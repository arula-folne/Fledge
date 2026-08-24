import fs from 'node:fs/promises'
import path from 'node:path'
import type { ContentCategory, Loader } from '@fledge/shared'
import { unzipToEntries } from './unzipToEntries.js'

export type MrpackEnvironment = 'required' | 'optional' | 'unsupported'

export type MrpackIndexFile = {
  path: string
  hashes?: { sha1?: string; sha512?: string }
  env?: { client?: MrpackEnvironment; server?: MrpackEnvironment }
  downloads: string[]
  fileSize?: number
}

export type MrpackIndex = {
  formatVersion?: number
  game?: string
  versionId?: string
  name?: string
  summary?: string
  files: MrpackIndexFile[]
  dependencies?: Record<string, string>
}

export function parseMrpackIndex(entries: Record<string, Uint8Array>): MrpackIndex {
  const raw = entries['modrinth.index.json']
  if (!raw) throw new Error('modrinth.index.json が見つかりません')
  const json = JSON.parse(new TextDecoder().decode(raw)) as MrpackIndex
  if (!Array.isArray(json.files)) throw new Error('不正な mrpack です')
  if (json.formatVersion != null && json.formatVersion !== 1) {
    throw new Error(`未対応の mrpack formatVersion です: ${json.formatVersion}`)
  }
  if (json.game != null && json.game !== 'minecraft') {
    throw new Error(`Minecraft 用ではない mrpack です: ${json.game}`)
  }
  for (const file of json.files) {
    if (!file.path || !Array.isArray(file.downloads) || file.downloads.length === 0) {
      throw new Error('mrpack のファイル情報が不正です')
    }
  }
  return json
}

export function clientFiles(index: MrpackIndex): MrpackIndexFile[] {
  return index.files.filter((file) => (file.env?.client ?? 'required') !== 'unsupported')
}

export function loaderFromMrpack(index: MrpackIndex, versionLoaders: string[]): Loader {
  const deps = index.dependencies ?? {}
  if (deps['fabric-loader'] || versionLoaders.includes('fabric')) return 'fabric'
  if (deps['quilt-loader'] || versionLoaders.includes('quilt')) return 'quilt'
  if (deps.neoforge || versionLoaders.includes('neoforge')) return 'neoforge'
  if (deps.forge || versionLoaders.includes('forge')) return 'forge'
  return 'vanilla'
}

export function minecraftFromMrpack(index: MrpackIndex, versionGameVersions: string[]): string | undefined {
  return index.dependencies?.minecraft || versionGameVersions[0]
}

export function loaderVersionFromMrpack(index: MrpackIndex, loader: Loader): string | undefined {
  const deps = index.dependencies ?? {}
  if (loader === 'fabric') return deps['fabric-loader']
  if (loader === 'quilt') return deps['quilt-loader']
  if (loader === 'neoforge') return deps.neoforge
  if (loader === 'forge') return deps.forge
  return undefined
}

function categoryFromPackPath(rel: string): ContentCategory {
  const lower = rel.replaceAll('\\', '/').toLowerCase()
  if (lower.startsWith('mods/')) return 'mod'
  if (lower.startsWith('resourcepacks/')) return 'resourcepack'
  if (lower.startsWith('shaderpacks/')) return 'shader'
  if (lower.includes('datapacks/')) return 'datapack'
  return 'mod'
}

export function projectIdFromDownloadUrl(url: string, filePath: string): string {
  const m = url.match(/cdn\.modrinth\.com\/data\/([^/]+)/i)
  if (m?.[1]) return m[1]
  return `pack:${filePath.replaceAll('\\', '/')}`
}

export function versionIdFromDownloadUrl(url: string): string | undefined {
  return url.match(/cdn\.modrinth\.com\/data\/[^/]+\/versions\/([^/]+)/i)?.[1]
}

/** overrides / client-overrides をインスタンスフォルダへ展開 */
export async function writeMrpackOverrides(
  instanceDir: string,
  entries: Record<string, Uint8Array>,
): Promise<void> {
  const prefixes = ['overrides/', 'client-overrides/']
  for (const [name, data] of Object.entries(entries)) {
    const normalized = name.replaceAll('\\', '/')
    const prefix = prefixes.find((p) => normalized.startsWith(p))
    if (!prefix) continue
    const rel = normalized.slice(prefix.length)
    if (!rel || rel.endsWith('/') || rel.split('/').includes('..')) continue
    const dest = path.join(instanceDir, rel)
    const resolved = path.resolve(dest)
    const root = path.resolve(instanceDir)
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) continue
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.writeFile(dest, data)
  }
}

export function packFileCategory(filePath: string): ContentCategory {
  return categoryFromPackPath(filePath)
}

export { unzipToEntries }
