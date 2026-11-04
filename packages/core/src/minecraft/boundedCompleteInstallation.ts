import { readFile, stat, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { checksum, MinecraftFolder } from '@xmcl/core'
import { download } from '@xmcl/file-transfer'
import {
  DEFAULT_RESOURCE_ROOT_URL,
  diagnoseProfile,
  installByProfile,
  installMinecraftJar,
  installResolvedAssets,
  installResolvedLibraries,
  type InstallProfile,
} from '@xmcl/installer'

/** アセット／ライブラリの同時ダウンロード上限（xmcl の無制限起動を避ける） */
export const MC_FILE_DOWNLOAD_CONCURRENCY = 24
/** stat など診断の同時数 */
const DIAGNOSE_CONCURRENCY = 64

export type BoundedCompleteScope = 'full' | 'libraries'

export type BoundedCompleteOptions = {
  signal?: AbortSignal
  abortSignal?: AbortSignal
  tracker?: unknown
  java?: string
  /** full: jar + profile + libs + assets。libraries: 差分ライブラリのみ（ローダー導入後） */
  scope?: BoundedCompleteScope
}

type LibLike = {
  download: { path?: string; sha1?: string; size?: number; url?: string }
}

type AssetLike = { name: string; hash: string; size: number }

type VersionLike = {
  id: string
  minecraftDirectory: string
  libraries: LibLike[]
  assets?: string
  assetIndex?: { id: string; sha1: string; size: number; url: string; totalSize?: number }
  logging?: { client?: { file?: { id: string; sha1?: string; size?: number; url: string } } }
}

function signalOf(options: BoundedCompleteOptions): AbortSignal | undefined {
  return options.signal ?? options.abortSignal
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return []
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  signal: AbortSignal | undefined,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      if (signal?.aborted) throw signal.reason ?? new Error('aborted')
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i]!)
    }
  })
  await Promise.all(workers)
  return results
}

/** サイズ一致なら SHA1 を省略。不一致・不明時のみハッシュ */
async function sha1IfNeeded(
  file: string,
  expectedSha1: string | undefined,
  expectedSize: number,
): Promise<string> {
  if (expectedSize > 0) {
    const st = await stat(file).catch(() => null)
    if (st && st.size === expectedSize) return expectedSha1 ?? ''
  }
  return checksum(file, 'sha1')
}

/** ライブラリ診断（size-first）。不足・破損のみ返す。 */
async function diagnoseLibrariesSizeFirst(
  libraries: LibLike[],
  folder: MinecraftFolder,
  signal?: AbortSignal,
): Promise<LibLike[]> {
  const flags = await mapPool(libraries, DIAGNOSE_CONCURRENCY, signal, async (lib) => {
    if (!lib.download.path) return lib
    const libPath = folder.getLibraryByPath(lib.download.path)
    const expectedSize = lib.download.size ?? -1
    const expectedSha1 = lib.download.sha1 ?? ''
    try {
      const st = await stat(libPath)
      if (expectedSize > 0 && st.size === expectedSize) return null
      if (expectedSha1) {
        const actual = await sha1IfNeeded(libPath, expectedSha1, expectedSize)
        if (actual === expectedSha1) return null
      } else if (st.size > 0) {
        return null
      }
      return lib
    } catch {
      return lib
    }
  })
  return flags.filter((x): x is LibLike => x != null)
}

async function installLibrariesBounded(
  version: VersionLike,
  options: BoundedCompleteOptions,
): Promise<void> {
  const signal = signalOf(options)
  const folder = MinecraftFolder.from(version.minecraftDirectory)
  const bad = await diagnoseLibrariesSizeFirst(version.libraries, folder, signal)
  for (const chunk of chunkArray(bad, MC_FILE_DOWNLOAD_CONCURRENCY)) {
    if (signal?.aborted) throw signal.reason ?? new Error('aborted')
    await installResolvedLibraries(chunk as never[], version.minecraftDirectory, {
      signal,
      tracker: options.tracker as never,
    })
  }
}

async function ensureAssetIndex(
  version: VersionLike,
  folder: MinecraftFolder,
  signal?: AbortSignal,
): Promise<AssetLike[]> {
  if (!version.assetIndex) {
    throw new Error('Cannot install assets for version without assetIndex')
  }
  const assetIndexInfo = version.assetIndex
  const assetsName = version.assets || assetIndexInfo.id
  await mkdir(folder.getPath('assets', 'objects'), { recursive: true })
  await mkdir(folder.getPath('assets', 'indexes'), { recursive: true })
  const jsonPath = folder.getPath('assets', 'indexes', `${assetsName}.json`)

  const readIndex = async () => {
    const raw = await readFile(jsonPath, 'utf-8')
    return JSON.parse(raw) as { objects: Record<string, { hash: string; size: number }> }
  }

  let index: { objects: Record<string, { hash: string; size: number }> }
  try {
    index = await readIndex()
  } catch {
    await download({
      url: assetIndexInfo.url,
      destination: jsonPath,
      expectedTotal: assetIndexInfo.size,
      signal,
    })
    index = await readIndex()
  }

  return Object.keys(index.objects).map((name) => ({
    name,
    hash: index.objects[name]!.hash,
    size: index.objects[name]!.size,
  }))
}

async function installLogConfig(
  version: VersionLike,
  folder: MinecraftFolder,
  signal?: AbortSignal,
): Promise<void> {
  const file = version.logging?.client?.file
  if (!file?.url || !file.id) return
  const dest = folder.getLogConfig(file.id)
  try {
    if (file.sha1) {
      const actual = await sha1IfNeeded(dest, file.sha1, file.size ?? -1)
      if (actual === file.sha1) return
    } else {
      const st = await stat(dest)
      if (st.size > 0) return
    }
  } catch {
    /* missing */
  }
  await download({
    url: file.url,
    destination: dest,
    expectedTotal: file.size,
    signal,
  })
}

async function diagnoseAssetsSizeFirst(
  assets: AssetLike[],
  folder: MinecraftFolder,
  signal?: AbortSignal,
): Promise<AssetLike[]> {
  const flags = await mapPool(assets, DIAGNOSE_CONCURRENCY, signal, async (asset) => {
    const assetPath = folder.getAsset(asset.hash)
    const st = await stat(assetPath).catch(() => null)
    if (st && st.size === asset.size) return null
    return asset
  })
  return flags.filter((x): x is AssetLike => x != null)
}

async function installAssetsBounded(
  version: VersionLike,
  options: BoundedCompleteOptions,
): Promise<void> {
  const signal = signalOf(options)
  const folder = MinecraftFolder.from(version.minecraftDirectory)
  await installLogConfig(version, folder, signal)
  const all = await ensureAssetIndex(version, folder, signal)
  const missing = await diagnoseAssetsSizeFirst(all, folder, signal)
  for (const chunk of chunkArray(missing, MC_FILE_DOWNLOAD_CONCURRENCY)) {
    if (signal?.aborted) throw signal.reason ?? new Error('aborted')
    await installResolvedAssets(chunk, folder, version.id, {
      abortSignal: signal,
      tracker: options.tracker as never,
      assetsHost: DEFAULT_RESOURCE_ROOT_URL,
    })
  }
}

async function readInstallProfile(versionDir: string): Promise<InstallProfile | undefined> {
  try {
    const raw = await readFile(path.join(versionDir, 'install_profile.json'), 'utf8')
    return JSON.parse(raw) as InstallProfile
  } catch {
    return undefined
  }
}

/**
 * completeInstallation 相当。ファイル並列を抑え、ライブラリ診断は size-first。
 */
export async function boundedCompleteInstallation(
  version: unknown,
  options: BoundedCompleteOptions = {},
): Promise<void> {
  const ver = version as VersionLike
  const scope = options.scope ?? 'full'
  const signal = signalOf(options)
  const folder = MinecraftFolder.from(ver.minecraftDirectory)

  if (scope === 'full') {
    await installMinecraftJar(ver as never, {
      signal,
      tracker: options.tracker as never,
    })

    const profile = await readInstallProfile(folder.getVersionRoot(ver.id))
    if (profile) {
      const needsInstall = await diagnoseProfile(profile, folder, 'client')
      if (needsInstall) {
        await installByProfile(profile, folder, {
          signal,
          tracker: options.tracker as never,
          java: options.java,
        })
      }
    }
  }

  await installLibrariesBounded(ver, options)

  if (scope === 'libraries') return

  await installAssetsBounded(ver, options)
}
