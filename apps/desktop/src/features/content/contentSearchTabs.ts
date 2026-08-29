import type { ContentCategory } from '@fledge/shared'

/** 検索画面のカテゴリタブ（お気に入りは UI 専用） */
export type ContentSearchTab = 'favorites' | ContentCategory

export function isFavoritesTab(tab: ContentSearchTab): tab is 'favorites' {
  return tab === 'favorites'
}

/** インスタンス作成用 Browse ページ（Modpack の左は Modpack、Mod の左にお気に入り） */
export function browsePageSearchTabs(): ContentSearchTab[] {
  return ['modpack', 'favorites', 'mod', 'resourcepack', 'shader', 'datapack']
}

/** インスタンスへのコンテンツ追加モーダル（Mod の左にお気に入り） */
export function instanceBrowseSearchTabs(): ContentSearchTab[] {
  return ['favorites', 'mod', 'resourcepack', 'datapack', 'shader', 'plugin']
}

export function defaultInstanceBrowseTab(): ContentSearchTab {
  return 'mod'
}

export function defaultBrowsePageTab(): ContentSearchTab {
  return 'modpack'
}

export function contentTabsAsCategories(tabs: ContentSearchTab[]): ContentCategory[] {
  return tabs.filter((tab): tab is ContentCategory => !isFavoritesTab(tab))
}
