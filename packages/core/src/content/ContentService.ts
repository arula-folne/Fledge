import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  ContentInstallRequestSchema,
  ContentSearchQuerySchema,
  InstalledContentSchema,
  type ContentCategory,
  type ContentLoaderFilter,
  type ContentMediaItem,
  type ContentSearchQuery,
  type ContentSearchResult,
  type ContentSourceId,
  type InstalledContent,
  type Loader,
} from '@fledge/shared'
import type { DownloadQueue } from '../download/DownloadQueue.js'
import type { InstanceStore } from '../instances/InstanceStore.js'
import type { Logger } from '../logging/Logger.js'
import type { ContentProvider, ContentProviderInfo } from './ContentProvider.js'
import { CurseForgeProvider } from './curseforge/CurseForgeProvider.js'
import { mergePreferModrinth } from './mergeContentHits.js'
import { ModrinthProvider } from './ModrinthProvider.js'

/**
 * 一旦 CurseForge 連携は無効。コードは残し、再有効化時は true に戻す。
 * true でもキー未設定なら従来どおり利用不可。
 */
const CURSEFORGE_FEATURE_ENABLED = false

const INDEX_DIR = '.fledge'
const INDEX_FILE = 'content-index.json'

type IndexFile = { items: InstalledContent[] }

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
  }
}

function loaderToFilters(loader: Loader): ContentLoaderFilter[] {
  switch (loader) {
    case 'fabric':
      return ['fabric']
    case 'forge':
      return ['forge']
    case 'neoforge':
      return ['neoforge']
    case 'vanilla':
      return []
    default:
      return []
  }
}

export class ContentService {
  private readonly modrinth: ModrinthProvider
  private readonly curseforge: CurseForgeProvider
  private readonly providers: Map<ContentSourceId, ContentProvider>

  constructor(
    private readonly instances: InstanceStore,
    private readonly queue: DownloadQueue,
    private readonly logger: Logger,
    getCurseForgeApiKey: () => Promise<string | undefined>,
  ) {
    this.modrinth = new ModrinthProvider()
    this.curseforge = new CurseForgeProvider(getCurseForgeApiKey)
    this.providers = new Map<ContentSourceId, ContentProvider>([
      ['modrinth', this.modrinth],
      ['curseforge', this.curseforge],
    ])
  }

  async listProviders(): Promise<ContentProviderInfo[]> {
    const cfEnabled = CURSEFORGE_FEATURE_ENABLED && (await this.curseforge.hasApiKey())
    return [
      {
        id: 'aggregated',
        name: 'Aggregated',
        available: true,
      },
      {
        id: 'modrinth',
        name: 'Modrinth',
        available: true,
      },
      {
        id: 'curseforge',
        name: 'CurseForge',
        available: cfEnabled,
        unavailableReasonKey: CURSEFORGE_FEATURE_ENABLED
          ? cfEnabled
            ? undefined
            : 'content.provider.curseforgeUnavailable'
          : 'content.provider.curseforgeDisabled',
      },
    ]
  }

  async search(raw: unknown): Promise<ContentSearchResult> {
    const query = ContentSearchQuerySchema.parse(raw)

    if (query.provider === 'aggregated') {
      return this.searchAggregated(query)
    }

    const provider = this.providers.get(query.provider)
    if (!provider) throw new Error(`Unknown content provider: ${query.provider}`)

    if (query.provider === 'curseforge') {
      if (!CURSEFORGE_FEATURE_ENABLED || !(await this.curseforge.hasApiKey())) {
        return { hits: [], total: 0, offset: query.offset, limit: query.limit }
      }
    }

    return provider.search(query)
  }

  private async searchAggregated(query: ContentSearchQuery): Promise<ContentSearchResult> {
    const perSourceLimit = Math.min(50, Math.max(query.limit, 20))
    const base = { ...query, offset: 0, limit: perSourceLimit }

    const mrPromise = this.modrinth.search({ ...base, provider: 'modrinth' })
    const useCf = CURSEFORGE_FEATURE_ENABLED && (await this.curseforge.hasApiKey())
    const cfPromise = useCf
      ? this.curseforge.search({ ...base, provider: 'curseforge' }).catch((err) => {
          const msg = err instanceof Error ? err.message : 'unknown'
          this.logger.warn('downloader', `CurseForge search failed: ${msg.slice(0, 160)}`)
          return {
            hits: [] as ContentSearchResult['hits'],
            total: 0,
            offset: 0,
            limit: perSourceLimit,
          }
        })
      : Promise.resolve({
          hits: [] as ContentSearchResult['hits'],
          total: 0,
          offset: 0,
          limit: perSourceLimit,
        })

    const [mr, cf] = await Promise.all([mrPromise, cfPromise])
    const merged = useCf ? mergePreferModrinth(mr.hits, cf.hits) : mr.hits
    const sliced = merged.slice(query.offset, query.offset + query.limit)
    return {
      hits: sliced,
      total: merged.length,
      offset: query.offset,
      limit: query.limit,
    }
  }

  async listInstalled(instanceId: string, category?: ContentCategory): Promise<InstalledContent[]> {
    const index = await this.readIndex(instanceId)
    const items = index.items.map((i) => InstalledContentSchema.parse(i))
    if (!category) return items
    return items.filter((i) => i.category === category)
  }

  async install(raw: unknown): Promise<InstalledContent> {
    const req = ContentInstallRequestSchema.parse(raw)
    const profile = await this.instances.get(req.instanceId)
    if (!profile) throw new Error(`Instance not found: ${req.instanceId}`)

    const provider = this.providers.get(req.provider)
    if (!provider) throw new Error(`Content provider unavailable: ${req.provider}`)
    if (req.provider === 'curseforge') {
      if (!CURSEFORGE_FEATURE_ENABLED) {
        throw new Error('CurseForge 連携は現在無効です。')
      }
      if (!(await this.curseforge.hasApiKey())) {
        throw new Error('CurseForge APIキーが設定されていません。')
      }
    }

    const loaders =
      req.loaders ??
      (req.category === 'mod' || req.category === 'plugin'
        ? loaderToFilters(profile.loader)
        : [])
    const gameVersion = req.gameVersion ?? profile.minecraftVersion

    const resolved = await provider.resolveInstall({
      projectId: req.projectId,
      category: req.category,
      versionId: req.versionId,
      gameVersion,
      loaders,
    })

    const instanceDir = this.instances.instanceDir(req.instanceId)
    const destDir = path.join(instanceDir, categoryDir(resolved.category))
    await fs.mkdir(destDir, { recursive: true })
    const destPath = path.join(destDir, resolved.fileName)

    await this.queue.enqueue({
      kind: 'content',
      labelKey: 'content.installing',
      priority: 5,
      meta: { instanceId: req.instanceId, projectId: resolved.projectId },
      execute: async (ctx) => {
        const res = await fetch(resolved.downloadUrl, {
          signal: ctx.signal,
          headers: { 'User-Agent': 'Fledge/0.1.0 (content-download)' },
          redirect: 'follow',
        })
        if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
        const total = Number(res.headers.get('content-length') ?? resolved.size ?? 0)
        const buf = Buffer.from(await res.arrayBuffer())
        if (resolved.sha1) {
          const hash = createHash('sha1').update(buf).digest('hex')
          if (hash !== resolved.sha1) throw new Error('Checksum mismatch')
        }
        await fs.writeFile(destPath, buf)
        ctx.report({ current: buf.length, total: total || buf.length, unit: 'bytes' })
      },
    }).done

    const index = await this.readIndex(req.instanceId)
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

    const entry: InstalledContent = {
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
      enabled: true,
      installedAt: new Date().toISOString(),
      updateAvailable: false,
    }
    index.items.push(entry)
    await this.writeIndex(req.instanceId, index)
    this.logger.info(
      'downloader',
      `Installed ${entry.name}@${entry.versionNumber} → ${req.instanceId}`,
    )
    return entry
  }

  async setEnabled(instanceId: string, entryId: string, enabled: boolean): Promise<InstalledContent> {
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
  }

  async remove(instanceId: string, entryId: string): Promise<void> {
    const index = await this.readIndex(instanceId)
    const entry = index.items.find((i) => i.id === entryId)
    if (!entry) return
    const dir = path.join(this.instances.instanceDir(instanceId), categoryDir(entry.category))
    await this.deleteFileQuiet(path.join(dir, entry.fileName), entry.enabled)
    index.items = index.items.filter((i) => i.id !== entryId)
    await this.writeIndex(instanceId, index)
  }

  async checkUpdates(instanceId: string): Promise<InstalledContent[]> {
    const profile = await this.instances.get(instanceId)
    if (!profile) throw new Error(`Instance not found: ${instanceId}`)
    const index = await this.readIndex(instanceId)
    const loaders = loaderToFilters(profile.loader)

    for (const entry of index.items) {
      const provider = this.providers.get(entry.provider)
      if (!provider?.findUpdate) {
        entry.updateAvailable = false
        continue
      }
      if (
        entry.provider === 'curseforge' &&
        (!CURSEFORGE_FEATURE_ENABLED || !(await this.curseforge.hasApiKey()))
      ) {
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
    await this.writeIndex(instanceId, index)
    return index.items
  }

  async listMedia(
    instanceId: string,
    kind: 'screenshots' | 'logs',
  ): Promise<ContentMediaItem[]> {
    const dir = path.join(this.instances.instanceDir(instanceId), kind)
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      const items: ContentMediaItem[] = []
      for (const e of entries) {
        if (!e.isFile()) continue
        const full = path.join(dir, e.name)
        const stat = await fs.stat(full)
        items.push({
          name: e.name,
          path: full,
          mtime: stat.mtime.toISOString(),
          size: stat.size,
        })
      }
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
      loaders: category === 'mod' || category === 'plugin' ? loaderToFilters(profile.loader) : [],
      provider: 'aggregated',
      offset: 0,
      limit: 20,
    })
  }

  private indexPath(instanceId: string): string {
    return path.join(this.instances.instanceDir(instanceId), INDEX_DIR, INDEX_FILE)
  }

  private async readIndex(instanceId: string): Promise<IndexFile> {
    try {
      const raw = await fs.readFile(this.indexPath(instanceId), 'utf8')
      const parsed = JSON.parse(raw) as IndexFile
      return { items: Array.isArray(parsed.items) ? parsed.items : [] }
    } catch {
      return { items: [] }
    }
  }

  private async writeIndex(instanceId: string, index: IndexFile): Promise<void> {
    const p = this.indexPath(instanceId)
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.writeFile(p, JSON.stringify(index, null, 2), 'utf8')
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
