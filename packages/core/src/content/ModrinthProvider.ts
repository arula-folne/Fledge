import type {
  ContentCategory,
  ContentLoaderFilter,
  ContentProject,
  ContentProjectDetail,
  ContentProjectPage,
  ContentSearchQuery,
  ContentSearchResult,
  ContentVersion,
} from '@fledge/shared'
import type { ContentProvider, ResolvedContentFile } from './ContentProvider.js'

const API = 'https://api.modrinth.com/v2'
const UA = 'Fledge/0.1.0 (https://github.com/arula-folne/Fledge; content-manager)'

const TYPE_MAP: Record<ContentCategory, string> = {
  mod: 'mod',
  resourcepack: 'resourcepack',
  shader: 'shader',
  datapack: 'datapack',
  plugin: 'plugin',
}

type MrHit = {
  project_id: string
  slug: string
  title: string
  description: string
  author?: string
  icon_url?: string | null
  downloads: number
  follows?: number
  categories?: string[]
  display_categories?: string[]
  versions?: string[]
  date_modified?: string
  client_side?: 'required' | 'optional' | 'unsupported'
  server_side?: 'required' | 'optional' | 'unsupported'
  project_type: string
}

type MrProject = {
  id: string
  slug: string
  title: string
  description: string
  body?: string
  icon_url?: string | null
  downloads: number
  followers?: number
  categories?: string[]
  additional_categories?: string[]
  loaders?: string[]
  game_versions?: string[]
  client_side?: 'required' | 'optional' | 'unsupported'
  server_side?: 'required' | 'optional' | 'unsupported'
  project_type: string
  published?: string
  updated?: string
  issues_url?: string | null
  source_url?: string | null
  wiki_url?: string | null
  discord_url?: string | null
  donation_urls?: Array<{ id?: string; platform?: string; url?: string }>
  license?: { id?: string | null; name?: string | null; url?: string | null } | null
  gallery?: Array<{ url: string; title?: string | null; featured?: boolean }>
}

type MrMember = {
  role?: string
  user?: { username?: string; name?: string; avatar_url?: string | null }
}

type MrVersion = {
  id: string
  project_id: string
  name: string
  version_number: string
  game_versions: string[]
  loaders: string[]
  featured?: boolean
  date_published?: string
  downloads?: number
  version_type?: 'release' | 'beta' | 'alpha'
  changelog?: string | null
  files: Array<{
    url: string
    filename: string
    primary: boolean
    size: number
    hashes?: { sha1?: string }
  }>
}

function mapCategory(projectType: string): ContentCategory | null {
  switch (projectType) {
    case 'mod':
      return 'mod'
    case 'resourcepack':
      return 'resourcepack'
    case 'shader':
      return 'shader'
    case 'datapack':
      return 'datapack'
    case 'plugin':
      return 'plugin'
    default:
      return null
  }
}

const LOADER_CATS = [
  'fabric',
  'forge',
  'neoforge',
  'quilt',
  'bukkit',
  'paper',
  'spigot',
  'purpur',
]

function loadersFromCats(cats: string[]): string[] {
  return cats.filter((c) => LOADER_CATS.includes(c))
}

function hitToProject(hit: MrHit): ContentProject | null {
  const projectType = mapCategory(hit.project_type)
  if (!projectType) return null
  const cats = hit.categories ?? []
  const display = hit.display_categories ?? []
  return {
    provider: 'modrinth',
    id: hit.project_id,
    slug: hit.slug,
    name: hit.title,
    description: hit.description || '',
    iconUrl: hit.icon_url ?? null,
    downloads: hit.downloads ?? 0,
    follows: hit.follows ?? 0,
    author: hit.author,
    displayCategories: display,
    dateModified: hit.date_modified,
    clientSide: hit.client_side,
    serverSide: hit.server_side,
    categories: cats,
    gameVersions: hit.versions ?? [],
    loaders: loadersFromCats(cats),
    projectType,
  }
}

function projectToDetail(
  p: MrProject,
  members: Array<{ username: string; role?: string; avatarUrl?: string }>,
): ContentProjectDetail | null {
  const projectType = mapCategory(p.project_type)
  if (!projectType) return null
  const cats = [...(p.categories ?? []), ...(p.additional_categories ?? [])]
  const loaders = p.loaders?.length ? p.loaders : loadersFromCats(cats)
  const display = cats.filter((c) => !LOADER_CATS.includes(c))
  const gallery = (p.gallery ?? [])
    .slice()
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
    .map((g) => ({ url: g.url, title: g.title ?? undefined, featured: Boolean(g.featured) }))
  const author = members[0]?.username
  return {
    provider: 'modrinth',
    id: p.id,
    slug: p.slug,
    name: p.title,
    description: p.description || '',
    iconUrl: p.icon_url ?? null,
    downloads: p.downloads ?? 0,
    follows: p.followers ?? 0,
    author,
    displayCategories: display,
    dateModified: p.updated,
    clientSide: p.client_side,
    serverSide: p.server_side,
    categories: cats,
    gameVersions: p.game_versions ?? [],
    loaders,
    projectType,
    body: p.body ?? '',
    publishedAt: p.published,
    licenseId: p.license?.id ?? undefined,
    licenseName: p.license?.name ?? undefined,
    licenseUrl: p.license?.url ?? undefined,
    issuesUrl: p.issues_url ?? undefined,
    sourceUrl: p.source_url ?? undefined,
    wikiUrl: p.wiki_url ?? undefined,
    discordUrl: p.discord_url ?? undefined,
    donationUrls: (p.donation_urls ?? [])
      .filter((d) => d.url)
      .map((d) => ({ platform: d.platform || d.id || 'donate', url: d.url! })),
    members,
    gallery,
  }
}

function mapVersion(v: MrVersion): ContentVersion {
  return {
    id: v.id,
    name: v.name,
    versionNumber: v.version_number,
    gameVersions: v.game_versions ?? [],
    loaders: v.loaders ?? [],
    featured: Boolean(v.featured),
    datePublished: v.date_published,
    downloads: v.downloads ?? 0,
    versionType: v.version_type,
    changelog: v.changelog ?? undefined,
  }
}

async function mrFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'ja,en;q=0.8',
      'User-Agent': UA,
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Modrinth API ${res.status}: ${body.slice(0, 200)}`)
  }
  return (await res.json()) as T
}

function pickPrimaryFile(version: MrVersion): MrVersion['files'][number] {
  const files = version.files ?? []
  return files.find((f) => f.primary) ?? files[0]!
}

export class ModrinthProvider implements ContentProvider {
  readonly id = 'modrinth' as const

  async search(query: ContentSearchQuery): Promise<ContentSearchResult> {
    const facets: string[][] = [[`project_type:${TYPE_MAP[query.category]}`]]
    if (query.gameVersion) facets.push([`versions:${query.gameVersion}`])
    if (query.loaders?.length) {
      facets.push(query.loaders.map((l) => `categories:${l}`))
    }

    const params = new URLSearchParams({
      limit: String(query.limit),
      offset: String(query.offset),
      index: query.sort ?? 'relevance',
      facets: JSON.stringify(facets),
    })
    if (query.query?.trim()) params.set('query', query.query.trim())

    const data = await mrFetch<{ hits?: MrHit[]; total_hits?: number }>(`/search?${params}`)
    const hits = (data.hits ?? []).map(hitToProject).filter((p): p is ContentProject => Boolean(p))
    return {
      hits,
      total: data.total_hits ?? hits.length,
      offset: query.offset,
      limit: query.limit,
    }
  }

  async getProject(projectId: string): Promise<ContentProjectPage> {
    const id = encodeURIComponent(projectId)
    const [raw, versions, members] = await Promise.all([
      mrFetch<MrProject>(`/project/${id}`),
      mrFetch<MrVersion[]>(`/project/${id}/version`),
      mrFetch<MrMember[]>(`/project/${id}/members`).catch(() => [] as MrMember[]),
    ])
    const team = members
      .map((m) => ({
        username: m.user?.username ?? m.user?.name ?? '',
        role: m.role,
        avatarUrl: m.user?.avatar_url ?? undefined,
      }))
      .filter((m) => m.username)
    const ownerIdx = team.findIndex((m) => m.role === 'Owner' || m.role === 'owner')
    if (ownerIdx > 0) {
      const [owner] = team.splice(ownerIdx, 1)
      if (owner) team.unshift(owner)
    }
    const project = projectToDetail(raw, team)
    if (!project) throw new Error('Unsupported Modrinth project type')
    return {
      project,
      versions: (versions ?? []).map(mapVersion),
    }
  }

  async resolveInstall(input: {
    projectId: string
    category: ContentCategory
    versionId?: string
    gameVersion?: string
    loaders?: ContentLoaderFilter[]
  }): Promise<ResolvedContentFile> {
    let version: MrVersion | undefined

    if (input.versionId) {
      version = await mrFetch<MrVersion>(`/version/${encodeURIComponent(input.versionId)}`)
    } else {
      const params = new URLSearchParams()
      if (input.gameVersion) {
        params.set('game_versions', JSON.stringify([input.gameVersion]))
      }
      if (input.loaders?.length) {
        params.set('loaders', JSON.stringify(input.loaders))
      }
      const qs = params.toString()
      const versions = await mrFetch<MrVersion[]>(
        `/project/${encodeURIComponent(input.projectId)}/version${qs ? `?${qs}` : ''}`,
      )
      version = versions[0]
    }

    if (!version) throw new Error('Compatible version not found on Modrinth')
    const file = pickPrimaryFile(version)
    if (!file) throw new Error('No downloadable file on Modrinth version')

    const project = await mrFetch<{
      id: string
      slug: string
      title: string
      icon_url?: string | null
    }>(`/project/${encodeURIComponent(input.projectId)}`)

    return {
      provider: 'modrinth',
      projectId: project.id,
      versionId: version.id,
      slug: project.slug,
      name: project.title,
      versionNumber: version.version_number,
      category: input.category,
      fileName: file.filename,
      downloadUrl: file.url,
      iconUrl: project.icon_url ?? null,
      sha1: file.hashes?.sha1,
      size: file.size,
    }
  }

  async findUpdate(
    entry: { projectId: string; versionId: string; category: ContentCategory },
    opts: { gameVersion?: string; loaders?: ContentLoaderFilter[] },
  ): Promise<{ versionId: string; versionNumber: string } | null> {
    try {
      const resolved = await this.resolveInstall({
        projectId: entry.projectId,
        category: entry.category,
        gameVersion: opts.gameVersion,
        loaders: opts.loaders,
      })
      if (resolved.versionId === entry.versionId) return null
      return { versionId: resolved.versionId, versionNumber: resolved.versionNumber }
    } catch {
      return null
    }
  }
}
