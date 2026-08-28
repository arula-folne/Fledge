import type { ContentFavoriteEntry, ContentProject, ContentSearchSort } from '@fledge/shared'

function sortProjects(projects: ContentProject[], sort: ContentSearchSort): ContentProject[] {
  const list = [...projects]
  switch (sort) {
    case 'downloads':
      return list.sort((a, b) => b.downloads - a.downloads)
    case 'follows':
      return list.sort((a, b) => (b.follows ?? 0) - (a.follows ?? 0))
    case 'newest':
    case 'updated':
      return list.sort((a, b) => Date.parse(b.dateModified ?? '') - Date.parse(a.dateModified ?? ''))
    case 'relevance':
    default:
      return list.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  }
}

export function listFavoriteProjects(
  favorites: ContentFavoriteEntry[],
  options: {
    query: string
    gameVersion: string
    sort: ContentSearchSort
    page: number
    pageSize: number
  },
): { hits: ContentProject[]; total: number; pageCount: number } {
  const q = options.query.trim().toLowerCase()
  let projects = favorites.map((entry) => entry.project)

  if (options.gameVersion.trim()) {
    const version = options.gameVersion.trim()
    projects = projects.filter(
      (project) =>
        project.gameVersions.length === 0 || project.gameVersions.includes(version),
    )
  }

  if (q) {
    projects = projects.filter((project) => {
      const haystack = [project.name, project.description, project.author ?? '']
        .join('\n')
        .toLowerCase()
      return haystack.includes(q)
    })
  }

  projects = sortProjects(projects, options.sort)
  const total = projects.length
  const pageCount = Math.max(1, Math.ceil(total / options.pageSize))
  const page = Math.min(Math.max(1, options.page), pageCount)
  const start = (page - 1) * options.pageSize
  const hits = projects.slice(start, start + options.pageSize)
  return { hits, total, pageCount }
}
