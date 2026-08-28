import path from 'node:path'
import type {
  Loader,
  LoaderVersion,
  LoaderVersionListResult,
  VersionInfo,
  VersionListResult,
} from '@fledge/shared'
import type { PathLayout } from '../app/paths.js'
import type { Logger } from '../logging/Logger.js'
import { FabricProvider } from './FabricProvider.js'
import { ForgeProvider } from './ForgeProvider.js'
import { MojangProvider } from './MojangProvider.js'
import { NeoForgeProvider } from './NeoForgeProvider.js'
import { QuiltProvider } from './QuiltProvider.js'
import { VersionCache } from './VersionCache.js'
import type { LoaderVersionProvider, MinecraftVersionProvider } from './VersionProvider.js'

const MC_CACHE_KEY = 'minecraft_versions'

function loaderCacheKey(loader: Loader, mc: string): string {
  return `${loader}_${mc.replace(/[^a-zA-Z0-9._-]/g, '_')}`
}

export class VersionService {
  private readonly cache: VersionCache
  private readonly mojang: MinecraftVersionProvider
  private readonly loaders: Map<Exclude<Loader, 'vanilla'>, LoaderVersionProvider>
  private readonly inflight = new Map<string, Promise<unknown>>()

  constructor(
    layout: PathLayout,
    private readonly logger: Logger,
  ) {
    this.cache = new VersionCache(path.join(layout.cache, 'versions'))
    this.mojang = new MojangProvider()
    this.loaders = new Map<Exclude<Loader, 'vanilla'>, LoaderVersionProvider>([
      ['fabric', new FabricProvider()],
      ['forge', new ForgeProvider()],
      ['neoforge', new NeoForgeProvider()],
      ['quilt', new QuiltProvider()],
    ])
  }

  async listMinecraftVersions(opts?: {
    includeSnapshots?: boolean
    force?: boolean
  }): Promise<VersionListResult> {
    const includeSnapshots = opts?.includeSnapshots ?? true
    const force = opts?.force ?? false

    const cached = await this.cache.get<VersionInfo[]>(MC_CACHE_KEY)

    if (!force && cached) {
      if (cached.stale) {
        void this.refreshMinecraftInBackground()
      }
      return {
        versions: filterMc(cached.data, includeSnapshots),
        fromCache: true,
        stale: cached.stale,
        offline: false,
        fetchedAt: cached.fetchedAt,
      }
    }

    try {
      const fresh = await this.fetchAndStoreMinecraft()
      return {
        versions: filterMc(fresh.data, includeSnapshots),
        fromCache: false,
        stale: false,
        offline: false,
        fetchedAt: fresh.fetchedAt,
      }
    } catch (err) {
      this.logger.warn('minecraft', `MC version fetch failed: ${String(err)}`)
      if (cached) {
        return {
          versions: filterMc(cached.data, includeSnapshots),
          fromCache: true,
          stale: true,
          offline: true,
          fetchedAt: cached.fetchedAt,
        }
      }
      throw err
    }
  }

  async listLoaderVersions(opts: {
    loader: Loader
    minecraftVersion: string
    force?: boolean
  }): Promise<LoaderVersionListResult> {
    const { loader, minecraftVersion, force = false } = opts
    if (loader === 'vanilla') {
      return {
        loader,
        minecraftVersion,
        versions: [],
        fromCache: false,
        stale: false,
        offline: false,
        fetchedAt: null,
      }
    }

    const provider = this.loaders.get(loader)
    if (!provider) {
      return {
        loader,
        minecraftVersion,
        versions: [],
        fromCache: false,
        stale: false,
        offline: false,
        fetchedAt: null,
      }
    }

    const key = loaderCacheKey(loader, minecraftVersion)
    const cached = await this.cache.get<LoaderVersion[]>(key)

    if (!force && cached) {
      if (cached.stale) {
        void this.refreshLoaderInBackground(loader, minecraftVersion)
      }
      return {
        loader,
        minecraftVersion,
        versions: cached.data,
        fromCache: true,
        stale: cached.stale,
        offline: false,
        fetchedAt: cached.fetchedAt,
      }
    }

    try {
      const fresh = await this.fetchAndStoreLoader(loader, minecraftVersion)
      return {
        loader,
        minecraftVersion,
        versions: fresh.data,
        fromCache: false,
        stale: false,
        offline: false,
        fetchedAt: fresh.fetchedAt,
      }
    } catch (err) {
      this.logger.warn('minecraft', `${loader} loader fetch failed: ${String(err)}`)
      if (cached) {
        return {
          loader,
          minecraftVersion,
          versions: cached.data,
          fromCache: true,
          stale: true,
          offline: true,
          fetchedAt: cached.fetchedAt,
        }
      }
      throw err
    }
  }

  /**
   * 手動更新: 対象キャッシュ削除 → 再取得。
   * target 省略時は MC + 指定ローダー（mc 付き）を更新。
   */
  async refresh(opts?: {
    target?: 'minecraft' | Loader
    minecraftVersion?: string
  }): Promise<void> {
    const target = opts?.target ?? 'minecraft'
    if (target === 'minecraft' || !opts?.target) {
      await this.cache.delete(MC_CACHE_KEY)
      await this.fetchAndStoreMinecraft()
    }
    if (target && target !== 'minecraft' && target !== 'vanilla' && opts?.minecraftVersion) {
      const key = loaderCacheKey(target, opts.minecraftVersion)
      await this.cache.delete(key)
      await this.fetchAndStoreLoader(target, opts.minecraftVersion)
    }
  }

  async clearCache(): Promise<void> {
    await this.cache.clear()
  }

  private async fetchAndStoreMinecraft(): Promise<{ data: VersionInfo[]; fetchedAt: string }> {
    const data = await this.mojang.fetchMinecraftVersions()
    const fetchedAt = await this.cache.set(MC_CACHE_KEY, data)
    return { data, fetchedAt }
  }

  private async fetchAndStoreLoader(
    loader: Exclude<Loader, 'vanilla'>,
    minecraftVersion: string,
  ): Promise<{ data: LoaderVersion[]; fetchedAt: string }> {
    const provider = this.loaders.get(loader)
    if (!provider) return { data: [], fetchedAt: new Date().toISOString() }
    const data = await provider.fetchLoaderVersions(minecraftVersion)
    const fetchedAt = await this.cache.set(loaderCacheKey(loader, minecraftVersion), data)
    return { data, fetchedAt }
  }

  private refreshMinecraftInBackground(): void {
    const key = 'bg:minecraft'
    if (this.inflight.has(key)) return
    const p = this.fetchAndStoreMinecraft()
      .catch((err) => {
        this.logger.warn('minecraft', `Background MC refresh failed: ${String(err)}`)
      })
      .finally(() => this.inflight.delete(key))
    this.inflight.set(key, p)
  }

  private refreshLoaderInBackground(
    loader: Exclude<Loader, 'vanilla'>,
    minecraftVersion: string,
  ): void {
    const key = `bg:${loader}:${minecraftVersion}`
    if (this.inflight.has(key)) return
    const p = this.fetchAndStoreLoader(loader, minecraftVersion)
      .catch((err) => {
        this.logger.warn('minecraft', `Background ${loader} refresh failed: ${String(err)}`)
      })
      .finally(() => this.inflight.delete(key))
    this.inflight.set(key, p)
  }
}

function filterMc(versions: VersionInfo[], includeSnapshots: boolean): VersionInfo[] {
  if (includeSnapshots) return versions
  return versions.filter((v) => v.type === 'release')
}
