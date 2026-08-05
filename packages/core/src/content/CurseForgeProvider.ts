import type {
  ContentCategory,
  ContentLoaderFilter,
  ContentProject,
  ContentSearchQuery,
  ContentSearchResult,
} from '@fledge/shared'
import type { ContentProvider, ResolvedContentFile } from './ContentProvider.js'

const API = 'https://api.curseforge.com/v1'
const MC_GAME_ID = 432

/** Minecraft class / section IDs */
const CLASS_ID: Record<ContentCategory, number> = {
  mod: 6,
  resourcepack: 12,
  shader: 6552,
  datapack: 6945,
  plugin: 5,
}

/** CurseForge ModLoaderType */
const LOADER_TYPE: Record<string, number> = {
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6,
}

type CfMod = {
  id: number
  name: string
  slug: string
  summary?: string
  downloadCount?: number
  classId?: number
  logo?: { url?: string } | null
  categories?: Array<{ name?: string }>
  latestFilesIndexes?: Array<{
    gameVersion?: string
    modLoader?: number
  }>
}

type CfFile = {
  id: number
  displayName: string
  fileName: string
  downloadUrl: string | null
  fileStatus: number
  fileDate: string
  fileLength: number
  gameVersions: string[]
  hashes?: Array<{ value: string; algo: number }>
  isAvailable?: boolean
}

type CfListResponse<T> = {
  data: T
  pagination?: { index: number; pageSize: number; resultCount: number; totalCount: number }
}

function mapLoaderName(modLoader?: number): string | null {
  switch (modLoader) {
    case 1:
      return 'forge'
    case 4:
      return 'fabric'
    case 5:
      return 'quilt'
    case 6:
      return 'neoforge'
    default:
      return null
  }
}

function primaryLoaderType(loaders?: ContentLoaderFilter[]): number | undefined {
  if (!loaders?.length) return undefined
  for (const l of loaders) {
    const id = LOADER_TYPE[l]
    if (id) return id
  }
  return undefined
}

function toProject(mod: CfMod, category: ContentCategory): ContentProject {
  const loaders = new Set<string>()
  const versions = new Set<string>()
  for (const idx of mod.latestFilesIndexes ?? []) {
    if (idx.gameVersion) versions.add(idx.gameVersion)
    const ln = mapLoaderName(idx.modLoader)
    if (ln) loaders.add(ln)
  }
  return {
    provider: 'curseforge',
    id: String(mod.id),
    slug: mod.slug,
    name: mod.name,
    description: mod.summary ?? '',
    iconUrl: mod.logo?.url ?? null,
    downloads: Math.max(0, Math.floor(mod.downloadCount ?? 0)),
    categories: (mod.categories ?? []).map((c) => c.name ?? '').filter(Boolean),
    gameVersions: [...versions].slice(0, 12),
    loaders: [...loaders],
    projectType: category,
  }
}

export class CurseForgeProvider implements ContentProvider {
  readonly id = 'curseforge' as const

  constructor(private readonly getApiKey: () => Promise<string | undefined>) {}

  async hasApiKey(): Promise<boolean> {
    const key = await this.getApiKey()
    return Boolean(key?.trim())
  }

  private async cfFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const key = (await this.getApiKey())?.trim()
    if (!key) throw new Error('CurseForge API key is not configured')
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'x-api-key': key,
        ...(init?.headers ?? {}),
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`CurseForge API ${res.status}: ${body.slice(0, 200)}`)
    }
    return (await res.json()) as T
  }

  async search(query: ContentSearchQuery): Promise<ContentSearchResult> {
    if (!(await this.hasApiKey())) {
      return { hits: [], total: 0, offset: query.offset, limit: query.limit }
    }

    const params = new URLSearchParams({
      gameId: String(MC_GAME_ID),
      classId: String(CLASS_ID[query.category]),
      pageSize: String(Math.min(50, query.limit)),
      index: String(query.offset),
      sortField: '2', // Popularity
      sortOrder: 'desc',
    })
    if (query.query) params.set('searchFilter', query.query)
    if (query.gameVersion) params.set('gameVersion', query.gameVersion)

    if ((query.category === 'mod' || query.category === 'plugin') && query.loaders.length) {
      const loaderType = primaryLoaderType(query.loaders)
      if (loaderType != null && query.gameVersion) {
        params.set('modLoaderType', String(loaderType))
      }
    }

    const data = await this.cfFetch<CfListResponse<CfMod[]>>(`/mods/search?${params}`)
    const hits = (data.data ?? []).map((m) => toProject(m, query.category))
    return {
      hits,
      total: data.pagination?.totalCount ?? hits.length,
      offset: query.offset,
      limit: query.limit,
    }
  }

  async resolveInstall(input: {
    projectId: string
    category: ContentCategory
    versionId?: string
    gameVersion?: string
    loaders?: ContentLoaderFilter[]
  }): Promise<ResolvedContentFile> {
    const modId = encodeURIComponent(input.projectId)

    let file: CfFile | undefined
    if (input.versionId) {
      const res = await this.cfFetch<CfListResponse<CfFile>>(`/mods/${modId}/files/${encodeURIComponent(input.versionId)}`)
      file = res.data
    } else {
      const params = new URLSearchParams({ pageSize: '50' })
      if (input.gameVersion) params.set('gameVersion', input.gameVersion)
      const loaderType = primaryLoaderType(input.loaders)
      if (loaderType != null && input.gameVersion) {
        params.set('modLoaderType', String(loaderType))
      }
      const res = await this.cfFetch<CfListResponse<CfFile[]>>(`/mods/${modId}/files?${params}`)
      const files = (res.data ?? []).filter((f) => f.isAvailable !== false && f.downloadUrl)
      file = files[0]
    }

    if (!file?.downloadUrl) {
      throw new Error('Compatible CurseForge file not found (or download URL missing)')
    }

    const modRes = await this.cfFetch<CfListResponse<CfMod>>(`/mods/${modId}`)
    const mod = modRes.data
    const sha1 = file.hashes?.find((h) => h.algo === 1)?.value

    return {
      provider: 'curseforge',
      projectId: String(mod.id),
      versionId: String(file.id),
      slug: mod.slug,
      name: mod.name,
      versionNumber: file.displayName || file.fileName,
      category: input.category,
      fileName: file.fileName,
      downloadUrl: file.downloadUrl,
      iconUrl: mod.logo?.url ?? null,
      sha1,
      size: file.fileLength,
    }
  }

  async findUpdate(
    entry: { projectId: string; versionId: string; category: ContentCategory },
    opts: { gameVersion?: string; loaders?: ContentLoaderFilter[] },
  ): Promise<{ versionId: string; versionNumber: string } | null> {
    if (!(await this.hasApiKey())) return null
    try {
      const resolved = await this.resolveInstall({
        projectId: entry.projectId,
        category: entry.category,
        gameVersion: opts.gameVersion,
        loaders: opts.loaders,
      })
      if (resolved.versionId === entry.versionId) return null
      return { versionId: resolved.versionId, versionNumber: resolved.versionNumber }
    } catch {
      return null
    }
  }
}
