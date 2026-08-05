import type {
  ContentCategory,
  ContentLoaderFilter,
  ContentProject,
  ContentSearchQuery,
  ContentSearchResult,
} from '@fledge/shared'
import type { ContentProvider, ResolvedContentFile } from '../ContentProvider.js'
import {
  CurseForgeApiService,
  type CfModSummary,
} from './CurseForgeApiService.js'
import { CurseForgeHttpClient } from './CurseForgeHttpClient.js'

/** Minecraft class / section IDs */
const CLASS_ID: Record<ContentCategory, number> = {
  mod: 6,
  resourcepack: 12,
  shader: 6552,
  datapack: 6945,
  plugin: 5,
}

const LOADER_TYPE: Record<string, number> = {
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6,
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

function toProject(mod: CfModSummary, category: ContentCategory): ContentProject {
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
  private readonly api: CurseForgeApiService

  constructor(
    private readonly getApiKey: () => Promise<string | undefined>,
    httpClient?: CurseForgeHttpClient,
  ) {
    const http =
      httpClient ??
      new CurseForgeHttpClient({
        resolveApiKey: this.getApiKey.bind(this),
      })
    this.api = new CurseForgeApiService(http)
  }

  /** ContentProvider 外からも詳細・カテゴリ等に使う */
  get service(): CurseForgeApiService {
    return this.api
  }

  async hasApiKey(): Promise<boolean> {
    const key = await this.getApiKey()
    return Boolean(key?.trim())
  }

  async search(query: ContentSearchQuery): Promise<ContentSearchResult> {
    if (!(await this.hasApiKey())) {
      return { hits: [], total: 0, offset: query.offset, limit: query.limit }
    }

    const loaderType =
      (query.category === 'mod' || query.category === 'plugin') && query.loaders.length
        ? primaryLoaderType(query.loaders)
        : undefined

    const data = await this.api.searchMods({
      classId: CLASS_ID[query.category],
      searchFilter: query.query || undefined,
      gameVersion: query.gameVersion,
      modLoaderType: loaderType != null && query.gameVersion ? loaderType : undefined,
      pageSize: Math.min(50, query.limit),
      index: query.offset,
    })
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
    const loaderType = primaryLoaderType(input.loaders)

    let file
    if (input.versionId) {
      file = await this.api.getModFile(input.projectId, input.versionId)
    } else {
      const files = await this.api.listModFiles(input.projectId, {
        gameVersion: input.gameVersion,
        modLoaderType: loaderType != null && input.gameVersion ? loaderType : undefined,
      })
      file = files.find((f) => f.isAvailable !== false && f.downloadUrl) ?? files[0]
    }

    if (!file?.downloadUrl) {
      throw new Error('対応する CurseForge ファイルが見つかりません。')
    }

    const mod = await this.api.getMod(input.projectId)
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
