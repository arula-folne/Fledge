import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { IconSearch } from '@tabler/icons-react'
import {
  type ContentCategory,
  type ContentLoaderFilter,
  type ContentProject,
  type ContentSearchQuery,
} from '@fledge/shared'
import { fledgeApi } from '../api/fledgeApi'
import { PageNav } from '../components/ui/PageNav'
import { ListPickDialog } from '../components/ui/ListPickDialog'
import { ContentBrowseFilters } from '../features/content/ContentBrowseFilters'
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
} from '../features/content/contentFavoritesList'
import { ContentSearchCategoryTabs } from '../features/content/ContentSearchCategoryTabs'
import { ContentSearchHitList } from '../features/content/ContentSearchHitList'
import { ContentSearchHitRow } from '../features/content/ContentSearchHitRow'
import { FavoriteCategoryFilters } from '../features/content/FavoriteCategoryFilters'
import {
  browsePageSearchTabs,
  contentTabsAsCategories,
  defaultBrowsePageTab,
  isFavoritesTab,
  type ContentSearchTab,
} from '../features/content/contentSearchTabs'
import { useContentFavorites } from '../features/content/useContentFavorites'
import { useModrinthTagIcons } from '../features/content/useModrinthTagIcons'
import { useInstanceCreateStore } from '../stores/appStores'

const ContentProjectView = lazy(() =>
  import('../features/content/ContentProjectView').then((m) => ({ default: m.ContentProjectView })),
)

const PAGE_SIZES = [10, 20, 30, 40, 50] as const
const DEFAULT_PAGE_SIZE: (typeof PAGE_SIZES)[number] = 20
const SORTS = CONTENT_SEARCH_SORTS

const selectClass =
  'rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-2 py-1 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]'

function needsLoaders(category: ContentCategory): boolean {
  return category === 'mod' || category === 'modpack'
}

function buildSearchInput(input: {
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
    loaders: needsLoaders(input.category) ? input.loaders : [],
    tags: input.tags,
    environments: [],
    provider: 'modrinth',
    sort: toContentSearchSort(input.sort),
    offset: (input.page - 1) * input.pageSize,
    limit: input.pageSize,
  }
}

export default function BrowsePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchTab, setSearchTab] = useState<ContentSearchTab>(defaultBrowsePageTab())
  const [favoriteCategory, setFavoriteCategory] = useState<FavoriteCategoryFilter>('all')
  const [query, setQuery] = useState('')
  const [gameVersion, setGameVersion] = useState('')
  const [loaders, setLoaders] = useState<ContentLoaderFilter[]>(['fabric', 'neoforge', 'forge', 'quilt'])
  const [tags, setTags] = useState<string[]>([])
  const [sort, setSort] = useState<FavoriteSort>('downloads')
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(DEFAULT_PAGE_SIZE)
  const [page, setPage] = useState(1)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [selectedProject, setSelectedProject] = useState<ContentProject | null>(null)
  const [versionTarget, setVersionTarget] = useState<ContentProject | null>(null)
  const attemptedVersionTarget = useRef<ContentProject | null>(null)

  const { favorites, isFavorite, toggleFavorite } = useContentFavorites()
  const favoriteScope: FavoriteCategoryFilter = isFavoritesTab(searchTab) ? favoriteCategory : searchTab
  const tagCategory = favoriteScope === 'all' ? 'all' : favoriteScope
  const tagIcons = useModrinthTagIcons(tagCategory)
  const filterCategory = tagCategory === 'all' ? 'mod' : tagCategory

  const versionsQuery = useQuery({
    queryKey: ['versions-minecraft', false],
    queryFn: () => fledgeApi.versions.listMinecraft({ includeSnapshots: false }),
    staleTime: 10 * 60_000,
  })

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
    return () => {
      // 探索画面を離れたら古い検索結果を早めに破棄
      queryClient.removeQueries({ queryKey: ['content-search'], type: 'inactive' })
    }
  }, [queryClient])

  useEffect(() => {
    setTags([])
  }, [searchTab, favoriteCategory])

  useEffect(() => {
    if (!isFavoritesTab(searchTab) && isFavoriteNameSort(sort)) {
      setSort('downloads')
    }
  }, [searchTab, sort])

  const versionOptions = useMemo(
    () => (versionsQuery.data?.versions ?? []).map((v) => v.id),
    [versionsQuery.data?.versions],
  )

  const searchInput = useMemo(
    () =>
      buildSearchInput({
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
    enabled: !selectedProject && !isFavoritesTab(searchTab),
    staleTime: 30_000,
    gcTime: 90_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 5_000),
  })

  const packVersionsQuery = useQuery({
    queryKey: ['content-create-versions', versionTarget?.id, gameVersion, loaders],
    queryFn: () =>
      fledgeApi.content.listVersions({
        projectId: versionTarget!.id,
        gameVersion: gameVersion.trim() || undefined,
        loaders,
      }),
    enabled: Boolean(versionTarget),
    staleTime: 60_000,
  })

  const createMutation = useMutation({
    mutationFn: (input: { id: string; versionId?: string; category: ContentCategory }) =>
      fledgeApi.content.createInstance({
        provider: 'modrinth',
        projectId: input.id,
        category: input.category,
        versionId: input.versionId,
        gameVersion: gameVersion.trim() || undefined,
        loaders: needsLoaders(input.category) ? loaders : [],
      }),
    onError: (err) => {
      if (attemptedVersionTarget.current) {
        setVersionTarget(attemptedVersionTarget.current)
      }
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
        useInstanceCreateStore.getState().setLastError(t(key, detail))
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      useInstanceCreateStore.getState().setLastError(message)
    },
    onSuccess: async (profile) => {
      attemptedVersionTarget.current = null
      await queryClient.invalidateQueries({ queryKey: ['instances'] })
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      useInstanceCreateStore.getState().unmarkCreating(profile.id)
      void fledgeApi.launch.prepare(profile.id).catch(() => {
        /* 裏で準備。失敗しても作成自体は成功 */
      })
    },
  })

  const requestCreate = useCallback(
    (input: { id: string; versionId?: string; category: ContentCategory }) => {
      setError(null)
      useInstanceCreateStore.getState().setLastError(null)
      navigate('/')
      createMutation.mutate(input)
    },
    [createMutation, navigate],
  )

  const requestCreateWithVersion = useCallback(
    (project: ContentProject, versionId?: string) => {
      if (project.projectType === 'modpack' && !versionId) {
        setVersionTarget(project)
        return
      }
      attemptedVersionTarget.current = project.projectType === 'modpack' ? project : null
      requestCreate({
        id: project.id,
        versionId,
        category: project.projectType || filterCategory,
      })
    },
    [requestCreate, filterCategory],
  )

  const versionDialog = (
    <ListPickDialog
      open={Boolean(versionTarget)}
      title={t('content.createVersionTitle', { name: versionTarget?.name ?? '' })}
      groups={[
        {
          items: (packVersionsQuery.data ?? []).map((version) => ({
            value: version.id,
            label: version.versionNumber,
            suffix: [...version.gameVersions.slice(0, 2), ...version.loaders.slice(0, 2)].join(
              ' · ',
            ),
          })),
        },
      ]}
      value=""
      empty={
        packVersionsQuery.isPending
          ? t('instances.versionsLoading')
          : packVersionsQuery.isError
          ? t('content.createVersionError')
          : t('content.noCompatVersions')
      }
      onSelect={(versionId) => {
        if (!versionTarget) return
        const target = versionTarget
        setVersionTarget(null)
        requestCreateWithVersion(target, versionId)
      }}
      onClose={() => setVersionTarget(null)}
    />
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
    () => favoriteFilterTabs(contentTabsAsCategories(browsePageSearchTabs()), favoritePool.map((p) => p.projectType)),
    [favoritePool],
  )

  useEffect(() => {
    if (!isFavoritesTab(searchTab)) return
    if (favoriteCategory !== 'all' && !favoriteCategoryTabs.includes(favoriteCategory)) {
      setFavoriteCategory('all')
    }
  }, [searchTab, favoriteCategory, favoriteCategoryTabs])

  const hits = isFavoritesTab(searchTab) ? favoriteResults.hits : (searchQuery.data?.hits ?? [])
  const total = isFavoritesTab(searchTab) ? favoriteResults.total : (searchQuery.data?.total ?? 0)
  const pageCount = isFavoritesTab(searchTab)
    ? favoriteResults.pageCount
    : Math.max(1, Math.ceil(total / pageSize))
  const typeLabel = isFavoritesTab(searchTab)
    ? t('content.category.favorites')
    : t(`content.category.${searchTab}`)
  const favoriteCompatSummary = useMemo(() => {
    let ok = 0
    let ng = 0
    for (const project of favoriteResults.all) {
      if (projectSupportsGameVersion(project, gameVersion)) ok += 1
      else ng += 1
    }
    return { ok, ng }
  }, [favoriteResults.all, gameVersion])

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

  if (selectedProject) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        {error ? (
          <p className="rounded-[var(--radius-sm)] bg-[var(--color-danger)]/15 px-2.5 py-1.5 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
        <Suspense fallback={<p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>}>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ContentProjectView
              hit={selectedProject}
              gameVersion={gameVersion}
              loaders={loaders}
              createMode
              creating={createMutation.isPending}
              onBack={() => {
                setError(null)
                setSelectedProject(null)
              }}
              onInstall={(versionId) => requestCreateWithVersion(selectedProject, versionId)}
            />
          </div>
        </Suspense>
        {versionDialog}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <header className="shrink-0">
        <h1 className="text-lg font-semibold text-[var(--color-text)]">{t('content.browsePageTitle')}</h1>
        <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{t('content.browsePageSubtitle')}</p>
      </header>

      <div className="flex min-h-0 flex-1 gap-2 overflow-hidden">
        <ContentBrowseFilters
          category={filterCategory}
          gameVersion={gameVersion}
          loaders={loaders}
          tags={tags}
          versionOptions={versionOptions}
          onGameVersion={setGameVersion}
          onLoaders={setLoaders}
          onTags={setTags}
          onReset={() => {
            setGameVersion('')
            setLoaders(['fabric', 'neoforge', 'forge', 'quilt'])
            setTags([])
          }}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
          <div data-fledge-tutorial="tutorial-browse-tabs">
            <ContentSearchCategoryTabs
              tabs={browsePageSearchTabs()}
              active={searchTab}
              onChange={(next) => {
                setTags([])
                setSearchTab(next)
              }}
            />
          </div>
          {isFavoritesTab(searchTab) ? (
            <FavoriteCategoryFilters
              categories={favoriteCategoryTabs}
              counts={favoriteCategoryCounts}
              active={favoriteCategory}
              onChange={setFavoriteCategory}
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
              {gameVersion.trim()
                ? t('content.favorite.compatDebugBanner', {
                    version: gameVersion,
                    ok: favoriteCompatSummary.ok,
                    ng: favoriteCompatSummary.ng,
                  })
                : t('content.favorite.compatDebugNoTarget')}
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
                  const compatible = projectSupportsGameVersion(hit, gameVersion)
                  return (
                  <ContentSearchHitRow
                    key={`${hit.provider}:${hit.id}`}
                    hit={hit}
                    index={index}
                    tagIcons={tagIcons}
                    mode="create"
                    installing={
                      createMutation.isPending && createMutation.variables?.id === hit.id
                    }
                    installed={false}
                    favorited={isFavorite(hit.id)}
                    incompatible={isFavoritesTab(searchTab) && !compatible}
                    compatDebug={
                      isFavoritesTab(searchTab)
                        ? t('content.favorite.compatDebug', {
                            status: compatible
                              ? hit.gameVersions.length === 0
                                ? t('content.favorite.compatUnknown')
                                : t('content.favorite.compatOk')
                              : t('content.favorite.compatNg'),
                            version: gameVersion.trim() || '—',
                            versions: formatGameVersionList(hit.gameVersions),
                          })
                        : null
                    }
                    onToggleFavorite={() => toggleFavorite(hit)}
                    onOpen={() => {
                      setError(null)
                      setSelectedProject(hit)
                    }}
                    onInstall={() => requestCreateWithVersion(hit)}
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
      {versionDialog}
    </div>
  )
}
