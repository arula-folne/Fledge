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
  type ContentProjectPage,
  type ContentSearchQuery,
  type ContentSearchResult,
  type ContentVersion,
  type InstalledContent,
  loaderToContentFilters,
} from '@fledge/shared'
import type { DownloadQueue } from '../download/DownloadQueue.js'
import { fetchBody } from '../download/fetchBody.js'
import type { InstanceStore } from '../instances/InstanceStore.js'
import type { Logger } from '../logging/Logger.js'
import type { ContentProvider, ContentProviderInfo } from './ContentProvider.js'
import { ModrinthProvider } from './ModrinthProvider.js'
import type { SettingsStore } from '../settings/SettingsStore.js'

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

export class ContentService {
  private readonly modrinth: ModrinthProvider
  private readonly providers: Map<string, ContentProvider>
  private readonly indexTail = new Map<string, Promise<unknown>>()

  constructor(
    private readonly instances: InstanceStore,
    private readonly queue: DownloadQueue,
    private readonly logger: Logger,
    settings: SettingsStore,
  ) {
    this.modrinth = new ModrinthProvider(() => settings.get().then((s) => s.locale))
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
    const index = await this.readIndex(instanceId)
    const items = index.items
    if (!category) return items
    return items.filter((i) => i.category === category)
  }

  async install(raw: unknown): Promise<InstalledContent> {
    const req = ContentInstallRequestSchema.parse(raw)
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

    const { done } = this.queue.enqueue({
      kind: 'content',
      labelKey: 'content.downloading',
      priority: 5,
      sessionId: `content-${req.instanceId}-${resolved.projectId}`,
      meta: {
        instanceId: req.instanceId,
        projectId: resolved.projectId,
        projectName: resolved.name,
        category: resolved.category,
      },
      execute: async (ctx) => {
        const buf = await fetchBody(resolved.downloadUrl, {
          signal: ctx.signal,
          headers: { 'User-Agent': 'Fledge/0.1.0 (content-download)' },
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
        if (resolved.sha1) {
          const hash = createHash('sha1').update(buf).digest('hex')
          if (hash !== resolved.sha1) throw new Error('Checksum mismatch')
        }
        await fs.writeFile(destPath, buf)
        ctx.report({ current: buf.length, total: buf.length, unit: 'bytes' })
        await this.finalizeInstalledContent(req.instanceId, instanceDir, resolved, entry)
      },
    })

    void done.catch((err) => {
      this.logger.error('downloader', `Content install failed: ${String(err)}`)
      void fs.unlink(destPath).catch(() => {
        /* ignore partial file */
      })
    })

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
  ): Promise<void> {
    await this.withIndexLock(instanceId, async () => {
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

      index.items.push(entry)
      await this.writeIndex(instanceId, index)
      this.logger.info(
        'downloader',
        `Installed ${entry.name}@${entry.versionNumber} → ${instanceId}`,
      )
    })
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
    const loaders = loaderToContentFilters(profile.loader)

    for (const entry of index.items) {
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
      return {
        items: items.flatMap((item) => {
          const result = InstalledContentSchema.safeParse(item)
          return result.success ? [result.data] : []
        }),
      }
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
