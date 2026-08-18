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

export function parseLibraryTab(value: string | null): LibraryDetailTab {
  if (value && (LIBRARY_DETAIL_TABS as string[]).includes(value)) {
    return value as LibraryDetailTab
  }
  return 'content'
}

export function parseContentCategory(value: string | null): ContentCategory {
  if (value && (CONTENT_CATEGORIES as string[]).includes(value)) {
    return value as ContentCategory
  }
  return 'mod'
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

/** コンテンツ種別を URL に反映（既定 mod は省略） */
export function writeContentCategory(params: URLSearchParams, category: ContentCategory) {
  if (category === 'mod') params.delete('category')
  else params.set('category', category)
}

export function openBrowse(params: URLSearchParams) {
  params.set('browse', '1')
}

export function closeBrowse(params: URLSearchParams) {
  params.delete('browse')
  params.delete('project')
}

export function writeProject(params: URLSearchParams, projectId: string) {
  params.set('project', projectId)
}
