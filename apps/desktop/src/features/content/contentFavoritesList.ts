import type {
  ContentCategory,
  ContentFavoriteEntry,
  ContentLoaderFilter,
  ContentProject,
  ContentSearchSort,
} from '@fledge/shared'

export type FavoriteCategoryFilter = 'all' | ContentCategory

export const FAVORITE_NAME_SORTS = ['nameAsc', 'nameDesc'] as const
export type FavoriteNameSort = (typeof FAVORITE_NAME_SORTS)[number]
export type FavoriteSort = ContentSearchSort | FavoriteNameSort

export const CONTENT_SEARCH_SORTS: ContentSearchSort[] = [
  'relevance',
  'downloads',
  'follows',
  'newest',
  'updated',
]

export const FAVORITE_SORTS: FavoriteSort[] = [...CONTENT_SEARCH_SORTS, ...FAVORITE_NAME_SORTS]

export function isFavoriteNameSort(sort: string): sort is FavoriteNameSort {
  return sort === 'nameAsc' || sort === 'nameDesc'
}

export function toContentSearchSort(sort: FavoriteSort): ContentSearchSort {
  return isFavoriteNameSort(sort) ? 'relevance' : sort
}

export const FAVORITE_GROUP_ORDER: ContentCategory[] = [
  'mod',
  'modpack',
  'resourcepack',
  'shader',
  'datapack',
  'plugin',
]

export type FavoriteCategoryGroup = {
  category: ContentCategory
  items: ContentProject[]
}

function sortProjects(projects: ContentProject[], sort: FavoriteSort): ContentProject[] {
  const list = [...projects]
  switch (sort) {
    case 'downloads':
      return list.sort((a, b) => b.downloads - a.downloads)
    case 'follows':
      return list.sort((a, b) => (b.follows ?? 0) - (a.follows ?? 0))
    case 'newest':
    case 'updated':
      return list.sort((a, b) => Date.parse(b.dateModified ?? '') - Date.parse(a.dateModified ?? ''))
    case 'nameDesc':
      return list.sort((a, b) => b.name.localeCompare(a.name, 'ja'))
    case 'nameAsc':
    case 'relevance':
    default:
      return list.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  }
}

function needsLoaders(category: ContentCategory): boolean {
  return category === 'mod' || category === 'modpack' || category === 'plugin'
}

/** 対応バージョンが空なら判定不能のため互換扱い */
export function projectSupportsGameVersion(
  project: ContentProject,
  gameVersion: string,
): boolean {
  const version = gameVersion.trim()
  if (!version) return true
  if (project.gameVersions.length === 0) return true
  return project.gameVersions.includes(version)
}

export function formatGameVersionList(versions: string[], limit = 8): string {
  if (versions.length === 0) return '—'
  const shown = versions.slice(0, limit)
  return shown.join(', ') + (versions.length > limit ? '…' : '')
}

export function filterFavoriteProjects(
  favorites: ContentFavoriteEntry[],
  options: {
    query: string
    sort: FavoriteSort
    category?: FavoriteCategoryFilter
    loaders?: ContentLoaderFilter[]
    tags?: string[]
  },
): ContentProject[] {
  const q = options.query.trim().toLowerCase()
  let projects = favorites.map((entry) => entry.project)

  if (options.category && options.category !== 'all') {
    projects = projects.filter((project) => project.projectType === options.category)
  }

  if (q) {
    projects = projects.filter((project) => {
      const haystack = [project.name, project.description, project.author ?? '']
        .join('\n')
        .toLowerCase()
      return haystack.includes(q)
    })
  }

  const category = options.category && options.category !== 'all' ? options.category : null
  if (options.loaders && options.loaders.length > 0) {
    const allowed = new Set<string>(options.loaders)
    projects = projects.filter((project) => {
      if (category && !needsLoaders(category)) return true
      if (!needsLoaders(project.projectType)) return true
      return project.loaders.length === 0 || project.loaders.some((loader) => allowed.has(loader))
    })
  }

  if (options.tags && options.tags.length > 0) {
    const wanted = new Set(options.tags)
    projects = projects.filter((project) => {
      const tags = [...project.displayCategories, ...project.categories]
      return tags.some((tag) => wanted.has(tag))
    })
  }

  return sortProjects(projects, options.sort)
}

export function countFavoriteCategories(projects: ContentProject[]): Map<ContentCategory, number> {
  const counts = new Map<ContentCategory, number>()
  for (const project of projects) {
    counts.set(project.projectType, (counts.get(project.projectType) ?? 0) + 1)
  }
  return counts
}

export function favoriteFilterTabs(
  screenTabs: ContentCategory[],
  present: Iterable<ContentCategory>,
): ContentCategory[] {
  const presentSet = new Set(present)
  const seen = new Set<ContentCategory>()
  const result: ContentCategory[] = []
  for (const category of screenTabs) {
    if (seen.has(category)) continue
    seen.add(category)
    result.push(category)
  }
  for (const category of FAVORITE_GROUP_ORDER) {
    if (presentSet.has(category) && !seen.has(category)) {
      result.push(category)
    }
  }
  return result
}

export function groupProjectsByCategory(projects: ContentProject[]): FavoriteCategoryGroup[] {
  const map = new Map<ContentCategory, ContentProject[]>()
  for (const project of projects) {
    const items = map.get(project.projectType) ?? []
    items.push(project)
    map.set(project.projectType, items)
  }
  return FAVORITE_GROUP_ORDER.flatMap((category) => {
    const items = map.get(category)
    return items?.length ? [{ category, items }] : []
  })
}

export function listFavoriteProjects(
  favorites: ContentFavoriteEntry[],
  options: {
    query: string
    sort: FavoriteSort
    page: number
    pageSize: number
    category?: FavoriteCategoryFilter
    loaders?: ContentLoaderFilter[]
    tags?: string[]
  },
): { hits: ContentProject[]; all: ContentProject[]; total: number; pageCount: number } {
  const projects = filterFavoriteProjects(favorites, options)
  const total = projects.length
  const pageCount = Math.max(1, Math.ceil(total / options.pageSize) || 1)
  const page = Math.min(Math.max(1, options.page), pageCount)
  const start = (page - 1) * options.pageSize
  const hits = projects.slice(start, start + options.pageSize)
  return { hits, all: projects, total, pageCount }
}
