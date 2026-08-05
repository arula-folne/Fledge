import type {
  ContentCategory,
  ContentLoaderFilter,
  ContentProject,
  ContentSearchQuery,
  ContentSearchResult,
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
  icon_url?: string | null
  downloads: number
  categories?: string[]
  versions?: string[]
  display_categories?: string[]
  project_type: string
}

type MrVersion = {
  id: string
  project_id: string
  name: string
  version_number: string
  game_versions: string[]
  loaders: string[]
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

function hitToProject(hit: MrHit): ContentProject | null {
  const projectType = mapCategory(hit.project_type)
  if (!projectType) return null
  const cats = hit.categories ?? []
  const loaders = cats.filter((c) =>
    ['fabric', 'forge', 'neoforge', 'quilt', 'bukkit', 'paper', 'spigot', 'purpur'].includes(c),
  )
  return {
    provider: 'modrinth',
    id: hit.project_id,
    slug: hit.slug,
    name: hit.title,
    description: hit.description || '',
    iconUrl: hit.icon_url ?? null,
    downloads: hit.downloads ?? 0,
    categories: cats,
    gameVersions: hit.versions ?? [],
    loaders,
    projectType,
  }
}

async function mrFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
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
  return version.files.find((f) => f.primary) ?? version.files[0]!
}

export class ModrinthProvider implements ContentProvider {
  readonly id = 'modrinth' as const

  async search(query: ContentSearchQuery): Promise<ContentSearchResult> {
    const facets: string[][] = [[`project_type:${TYPE_MAP[query.category]}`]]
    if (query.gameVersion) facets.push([`versions:${query.gameVersion}`])
    if (query.loaders.length) {
      facets.push(query.loaders.map((l) => `categories:${l}`))
    }

    const params = new URLSearchParams({
      query: query.query,
      limit: String(query.limit),
      offset: String(query.offset),
      index: 'relevance',
      facets: JSON.stringify(facets),
    })

    const data = await mrFetch<{ hits: MrHit[]; total_hits: number }>(`/search?${params}`)
    const hits = data.hits.map(hitToProject).filter((p): p is ContentProject => Boolean(p))
    return {
      hits,
      total: data.total_hits,
      offset: query.offset,
      limit: query.limit,
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
