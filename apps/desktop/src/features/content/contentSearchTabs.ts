import type { ContentCatalogProviderId, ContentCategory, Loader } from '@fledge/shared'
import { contentCategoriesForLoader } from '@fledge/shared'

/** 検索画面のカテゴリタブ（お気に入りは UI 専用） */
export type ContentSearchTab = 'favorites' | ContentCategory

export function isFavoritesTab(tab: ContentSearchTab): tab is 'favorites' {
  return tab === 'favorites'
}

/** カテゴリ楕円内の並び: Modpack → Mod → リソースパック → データパック → シェーダー */
const BROWSE_CATEGORY_ORDER: ContentCategory[] = [
  'modpack',
  'mod',
  'resourcepack',
  'datapack',
  'shader',
]

/** folne 公式カタログで扱う種別（現状は Mod） */
const FOLNE_CATEGORY_ORDER: ContentCategory[] = ['mod']

/**
 * コンテンツ検索のタブ。
 * UI では (配布元) (お気に入り) (カテゴリ…) の 3 楕円に分ける。
 */
export function browsePageSearchTabs(
  provider: ContentCatalogProviderId = 'modrinth',
): ContentSearchTab[] {
  if (provider === 'folne') return ['favorites', ...FOLNE_CATEGORY_ORDER]
  return ['favorites', ...BROWSE_CATEGORY_ORDER]
}

/** インスタンスへのコンテンツ追加（ローダーで種別を制限。Modpack は閲覧・お気に入り用） */
export function instanceBrowseSearchTabs(
  loader: Loader,
  provider: ContentCatalogProviderId = 'modrinth',
): ContentSearchTab[] {
  if (provider === 'folne') {
    const allowed = new Set(contentCategoriesForLoader(loader))
    if (!allowed.has('mod')) return ['favorites']
    return ['favorites', 'mod']
  }
  const allowed = new Set(contentCategoriesForLoader(loader))
  const cats = BROWSE_CATEGORY_ORDER.filter(
    (c) => c === 'modpack' || allowed.has(c),
  )
  if (loader === 'vanilla') {
    return ['favorites', ...cats.filter((c) => allowed.has(c))]
  }
  return ['favorites', ...cats]
}

export function defaultInstanceBrowseTab(loader: Loader = 'fabric'): ContentSearchTab {
  const tabs = instanceBrowseSearchTabs(loader)
  if (tabs.includes('mod')) return 'mod'
  const first = tabs.find((tab) => !isFavoritesTab(tab))
  return first ?? 'resourcepack'
}

export function defaultBrowsePageTab(): ContentSearchTab {
  return 'modpack'
}

export function contentTabsAsCategories(tabs: ContentSearchTab[]): ContentCategory[] {
  return tabs.filter((tab): tab is ContentCategory => !isFavoritesTab(tab))
}
