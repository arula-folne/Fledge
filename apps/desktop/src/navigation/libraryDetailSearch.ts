import type { ContentCategory } from '@fledge/shared'
import type { LibraryDetailTab } from '../stores/appStores'

export const LIBRARY_DETAIL_TABS: LibraryDetailTab[] = [
  'content',
  'screenshots',
  'files',
  'logs',
]

export const CONTENT_CATEGORIES: ContentCategory[] = [
  'mod',
  'resourcepack',
  'shader',
  'datapack',
  'plugin',
]

/** インストール済み一覧のフィルター（すべて / 種別） */
export type ContentListFilter = 'all' | ContentCategory

export function parseContentFilter(value: string | null): ContentListFilter {
  if (value && (CONTENT_CATEGORIES as string[]).includes(value)) {
    return value as ContentCategory
  }
  return 'all'
}

/** 互換: 旧コード / HMR 向け。既定は all 相当として mod を返さない */
export function parseContentCategory(value: string | null): ContentCategory {
  const filter = parseContentFilter(value)
  return filter === 'all' ? 'mod' : filter
}

export function parseLibraryTab(value: string | null): LibraryDetailTab {
  if (value && (LIBRARY_DETAIL_TABS as string[]).includes(value)) {
    return value as LibraryDetailTab
  }
  return 'content'
}

/** 一覧フィルターを URL に反映（既定 all は省略） */
export function writeContentFilter(params: URLSearchParams, filter: ContentListFilter) {
  if (filter === 'all') params.delete('category')
  else params.set('category', filter)
}

/** @deprecated writeContentFilter を使用 */
export function writeContentCategory(params: URLSearchParams, category: ContentCategory) {
  writeContentFilter(params, category)
}

/** インスタンス詳細タブを URL に反映（既定 content は省略） */
export function writeLibraryTab(params: URLSearchParams, tab: LibraryDetailTab) {
  if (tab === 'content') params.delete('tab')
  else params.set('tab', tab)

  if (tab !== 'content') {
    params.delete('browse')
    params.delete('project')
    params.delete('category')
  }
}

export function openBrowse(params: URLSearchParams) {
  params.set('browse', '1')
}

export function closeBrowse(params: URLSearchParams) {
  params.delete('browse')
  params.delete('project')
  params.delete('category')
}

export function writeProject(params: URLSearchParams, projectId: string) {
  params.set('project', projectId)
}

/** インストール済み一覧などから詳細を開く（browse なし） */
export function openProject(params: URLSearchParams, projectId: string) {
  writeProject(params, projectId)
}

export function closeProject(params: URLSearchParams) {
  params.delete('project')
}
