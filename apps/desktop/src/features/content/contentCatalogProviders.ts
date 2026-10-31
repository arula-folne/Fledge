import type { ContentCatalogProviderId } from '@fledge/shared'

/** 検索画面で選べる配布元（お気に入りはプロバイダ共通） */
export const CONTENT_CATALOG_PROVIDERS: ContentCatalogProviderId[] = ['modrinth', 'folne']

export function isCatalogProvider(id: string): id is ContentCatalogProviderId {
  return id === 'modrinth' || id === 'folne'
}

export function isFolneProvider(id: ContentCatalogProviderId): boolean {
  return id === 'folne'
}
