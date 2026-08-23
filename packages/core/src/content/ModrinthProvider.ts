import { fledgeUserAgent } from '@fledge/shared'
import type {
  ContentCategory,
  ContentCategoryTag,
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
const UA = fledgeUserAgent('https://github.com/arula-folne/Fledge; content-manager')
const FETCH_TIMEOUT_MS = 20_000
const MAX_RATE_LIMIT_RETRIES = 2
const MAX_TRANSIENT_RETRIES = 1

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
  dependencies?: Array<{
    version_id?: string | null
    project_id?: string | null
    file_name?: string | null
    dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded'
  }>
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
    gameVersions: [],
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
    .slice(0, 8)
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
    body: (p.body ?? '').slice(0, 12_000),
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
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Fledge の locale を Modrinth API の Accept-Language にする。本文翻訳は返らないが、対応時に備える。 */
function acceptLanguageFromLocale(locale: string): string {
  const raw = locale.trim().replace(/_/g, '-') || 'en'
  const [langRaw, ...rest] = raw.split('-')
  const lang = (langRaw ?? 'en').toLowerCase()
  const region = rest.join('-')
  const primary = region
    ? `${lang}-${region.length === 2 ? region.toUpperCase() : region}`
    : lang
  const parts = [primary]
  if (region && primary.toLowerCase() !== lang) parts.push(`${lang};q=0.9`)
  if (!lang.startsWith('en')) parts.push('en;q=0.8')
  return parts.join(',')
}

function rateLimitDelayMs(res: Response): number {
  const retryAfter = Number(res.headers.get('Retry-After'))
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 10_000)
  const reset = Number(res.headers.get('X-Ratelimit-Reset'))
  if (Number.isFinite(reset) && reset > 0) return Math.min(reset * 1000, 10_000)
  return 1_500
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
}

function timedSignal(external?: AbortSignal | null): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const onExternalAbort = () => controller.abort()
  if (external) {
    if (external.aborted) controller.abort()
    else external.addEventListener('abort', onExternalAbort, { once: true })
  }
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onExternalAbort)
    },
  }
}

async function mrFetch<T>(
  path: string,
  init?: RequestInit,
  attempt = 0,
): Promise<T> {
  const { signal, cancel } = timedSignal(init?.signal)
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      signal,
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en;q=0.8',
        'User-Agent': UA,
        ...(init?.headers ?? {}),
      },
    })
    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      await wait(rateLimitDelayMs(res))
      return mrFetch<T>(path, init, attempt + 1)
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const err = new Error(`Modrinth API ${res.status}: ${body.slice(0, 200)}`)
      Object.assign(err, {
        messageKey: res.status === 429 ? 'content.searchRateLimited' : 'content.searchFailed',
      })
      throw err
    }
    return (await res.json()) as T
  } catch (err) {
    if (isAbortError(err) && !init?.signal?.aborted) {
      const timeout = new Error('Modrinth API timed out')
      Object.assign(timeout, { messageKey: 'content.searchTimeout' })
      throw timeout
    }
    const transient =
      err instanceof TypeError ||
      (err instanceof Error && /ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed/i.test(err.message))
    if (transient && attempt < MAX_TRANSIENT_RETRIES) {
      await wait(800 * (attempt + 1))
      return mrFetch<T>(path, init, attempt + 1)
    }
    if (err instanceof Error && !(err as Error & { messageKey?: string }).messageKey) {
      Object.assign(err, { messageKey: 'content.searchFailed' })
    }
    throw err
  } finally {
    cancel()
  }
}

function pickPrimaryFile(version: MrVersion): MrVersion['files'][number] {
  const files = version.files ?? []
  return files.find((f) => f.primary) ?? files[0]!
}

function contentError(messageKey: string, message: string, detail?: Record<string, string>): Error {
  const err = new Error(message)
  Object.assign(err, { messageKey, detail })
  return err
}

type MrProjectMeta = {
  id: string
  slug: string
  title: string
  icon_url?: string | null
  project_type?: string
}

type MrCategoryTag = {
  icon: string
  name: string
  project_type: string
  header: string
}

function mapCategoryTag(raw: MrCategoryTag): ContentCategoryTag {
  return {
    name: raw.name,
    projectType: raw.project_type,
    header: raw.header,
    icon: raw.icon ?? '',
  }
}

const MAX_DEPENDENCY_DEPTH = 24

export class ModrinthProvider implements ContentProvider {
  readonly id = 'modrinth' as const
  private categoryTagsCache: ContentCategoryTag[] | null = null

  constructor(private readonly getLocale: () => Promise<string> = async () => 'ja') {}

  private async api<T>(path: string, init?: RequestInit): Promise<T> {
    const locale = await this.getLocale().catch(() => 'ja')
    return mrFetch<T>(path, {
      ...init,
      headers: {
        'Accept-Language': acceptLanguageFromLocale(locale),
        ...(init?.headers ?? {}),
      },
    })
  }

  async search(query: ContentSearchQuery): Promise<ContentSearchResult> {
    const facets: string[][] = [[`project_type:${TYPE_MAP[query.category]}`]]
    if (query.gameVersion) facets.push([`versions:${query.gameVersion}`])
    if (query.loaders?.length) {
      facets.push(query.loaders.map((l) => `categories:${l}`))
    }
    if (query.tags?.length) {
      facets.push(query.tags.map((tag) => `categories:${tag}`))
    }
    if (query.environments?.includes('client')) {
      facets.push(['client_side:required', 'client_side:optional'])
    }
    if (query.environments?.includes('server')) {
      facets.push(['server_side:required', 'server_side:optional'])
    }

    const params = new URLSearchParams({
      limit: String(query.limit),
      offset: String(query.offset),
      index: query.sort ?? 'relevance',
      facets: JSON.stringify(facets),
    })
    if (query.query?.trim()) params.set('query', query.query.trim())

    const data = await this.api<{ hits?: MrHit[]; total_hits?: number }>(`/search?${params}`)
    const hits = (data.hits ?? []).map(hitToProject).filter((p): p is ContentProject => Boolean(p))
    return {
      hits,
      total: data.total_hits ?? hits.length,
      offset: query.offset,
      limit: query.limit,
    }
  }

  async getProject(projectId: string): Promise<ContentProjectPage> {
    const raw = await this.api<MrProject>(`/project/${encodeURIComponent(projectId)}`)
    const project = projectToDetail(raw, [])
    if (!project) throw new Error('Unsupported project type')
    return { project, versions: [] }
  }

  async listVersions(
    projectId: string,
    opts?: { gameVersion?: string; loaders?: ContentLoaderFilter[] },
  ): Promise<ContentVersion[]> {
    const params = new URLSearchParams()
    if (opts?.gameVersion) params.set('game_versions', JSON.stringify([opts.gameVersion]))
    if (opts?.loaders?.length) params.set('loaders', JSON.stringify(opts.loaders))
    const qs = params.toString()
    const versions = await this.api<MrVersion[]>(
      `/project/${encodeURIComponent(projectId)}/version${qs ? `?${qs}` : ''}`,
    )
    return (versions ?? []).slice(0, 40).map(mapVersion)
  }

  async listCategoryTags(): Promise<ContentCategoryTag[]> {
    if (this.categoryTagsCache) return this.categoryTagsCache
    const raw = await this.api<MrCategoryTag[]>('/tag/category')
    this.categoryTagsCache = (raw ?? []).map(mapCategoryTag)
    return this.categoryTagsCache
  }

  async resolveInstall(input: {
    projectId: string
    category: ContentCategory
    versionId?: string
    gameVersion?: string
    loaders?: ContentLoaderFilter[]
  }): Promise<ResolvedContentFile> {
    const files = await this.resolveInstallSet(input)
    const primary = files[files.length - 1]
    if (!primary) throw new Error('Compatible version not found on Modrinth')
    return primary
  }

  async resolveInstallSet(input: {
    projectId: string
    category: ContentCategory
    versionId?: string
    gameVersion?: string
    loaders?: ContentLoaderFilter[]
    installed?: ReadonlyMap<string, string>
  }): Promise<ResolvedContentFile[]> {
    const chosen = new Map<string, ResolvedContentFile>()
    const visiting = new Set<string>()
    const pinned = new Set<string>()
    const incompat = new Map<string, string>()
    let rootProjectId: string | null = null

    const walk = async (
      projectRef: string,
      category: ContentCategory,
      versionId: string | undefined,
      depth: number,
    ): Promise<void> => {
      if (depth > MAX_DEPENDENCY_DEPTH) {
        throw contentError(
          'content.error.dependencyTooDeep',
          '依存関係が深すぎるため解決できませんでした',
        )
      }

      const version = await this.fetchVersion(projectRef, versionId, input.gameVersion, input.loaders)
      const projectId = version.project_id
      if (!projectId) throw new Error('Modrinth version missing project_id')

      if (visiting.has(projectId)) return
      const existing = chosen.get(projectId)
      if (existing) {
        if (existing.versionId === version.id) return
        if (!versionId) return
        if (pinned.has(projectId)) {
          throw contentError(
            'content.error.dependencyConflict',
            `依存関係で要求されるバージョンが衝突しています: ${existing.name}`,
            { name: existing.name },
          )
        }
        // 未ピン留めの版を、依存が指定する version_id に合わせる（Sodium 最新→Iris 指定版など）
        chosen.delete(projectId)
      }
      if (versionId) pinned.add(projectId)

      visiting.add(projectId)
      try {
        const project = await this.api<MrProjectMeta>(`/project/${encodeURIComponent(projectId)}`)
        if (depth === 0) rootProjectId = project.id
        const resolvedCategory = mapCategory(project.project_type ?? '') ?? category

        for (const dep of version.dependencies ?? []) {
          const depProjectId = dep.project_id?.trim()
          if (!depProjectId) continue
          if (dep.dependency_type === 'incompatible') {
            incompat.set(depProjectId, project.title)
            continue
          }
          if (dep.dependency_type !== 'required') continue
          const depVersionId = dep.version_id?.trim() || undefined
          await walk(depProjectId, 'mod', depVersionId, depth + 1)
        }

        const file = pickPrimaryFile(version)
        if (!file) throw new Error('No downloadable file on Modrinth version')

        chosen.set(projectId, {
          provider: 'modrinth',
          projectId: project.id,
          versionId: version.id,
          slug: project.slug,
          name: project.title,
          versionNumber: version.version_number,
          category: resolvedCategory,
          fileName: file.filename,
          downloadUrl: file.url,
          iconUrl: project.icon_url ?? null,
          sha1: file.hashes?.sha1,
          size: file.size,
        })
      } finally {
        visiting.delete(projectId)
      }
    }

    await walk(input.projectId, input.category, input.versionId, 0)

    for (const [badId, byName] of incompat) {
      if (chosen.has(badId) || input.installed?.has(badId)) {
        const bad = chosen.get(badId)
        throw contentError(
          'content.error.dependencyIncompatible',
          `${byName} は ${bad?.name ?? badId} と併用できません`,
          { name: byName, other: bad?.name ?? badId },
        )
      }
    }

    const files = [...chosen.values()]
    if (!rootProjectId || files.length === 0) {
      throw new Error('Compatible version not found on Modrinth')
    }
    // Map 挿入順は依存→本体。念のため本体を末尾へ。
    const primary = files.find((f) => f.projectId === rootProjectId)
    if (!primary) return files
    return [...files.filter((f) => f.projectId !== rootProjectId), primary]
  }

  private async fetchVersion(
    projectId: string,
    versionId: string | undefined,
    gameVersion: string | undefined,
    loaders: ContentLoaderFilter[] | undefined,
  ): Promise<MrVersion> {
    if (versionId) {
      return this.api<MrVersion>(`/version/${encodeURIComponent(versionId)}`)
    }
    const params = new URLSearchParams()
    if (gameVersion) params.set('game_versions', JSON.stringify([gameVersion]))
    if (loaders?.length) params.set('loaders', JSON.stringify(loaders))
    const qs = params.toString()
    const versions = await this.api<MrVersion[]>(
      `/project/${encodeURIComponent(projectId)}/version${qs ? `?${qs}` : ''}`,
    )
    const version = versions[0]
    if (!version) {
      throw contentError(
        'content.error.compatibleVersionNotFound',
        `対応するバージョンが見つかりません: ${projectId}`,
        { projectId },
      )
    }
    return version
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
