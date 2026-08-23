import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  'rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-2.5 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]'

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
  const queryClient = useQueryClient()
  const wasOpenRef = useRef(false)
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
  const tagIcons = useModrinthTagIcons(category)

  const versionsQuery = useQuery({
    queryKey: ['versions-minecraft', false],
    queryFn: () => fledgeApi.versions.listMinecraft({ includeSnapshots: false }),
    enabled: open,
    staleTime: 10 * 60_000,
  })

  useEffect(() => {
    if (open && !wasOpenRef.current) {
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
    wasOpenRef.current = open
  }, [open, instance.id, instance.minecraftVersion, instance.loader, reset])

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), 400)
    return () => window.clearTimeout(id)
  }, [query])

  useEffect(() => {
    setPage(1)
  }, [debouncedQuery, category, gameVersion, loaders, tags, sort, pageSize])

  useEffect(() => {
    setTags([])
  }, [category])

  const versionOptions = useMemo(() => {
    const ids = (versionsQuery.data?.versions ?? []).map((v) => v.id)
    return [instance.minecraftVersion, ...ids.filter((id) => id !== instance.minecraftVersion)]
  }, [versionsQuery.data?.versions, instance.minecraftVersion])

  const searchInput: ContentSearchQuery = useMemo(
    () => ({
      query: debouncedQuery,
      category,
      gameVersion: gameVersion.trim() || undefined,
      loaders: category === 'mod' || category === 'plugin' ? loaders : [],
      tags,
      environments: [],
      provider: 'modrinth',
      sort,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    }),
    [debouncedQuery, category, gameVersion, loaders, tags, sort, page, pageSize],
  )

  const searchQuery = useQuery({
    queryKey: ['content-search', searchInput],
    queryFn: () => fledgeApi.content.search(searchInput),
    enabled: open,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 5_000),
  })

  const installedQuery = useQuery({
    queryKey: ['content-installed', instance.id, category],
    queryFn: () => fledgeApi.content.listInstalled(instance.id, category),
    enabled: open,
    placeholderData: keepPreviousData,
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
        category,
        versionId: input.versionId,
        gameVersion: gameVersion.trim() || undefined,
        loaders: category === 'mod' || category === 'plugin' ? loaders : [],
      }),
    onError: (err, input) => {
      unmark(input.id)
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
        <div className="flex min-h-0 flex-1 gap-4">
          <ContentBrowseFilters
            instance={instance}
            category={category}
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
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onCategoryChange(c)}
                className={[
                  'inline-flex items-center rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium transition-colors',
                  category === c
                    ? 'bg-[var(--color-selection)] text-[var(--color-on-selection)]'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]',
                ].join(' ')}
              >
                <ContentCategoryLabel category={c} iconSize={16} />
              </button>
            ))}
          </div>

          <div className="relative shrink-0">
            <IconSearch
              size={18}
              stroke={1.75}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
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
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] py-2.5 pl-11 pr-4 text-sm outline-none focus:border-[var(--color-accent)]"
            />
          </div>

          <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-3">
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
              <span className="text-sm text-[var(--color-text-muted)]">
                {t('content.resultCount', { total: total.toLocaleString('ja-JP') })}
              </span>
            ) : null}
            <div className="ml-auto">
              <PageNav page={page} pageCount={pageCount} onChange={setPage} />
            </div>
          </div>

          {error ? (
            <p className="rounded-[var(--radius-sm)] bg-[var(--color-danger)]/15 px-3 py-2 text-sm text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}
          {searchErrorMessage ? (
            <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/15 px-3 py-2 text-sm text-[var(--color-danger)]">
              <p className="min-w-0 flex-1">{searchErrorMessage}</p>
              <button
                type="button"
                className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-on-accent)]"
                onClick={() => void searchQuery.refetch()}
              >
                {t('common.retry')}
              </button>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
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
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
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
              <span className="truncate text-sm font-medium">{hit.name}</span>
              {hit.author ? (
                <span className="truncate text-xs text-[var(--color-text-muted)]">{hit.author}</span>
              ) : null}
              <span className="ml-auto shrink-0 text-xs tabular-nums text-[var(--color-text-muted)]">
                {formatJaCount(hit.downloads)}
              </span>
            </div>
            <p className="truncate text-xs text-[var(--color-text-muted)]">{hit.description}</p>
            <ProjectTagRow
              categories={hit.displayCategories ?? []}
              loaders={hit.loaders ?? []}
              tagIcons={tagIcons}
            />
          </div>
        </button>
        <ContentInstallButton size="sm" installed={installed} installing={false} onInstall={onInstall} />
      </div>
    </li>
  )
}
