import type { CurseForgeHttpClient } from './CurseForgeHttpClient.js'

const MC_GAME_ID = 432

export type CfModSummary = {
  id: number
  name: string
  slug: string
  summary?: string
  downloadCount?: number
  classId?: number
  logo?: { url?: string } | null
  categories?: Array<{ id?: number; name?: string }>
  latestFilesIndexes?: Array<{
    gameVersion?: string
    modLoader?: number
    fileId?: number
  }>
}

export type CfFile = {
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

export type CfCategory = {
  id: number
  name: string
  slug?: string
  classId?: number
  parentCategoryId?: number
}

export type CfMinecraftVersion = {
  id: number
  gameVersionId: number
  versionString: string
  jarModLoader?: string
}

type CfListResponse<T> = {
  data: T
  pagination?: { index: number; pageSize: number; resultCount: number; totalCount: number }
}

export type SearchModsParams = {
  classId?: number
  categoryId?: number
  gameVersion?: string
  searchFilter?: string
  modLoaderType?: number
  pageSize?: number
  index?: number
  sortField?: number
  sortOrder?: 'asc' | 'desc'
}

/**
 * CurseForge REST 操作のサービス層。
 * UI / ContentProvider はここ経由のみアクセスし、将来プロキシへ差し替え可能にする。
 */
export class CurseForgeApiService {
  constructor(private readonly http: CurseForgeHttpClient) {}

  /** Mod 検索 */
  async searchMods(params: SearchModsParams): Promise<CfListResponse<CfModSummary[]>> {
    const qs = new URLSearchParams({
      gameId: String(MC_GAME_ID),
      pageSize: String(Math.min(50, params.pageSize ?? 20)),
      index: String(params.index ?? 0),
      sortField: String(params.sortField ?? 2),
      sortOrder: params.sortOrder ?? 'desc',
    })
    if (params.classId != null) qs.set('classId', String(params.classId))
    if (params.categoryId != null) qs.set('categoryId', String(params.categoryId))
    if (params.gameVersion) qs.set('gameVersion', params.gameVersion)
    if (params.searchFilter) qs.set('searchFilter', params.searchFilter)
    if (params.modLoaderType != null) qs.set('modLoaderType', String(params.modLoaderType))
    return this.http.get(`/mods/search?${qs}`)
  }

  /** Mod 詳細 */
  async getMod(modId: string | number): Promise<CfModSummary> {
    const res = await this.http.get<CfListResponse<CfModSummary>>(`/mods/${encodeURIComponent(String(modId))}`)
    return res.data
  }

  /** 複数 Mod 詳細（POST） */
  async getMods(modIds: number[]): Promise<CfModSummary[]> {
    const res = await this.http.post<CfListResponse<CfModSummary[]>>('/mods', { modIds })
    return res.data ?? []
  }

  /** Minecraft バージョン一覧 */
  async getMinecraftVersions(): Promise<CfMinecraftVersion[]> {
    const res = await this.http.get<CfListResponse<CfMinecraftVersion[]>>(
      `/minecraft/version`,
    )
    return res.data ?? []
  }

  /** カテゴリ一覧（Minecraft） */
  async getCategories(): Promise<CfCategory[]> {
    const res = await this.http.get<CfListResponse<CfCategory[]>>(
      `/categories?gameId=${MC_GAME_ID}`,
    )
    return res.data ?? []
  }

  /** ファイルメタ */
  async getModFile(modId: string | number, fileId: string | number): Promise<CfFile> {
    const res = await this.http.get<CfListResponse<CfFile>>(
      `/mods/${encodeURIComponent(String(modId))}/files/${encodeURIComponent(String(fileId))}`,
    )
    return res.data
  }

  /** ファイル一覧 */
  async listModFiles(
    modId: string | number,
    opts?: { gameVersion?: string; modLoaderType?: number; pageSize?: number },
  ): Promise<CfFile[]> {
    const qs = new URLSearchParams({ pageSize: String(opts?.pageSize ?? 50) })
    if (opts?.gameVersion) qs.set('gameVersion', opts.gameVersion)
    if (opts?.modLoaderType != null) qs.set('modLoaderType', String(opts.modLoaderType))
    const res = await this.http.get<CfListResponse<CfFile[]>>(
      `/mods/${encodeURIComponent(String(modId))}/files?${qs}`,
    )
    return res.data ?? []
  }

  /** ダウンロード URL 取得（ファイルメタ経由） */
  async getDownloadUrl(modId: string | number, fileId: string | number): Promise<string> {
    const file = await this.getModFile(modId, fileId)
    if (!file.downloadUrl) {
      throw new Error('ダウンロード URL を取得できませんでした。')
    }
    return file.downloadUrl
  }
}

export { MC_GAME_ID }
