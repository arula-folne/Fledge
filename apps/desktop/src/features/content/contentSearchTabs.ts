import type { ContentCategory, Loader } from '@fledge/shared'
import { contentCategoriesForLoader } from '@fledge/shared'

/** 検索画面のカテゴリタブ（お気に入りは UI 専用） */
export type ContentSearchTab = 'favorites' | ContentCategory

export function isFavoritesTab(tab: ContentSearchTab): tab is 'favorites' {
  return tab === 'favorites'
}

/** インスタンス作成用 Browse ページ（Modpack の左は Modpack、Mod の左にお気に入り） */
export function browsePageSearchTabs(): ContentSearchTab[] {
  return ['modpack', 'favorites', 'mod', 'resourcepack', 'shader', 'datapack']
}

/** インスタンスへのコンテンツ追加モーダル（ローダーに応じて種別を制限） */
export function instanceBrowseSearchTabs(loader: Loader): ContentSearchTab[] {
  return ['favorites', ...contentCategoriesForLoader(loader)]
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
