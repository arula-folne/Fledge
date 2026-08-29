import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { IconSearch } from '@tabler/icons-react'
import {
  type ContentCategory,
  type ContentLoaderFilter,
  type ContentProject,
  type ContentSearchQuery,
  type InstanceProfile,
  loaderToContentFilters,
} from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Dialog } from '../../components/ui/Dialog'
import { PageNav } from '../../components/ui/PageNav'
import { useTransferStore } from '../../stores/appStores'
import { ContentBrowseFilters } from './ContentBrowseFilters'
import {
  countFavoriteCategories,
  favoriteFilterTabs,
  filterFavoriteProjects,
  formatGameVersionList,
  listFavoriteProjects,
  projectSupportsGameVersion,
  CONTENT_SEARCH_SORTS,
  FAVORITE_SORTS,
  isFavoriteNameSort,
  toContentSearchSort,
  type FavoriteCategoryFilter,
  type FavoriteSort,
} from './contentFavoritesList'
import { ContentSearchCategoryTabs } from './ContentSearchCategoryTabs'
import { ContentSearchHitList } from './ContentSearchHitList'
import { ContentSearchHitRow } from './ContentSearchHitRow'
import { FavoriteCategoryFilters } from './FavoriteCategoryFilters'
import {
  defaultInstanceBrowseTab,
  instanceBrowseSearchTabs,
  contentTabsAsCategories,
  isFavoritesTab,
  type ContentSearchTab,
} from './contentSearchTabs'
import { useContentFavorites } from './useContentFavorites'
import { useOptimisticContentInstalls } from './useOptimisticContentInstalls'
import { useModrinthTagIcons } from './useModrinthTagIcons'

const ContentProjectView = lazy(() =>
  import('./ContentProjectView').then((m) => ({ default: m.ContentProjectView })),
)

const PAGE_SIZES = [10, 20, 30, 40, 50] as const
const DEFAULT_PAGE_SIZE: (typeof PAGE_SIZES)[number] = 20
const SORTS = CONTENT_SEARCH_SORTS

const selectClass =
  'rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-2 py-1 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]'

function buildContentSearchInput(input: {
  category: ContentCategory
  debouncedQuery: string
  gameVersion: string
  loaders: ContentLoaderFilter[]
  tags: string[]
  sort: FavoriteSort
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
    sort: toContentSearchSort(input.sort),
    offset: (input.page - 1) * input.pageSize,
    limit: input.pageSize,
  }
}

function keepSearchDataForSameCategory<T>(
  previousData: T | undefined,
  previousQuery: { queryKey: readonly unknown[] } | undefined,
  tab: ContentSearchTab,
): T | undefined {
  if (isFavoritesTab(tab)) return undefined
  const prev = previousQuery?.queryKey[1] as ContentSearchQuery | undefined
  return prev?.category === tab ? previousData : undefined
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
  const prevInstanceIdRef = useRef(instance.id)
  const [searchTab, setSearchTab] = useState<ContentSearchTab>(defaultInstanceBrowseTab())
  const [favoriteCategory, setFavoriteCategory] = useState<FavoriteCategoryFilter>('all')
  const [query, setQuery] = useState('')
  const [gameVersion, setGameVersion] = useState(instance.minecraftVersion)
  const [loaders, setLoaders] = useState<ContentLoaderFilter[]>(() =>
    loaderToContentFilters(instance.loader),
  )
  const [tags, setTags] = useState<string[]>([])
  const [sort, setSort] = useState<FavoriteSort>('relevance')
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(DEFAULT_PAGE_SIZE)
  const [page, setPage] = useState(1)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [bulkInstalling, setBulkInstalling] = useState(false)
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
  const { favorites, isFavorite, toggleFavorite } = useContentFavorites()
  const favoriteScope: FavoriteCategoryFilter = isFavoritesTab(searchTab) ? favoriteCategory : searchTab
  const tagCategory = favoriteScope === 'all' ? 'all' : favoriteScope
  const tagIcons = useModrinthTagIcons(tagCategory)
  const filterCategory = tagCategory === 'all' ? 'mod' : tagCategory

  const versionsQuery = useQuery({
    queryKey: ['versions-minecraft', false],
    queryFn: () => fledgeApi.versions.listMinecraft({ includeSnapshots: false }),
    enabled: open && browseMode,
    staleTime: 10 * 60_000,
  })

  useEffect(() => {
    if (prevInstanceIdRef.current !== instance.id) {
      reset()
      prevInstanceIdRef.current = instance.id
    }
    if (open && browseMode && !wasBrowseOpenRef.current) {
      setSearchTab(defaultInstanceBrowseTab())
      setFavoriteCategory('all')
      setBulkInstalling(false)
      setGameVersion(instance.minecraftVersion)
      setLoaders(loaderToContentFilters(instance.loader))
      setTags([])
      setSort('relevance')
      setPageSize(DEFAULT_PAGE_SIZE)
      setPage(1)
      setQuery('')
      setDebouncedQuery('')
      setError(null)
    }
    wasBrowseOpenRef.current = open && browseMode
  }, [open, browseMode, instance.id, instance.minecraftVersion, instance.loader, reset])

  useEffect(() => {
    if (!open) return
    void queryClient.refetchQueries({ queryKey: ['content-installed', instance.id] })
  }, [open, instance.id, queryClient])

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), 400)
    return () => window.clearTimeout(id)
  }, [query])

  useEffect(() => {
    setPage(1)
  }, [debouncedQuery, searchTab, favoriteCategory, gameVersion, loaders, tags, sort, pageSize])

  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 })
  }, [page])

  useEffect(() => {
    setTags([])
  }, [searchTab, favoriteCategory])

  useEffect(() => {
    if (!isFavoritesTab(searchTab) && isFavoriteNameSort(sort)) {
      setSort('relevance')
    }
  }, [searchTab, sort])

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
        gcTime: 90_000,
      })
    },
    [debouncedQuery, gameVersion, loaders, sort, pageSize, queryClient],
  )

  useEffect(() => {
    if (!open) return
    void queryClient.prefetchQuery({
      queryKey: ['content-installed', instance.id, 'all'],
      queryFn: () => fledgeApi.content.listInstalled(instance.id),
      staleTime: 0,
    })
  }, [open, instance.id, queryClient])

  // 全カテゴリ一括 prefetch はメモリを食いやすいので、ホバー／フォーカス時のみにする

  const versionOptions = useMemo(() => {
    const ids = (versionsQuery.data?.versions ?? []).map((v) => v.id)
    return [instance.minecraftVersion, ...ids.filter((id) => id !== instance.minecraftVersion)]
  }, [versionsQuery.data?.versions, instance.minecraftVersion])

  const searchInput: ContentSearchQuery = useMemo(
    () =>
      buildContentSearchInput({
        category: filterCategory,
        debouncedQuery,
        gameVersion,
        loaders,
        tags,
        sort,
        page,
        pageSize,
      }),
    [debouncedQuery, filterCategory, gameVersion, loaders, tags, sort, page, pageSize],
  )

  const searchQuery = useQuery({
    queryKey: ['content-search', searchInput],
    queryFn: () => fledgeApi.content.search(searchInput),
    enabled: open && browseMode && !projectId && !isFavoritesTab(searchTab),
    placeholderData: (previousData, previousQuery) =>
      keepSearchDataForSameCategory(previousData, previousQuery, searchTab),
    staleTime: 30_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 5_000),
  })

  const installedQuery = useQuery({
    queryKey: ['content-installed', instance.id, 'all'],
    queryFn: () => fledgeApi.content.listInstalled(instance.id),
    enabled: open,
    refetchOnMount: 'always',
    placeholderData: browseMode
      ? undefined
      : (previousData, previousQuery) =>
          keepInstalledDataForInstance(previousData, previousQuery, instance.id),
  })

  const installedProjectIds = useMemo(
    () => new Set((installedQuery.data ?? []).map((item) => item.projectId)),
    [installedQuery.data],
  )

  const refreshInstalled = useCallback(async () => {
    await queryClient.refetchQueries({ queryKey: ['content-installed', instance.id] })
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
    mutationFn: (input: { id: string; versionId?: string; category: ContentCategory }) =>
      fledgeApi.content.install({
        instanceId: instance.id,
        provider: 'modrinth',
        projectId: input.id,
        category: input.category,
        versionId: input.versionId,
        gameVersion: gameVersion.trim() || undefined,
        loaders: input.category === 'mod' || input.category === 'plugin' ? loaders : [],
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
    (input: { id: string; versionId?: string; category: ContentCategory }) => {
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

  const favoriteResults = useMemo(
    () =>
      listFavoriteProjects(favorites, {
        query: debouncedQuery,
        sort,
        page,
        pageSize,
        category: favoriteCategory,
        loaders,
        tags,
      }),
    [favorites, debouncedQuery, sort, page, pageSize, favoriteCategory, loaders, tags],
  )
  const favoritePool = useMemo(
    () =>
      filterFavoriteProjects(favorites, {
        query: debouncedQuery,
        sort,
        category: 'all',
      }),
    [favorites, debouncedQuery, sort],
  )
  const favoriteCategoryCounts = useMemo(() => countFavoriteCategories(favoritePool), [favoritePool])
  const favoriteCategoryTabs = useMemo(
    () =>
      favoriteFilterTabs(
        contentTabsAsCategories(instanceBrowseSearchTabs()),
        favoritePool.map((p) => p.projectType),
      ),
    [favoritePool],
  )

  useEffect(() => {
    if (!isFavoritesTab(searchTab)) return
    if (favoriteCategory !== 'all' && !favoriteCategoryTabs.includes(favoriteCategory)) {
      setFavoriteCategory('all')
    }
  }, [searchTab, favoriteCategory, favoriteCategoryTabs])

  const instanceGameVersion = instance.minecraftVersion
  const pendingFavoriteInstalls = useMemo(() => {
    if (!isFavoritesTab(searchTab)) return []
    return favoriteResults.hits.filter(
      (project) =>
        project.projectType !== 'modpack' &&
        !resolveInstalled(project.id) &&
        projectSupportsGameVersion(project, instanceGameVersion),
    )
  }, [searchTab, favoriteResults.hits, resolveInstalled, instanceGameVersion])

  const favoriteCompatSummary = useMemo(() => {
    let ok = 0
    let ng = 0
    for (const project of favoriteResults.all) {
      if (projectSupportsGameVersion(project, instanceGameVersion)) ok += 1
      else ng += 1
    }
    return { ok, ng }
  }, [favoriteResults.all, instanceGameVersion])

  const requestInstallFavorites = useCallback(async () => {
    if (pendingFavoriteInstalls.length === 0 || bulkInstalling) return
    setError(null)
    setBulkInstalling(true)
    const targets = [...pendingFavoriteInstalls]
    for (const project of targets) {
      mark(project.id)
    }
    let failed = 0
    for (const project of targets) {
      try {
        await fledgeApi.content.install({
          instanceId: instance.id,
          provider: 'modrinth',
          projectId: project.id,
          category: project.projectType,
          gameVersion: gameVersion.trim() || undefined,
          loaders:
            project.projectType === 'mod' || project.projectType === 'plugin' ? loaders : [],
        })
      } catch {
        unmark(project.id)
        failed += 1
      }
    }
    await refreshInstalled()
    onInstalled()
    setBulkInstalling(false)
    if (failed > 0) {
      setError(t('content.favoritesInstallAllError', { n: failed }))
    }
  }, [
    pendingFavoriteInstalls,
    bulkInstalling,
    mark,
    unmark,
    instance.id,
    gameVersion,
    loaders,
    refreshInstalled,
    onInstalled,
    t,
  ])

  const hits = isFavoritesTab(searchTab) ? favoriteResults.hits : (searchQuery.data?.hits ?? [])
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
  const total = isFavoritesTab(searchTab) ? favoriteResults.total : (searchQuery.data?.total ?? 0)
  const pageCount = isFavoritesTab(searchTab)
    ? favoriteResults.pageCount
    : Math.max(1, Math.ceil(total / pageSize))
  const typeLabel = isFavoritesTab(searchTab)
    ? t('content.category.favorites')
    : t(`content.category.${searchTab}`)
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
      contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      {projectId ? (
        selected ? (
          <Suspense fallback={<p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>}>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ContentProjectView
                hit={selected}
                instance={instance}
                gameVersion={gameVersion}
                loaders={loaders}
                installed={resolveInstalled(selected.id)}
                installedVersionId={resolveInstalledVersionId(selected.id)}
                onBack={onBackFromProject}
                onInstall={(versionId) =>
                  requestInstall({ id: selected.id, versionId, category: selected.projectType })
                }
              />
            </div>
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
        <div className="flex min-h-0 flex-1 gap-2 overflow-hidden">
          <ContentBrowseFilters
            instance={instance}
            category={filterCategory}
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
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
            <ContentSearchCategoryTabs
              tabs={instanceBrowseSearchTabs()}
              active={searchTab}
              onChange={(next) => {
                setTags([])
                setSearchTab(next)
              }}
              onPrefetch={(tab) => {
                if (isFavoritesTab(tab)) return
                void prefetchCategorySearch(tab, tab === searchTab ? tags : [])
              }}
            />
            {isFavoritesTab(searchTab) ? (
              <FavoriteCategoryFilters
                categories={favoriteCategoryTabs}
                counts={favoriteCategoryCounts}
                active={favoriteCategory}
                onChange={setFavoriteCategory}
                bulkInstall={{
                  pendingCount: pendingFavoriteInstalls.length,
                  installing: bulkInstalling,
                  disabled: installMutation.isPending,
                  onInstall: () => void requestInstallFavorites(),
                }}
              />
            ) : null}

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
                  onChange={(e) => setSort(e.target.value as FavoriteSort)}
                  className={selectClass}
                >
                  {(isFavoritesTab(searchTab) ? FAVORITE_SORTS : SORTS).map((s) => (
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

            {isFavoritesTab(searchTab) ? (
              <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg)]/60 px-2.5 py-1.5 font-mono text-[11px] leading-snug text-[var(--color-text-muted)]">
                {t('content.favorite.compatDebugBanner', {
                  version: instanceGameVersion,
                  ok: favoriteCompatSummary.ok,
                  ng: favoriteCompatSummary.ng,
                })}
              </p>
            ) : null}

            <div
              ref={listScrollRef}
              className={[
                'min-h-0 flex-1 overflow-y-auto transition-opacity',
                searchQuery.isFetching && !searchQuery.isPending ? 'opacity-80' : '',
              ].join(' ')}
            >
              {searchQuery.isPending && !searchQuery.data && !isFavoritesTab(searchTab) ? (
                <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
              ) : searchQuery.isError && hits.length === 0 ? null : hits.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">
                  {isFavoritesTab(searchTab)
                    ? favoritePool.length === 0
                      ? t('content.favoritesEmpty')
                      : t('content.favoritesEmptyCategory')
                    : t('content.noResults')}
                </p>
              ) : (
                <ContentSearchHitList
                  hits={hits}
                  groupByCategory={isFavoritesTab(searchTab) && favoriteCategory === 'all'}
                  renderRow={(hit, index) => {
                    const compatible = projectSupportsGameVersion(hit, instanceGameVersion)
                    return (
                    <ContentSearchHitRow
                      key={`${hit.provider}:${hit.id}`}
                      hit={hit}
                      index={index}
                      tagIcons={tagIcons}
                      installed={resolveInstalled(hit.id)}
                      favorited={isFavorite(hit.id)}
                      incompatible={!compatible}
                      compatDebug={t('content.favorite.compatDebug', {
                        status: compatible
                          ? hit.gameVersions.length === 0
                            ? t('content.favorite.compatUnknown')
                            : t('content.favorite.compatOk')
                          : t('content.favorite.compatNg'),
                        version: instanceGameVersion,
                        versions: formatGameVersionList(hit.gameVersions),
                      })}
                      onToggleFavorite={() => toggleFavorite(hit)}
                      onOpen={() => onSelectProject(hit)}
                      onInstall={() =>
                        requestInstall({ id: hit.id, category: hit.projectType })
                      }
                    />
                    )
                  }}
                />
              )}
            </div>

            {pageCount > 1 ? (
              <div className="flex shrink-0 justify-end border-t border-[var(--color-border)] pt-2">
                <PageNav page={page} pageCount={pageCount} onChange={setPage} />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Dialog>
  )
}
