import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconClock,
  IconDownload,
  IconHeart,
  IconSearch,
} from '@tabler/icons-react'
import type {
  ContentCategory,
  ContentEnvironmentFilter,
  ContentLoaderFilter,
  ContentProject,
  ContentSearchQuery,
  ContentSearchSort,
  InstanceProfile,
  Loader,
} from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Dialog } from '../../components/ui/Dialog'
import { useTransferStore } from '../../stores/appStores'
import { ContentProjectView } from './ContentProjectView'
import { filterTagsForCategory, ProjectTagRow, tagLabel } from './ModrinthTags'

const ENVIRONMENTS: ContentEnvironmentFilter[] = ['client', 'server']

const PAGE_SIZES = [10, 20] as const
const CATEGORIES: ContentCategory[] = [
  'mod',
  'resourcepack',
  'datapack',
  'shader',
  'plugin',
]
const LOADERS: ContentLoaderFilter[] = ['fabric', 'forge', 'neoforge', 'quilt']
const SORTS: ContentSearchSort[] = ['relevance', 'downloads', 'follows', 'newest', 'updated']

function loadersFromInstance(loader: Loader): ContentLoaderFilter[] {
  if (loader === 'fabric') return ['fabric']
  if (loader === 'forge') return ['forge']
  if (loader === 'neoforge') return ['neoforge']
  if (loader === 'quilt') return ['quilt']
  return []
}

function formatJaCount(n: number): string {
  if (n >= 100_000_000) {
    const v = n / 100_000_000
    return `${v >= 10 ? v.toFixed(1) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}億`
  }
  if (n >= 10_000) {
    const v = n / 10_000
    return `${Number.isInteger(v) ? v : v.toFixed(1)}万`
  }
  return n.toLocaleString('ja-JP')
}

function formatRelativeJa(iso: string | undefined, t: (key: string, opts?: Record<string, unknown>) => string): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  const sec = Math.max(0, (Date.now() - ms) / 1000)
  if (sec < 60) return t('content.time.justNow')
  if (sec < 3600) return t('content.time.minutes', { n: Math.floor(sec / 60) })
  if (sec < 86400) return t('content.time.hours', { n: Math.floor(sec / 3600) })
  if (sec < 86400 * 7) return t('content.time.days', { n: Math.floor(sec / 86400) })
  if (sec < 86400 * 30) return t('content.time.weeks', { n: Math.floor(sec / (86400 * 7)) })
  if (sec < 86400 * 365) return t('content.time.months', { n: Math.floor(sec / (86400 * 30)) })
  return t('content.time.years', { n: Math.floor(sec / (86400 * 365)) })
}

function PaginationBar({
  page,
  pageCount,
  onPage,
}: {
  page: number
  pageCount: number
  onPage: (n: number) => void
}) {
  const cell = 'flex h-6 w-10 items-center justify-center rounded-[var(--radius-sm)] text-[11px] tabular-nums'
  const chev =
    'flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]'
  const barClass = 'ml-auto grid h-6 w-[18.5rem] shrink-0 items-center justify-items-center'
  const barStyle = { gridTemplateColumns: '1.5rem 1.5rem repeat(5, 2.5rem) 1.5rem 1.5rem' } as const

  if (pageCount <= 1) {
    return <div className={barClass} style={barStyle} aria-hidden />
  }

  const windowSize = 5
  const maxStart = Math.max(1, pageCount - windowSize + 1)
  const start = Math.min(Math.max(page - 2, 1), maxStart)
  const pages = [0, 1, 2, 3, 4].map((i) => start + i)

  const pageBtn = (n: number) => (
    <button
      key={n}
      type="button"
      onClick={() => onPage(n)}
      className={[
        cell,
        n === page
          ? 'bg-[var(--color-selection-soft)] font-medium text-[var(--color-selection)]'
          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]',
      ].join(' ')}
    >
      {n}
    </button>
  )

  const jump = (
    visible: boolean,
    onClick: () => void,
    icon: ReactNode,
  ) => (
    <button
      type="button"
      className={chev}
      style={{ visibility: visible ? 'visible' : 'hidden' }}
      disabled={!visible}
      onClick={onClick}
    >
      {icon}
    </button>
  )

  return (
    <nav className={barClass} style={barStyle} aria-label="pagination">
      {jump(page > 1, () => onPage(1), <IconChevronsLeft size={14} stroke={1.75} />)}
      {jump(page > 1, () => onPage(page - 1), <IconChevronLeft size={14} stroke={1.75} />)}
      {pages.map((n) =>
        n >= 1 && n <= pageCount ? pageBtn(n) : <div key={n} className="h-6 w-10" />,
      )}
      {jump(page < pageCount, () => onPage(page + 1), <IconChevronRight size={14} stroke={1.75} />)}
      {jump(page < pageCount, () => onPage(pageCount), <IconChevronsRight size={14} stroke={1.75} />)}
    </nav>
  )
}

const selectClass =
  'rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]'

type Props = {
  open: boolean
  onClose: () => void
  instance: InstanceProfile
  category: ContentCategory
  onCategoryChange: (category: ContentCategory) => void
  projectId: string | null
  onSelectProject: (hit: ContentProject) => void
  onBackFromProject: () => void
  onInstalled: () => void
}

export function AddContentModal({
  open,
  onClose,
  instance,
  category,
  onCategoryChange,
  projectId,
  onSelectProject,
  onBackFromProject,
  onInstalled,
}: Props) {
  const { t } = useTranslation()
  const wasOpenRef = useRef(false)
  const [query, setQuery] = useState('')
  const [gameVersion, setGameVersion] = useState(instance.minecraftVersion)
  const [versionFilter, setVersionFilter] = useState('')
  const [loaders, setLoaders] = useState<ContentLoaderFilter[]>(() =>
    loadersFromInstance(instance.loader),
  )
  const [tags, setTags] = useState<string[]>([])
  const [environments, setEnvironments] = useState<ContentEnvironmentFilter[]>([])
  const [sort, setSort] = useState<ContentSearchSort>('relevance')
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(20)
  const [page, setPage] = useState(1)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const jobs = useTransferStore((s) => s.jobs)
  const installingIds = useMemo(() => {
    const ids = new Set<string>()
    for (const job of Object.values(jobs)) {
      if (
        job.kind === 'content' &&
        job.meta.instanceId === instance.id &&
        (job.status === 'queued' || job.status === 'active') &&
        typeof job.meta.projectId === 'string'
      ) {
        ids.add(job.meta.projectId)
      }
    }
    return ids
  }, [jobs, instance.id])

  const versionsQuery = useQuery({
    queryKey: ['versions-minecraft', false],
    queryFn: () => fledgeApi.versions.listMinecraft({ includeSnapshots: false }),
    enabled: open,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setGameVersion(instance.minecraftVersion)
      setVersionFilter('')
      setLoaders(loadersFromInstance(instance.loader))
      setTags([])
      setEnvironments([])
      setSort('relevance')
      setPageSize(20)
      setPage(1)
      setQuery('')
      setDebouncedQuery('')
      setError(null)
    }
    wasOpenRef.current = open
  }, [open, instance.id, instance.minecraftVersion, instance.loader])

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), 280)
    return () => window.clearTimeout(id)
  }, [query])

  useEffect(() => {
    setPage(1)
  }, [debouncedQuery, category, gameVersion, loaders, tags, environments, sort, pageSize])

  useEffect(() => {
    setTags([])
  }, [category])

  const availableTags = useMemo(() => filterTagsForCategory(category), [category])

  const versionIds = useMemo(() => {
    const q = versionFilter.trim().toLowerCase()
    const ids = (versionsQuery.data?.versions ?? []).map((v) => v.id)
    const filtered = q ? ids.filter((id) => id.toLowerCase().includes(q)) : ids
    const head = filtered.slice(0, 36)
    if (gameVersion && !head.includes(gameVersion) && (!q || gameVersion.toLowerCase().includes(q))) {
      return [gameVersion, ...head.filter((id) => id !== gameVersion)]
    }
    return head
  }, [versionsQuery.data?.versions, versionFilter, gameVersion])

  const searchInput: ContentSearchQuery = useMemo(
    () => ({
      query: debouncedQuery,
      category,
      gameVersion: gameVersion.trim() || undefined,
      loaders: category === 'mod' || category === 'plugin' ? loaders : [],
      tags,
      environments,
      provider: 'modrinth',
      sort,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    }),
    [debouncedQuery, category, gameVersion, loaders, tags, environments, sort, page, pageSize],
  )

  const searchQuery = useQuery({
    queryKey: ['content-search', searchInput],
    queryFn: () => fledgeApi.content.search(searchInput),
    enabled: open,
    placeholderData: keepPreviousData,
    retry: 2,
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 5_000),
  })

  const searchErrorMessage = (() => {
    if (!searchQuery.isError) return null
    const err = searchQuery.error
    const key =
      err && typeof err === 'object' && 'messageKey' in err && typeof err.messageKey === 'string'
        ? err.messageKey
        : null
    if (key === 'content.searchTimeout') return t('content.searchTimeout')
    if (key === 'content.searchRateLimited') return t('content.searchRateLimited')
    if (key === 'content.searchFailed') return t('content.searchFailed')
    if (err instanceof Error && /timed?\s*out/i.test(err.message)) return t('content.searchTimeout')
    if (err instanceof Error && /429|rate.?limit/i.test(err.message)) return t('content.searchRateLimited')
    return err instanceof Error && err.message ? err.message : t('content.searchFailed')
  })()

  const installMutation = useMutation({
    mutationFn: (hit: { id: string }) =>
      fledgeApi.content.install({
        instanceId: instance.id,
        provider: 'modrinth',
        projectId: hit.id,
        category,
        gameVersion: gameVersion.trim() || undefined,
        loaders: category === 'mod' || category === 'plugin' ? loaders : [],
      }),
    onMutate: () => {
      setError(null)
    },
    onSuccess: () => {
      onInstalled()
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err))
    },
  })

  const hits = searchQuery.data?.hits ?? []
  const selectedFromHits = useMemo(() => {
    if (!projectId) return null
    return hits.find((hit) => hit.id === projectId || hit.slug === projectId) ?? null
  }, [projectId, hits])

  const projectQuery = useQuery({
    queryKey: ['content-project-browse', projectId],
    queryFn: () => fledgeApi.content.getProject(projectId!),
    enabled: open && Boolean(projectId) && !selectedFromHits,
    staleTime: 60_000,
  })

  const selected = selectedFromHits ?? projectQuery.data?.project ?? null

  const toggleLoader = (l: ContentLoaderFilter) => {
    setLoaders((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]))
  }

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]))
  }

  const toggleEnvironment = (env: ContentEnvironmentFilter) => {
    setEnvironments((prev) => (prev.includes(env) ? prev.filter((x) => x !== env) : [...prev, env]))
  }

  const total = searchQuery.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const typeLabel = t(`content.category.${category}`)

  return (
    <Dialog
      open={open}
      title={t('content.browseTitle')}
      subtitle={`${instance.name} · ${instance.minecraftVersion} · ${instance.loader}`}
      onClose={onClose}
      size="full"
    >
      {projectId ? (
        selected ? (
          <ContentProjectView
            hit={selected}
            instance={instance}
            gameVersion={gameVersion}
            loaders={loaders}
            installing={installingIds.has(selected.id)}
            onBack={onBackFromProject}
            onInstalled={onInstalled}
            onError={setError}
          />
        ) : projectQuery.isError ? (
          <p className="text-xs text-[var(--color-danger)]">
            {projectQuery.error instanceof Error
              ? projectQuery.error.message
              : String(projectQuery.error)}
          </p>
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">{t('common.loading')}</p>
        )
      ) : (
      <div className="flex min-h-0 flex-1 flex-col gap-2.5">
        <div className="flex shrink-0 flex-wrap gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onCategoryChange(c)}
              className={[
                'rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors',
                category === c
                  ? 'bg-[var(--color-selection)] text-[var(--color-on-selection)]'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]',
              ].join(' ')}
            >
              {t(`content.category.${c}`)}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 gap-3">
          <aside className="hidden w-48 shrink-0 flex-col gap-3 overflow-y-auto sm:flex">
            <section>
              <h3 className="mb-1.5 text-[11px] font-semibold text-[var(--color-text)]">
                {t('content.filter.gameVersion')}
              </h3>
              <div className="relative mb-1.5">
                <IconSearch
                  size={12}
                  stroke={1.75}
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
                />
                <input
                  value={versionFilter}
                  onChange={(e) => setVersionFilter(e.target.value)}
                  placeholder={t('content.filter.versionSearch')}
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] py-1 pl-6 pr-2 text-[11px] outline-none focus:border-[var(--color-accent)]"
                />
              </div>
              <div className="max-h-40 space-y-0.5 overflow-y-auto pr-0.5 text-[11px]">
                <label className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-0.5 hover:bg-[var(--color-hover)]">
                  <input
                    type="checkbox"
                    checked={!gameVersion}
                    onChange={() => setGameVersion('')}
                    className="accent-[var(--color-accent)]"
                  />
                  {t('content.filter.anyVersion')}
                </label>
                {versionIds.map((id) => (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-0.5 hover:bg-[var(--color-hover)]"
                  >
                    <input
                      type="checkbox"
                      checked={gameVersion === id}
                      onChange={() => setGameVersion(gameVersion === id ? '' : id)}
                      className="accent-[var(--color-accent)]"
                    />
                    <span className="truncate">{id}</span>
                  </label>
                ))}
              </div>
            </section>

            {(category === 'mod' || category === 'plugin') && (
              <section>
                <h3 className="mb-1.5 text-[11px] font-semibold text-[var(--color-text)]">
                  {t('content.filter.loader')}
                </h3>
                <div className="space-y-0.5 text-[11px]">
                  {LOADERS.map((l) => (
                    <label
                      key={l}
                      className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-0.5 capitalize hover:bg-[var(--color-hover)]"
                    >
                      <input
                        type="checkbox"
                        checked={loaders.includes(l)}
                        onChange={() => toggleLoader(l)}
                        className="accent-[var(--color-accent)]"
                      />
                      {l}
                    </label>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h3 className="mb-1.5 text-[11px] font-semibold text-[var(--color-text)]">
                {t('content.filter.environment')}
              </h3>
              <div className="space-y-0.5 text-[11px]">
                {ENVIRONMENTS.map((env) => (
                  <label
                    key={env}
                    className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-0.5 hover:bg-[var(--color-hover)]"
                  >
                    <input
                      type="checkbox"
                      checked={environments.includes(env)}
                      onChange={() => toggleEnvironment(env)}
                      className="accent-[var(--color-accent)]"
                    />
                    {t(`content.env.${env}`)}
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-1.5 text-[11px] font-semibold text-[var(--color-text)]">
                {t('content.filter.category')}
              </h3>
              <div className="max-h-48 space-y-0.5 overflow-y-auto pr-0.5 text-[11px]">
                {availableTags.map((tag) => (
                  <label
                    key={tag}
                    className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-0.5 hover:bg-[var(--color-hover)]"
                  >
                    <input
                      type="checkbox"
                      checked={tags.includes(tag)}
                      onChange={() => toggleTag(tag)}
                      className="accent-[var(--color-accent)]"
                    />
                    <span className="truncate">{tagLabel(tag, t)}</span>
                  </label>
                ))}
              </div>
            </section>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="relative shrink-0">
              <IconSearch
                size={14}
                stroke={1.75}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  total > 0
                    ? t('content.searchPlaceholderCount', {
                        total: total.toLocaleString('ja-JP'),
                        type: typeLabel,
                      })
                    : t('content.searchPlaceholder', { type: typeLabel })
                }
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] py-1.5 pl-8 pr-3 text-xs outline-none focus:border-[var(--color-accent)]"
              />
            </div>

            <div className="flex h-6 shrink-0 flex-nowrap items-center gap-2">
              <label className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
                {t('content.sort.label')}
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as ContentSearchSort)}
                  className={selectClass}
                >
                  {SORTS.map((s) => (
                    <option key={s} value={s}>
                      {t(`content.sort.${s}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
                {t('content.showCount')}
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])}
                  className={selectClass}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              {total > 0 ? (
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  {t('content.resultCount', { total: total.toLocaleString('ja-JP') })}
                </span>
              ) : null}
              {total > 0 ? (
                <PaginationBar page={page} pageCount={pageCount} onPage={setPage} />
              ) : (
                <div className="ml-auto h-6 w-[18.5rem] shrink-0" aria-hidden />
              )}
            </div>

            {error ? (
              <p className="rounded-[var(--radius-sm)] bg-[var(--color-danger)]/15 px-2 py-1.5 text-xs text-[var(--color-danger)]">
                {error}
              </p>
            ) : null}
            {searchErrorMessage ? (
              <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/15 px-2 py-1.5 text-xs text-[var(--color-danger)]">
                <p className="min-w-0 flex-1">{searchErrorMessage}</p>
                <button
                  type="button"
                  className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-2 py-1 text-[11px] font-medium text-[var(--color-on-accent)]"
                  onClick={() => void searchQuery.refetch()}
                >
                  {t('common.retry')}
                </button>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto">
              {searchQuery.isPending && !searchQuery.data ? (
                <p className="text-xs text-[var(--color-text-muted)]">{t('common.loading')}</p>
              ) : searchQuery.isError && hits.length === 0 ? null : hits.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)]">{t('content.noResults')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {hits.map((hit) => (
                    <SearchHitCard
                      key={`${hit.provider}:${hit.id}`}
                      hit={hit}
                      installing={installingIds.has(hit.id)}
                      onOpen={() => onSelectProject(hit)}
                      onInstall={() => installMutation.mutate({ id: hit.id })}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
      )}
    </Dialog>
  )
}

function SearchHitCard({
  hit,
  installing,
  onOpen,
  onInstall,
}: {
  hit: ContentProject
  installing: boolean
  onOpen: () => void
  onInstall: () => void
}) {
  const { t } = useTranslation()
  const updated = formatRelativeJa(hit.dateModified, t)

  return (
    <li>
      <div
        role="link"
        tabIndex={0}
        className="flex cursor-pointer gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]/40 px-2.5 py-2 transition hover:border-[var(--color-accent)]/35 hover:bg-[var(--color-hover)]/40"
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen()
          }
        }}
      >
        {hit.iconUrl ? (
          <img
            src={hit.iconUrl}
            alt=""
            className="size-12 shrink-0 rounded-[var(--radius-sm)] object-cover"
          />
        ) : (
          <div className="size-12 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-accent-soft)]" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-[13px] font-semibold leading-tight text-[var(--color-text)]">
                  {hit.name}
                </span>
                {hit.author ? (
                  <span className="text-[11px] text-[var(--color-text-muted)]">
                    {t('content.byAuthor', { name: hit.author })}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[var(--color-text-muted)]">
                {hit.description}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5 text-[10px] tabular-nums text-[var(--color-text-muted)]">
              <span className="inline-flex items-center gap-0.5">
                <IconDownload size={11} stroke={1.75} />
                {formatJaCount(hit.downloads)}
              </span>
              {hit.follows != null ? (
                <span className="inline-flex items-center gap-0.5">
                  <IconHeart size={11} stroke={1.75} />
                  {formatJaCount(hit.follows)}
                </span>
              ) : null}
              {updated ? (
                <span className="inline-flex items-center gap-0.5">
                  <IconClock size={11} stroke={1.75} />
                  {updated}
                </span>
              ) : null}
            </div>
          </div>
          <div className="mt-1.5 flex flex-wrap items-end justify-between gap-2">
            <ProjectTagRow
              clientSide={hit.clientSide}
              serverSide={hit.serverSide}
              categories={hit.displayCategories ?? []}
              loaders={hit.loaders ?? []}
            />
            <button
              type="button"
              className="ml-auto inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--color-on-accent)] disabled:opacity-50"
              disabled={installing}
              onClick={(e) => {
                e.stopPropagation()
                onInstall()
              }}
            >
              <IconDownload size={12} stroke={1.75} />
              {installing ? t('content.installing') : t('content.install')}
            </button>
          </div>
        </div>
      </div>
    </li>
  )
}
