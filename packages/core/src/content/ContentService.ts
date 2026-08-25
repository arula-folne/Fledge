import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { zipSync } from 'fflate'
import {
  ContentCreateInstanceRequestSchema,
  ContentInstallRequestSchema,
  ContentSearchQuerySchema,
  InstalledContentSchema,
  type ContentCategory,
  type ContentCreateInstanceRequest,
  type ContentLoaderFilter,
  type ContentMediaItem,
  type ContentProject,
  type ContentProjectPage,
  type ContentSearchQuery,
  type ContentSearchResult,
  type ContentVersion,
  type InstalledContent,
  type InstanceProfile,
  type Loader,
  loaderToContentFilters,
  fledgeUserAgent,
} from '@fledge/shared'
import type { DownloadQueue } from '../download/DownloadQueue.js'
import { fetchBody, fetchToFile } from '../download/fetchBody.js'
import type { InstanceStore } from '../instances/InstanceStore.js'
import type { Logger } from '../logging/Logger.js'
import {
  applyMinecraftInitialSettingsToInstance,
  snapshotMinecraftDebugOverlay,
  snapshotMinecraftInitialOptions,
} from '../minecraft/minecraftInitialOptions.js'
import type { SettingsStore } from '../settings/SettingsStore.js'
import type { VersionService } from '../versions/VersionService.js'
import type { ContentProvider, ContentProviderInfo } from './ContentProvider.js'
import { ModrinthProvider } from './ModrinthProvider.js'
import {
  clientFiles,
  loaderFromMrpack,
  loaderVersionFromMrpack,
  minecraftFromMrpack,
  packFileCategory,
  parseMrpackIndex,
  projectIdFromDownloadUrl,
  versionIdFromDownloadUrl,
  writeMrpackOverrides,
  type MrpackIndex,
  type MrpackIndexFile,
} from './mrpack.js'
import { unzipToEntries } from './unzipToEntries.js'

const INDEX_DIR = '.fledge'
const INDEX_FILE = 'content-index.json'

type IndexFile = { items: InstalledContent[]; invalidItems?: unknown[] }

const EXPORT_EXCLUDED_ROOTS = new Set([
  '.fledge',
  'saves',
  'logs',
  'screenshots',
  'crash-reports',
  'backups',
])

async function listFilesRecursive(root: string, rel = ''): Promise<string[]> {
  const dir = path.join(root, rel)
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files: string[] = []
  const dirJobs: Promise<string[]>[] = []
  for (const entry of entries) {
    const child = rel ? path.join(rel, entry.name) : entry.name
    if (entry.isDirectory()) dirJobs.push(listFilesRecursive(root, child))
    else if (entry.isFile()) files.push(child)
  }
  if (dirJobs.length === 0) return files
  const nested = await Promise.all(dirJobs)
  return files.concat(...nested)
}

function fileHashes(data: Uint8Array): { sha1: string; sha512: string } {
  return {
    sha1: createHash('sha1').update(data).digest('hex'),
    sha512: createHash('sha512').update(data).digest('hex'),
  }
}

function categoryDir(category: ContentCategory): string {
  switch (category) {
    case 'mod':
      return 'mods'
    case 'resourcepack':
      return 'resourcepacks'
    case 'shader':
      return 'shaderpacks'
    case 'plugin':
      return 'plugins'
    case 'datapack':
      return path.join('world', 'datapacks')
    case 'modpack':
      throw new Error('Modpack はインスタンスフォルダ直下に展開します')
  }
}

function pickLoader(loaders: string[]): Loader {
  const set = new Set(loaders.map((l) => l.toLowerCase()))
  if (set.has('fabric')) return 'fabric'
  if (set.has('quilt')) return 'quilt'
  if (set.has('neoforge')) return 'neoforge'
  if (set.has('forge')) return 'forge'
  return 'vanilla'
}

function safeInstancePath(instanceDir: string, rel: string): string | null {
  const normalized = rel.replaceAll('\\', '/').replace(/^\/+/, '')
  if (!normalized || normalized.endsWith('/') || normalized.includes('..')) return null
  const dest = path.join(instanceDir, normalized)
  const root = path.resolve(instanceDir)
  const resolved = path.resolve(dest)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null
  return dest
}

export class ContentService {
  private readonly modrinth: ModrinthProvider
  private readonly providers: Map<string, ContentProvider>
  private readonly indexTail = new Map<string, Promise<unknown>>()
  private readonly contentGeneration = new Map<string, number>()
  private readonly inflightContent = new Map<string, InstalledContent>()

  private contentKey(instanceId: string, provider: string, projectId: string): string {
    return `${instanceId}:${provider}:${projectId}`
  }

  private nextContentGeneration(key: string): number {
    const next = (this.contentGeneration.get(key) ?? 0) + 1
    this.contentGeneration.set(key, next)
    return next
  }

  constructor(
    private readonly instances: InstanceStore,
    private readonly queue: DownloadQueue,
    private readonly logger: Logger,
    private readonly settings: SettingsStore,
    private readonly versions: VersionService,
  ) {
    this.modrinth = new ModrinthProvider(() => this.settings.get().then((s) => s.locale))
    this.providers = new Map([['modrinth', this.modrinth]])
  }

  async listProviders(): Promise<ContentProviderInfo[]> {
    return [
      {
        id: 'modrinth',
        name: 'Modrinth',
        available: true,
      },
    ]
  }

  async listCategoryTags() {
    return this.modrinth.listCategoryTags()
  }

  async search(raw: unknown): Promise<ContentSearchResult> {
    const query = ContentSearchQuerySchema.parse(raw)
    return this.modrinth.search({ ...query, provider: 'modrinth' })
  }

  async getProject(projectId: string): Promise<ContentProjectPage> {
    const id = String(projectId ?? '').trim()
    if (!id) throw new Error('Project id required')
    return this.modrinth.getProject(id)
  }

  async listVersions(raw: unknown): Promise<ContentVersion[]> {
    const input = raw as {
      projectId?: string
      gameVersion?: string
      loaders?: ContentLoaderFilter[]
    }
    const id = String(input?.projectId ?? '').trim()
    if (!id) throw new Error('Project id required')
    return this.modrinth.listVersions(id, {
      gameVersion: input.gameVersion?.trim() || undefined,
      loaders: Array.isArray(input.loaders) ? input.loaders : [],
    })
  }

  async listInstalled(instanceId: string, category?: ContentCategory): Promise<InstalledContent[]> {
    let index = await this.readIndex(instanceId)
    const unresolved = index.items.filter(
      (item) => !item.projectMetadataResolved && !item.projectId.startsWith('pack:'),
    )
    if (unresolved.length > 0) {
      try {
        const metadata = await this.modrinth.getProjectMetadata(
          unresolved.map((item) => item.projectId),
        )
        index = await this.withIndexLock(instanceId, async () => {
          const current = await this.readIndex(instanceId)
          let changed = false
          for (const item of current.items) {
            if (item.projectMetadataResolved) continue
            const project = metadata.get(item.projectId)
            if (!project) continue
            item.slug = project.slug
            item.name = project.name
            item.iconUrl = project.iconUrl
            item.projectMetadataResolved = true
            changed = true
          }
          if (changed) await this.writeIndex(instanceId, current)
          return current
        })
      } catch (err) {
        this.logger.warn('downloader', `Modrinth metadata hydration failed: ${String(err)}`)
      }
    }
    const items = index.items
    if (!category) return items
    return items.filter((i) => i.category === category)
  }

  async install(raw: unknown): Promise<InstalledContent> {
    const req = ContentInstallRequestSchema.parse(raw)
    if (req.category === 'modpack') {
      throw Object.assign(new Error('Modpack は閲覧画面からインスタンスを作成してください'), {
        messageKey: 'content.error.modpackUseCreate',
      })
    }
    const profile = await this.instances.get(req.instanceId)
    if (!profile) throw new Error(`Instance not found: ${req.instanceId}`)

    const provider = this.providers.get(req.provider)
    if (!provider) throw new Error(`Content provider unavailable: ${req.provider}`)

    const loaders =
      req.loaders ??
      (req.category === 'mod' || req.category === 'plugin'
        ? loaderToContentFilters(profile.loader)
        : [])
    const gameVersion = req.gameVersion ?? profile.minecraftVersion

    const index = await this.readIndex(req.instanceId)
    const installed = new Map(index.items.map((item) => [item.projectId, item.versionId]))

    const files =
      provider.resolveInstallSet != null
        ? await provider.resolveInstallSet({
            projectId: req.projectId,
            category: req.category,
            versionId: req.versionId,
            gameVersion,
            loaders,
            installed,
          })
        : [
            await provider.resolveInstall({
              projectId: req.projectId,
              category: req.category,
              versionId: req.versionId,
              gameVersion,
              loaders,
            }),
          ]

    if (files.length === 0) throw new Error('Compatible version not found on Modrinth')
    const primary = files[files.length - 1]!
    const instanceDir = this.instances.instanceDir(req.instanceId)
    const installedByProject = new Map(index.items.map((item) => [item.projectId, item]))

    let primaryEntry: InstalledContent | null = null
    const toEnqueue: typeof files = []
    for (const resolved of files) {
      const current = installedByProject.get(resolved.projectId)
      if (current?.versionId === resolved.versionId) {
        if (resolved.projectId === primary.projectId) primaryEntry = current
        continue
      }
      toEnqueue.push(resolved)
    }

    if (toEnqueue.length > 0) {
      const dirs = new Set(toEnqueue.map((f) => path.join(instanceDir, categoryDir(f.category))))
      await Promise.all([...dirs].map((dir) => fs.mkdir(dir, { recursive: true })))
      const entries = await Promise.all(
        toEnqueue.map((resolved) => this.enqueueContentDownload(req.instanceId, instanceDir, resolved)),
      )
      for (let i = 0; i < toEnqueue.length; i++) {
        if (toEnqueue[i]!.projectId === primary.projectId) primaryEntry = entries[i]!
      }
    }

    if (files.length > 1) {
      const depNames = files
        .slice(0, -1)
        .map((f) => `${f.name}@${f.versionNumber}`)
        .join(', ')
      this.logger.info(
        'downloader',
        `Resolved Modrinth dependencies for ${primary.name}: ${depNames || '(none)'}`,
      )
    }

    return primaryEntry ?? this.toInstalledEntry({ ...primary, projectMetadataResolved: true })
  }

  /** Mod / Modpack 等から新規インスタンスを作成し、コンテンツ導入を開始する */
  async createInstanceFromProject(raw: unknown): Promise<InstanceProfile> {
    const req = ContentCreateInstanceRequestSchema.parse(raw)
    if (req.category === 'plugin') {
      throw Object.assign(new Error('プラグインからのインスタンス作成は未対応です'), {
        messageKey: 'content.error.pluginCreateUnsupported',
      })
    }

    const pagePromise = this.getProject(req.projectId)
    const versionsPromise = this.listVersions({
      projectId: req.projectId,
      gameVersion: req.gameVersion,
      loaders: req.loaders,
    })
    const [page, versions] = await Promise.all([pagePromise, versionsPromise])
    let version = req.versionId
      ? versions.find((v) => v.id === req.versionId)
      : versions[0]
    if (!version && req.versionId) {
      const all = await this.listVersions({ projectId: req.projectId })
      version = all.find((v) => v.id === req.versionId)
    }
    if (!version) {
      throw Object.assign(new Error('Compatible version not found on Modrinth'), {
        messageKey: 'content.error.compatibleVersionNotFound',
        detail: { projectId: req.projectId },
      })
    }

    if (req.category === 'modpack') {
      return this.createInstanceFromModpack(req, page.project, version)
    }
    return this.createInstanceFromContent(req, page.project, version)
  }

  private async createInstanceFromContent(
    req: ContentCreateInstanceRequest,
    project: ContentProject,
    version: ContentVersion,
  ): Promise<InstanceProfile> {
    const loader = req.category === 'mod' ? pickLoader(version.loaders) : 'vanilla'
    const minecraftVersion =
      req.gameVersion?.trim() || version.gameVersions[0] || project.gameVersions[0]
    if (!minecraftVersion) {
      throw Object.assign(new Error('Minecraft バージョンを特定できません'), {
        messageKey: 'content.error.minecraftVersionUnknown',
      })
    }
    const loaderVersion = await this.resolveLoaderVersion(loader, minecraftVersion)
    const profile = await this.createSeededInstance({
      name: req.instanceName?.trim() || project.name,
      minecraftVersion,
      loader,
      loaderVersion,
    })

    await this.install({
      instanceId: profile.id,
      provider: req.provider,
      projectId: req.projectId,
      category: req.category,
      versionId: version.id,
      gameVersion: minecraftVersion,
      loaders: req.category === 'mod' ? loaderToContentFilters(loader) : [],
    })

    // Mod 導入後に初期設定を書いておく（初回起動でも再検証・再適用する）
    const settingsAfterContent = await this.settings.get()
    await applyMinecraftInitialSettingsToInstance(
      this.instances.instanceDir(profile.id),
      settingsAfterContent.minecraftInitialSettings,
      minecraftVersion,
      settingsAfterContent.locale,
    )

    return profile
  }

  private async createInstanceFromModpack(
    req: ContentCreateInstanceRequest,
    project: ContentProject,
    version: ContentVersion,
  ): Promise<InstanceProfile> {
    const resolved = await this.modrinth.resolveInstall({
      projectId: req.projectId,
      category: 'modpack',
      versionId: version.id,
      gameVersion: req.gameVersion,
      loaders: req.loaders,
    })

    let mrpackBuf: Buffer | undefined
    const { done: packDone } = this.queue.enqueue({
      kind: 'content',
      labelKey: 'content.downloading',
      priority: 6,
      sessionId: `content-mrpack-${req.projectId}`,
      meta: {
        projectId: req.projectId,
        projectName: project.name,
        category: 'modpack',
      },
      execute: async (ctx) => {
        mrpackBuf = await fetchBody(resolved.downloadUrl, {
          signal: ctx.signal,
          headers: { 'User-Agent': fledgeUserAgent('content-download') },
          onProgress: (current, total) => {
            ctx.report({
              current,
              total,
              unit: 'bytes',
              messageKey: 'content.downloading',
              meta: { name: project.name, file: resolved.fileName },
            })
          },
        })
      },
    })
    await packDone
    if (!mrpackBuf) throw new Error('Modpack のダウンロードに失敗しました')

    return this.createInstanceFromMrpackBytes(new Uint8Array(mrpackBuf), {
      name: req.instanceName?.trim() || project.name,
      versionId: version.id,
      versionNumber: version.versionNumber,
      iconUrl: project.iconUrl,
      fallbackGameVersions: version.gameVersions,
      fallbackLoaders: version.loaders,
      requestedGameVersion: req.gameVersion,
    })
  }

  /** ローカルの Modrinth pack から新しいインスタンスを作成する。 */
  async importMrpackFromFile(filePath: string): Promise<InstanceProfile> {
    if (path.extname(filePath).toLowerCase() !== '.mrpack') {
      throw new Error('選択したファイルは .mrpack ではありません')
    }
    const bytes = await fs.readFile(filePath)
    return this.createInstanceFromMrpackBytes(new Uint8Array(bytes), {
      name: path.basename(filePath, path.extname(filePath)),
      versionId: randomUUID(),
      versionNumber: 'imported',
      iconUrl: null,
      fallbackGameVersions: [],
      fallbackLoaders: [],
    })
  }

  private async createInstanceFromMrpackBytes(
    bytes: Uint8Array,
    pack: {
      name: string
      versionId: string
      versionNumber: string
      iconUrl: string | null
      fallbackGameVersions: string[]
      fallbackLoaders: string[]
      requestedGameVersion?: string
    },
  ): Promise<InstanceProfile> {
    const entries = unzipToEntries(bytes)
    const index = parseMrpackIndex(entries)
    const minecraftVersion =
      pack.requestedGameVersion?.trim() ||
      minecraftFromMrpack(index, pack.fallbackGameVersions)
    if (!minecraftVersion) {
      throw Object.assign(new Error('Minecraft バージョンを特定できません'), {
        messageKey: 'content.error.minecraftVersionUnknown',
      })
    }
    const loader = loaderFromMrpack(index, pack.fallbackLoaders)
    const preferredLoader = loaderVersionFromMrpack(index, loader)
    const loaderVersion = await this.resolveLoaderVersion(
      loader,
      minecraftVersion,
      preferredLoader,
    )
    let profile: InstanceProfile | null = null
    try {
      profile = await this.createSeededInstance({
        name: index.name?.trim() || pack.name,
        minecraftVersion,
        loader,
        loaderVersion,
      })

      const instanceDir = this.instances.instanceDir(profile.id)
      const writeSettings = await this.settings.get()
      await writeMrpackOverrides(
        instanceDir,
        entries,
        writeSettings.maxWriteConcurrency,
      )

      const packFiles = clientFiles(index)
      const projectIds = packFiles
        .map((file) => projectIdFromDownloadUrl(file.downloads[0] ?? '', file.path))
        .filter((id) => !id.startsWith('pack:'))
      const projectMetadata = this.modrinth
        .getProjectMetadata(projectIds)
        .catch(() => new Map<string, { slug: string; name: string; iconUrl: string | null }>())
      const downloadResults = await Promise.allSettled(
        packFiles.map((file) =>
          this.enqueueMrpackFile(profile!.id, instanceDir, file, {
            packName: index.name?.trim() || pack.name,
            versionId: pack.versionId,
            versionNumber: pack.versionNumber,
            iconUrl: pack.iconUrl,
            projectMetadata,
          }),
        ),
      )
      const failedDownload = downloadResults.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      )
      if (failedDownload) throw failedDownload.reason

      // overrides / パックファイル展開後に Fledge 初期設定で上書き（初回起動でも再適用）
      const settingsAfterPack = await this.settings.get()
      await applyMinecraftInitialSettingsToInstance(
        instanceDir,
        settingsAfterPack.minecraftInitialSettings,
        minecraftVersion,
        settingsAfterPack.locale,
      )

      this.logger.info(
        'downloader',
        `Created instance ${profile.id} from mrpack ${pack.name}@${pack.versionNumber}`,
      )
      return profile
    } catch (err) {
      if (profile) {
        this.disposeInstance(profile.id)
        await this.instances.remove(profile.id).catch(() => undefined)
        const current = await this.settings.get()
        if (current.selectedInstanceId === profile.id) {
          await this.settings.set({ selectedInstanceId: null })
        }
      }
      throw err
    }
  }

  /** インスタンス構成を Modrinth Modpack Format (.mrpack) で保存する。 */
  async exportMrpack(instanceId: string, destination: string): Promise<void> {
    const profile = await this.instances.get(instanceId)
    if (!profile) throw new Error(`Instance not found: ${instanceId}`)
    const instanceDir = this.instances.instanceDir(instanceId)
    const contentIndex = await this.readIndex(instanceId)
    const zipEntries: Record<string, Uint8Array> = {}
    const packFiles: MrpackIndexFile[] = []
    const referencedPaths = new Set<string>()

    for (const item of contentIndex.items.filter((entry) => entry.enabled)) {
      if (item.category === 'modpack') continue
      const rel = path.join(categoryDir(item.category), item.fileName).replaceAll('\\', '/')
      const full = safeInstancePath(instanceDir, rel)
      if (!full) continue
      let data: Uint8Array
      try {
        data = new Uint8Array(await fs.readFile(full))
      } catch {
        continue
      }

      let downloadUrl = item.downloadUrl
      let resolvedSha1 = item.sha1
      let resolvedSha512 = item.sha512
      const env = item.env
      if (!downloadUrl && !item.projectId.startsWith('pack:')) {
        try {
          const resolved = await this.modrinth.resolveInstall({
            projectId: item.projectId,
            category: item.category,
            versionId: item.versionId,
            gameVersion: profile.minecraftVersion,
            loaders:
              item.category === 'mod' || item.category === 'plugin'
                ? loaderToContentFilters(profile.loader)
                : [],
          })
          downloadUrl = resolved.downloadUrl
          resolvedSha1 = resolved.sha1
          resolvedSha512 = resolved.sha512
        } catch {
          // API で再解決できないファイルは overrides に含める
        }
      }

      if (downloadUrl) {
        const computed = fileHashes(data)
        const hashMatches =
          (!resolvedSha1 || resolvedSha1.toLowerCase() === computed.sha1) &&
          (!resolvedSha512 || resolvedSha512.toLowerCase() === computed.sha512)
        if (!hashMatches) {
          this.logger.warn(
            'downloader',
            `Exporting modified content as override because its hash changed: ${rel}`,
          )
          continue
        }
        packFiles.push({
          path: rel,
          hashes: {
            sha1: computed.sha1,
            sha512: computed.sha512,
          },
          env: env ?? { client: 'required', server: 'required' },
          downloads: [downloadUrl],
          fileSize: data.byteLength,
        })
        referencedPaths.add(rel.toLowerCase())
      }
    }

    for (const relNative of await listFilesRecursive(instanceDir)) {
      const rel = relNative.replaceAll('\\', '/')
      const root = rel.split('/')[0]?.toLowerCase() ?? ''
      const lower = rel.toLowerCase()
      if (
        rel === 'profile.json' ||
        /^icon\.[^.]+$/i.test(rel) ||
        EXPORT_EXCLUDED_ROOTS.has(root) ||
        lower.endsWith('.disabled') ||
        referencedPaths.has(lower)
      ) {
        continue
      }
      zipEntries[`overrides/${rel}`] = new Uint8Array(
        await fs.readFile(path.join(instanceDir, relNative)),
      )
    }

    const dependencies: Record<string, string> = { minecraft: profile.minecraftVersion }
    if (profile.loader !== 'vanilla' && profile.loaderVersion) {
      const key =
        profile.loader === 'fabric'
          ? 'fabric-loader'
          : profile.loader === 'quilt'
            ? 'quilt-loader'
            : profile.loader
      dependencies[key] = profile.loaderVersion
    }
    const mrpackIndex: MrpackIndex = {
      formatVersion: 1,
      game: 'minecraft',
      versionId: randomUUID(),
      name: profile.name,
      summary: profile.notes?.trim() || `${profile.name} exported by Fledge`,
      files: packFiles,
      dependencies,
    }
    zipEntries['modrinth.index.json'] = new TextEncoder().encode(
      JSON.stringify(mrpackIndex, null, 2),
    )

    const tmp = `${destination}.part-${randomUUID()}`
    try {
      const archive = zipSync(zipEntries, { level: 6 })
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.writeFile(tmp, archive)
      await fs.rm(destination, { force: true })
      await fs.rename(tmp, destination)
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => undefined)
      throw err
    }
  }

  private enqueueMrpackFile(
    instanceId: string,
    instanceDir: string,
    file: MrpackIndexFile,
    packMeta: {
      packName: string
      versionId: string
      versionNumber: string
      iconUrl: string | null
      projectMetadata: Promise<
        Map<string, { slug: string; name: string; iconUrl: string | null }>
      >
    },
  ): Promise<void> {
    const rel = file.path.replaceAll('\\', '/')
    const dest = safeInstancePath(instanceDir, rel)
    const downloadUrl = file.downloads[0]
    if (!dest || !downloadUrl) return Promise.resolve()

    const category = packFileCategory(rel)
    const fileName = path.basename(rel)
    const projectId = projectIdFromDownloadUrl(downloadUrl, rel)
    const entry = this.toInstalledEntry({
      provider: 'modrinth',
      projectId,
      versionId: versionIdFromDownloadUrl(downloadUrl) ?? packMeta.versionId,
      slug: fileName.replace(/\.[^.]+$/, '') || fileName,
      name: fileName,
      versionNumber: packMeta.versionNumber,
      category,
      fileName,
      iconUrl: packMeta.iconUrl,
      downloadUrl,
      sha1: file.hashes?.sha1,
      sha512: file.hashes?.sha512,
      fileSize: file.fileSize,
      env: file.env,
      projectMetadataResolved: false,
    })
    const parentRel = path.dirname(rel).replaceAll('\\', '/')
    const indexDir = categoryDir(category).replaceAll('\\', '/')
    const canIndex = parentRel === indexDir
    const key = this.contentKey(instanceId, 'modrinth', projectId)
    const generation = this.nextContentGeneration(key)
    const stagingPath = `${dest}.download-${randomUUID()}`

    const { done } = this.queue.enqueue({
      kind: 'content',
      labelKey: 'content.downloading',
      priority: 5,
      sessionId: `content-${instanceId}-${projectId}`,
      meta: {
        instanceId,
        projectId,
        projectName: packMeta.packName,
        category,
      },
      execute: async (ctx) => {
        await fetchToFile(downloadUrl, stagingPath, {
          signal: ctx.signal,
          headers: { 'User-Agent': fledgeUserAgent('content-download') },
          expectedSha1: file.hashes?.sha1,
          onProgress: (current, total) => {
            ctx.report({
              current,
              total,
              unit: 'bytes',
              messageKey: 'content.downloading',
              meta: { name: packMeta.packName, file: fileName },
            })
          },
        })
        if (ctx.signal.aborted) return
        if (canIndex) {
          const project = (await packMeta.projectMetadata).get(projectId)
          if (project) {
            entry.slug = project.slug
            entry.name = project.name
            entry.iconUrl = project.iconUrl
            entry.projectMetadataResolved = true
          }
          await this.finalizeInstalledContent(
            instanceId,
            instanceDir,
            {
              provider: 'modrinth',
              projectId,
              category,
              fileName,
            },
            entry,
            { key, generation, stagingPath, destPath: dest },
          )
        } else {
          if (!(await this.instances.get(instanceId))) {
            await fs.rm(stagingPath, { force: true })
            return
          }
          await fs.rm(dest, { force: true })
          await fs.rename(stagingPath, dest)
        }
      },
    })

    return done.catch(async (err) => {
      this.logger.error('downloader', `Modpack file install failed: ${String(err)}`)
      await fs.unlink(stagingPath).catch(() => {
        /* ignore */
      })
      await fs.unlink(`${stagingPath}.part`).catch(() => {
        /* ignore */
      })
      throw err
    })
  }

  private async createSeededInstance(input: {
    name: string
    minecraftVersion: string
    loader: Loader
    loaderVersion?: string
  }): Promise<InstanceProfile> {
    const settings = await this.settings.get()
    const profile = await this.instances.create(
      {
        name: input.name,
        minecraftVersion: input.minecraftVersion,
        loader: input.loader,
        loaderVersion: input.loaderVersion,
        memoryMaxMb: settings.defaultMemoryMaxMb,
        jvmArgs: settings.defaultJvmArgs,
      },
      {
        memoryMaxMb: settings.defaultMemoryMaxMb,
        jvmArgs: settings.defaultJvmArgs,
        seedMinecraftInitialSettings: true,
        pendingMinecraftOptions: snapshotMinecraftInitialOptions(
          settings.minecraftInitialSettings,
          input.minecraftVersion,
          settings.locale,
        ),
        pendingMinecraftDebugOverlay: snapshotMinecraftDebugOverlay(
          settings.minecraftInitialSettings,
          input.minecraftVersion,
        ),
      },
    )
    await applyMinecraftInitialSettingsToInstance(
      this.instances.instanceDir(profile.id),
      settings.minecraftInitialSettings,
      input.minecraftVersion,
      settings.locale,
    )
    if (!settings.selectedInstanceId) {
      await this.settings.set({ selectedInstanceId: profile.id })
    }
    return profile
  }

  private async resolveLoaderVersion(
    loader: Loader,
    minecraftVersion: string,
    preferred?: string,
  ): Promise<string | undefined> {
    if (loader === 'vanilla') return undefined
    if (preferred?.trim()) return preferred.trim()
    const list = await this.versions.listLoaderVersions({ loader, minecraftVersion })
    const preferredEntry =
      list.versions.find((v) => v.recommended) ??
      list.versions.find((v) => v.stable) ??
      list.versions[0]
    return preferredEntry?.id
  }

  private toInstalledEntry(resolved: {
    provider: InstalledContent['provider']
    projectId: string
    versionId: string
    slug: string
    name: string
    versionNumber: string
    category: InstalledContent['category']
    fileName: string
    iconUrl: string | null
    downloadUrl?: string
    sha1?: string
    sha512?: string
    fileSize?: number
    env?: InstalledContent['env']
    projectMetadataResolved?: boolean
  }): InstalledContent {
    return {
      id: randomUUID(),
      provider: resolved.provider,
      projectId: resolved.projectId,
      versionId: resolved.versionId,
      slug: resolved.slug,
      name: resolved.name,
      versionNumber: resolved.versionNumber,
      category: resolved.category,
      fileName: resolved.fileName,
      iconUrl: resolved.iconUrl,
      downloadUrl: resolved.downloadUrl,
      sha1: resolved.sha1,
      sha512: resolved.sha512,
      fileSize: resolved.fileSize,
      env: resolved.env,
      projectMetadataResolved: resolved.projectMetadataResolved,
      enabled: true,
      installedAt: new Date().toISOString(),
      updateAvailable: false,
    }
  }

  private async enqueueContentDownload(
    instanceId: string,
    instanceDir: string,
    resolved: {
      provider: InstalledContent['provider']
      projectId: string
      versionId: string
      slug: string
      name: string
      versionNumber: string
      category: InstalledContent['category']
      fileName: string
      downloadUrl: string
      iconUrl: string | null
      sha1?: string
      sha512?: string
      size?: number
    },
  ): Promise<InstalledContent> {
    const key = this.contentKey(instanceId, resolved.provider, resolved.projectId)
    const existing = this.inflightContent.get(key)
    if (existing) return existing

    const destDir = path.join(instanceDir, categoryDir(resolved.category))
    await fs.mkdir(destDir, { recursive: true })
    const destPath = path.join(destDir, resolved.fileName)
    const stagingPath = `${destPath}.download-${randomUUID()}`
    const generation = this.nextContentGeneration(key)
    const entry = this.toInstalledEntry({
      ...resolved,
      fileSize: resolved.size,
      projectMetadataResolved: true,
    })

    const { done } = this.queue.enqueue({
      kind: 'content',
      labelKey: 'content.downloading',
      priority: 5,
      sessionId: `content-${instanceId}-${resolved.projectId}`,
      meta: {
        instanceId,
        projectId: resolved.projectId,
        projectName: resolved.name,
        category: resolved.category,
      },
      execute: async (ctx) => {
        await fetchToFile(resolved.downloadUrl, stagingPath, {
          signal: ctx.signal,
          headers: { 'User-Agent': fledgeUserAgent('content-download') },
          expectedSha1: resolved.sha1,
          onProgress: (current, total) => {
            ctx.report({
              current,
              total,
              unit: 'bytes',
              messageKey: 'content.downloading',
              meta: { name: resolved.name, file: resolved.fileName },
            })
          },
        })
        if (ctx.signal.aborted) return
        await this.finalizeInstalledContent(instanceId, instanceDir, resolved, entry, {
          key,
          generation,
          stagingPath,
          destPath,
        })
      },
    })

    this.inflightContent.set(key, entry)
    void done.catch((err) => {
      this.logger.error('downloader', `Content install failed: ${String(err)}`)
      void fs.unlink(stagingPath).catch(() => {
        /* ignore partial file */
      })
      void fs.unlink(`${stagingPath}.part`).catch(() => {
        /* ignore */
      })
    })
    void done.finally(() => {
      if (this.inflightContent.get(key)?.id === entry.id) this.inflightContent.delete(key)
    }).catch(() => undefined)

    return entry
  }

  private async finalizeInstalledContent(
    instanceId: string,
    instanceDir: string,
    resolved: {
      provider: InstalledContent['provider']
      projectId: string
      category: InstalledContent['category']
      fileName: string
    },
    entry: InstalledContent,
    pending: {
      key: string
      generation: number
      stagingPath: string
      destPath: string
    },
  ): Promise<void> {
    const profile = await this.instances.get(instanceId)
    if (!profile) {
      await fs.rm(pending.stagingPath, { force: true })
      return
    }

    await this.withIndexLock(instanceId, async () => {
      if (this.contentGeneration.get(pending.key) !== pending.generation) {
        await fs.rm(pending.stagingPath, { force: true })
        return
      }
      if (!(await this.instances.get(instanceId))) {
        await fs.rm(pending.stagingPath, { force: true })
        return
      }
      const index = await this.readIndex(instanceId)
      const previous = index.items.filter(
        (i) => i.provider === resolved.provider && i.projectId === resolved.projectId,
      )
      for (const old of previous) {
        await this.deleteFileQuiet(
          path.join(instanceDir, categoryDir(old.category), old.fileName),
          old.enabled,
        )
        index.items = index.items.filter((i) => i.id !== old.id)
      }

      await fs.rm(pending.destPath, { force: true })
      await fs.rename(pending.stagingPath, pending.destPath)
      index.items.push(entry)
      await this.writeIndex(instanceId, index)
      this.logger.info(
        'downloader',
        `Installed ${entry.name}@${entry.versionNumber} → ${instanceId}`,
      )
    })
  }

  async setEnabled(instanceId: string, entryId: string, enabled: boolean): Promise<InstalledContent> {
    return this.withIndexLock(instanceId, async () => {
      const index = await this.readIndex(instanceId)
      const entry = index.items.find((i) => i.id === entryId)
      if (!entry) throw new Error('Content entry not found')
      if (entry.enabled === enabled) return entry

      const dir = path.join(this.instances.instanceDir(instanceId), categoryDir(entry.category))
      const active = path.join(dir, entry.fileName)
      const disabled = `${active}.disabled`

      if (enabled) {
        await fs.rename(disabled, active).catch(async () => {
          await fs.access(active)
        })
      } else {
        await fs.rename(active, disabled).catch(async () => {
          await fs.access(disabled)
        })
      }

      entry.enabled = enabled
      await this.writeIndex(instanceId, index)
      return entry
    })
  }

  /** インスタンス削除時: 進行中の導入を止め、メモリ上の状態を破棄する */
  disposeInstance(instanceId: string): void {
    this.queue.cancelBySessionPrefix(`content-${instanceId}-`)
    const prefix = `${instanceId}:`
    for (const key of [...this.inflightContent.keys()]) {
      if (key.startsWith(prefix)) this.inflightContent.delete(key)
    }
    for (const key of [...this.contentGeneration.keys()]) {
      if (key.startsWith(prefix)) this.contentGeneration.delete(key)
    }
    this.indexTail.delete(instanceId)
  }

  async remove(instanceId: string, entryId: string): Promise<void> {
    const snapshot = await this.readIndex(instanceId)
    const entry =
      snapshot.items.find((i) => i.id === entryId) ??
      [...this.inflightContent.values()].find((i) => i.id === entryId)
    if (!entry) return

    const key = this.contentKey(instanceId, entry.provider, entry.projectId)
    this.nextContentGeneration(key)
    this.queue.cancelBySession(`content-${instanceId}-${entry.projectId}`)

    await this.withIndexLock(instanceId, async () => {
      const index = await this.readIndex(instanceId)
      const current = index.items.find((i) => i.id === entryId)
      if (current) {
        const dir = path.join(this.instances.instanceDir(instanceId), categoryDir(current.category))
        await this.deleteFileQuiet(path.join(dir, current.fileName), current.enabled)
        index.items = index.items.filter((i) => i.id !== entryId)
        await this.writeIndex(instanceId, index)
      }
    })
  }

  async checkUpdates(instanceId: string): Promise<InstalledContent[]> {
    const profile = await this.instances.get(instanceId)
    if (!profile) throw new Error(`Instance not found: ${instanceId}`)
    const index = await this.readIndex(instanceId)
    const loaders = loaderToContentFilters(profile.loader)

    const UPDATE_CONCURRENCY = 8
    let cursor = 0
    const workers = Array.from({ length: Math.min(UPDATE_CONCURRENCY, index.items.length) }, async () => {
      while (cursor < index.items.length) {
        const i = cursor++
        const entry = index.items[i]!
        const provider = this.providers.get(entry.provider)
        if (!provider?.findUpdate) {
          entry.updateAvailable = false
          continue
        }
        const update = await provider.findUpdate(entry, {
          gameVersion: profile.minecraftVersion,
          loaders: entry.category === 'mod' || entry.category === 'plugin' ? loaders : [],
        })
        if (update) {
          entry.updateAvailable = true
          entry.latestVersionId = update.versionId
          entry.latestVersionNumber = update.versionNumber
        } else {
          entry.updateAvailable = false
          entry.latestVersionId = undefined
          entry.latestVersionNumber = undefined
        }
      }
    })
    await Promise.all(workers)

    return this.withIndexLock(instanceId, async () => {
      const current = await this.readIndex(instanceId)
      const updates = new Map(index.items.map((entry) => [entry.id, entry]))
      for (const entry of current.items) {
        const update = updates.get(entry.id)
        if (!update) continue
        entry.updateAvailable = update.updateAvailable
        entry.latestVersionId = update.latestVersionId
        entry.latestVersionNumber = update.latestVersionNumber
      }
      await this.writeIndex(instanceId, current)
      return current.items
    })
  }

  async listMedia(
    instanceId: string,
    kind: 'screenshots' | 'logs',
  ): Promise<ContentMediaItem[]> {
    const dir = path.join(this.instances.instanceDir(instanceId), kind)
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      const files = entries.filter((e) => e.isFile())
      const items = await Promise.all(
        files.map(async (e) => {
          const full = path.join(dir, e.name)
          const stat = await fs.stat(full)
          return {
            name: e.name,
            path: full,
            mtime: stat.mtime.toISOString(),
            size: stat.size,
          } satisfies ContentMediaItem
        }),
      )
      return items.sort((a, b) => (b.mtime ?? '').localeCompare(a.mtime ?? ''))
    } catch {
      return []
    }
  }

  async defaultSearchQuery(
    instanceId: string,
    category: ContentCategory = 'mod',
  ): Promise<ContentSearchQuery> {
    const profile = await this.instances.get(instanceId)
    if (!profile) throw new Error(`Instance not found: ${instanceId}`)
    return ContentSearchQuerySchema.parse({
      query: '',
      category,
      gameVersion: profile.minecraftVersion,
      loaders: category === 'mod' || category === 'plugin' ? loaderToContentFilters(profile.loader) : [],
      provider: 'modrinth',
      offset: 0,
      limit: 20,
    })
  }

  private indexPath(instanceId: string): string {
    return path.join(this.instances.instanceDir(instanceId), INDEX_DIR, INDEX_FILE)
  }

  private async withIndexLock<T>(instanceId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.indexTail.get(instanceId) ?? Promise.resolve()
    const next = prev.then(fn, fn)
    this.indexTail.set(
      instanceId,
      next.then(
        () => undefined,
        () => undefined,
      ),
    )
    return next
  }

  private async readIndex(instanceId: string): Promise<IndexFile> {
    try {
      const raw = await fs.readFile(this.indexPath(instanceId), 'utf8')
      const parsed = JSON.parse(raw) as IndexFile
      const items = Array.isArray(parsed.items) ? parsed.items : []
      const valid: InstalledContent[] = []
      const invalid: unknown[] = []
      for (const item of items) {
        const result = InstalledContentSchema.safeParse(item)
        if (result.success) valid.push(result.data)
        else invalid.push(item)
      }
      if (invalid.length > 0) {
        this.logger.warn(
          'downloader',
          `Preserving ${invalid.length} unsupported content-index entries for ${instanceId}`,
        )
      }
      return { items: valid, invalidItems: invalid }
    } catch {
      return { items: [] }
    }
  }

  private async writeIndex(instanceId: string, index: IndexFile): Promise<void> {
    const p = this.indexPath(instanceId)
    await fs.mkdir(path.dirname(p), { recursive: true })
    const tmp = `${p}.tmp-${randomUUID()}`
    const serialized = {
      items: [...index.items, ...(index.invalidItems ?? [])],
    }
    try {
      await fs.writeFile(tmp, `${JSON.stringify(serialized)}\n`, 'utf8')
      await fs.rename(tmp, p)
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => undefined)
      throw err
    }
  }

  private async deleteFileQuiet(filePath: string, enabled: boolean): Promise<void> {
    const targets = enabled ? [filePath, `${filePath}.disabled`] : [`${filePath}.disabled`, filePath]
    for (const t of targets) {
      try {
        await fs.unlink(t)
      } catch {
        // ignore
      }
    }
  }
}
