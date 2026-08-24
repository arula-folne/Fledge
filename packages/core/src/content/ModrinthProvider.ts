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
  modpack: 'modpack',
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
    hashes?: { sha1?: string; sha512?: string }
  }>
}

function mapCategory(projectType: string): ContentCategory | null {
  switch (projectType) {
    case 'mod':
      return 'mod'
    case 'modpack':
      return 'modpack'
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

function toResolvedFile(
  project: MrProjectMeta,
  version: MrVersion,
  category: ContentCategory,
): ResolvedContentFile {
  const file = pickPrimaryFile(version)
  if (!file) throw new Error('No downloadable file on Modrinth version')
  return {
    provider: 'modrinth',
    projectId: project.id,
    versionId: version.id,
    slug: project.slug,
    name: project.title,
    versionNumber: version.version_number,
    category,
    fileName: file.filename,
    downloadUrl: file.url,
    iconUrl: project.icon_url ?? null,
    sha1: file.hashes?.sha1,
    sha512: file.hashes?.sha512,
    size: file.size,
  }
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
  private localeCache: string | null = null

  constructor(private readonly getLocale: () => Promise<string> = async () => 'ja') {}

  private async api<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.localeCache) {
      this.localeCache = await this.getLocale().catch(() => 'ja')
    }
    return mrFetch<T>(path, {
      ...init,
      headers: {
        'Accept-Language': acceptLanguageFromLocale(this.localeCache),
        ...(init?.headers ?? {}),
      },
    })
  }

  /** 解決セッション中だけ使う locale を更新 */
  private async refreshLocale(): Promise<void> {
    this.localeCache = await this.getLocale().catch(() => 'ja')
  }

  private async fetchProjectsByIds(ids: string[]): Promise<Map<string, MrProjectMeta>> {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
    const out = new Map<string, MrProjectMeta>()
    if (unique.length === 0) return out

    // Modrinth: GET /projects?ids=["a","b"]
    const CHUNK = 50
    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK)
      const params = new URLSearchParams({ ids: JSON.stringify(chunk) })
      const list = await this.api<MrProjectMeta[]>(`/projects?${params}`)
      for (const p of list ?? []) {
        if (p?.id) out.set(p.id, p)
      }
    }
    return out
  }

  async getProjectMetadata(
    ids: string[],
  ): Promise<Map<string, { slug: string; name: string; iconUrl: string | null }>> {
    const projects = await this.fetchProjectsByIds(ids)
    return new Map(
      [...projects.entries()].map(([id, project]) => [
        id,
        {
          slug: project.slug,
          name: project.title,
          iconUrl: project.icon_url ?? null,
        },
      ]),
    )
  }

  private async fetchVersionsByIds(ids: string[]): Promise<Map<string, MrVersion>> {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
    const out = new Map<string, MrVersion>()
    if (unique.length === 0) return out

    const CHUNK = 50
    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK)
      const params = new URLSearchParams({ ids: JSON.stringify(chunk) })
      const list = await this.api<MrVersion[]>(`/versions?${params}`)
      for (const v of list ?? []) {
        if (v?.id) out.set(v.id, v)
      }
    }
    return out
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
    await this.refreshLocale()

    // mrpack はパック内に依存を持つ。API 上の required 依存は辿らない
    if (input.category === 'modpack') {
      const version = await this.fetchVersion(
        input.projectId,
        input.versionId,
        input.gameVersion,
        input.loaders,
      )
      const meta = await this.api<MrProjectMeta>(
        `/project/${encodeURIComponent(version.project_id || input.projectId)}`,
      )
      return [toResolvedFile(meta, version, 'modpack')]
    }

    const chosen = new Map<string, ResolvedContentFile>()
    const pinned = new Set<string>()
    const incompat = new Map<string, string>()
    const projectCache = new Map<string, MrProjectMeta>()
    const versionByIdCache = new Map<string, MrVersion>()
    /** projectId → 進行中の walk（同一プロジェクトの重複解決を共有） */
    const inflight = new Map<string, Promise<void>>()
    let rootProjectId: string | null = null

    const ensureProjects = async (ids: string[]): Promise<void> => {
      const missing = ids.filter((id) => id && !projectCache.has(id))
      if (missing.length === 0) return
      const fetched = await this.fetchProjectsByIds(missing)
      for (const [id, meta] of fetched) projectCache.set(id, meta)
    }

    const fetchVersionCached = async (
      projectRef: string,
      versionId: string | undefined,
    ): Promise<MrVersion> => {
      if (versionId) {
        const hit = versionByIdCache.get(versionId)
        if (hit) return hit
        const bulk = await this.fetchVersionsByIds([versionId])
        for (const [id, v] of bulk) versionByIdCache.set(id, v)
        const version = versionByIdCache.get(versionId)
        if (version) return version
        return this.fetchVersion(projectRef, versionId, input.gameVersion, input.loaders)
      }
      return this.fetchVersion(projectRef, undefined, input.gameVersion, input.loaders)
    }

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

      const version = await fetchVersionCached(projectRef, versionId)
      if (version.id) versionByIdCache.set(version.id, version)
      const projectId = version.project_id
      if (!projectId) throw new Error('Modrinth version missing project_id')

      const joinExisting = async (): Promise<boolean> => {
        const existingJob = inflight.get(projectId)
        if (!existingJob) return false
        await existingJob
        const existing = chosen.get(projectId)
        if (!existing) return false
        if (existing.versionId === version.id) return true
        if (!versionId) return true
        if (pinned.has(projectId)) {
          throw contentError(
            'content.error.dependencyConflict',
            `依存関係で要求されるバージョンが衝突しています: ${existing.name}`,
            { name: existing.name },
          )
        }
        // 未ピン留め → 差し替えのため false（再実行）
        return false
      }

      if (await joinExisting()) return

      const run = async (): Promise<void> => {
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
          chosen.delete(projectId)
        }
        if (versionId) pinned.add(projectId)

        const requiredDeps: Array<{ projectId: string; versionId?: string }> = []
        const pendingIncompat: string[] = []
        for (const dep of version.dependencies ?? []) {
          const depProjectId = dep.project_id?.trim()
          if (!depProjectId) continue
          if (dep.dependency_type === 'incompatible') {
            pendingIncompat.push(depProjectId)
            continue
          }
          if (dep.dependency_type !== 'required') continue
          requiredDeps.push({
            projectId: depProjectId,
            versionId: dep.version_id?.trim() || undefined,
          })
        }

        await ensureProjects([projectId, ...requiredDeps.map((d) => d.projectId), ...pendingIncompat])
        const depVersionIds = requiredDeps
          .map((d) => d.versionId)
          .filter((id): id is string => Boolean(id && !versionByIdCache.has(id)))
        if (depVersionIds.length > 0) {
          const bulk = await this.fetchVersionsByIds(depVersionIds)
          for (const [id, v] of bulk) versionByIdCache.set(id, v)
        }

        if (!projectCache.has(projectId)) {
          const solo = await this.api<MrProjectMeta>(`/project/${encodeURIComponent(projectId)}`)
          projectCache.set(projectId, solo)
        }
        const meta = projectCache.get(projectId)!
        if (depth === 0) rootProjectId = meta.id
        const resolvedCategory = mapCategory(meta.project_type ?? '') ?? category

        for (const badId of pendingIncompat) {
          incompat.set(badId, meta.title)
        }

        if (requiredDeps.length > 0) {
          await Promise.all(
            requiredDeps.map((dep) => walk(dep.projectId, 'mod', dep.versionId, depth + 1)),
          )
        }

        chosen.set(projectId, toResolvedFile(meta, version, resolvedCategory))
      }

      let job = inflight.get(projectId)
      if (!job) {
        job = run().finally(() => {
          if (inflight.get(projectId) === job) inflight.delete(projectId)
        })
        inflight.set(projectId, job)
      }
      await job

      // 共有ジョブ完了後にピン留め差し替えが必要ならもう一度
      const after = chosen.get(projectId)
      if (
        versionId &&
        after &&
        after.versionId !== version.id &&
        !pinned.has(projectId)
      ) {
        await walk(projectRef, category, versionId, depth)
      } else if (versionId && after && after.versionId !== version.id && pinned.has(projectId)) {
        throw contentError(
          'content.error.dependencyConflict',
          `依存関係で要求されるバージョンが衝突しています: ${after.name}`,
          { name: after.name },
        )
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
      // 依存ツリー全体は見ず、当該プロジェクトの最新互換版だけ見る（高速）
      const versions = await this.listVersions(entry.projectId, {
        gameVersion: opts.gameVersion,
        loaders: opts.loaders,
      })
      const latest = versions[0]
      if (!latest || latest.id === entry.versionId) return null
      return { versionId: latest.id, versionNumber: latest.versionNumber }
    } catch {
      return null
    }
  }
}
