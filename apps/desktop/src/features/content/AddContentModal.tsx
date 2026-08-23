import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { IconSearch } from '@tabler/icons-react'
import {
  type ContentCategory,
  type ContentLoaderFilter,
  type ContentProject,
  type ContentSearchQuery,
  type ContentSearchSort,
  type InstanceProfile,
  loaderToContentFilters,
} from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Dialog } from '../../components/ui/Dialog'
import { PageNav } from '../../components/ui/PageNav'
import { formatJaCount } from '../../utils/formatJaCount'
import { useTransferStore } from '../../stores/appStores'
import { ContentBrowseFilters } from './ContentBrowseFilters'
import { ContentInstallButton } from './ContentInstallButton'
import { ProjectTagRow } from './ContentTags'
import { useOptimisticContentInstalls } from './useOptimisticContentInstalls'
import { ContentCategoryLabel } from './contentCategoryIcons'
import { useModrinthTagIcons } from './useModrinthTagIcons'

const ContentProjectView = lazy(() =>
  import('./ContentProjectView').then((m) => ({ default: m.ContentProjectView })),
)

const PAGE_SIZES = [10, 20, 30, 40, 50] as const
const DEFAULT_PAGE_SIZE: (typeof PAGE_SIZES)[number] = 20
const CATEGORIES: ContentCategory[] = ['mod', 'resourcepack', 'datapack', 'shader', 'plugin']
const SORTS: ContentSearchSort[] = ['relevance', 'downloads', 'follows', 'newest', 'updated']

const selectClass =
  'rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-2 py-1 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]'

function buildContentSearchInput(input: {
  category: ContentCategory
  debouncedQuery: string
  gameVersion: string
  loaders: ContentLoaderFilter[]
  tags: string[]
  sort: ContentSearchSort
  page: number
  pageSize: number
}): ContentSearchQuery {
  return {
    query: input.debouncedQuery,
    category: input.category,
    gameVersion: input.gameVersion.trim() || undefined,
    loaders: input.category === 'mod' || input.category === 'plugin' ? input.loaders : [],
    tags: input.tags,
    environments: [],
    provider: 'modrinth',
    sort: input.sort,
    offset: (input.page - 1) * input.pageSize,
    limit: input.pageSize,
  }
}

function keepSearchDataForSameCategory<T>(
  previousData: T | undefined,
  previousQuery: { queryKey: readonly unknown[] } | undefined,
  category: ContentCategory,
): T | undefined {
  const prev = previousQuery?.queryKey[1] as ContentSearchQuery | undefined
  return prev?.category === category ? previousData : undefined
}

function keepInstalledDataForInstance<T>(
  previousData: T | undefined,
  previousQuery: { queryKey: readonly unknown[] } | undefined,
  instanceId: string,
): T | undefined {
  const [key, id] = previousQuery?.queryKey ?? []
  return key === 'content-installed' && id === instanceId ? previousData : undefined
}

type Props = {
  open: boolean
  /** 検索 UI を表示するモード（browse=1）。false のときはインストール済み詳細のみ */
  browseMode?: boolean
  onClose: () => void
  instance: InstanceProfile
  projectId: string | null
  onSelectProject: (hit: ContentProject) => void
  onBackFromProject: () => void
  onInstalled: () => void
}

export function AddContentModal({
  open,
  browseMode = true,
  onClose,
  instance,
  projectId,
  onSelectProject,
  onBackFromProject,
  onInstalled,
}: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const wasBrowseOpenRef = useRef(false)
  const [searchCategory, setSearchCategory] = useState<ContentCategory>('mod')
  const [query, setQuery] = useState('')
  const [gameVersion, setGameVersion] = useState(instance.minecraftVersion)
  const [loaders, setLoaders] = useState<ContentLoaderFilter[]>(() =>
    loaderToContentFilters(instance.loader),
  )
  const [tags, setTags] = useState<string[]>([])
  const [sort, setSort] = useState<ContentSearchSort>('relevance')
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(DEFAULT_PAGE_SIZE)
  const [page, setPage] = useState(1)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const jobs = useTransferStore((s) => s.jobs)
  const { mark, unmark, reset, showsInstalled, pendingVersionId, pendingProjectIds } =
    useOptimisticContentInstalls()
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
  const tagIcons = useModrinthTagIcons(searchCategory)

  const versionsQuery = useQuery({
    queryKey: ['versions-minecraft', false],
    queryFn: () => fledgeApi.versions.listMinecraft({ includeSnapshots: false }),
    enabled: open && browseMode,
    staleTime: 10 * 60_000,
  })

  useEffect(() => {
    if (open && browseMode && !wasBrowseOpenRef.current) {
      setSearchCategory('mod')
      setGameVersion(instance.minecraftVersion)
      setLoaders(loaderToContentFilters(instance.loader))
      setTags([])
      setSort('relevance')
      setPageSize(DEFAULT_PAGE_SIZE)
      setPage(1)
      setQuery('')
      setDebouncedQuery('')
      setError(null)
      reset()
    }
    wasBrowseOpenRef.current = open && browseMode
  }, [open, browseMode, instance.id, instance.minecraftVersion, instance.loader, reset])

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), 400)
    return () => window.clearTimeout(id)
  }, [query])

  useEffect(() => {
    setPage(1)
  }, [debouncedQuery, searchCategory, gameVersion, loaders, tags, sort, pageSize])

  useEffect(() => {
    setTags([])
  }, [searchCategory])

  const prefetchCategorySearch = useCallback(
    (cat: ContentCategory, searchTags: string[] = []) => {
      const input = buildContentSearchInput({
        category: cat,
        debouncedQuery,
        gameVersion,
        loaders,
        tags: searchTags,
        sort,
        page: 1,
        pageSize,
      })
      return queryClient.prefetchQuery({
        queryKey: ['content-search', input],
        queryFn: () => fledgeApi.content.search(input),
        staleTime: 30_000,
      })
    },
    [debouncedQuery, gameVersion, loaders, sort, pageSize, queryClient],
  )

  useEffect(() => {
    if (!open) return
    void queryClient.prefetchQuery({
      queryKey: ['content-installed', instance.id, 'all'],
      queryFn: () => fledgeApi.content.listInstalled(instance.id),
      staleTime: 30_000,
    })
  }, [open, instance.id, queryClient])

  useEffect(() => {
    if (!open || !browseMode || projectId) return
    for (const cat of CATEGORIES) {
      void prefetchCategorySearch(cat, cat === searchCategory ? tags : [])
    }
  }, [open, browseMode, projectId, searchCategory, tags, prefetchCategorySearch])

  const versionOptions = useMemo(() => {
    const ids = (versionsQuery.data?.versions ?? []).map((v) => v.id)
    return [instance.minecraftVersion, ...ids.filter((id) => id !== instance.minecraftVersion)]
  }, [versionsQuery.data?.versions, instance.minecraftVersion])

  const searchInput: ContentSearchQuery = useMemo(
    () =>
      buildContentSearchInput({
        category: searchCategory,
        debouncedQuery,
        gameVersion,
        loaders,
        tags,
        sort,
        page,
        pageSize,
      }),
    [debouncedQuery, searchCategory, gameVersion, loaders, tags, sort, page, pageSize],
  )

  const searchQuery = useQuery({
    queryKey: ['content-search', searchInput],
    queryFn: () => fledgeApi.content.search(searchInput),
    enabled: open && browseMode && !projectId,
    placeholderData: (previousData, previousQuery) =>
      keepSearchDataForSameCategory(previousData, previousQuery, searchCategory),
    staleTime: 30_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 5_000),
  })

  const installedQuery = useQuery({
    queryKey: ['content-installed', instance.id, 'all'],
    queryFn: () => fledgeApi.content.listInstalled(instance.id),
    enabled: open,
    placeholderData: (previousData, previousQuery) =>
      keepInstalledDataForInstance(previousData, previousQuery, instance.id),
  })

  const installedProjectIds = useMemo(
    () => new Set((installedQuery.data ?? []).map((item) => item.projectId)),
    [installedQuery.data],
  )

  const refreshInstalled = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['content-installed', instance.id] })
  }, [instance.id, queryClient])

  useEffect(() => {
    for (const job of Object.values(jobs)) {
      if (
        job.kind === 'content' &&
        job.status === 'failed' &&
        job.meta.instanceId === instance.id &&
        typeof job.meta.projectId === 'string'
      ) {
        unmark(job.meta.projectId)
      }
    }
  }, [jobs, instance.id, unmark])

  useEffect(() => {
    for (const item of installedQuery.data ?? []) {
      if (pendingProjectIds.has(item.projectId)) {
        unmark(item.projectId)
      }
    }
  }, [installedQuery.data, pendingProjectIds, unmark])

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
    mutationFn: (input: { id: string; versionId?: string }) =>
      fledgeApi.content.install({
        instanceId: instance.id,
        provider: 'modrinth',
        projectId: input.id,
        category: searchCategory,
        versionId: input.versionId,
        gameVersion: gameVersion.trim() || undefined,
        loaders: searchCategory === 'mod' || searchCategory === 'plugin' ? loaders : [],
      }),
    onError: (err, input) => {
      unmark(input.id)
      const key =
        err && typeof err === 'object' && 'messageKey' in err && typeof err.messageKey === 'string'
          ? err.messageKey
          : null
      const detail =
        err && typeof err === 'object' && 'detail' in err && err.detail && typeof err.detail === 'object'
          ? (err.detail as Record<string, string>)
          : undefined
      if (key && key.startsWith('content.error.')) {
        setError(t(key, detail))
        return
      }
      setError(err instanceof Error ? err.message : String(err))
    },
    onSuccess: async () => {
      await refreshInstalled()
      onInstalled()
    },
  })

  const requestInstall = useCallback(
    (input: { id: string; versionId?: string }) => {
      setError(null)
      mark(input.id, input.versionId)
      installMutation.mutate(input)
    },
    [mark, installMutation],
  )

  const resolveInstalled = useCallback(
    (projectId: string) => showsInstalled(projectId, installedProjectIds, installingIds),
    [showsInstalled, installedProjectIds, installingIds],
  )

  const resolveInstalledVersionId = useCallback(
    (projectId: string) =>
      installedQuery.data?.find((item) => item.projectId === projectId)?.versionId ??
      pendingVersionId(projectId),
    [installedQuery.data, pendingVersionId],
  )

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
  const total = searchQuery.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const typeLabel = t(`content.category.${searchCategory}`)
  const dialogTitle =
    selected?.name ??
    (browseMode ? t('content.browseTitle') : projectId ? t('content.detailTitle') : t('content.browseTitle'))

  return (
    <Dialog
      open={open}
      title={dialogTitle}
      subtitle={`${instance.name} · ${instance.minecraftVersion} · ${instance.loader}`}
      onClose={onClose}
      size="full"
      compact
    >
      {projectId ? (
        selected ? (
          <Suspense fallback={<p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>}>
            <ContentProjectView
              hit={selected}
              instance={instance}
              gameVersion={gameVersion}
              loaders={loaders}
              installed={resolveInstalled(selected.id)}
              installedVersionId={resolveInstalledVersionId(selected.id)}
              onBack={onBackFromProject}
              onInstall={(versionId) => requestInstall({ id: selected.id, versionId })}
            />
          </Suspense>
        ) : projectQuery.isError ? (
          <p className="text-sm text-[var(--color-danger)]">
            {projectQuery.error instanceof Error
              ? projectQuery.error.message
              : String(projectQuery.error)}
          </p>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
        )
      ) : (
        <div className="flex min-h-0 flex-1 gap-2">
          <ContentBrowseFilters
            instance={instance}
            category={searchCategory}
            gameVersion={gameVersion}
            loaders={loaders}
            tags={tags}
            versionOptions={versionOptions}
            onGameVersion={setGameVersion}
            onLoaders={setLoaders}
            onTags={setTags}
            onReset={() => {
              setGameVersion(instance.minecraftVersion)
              setLoaders(loaderToContentFilters(instance.loader))
              setTags([])
            }}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onMouseEnter={() => void prefetchCategorySearch(c, c === searchCategory ? tags : [])}
                  onFocus={() => void prefetchCategorySearch(c, c === searchCategory ? tags : [])}
                  onClick={() => {
                    if (c === searchCategory) return
                    setTags([])
                    setSearchCategory(c)
                  }}
                  className={[
                    'inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium transition-colors',
                    searchCategory === c
                      ? 'bg-[var(--color-selection)] text-[var(--color-on-selection)]'
                      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]',
                  ].join(' ')}
                >
                  <ContentCategoryLabel category={c} iconSize={15} />
                </button>
              ))}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div className="relative min-w-[14rem] flex-1">
                <IconSearch
                  size={16}
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
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] py-1.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--color-accent)]"
                />
              </div>
              <label className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)]">
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
              <label className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)]">
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
                <span className="text-sm tabular-nums text-[var(--color-text-muted)]">
                  {t('content.resultCount', { total: total.toLocaleString('ja-JP') })}
                </span>
              ) : null}
              <div className="ml-auto">
                <PageNav page={page} pageCount={pageCount} onChange={setPage} />
              </div>
            </div>

            {error ? (
              <p className="rounded-[var(--radius-sm)] bg-[var(--color-danger)]/15 px-2.5 py-1.5 text-sm text-[var(--color-danger)]">
                {error}
              </p>
            ) : null}
            {searchErrorMessage ? (
              <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/15 px-2.5 py-1.5 text-sm text-[var(--color-danger)]">
                <p className="min-w-0 flex-1">{searchErrorMessage}</p>
                <button
                  type="button"
                  className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-2.5 py-1 text-sm font-medium text-[var(--color-on-accent)]"
                  onClick={() => void searchQuery.refetch()}
                >
                  {t('common.retry')}
                </button>
              </div>
            ) : null}

            <div
              className={[
                'min-h-0 flex-1 overflow-y-auto transition-opacity',
                searchQuery.isFetching && !searchQuery.isPending ? 'opacity-80' : '',
              ].join(' ')}
            >
              {searchQuery.isPending && !searchQuery.data ? (
                <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
              ) : searchQuery.isError && hits.length === 0 ? null : hits.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">{t('content.noResults')}</p>
              ) : (
                <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
                  {hits.map((hit) => (
                    <SearchHitRow
                      key={`${hit.provider}:${hit.id}`}
                      hit={hit}
                      installed={resolveInstalled(hit.id)}
                      tagIcons={tagIcons}
                      onOpen={() => onSelectProject(hit)}
                      onInstall={() => requestInstall({ id: hit.id })}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}

function SearchHitRow({
  hit,
  installed,
  tagIcons,
  onOpen,
  onInstall,
}: {
  hit: ContentProject
  installed: boolean
  tagIcons: Map<string, string>
  onOpen: () => void
  onInstall: () => void
}) {
  return (
    <li>
      <div className="flex items-start gap-3 px-3.5 py-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          onClick={onOpen}
        >
          {hit.iconUrl ? (
            <img
              src={hit.iconUrl}
              alt=""
              width={48}
              height={48}
              loading="lazy"
              decoding="async"
              className="size-12 shrink-0 rounded-[var(--radius-sm)] object-cover"
            />
          ) : (
            <div className="size-12 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-accent-soft)]" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-base font-medium leading-snug">{hit.name}</span>
              {hit.author ? (
                <span className="truncate text-sm text-[var(--color-text-muted)]">{hit.author}</span>
              ) : null}
              <span className="ml-auto shrink-0 text-sm tabular-nums text-[var(--color-text-muted)]">
                {formatJaCount(hit.downloads)}
              </span>
            </div>
            {hit.description ? (
              <p className="mt-0.5 line-clamp-2 break-words text-sm leading-relaxed text-[var(--color-text-muted)]">
                {hit.description}
              </p>
            ) : null}
            <div className="mt-0.5">
              <ProjectTagRow
                categories={hit.displayCategories ?? []}
                loaders={hit.loaders ?? []}
                tagIcons={tagIcons}
              />
            </div>
          </div>
        </button>
        <div className="shrink-0 self-center">
          <ContentInstallButton size="sm" installed={installed} installing={false} onInstall={onInstall} />
        </div>
      </div>
    </li>
  )
}
