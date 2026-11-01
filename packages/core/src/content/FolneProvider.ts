import { fledgeUserAgent } from '@fledge/shared'
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

/** 本番: folne 公式サイト。開発時は FLEDGE_FOLNE_CONTENT_API で上書き可 */
const DEFAULT_API_BASE = 'https://www.folne.net/api/content'
const UA = fledgeUserAgent('https://github.com/arula-folne/Fledge; folne-content')
const FETCH_TIMEOUT_MS = 20_000

type FolneHit = {
  provider?: string
  id: string
  slug: string
  name: string
  description: string
  iconUrl?: string | null
  downloads?: number
  follows?: number
  author?: string
  displayCategories?: string[]
  dateModified?: string
  categories?: string[]
  gameVersions?: string[]
  loaders?: string[]
  projectType: ContentCategory
}

type FolneVersion = ContentVersion & {
  files?: Array<{
    url: string
    filename: string
    primary?: boolean
    size?: number
    hashes?: { sha1?: string; sha512?: string }
  }>
}

type FolneResolved = {
  provider: 'folne'
  projectId: string
  versionId: string
  slug: string
  name: string
  versionNumber: string
  category: ContentCategory
  fileName: string
  downloadUrl: string
  iconUrl: string | null
  sha1?: string
  sha512?: string
  size?: number
}

function apiBase(): string {
  const fromEnv = process.env.FLEDGE_FOLNE_CONTENT_API?.trim()
  return (fromEnv || DEFAULT_API_BASE).replace(/\/$/, '')
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  )
}

async function folneFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const cancel = () => clearTimeout(timer)
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': UA,
        ...(init?.headers ?? {}),
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const err = new Error(`folne content API ${res.status}: ${body.slice(0, 200)}`)
      Object.assign(err, {
        messageKey:
          res.status === 429
            ? 'content.searchRateLimited'
            : res.status === 404
              ? 'content.error.compatibleVersionNotFound'
              : 'content.searchFailed',
      })
      throw err
    }
    return (await res.json()) as T
  } catch (err) {
    if (isAbortError(err) && !init?.signal?.aborted) {
      const timeout = new Error('folne content API timed out')
      Object.assign(timeout, { messageKey: 'content.searchTimeout' })
      throw timeout
    }
    if (err instanceof Error && !(err as Error & { messageKey?: string }).messageKey) {
      Object.assign(err, { messageKey: 'content.searchFailed' })
    }
    throw err
  } finally {
    cancel()
  }
}

function hitToProject(hit: FolneHit): ContentProject | null {
  if (!hit?.id || !hit.projectType) return null
  return {
    provider: 'folne',
    id: hit.id,
    slug: hit.slug || hit.id,
    name: hit.name,
    description: hit.description ?? '',
    iconUrl: hit.iconUrl ?? null,
    downloads: hit.downloads ?? 0,
    follows: hit.follows ?? 0,
    author: hit.author,
    displayCategories: hit.displayCategories ?? [],
    dateModified: hit.dateModified,
    categories: hit.categories ?? [hit.projectType],
    gameVersions: hit.gameVersions ?? [],
    loaders: hit.loaders ?? [],
    projectType: hit.projectType,
  }
}

/**
 * folne 公式サイト（www.folne.net）を Modrinth と同じ役割の配布元として使う。
 * 検索・詳細・バージョン・ファイル解決はすべてサイトの /api/content 経由。
 */
export class FolneProvider implements ContentProvider {
  readonly id = 'folne' as const

  async search(query: ContentSearchQuery): Promise<ContentSearchResult> {
    const params = new URLSearchParams({
      category: query.category,
      sort: query.sort ?? 'relevance',
      offset: String(query.offset),
      limit: String(query.limit),
      locale: 'ja',
    })
    if (query.query?.trim()) params.set('query', query.query.trim())
    if (query.gameVersion?.trim()) params.set('gameVersion', query.gameVersion.trim())
    if (query.loaders?.length) params.set('loaders', query.loaders.join(','))
    if (query.tags?.length) params.set('tags', query.tags.join(','))

    const data = await folneFetch<{
      hits?: FolneHit[]
      total?: number
      offset?: number
      limit?: number
    }>(`/search?${params}`)

    const hits = (data.hits ?? [])
      .map(hitToProject)
      .filter((p): p is ContentProject => Boolean(p))

    return {
      hits,
      total: data.total ?? hits.length,
      offset: data.offset ?? query.offset,
      limit: data.limit ?? query.limit,
    }
  }

  async getProject(projectId: string): Promise<ContentProjectPage> {
    const page = await folneFetch<{
      project: ContentProjectDetail & { provider?: string }
      versions?: ContentVersion[]
    }>(`/projects/${encodeURIComponent(projectId)}?locale=ja`)

    const project = hitToProject({
      ...page.project,
      projectType: page.project.projectType,
    })
    if (!project) throw new Error('Unsupported folne project type')

    return {
      project: {
        ...page.project,
        ...project,
        body: page.project.body ?? '',
        donationUrls: page.project.donationUrls ?? [],
        members: page.project.members ?? [],
        gallery: page.project.gallery ?? [],
      },
      versions: page.versions ?? [],
    }
  }

  async listVersions(
    projectId: string,
    opts?: { gameVersion?: string; loaders?: ContentLoaderFilter[] },
  ): Promise<ContentVersion[]> {
    const params = new URLSearchParams()
    if (opts?.gameVersion?.trim()) params.set('gameVersion', opts.gameVersion.trim())
    if (opts?.loaders?.length) params.set('loaders', opts.loaders.join(','))
    const qs = params.toString()
    const versions = await folneFetch<FolneVersion[]>(
      `/projects/${encodeURIComponent(projectId)}/versions${qs ? `?${qs}` : ''}`,
    )
    return (versions ?? []).map((v) => ({
      id: v.id,
      name: v.name,
      versionNumber: v.versionNumber,
      gameVersions: v.gameVersions ?? [],
      loaders: v.loaders ?? [],
      featured: v.featured ?? false,
      datePublished: v.datePublished,
      downloads: v.downloads ?? 0,
      versionType: v.versionType,
      changelog: v.changelog,
    }))
  }

  async resolveInstall(input: {
    projectId: string
    category: ContentCategory
    versionId?: string
    gameVersion?: string
    loaders?: ContentLoaderFilter[]
  }): Promise<ResolvedContentFile> {
    const params = new URLSearchParams({
      projectId: input.projectId,
      category: input.category,
    })
    if (input.versionId) params.set('versionId', input.versionId)
    if (input.gameVersion?.trim()) params.set('gameVersion', input.gameVersion.trim())
    if (input.loaders?.length) params.set('loaders', input.loaders.join(','))

    const resolved = await folneFetch<FolneResolved>(`/resolve?${params}`)
    if (!resolved?.downloadUrl || !resolved.fileName) {
      throw Object.assign(new Error('Compatible version not found on folne'), {
        messageKey: 'content.error.compatibleVersionNotFound',
      })
    }

    return {
      provider: 'folne',
      projectId: resolved.projectId,
      versionId: resolved.versionId,
      slug: resolved.slug,
      name: resolved.name,
      versionNumber: resolved.versionNumber,
      category: resolved.category || input.category,
      fileName: resolved.fileName,
      downloadUrl: resolved.downloadUrl,
      iconUrl: resolved.iconUrl ?? null,
      sha1: resolved.sha1,
      sha512: resolved.sha512,
      size: resolved.size,
    }
  }
}
