import type {
  ContentCategory,
  ContentInstallRequest,
  ContentLoaderFilter,
  ContentProjectPage,
  ContentSearchQuery,
  ContentSearchResult,
  ContentSourceId,
  InstalledContent,
} from '@fledge/shared'

/** Provider が解決した「いま入れるファイル」 */
export type ResolvedContentFile = {
  provider: ContentSourceId
  projectId: string
  versionId: string
  slug: string
  name: string
  versionNumber: string
  category: ContentCategory
  fileName: string
  downloadUrl: string
  iconUrl: string | null
  sha1?: string
  size?: number
}

export type ContentProviderInfo = {
  id: ContentSourceId
  name: string
  /** false なら検索 UI で選択可だが使えない */
  available: boolean
  unavailableReasonKey?: string
}

/**
 * 配布元抽象。UI は ContentService 経由のみ利用し、Provider 直接依存を避ける。
 */
export interface ContentProvider {
  readonly id: ContentSourceId
  search(query: ContentSearchQuery): Promise<ContentSearchResult>
  getProject(projectId: string): Promise<ContentProjectPage>
  resolveInstall(input: {
    projectId: string
    category: ContentCategory
    versionId?: string
    gameVersion?: string
    loaders?: ContentLoaderFilter[]
  }): Promise<ResolvedContentFile>
  findUpdate?(
    entry: Pick<InstalledContent, 'projectId' | 'versionId' | 'category'>,
    opts: { gameVersion?: string; loaders?: ContentLoaderFilter[] },
  ): Promise<{ versionId: string; versionNumber: string } | null>
}

export type { ContentInstallRequest }
