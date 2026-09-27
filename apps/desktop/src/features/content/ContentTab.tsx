import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { getFledgeUiScaleRoot } from '../../components/layout/fledgeUiScaleRoot'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  IconArrowUp,
  IconArrowsExchange,
  IconLayoutGrid,
  IconPlus,
  IconRefresh,
  IconShare,
  IconTrash,
} from '@tabler/icons-react'
import type { ContentVersion, InstalledContent, InstanceProfile } from '@fledge/shared'
import { contentCategoriesForLoader, loaderToContentFilters } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Dialog } from '../../components/ui/Dialog'
import { HoverTip } from '../../components/ui/HoverTip'
import { ListPickDialog, type ListPickGroup, type ListPickItem } from '../../components/ui/ListPickDialog'
import { Switch } from '../../components/ui/Switch'
import {
  type ContentListFilter,
  parseContentFilter,
  writeContentFilter,
} from '../../navigation/libraryDetailSearch'
import { ContentCategoryIcon, ContentCategoryLabel, ContentFallbackIcon, ContentFilterAllLabel } from './contentCategoryIcons'
import { ContentShareDialog } from './ContentShareDialog'
import { SlidingPillTabs } from '../../components/ui/SlidingPillTabs'
import { useTransferStore } from '../../stores/appStores'
import { ContentDropOverlay, useContentFileDrop } from './ContentDropZone'

type Props = {
  instance: InstanceProfile
}

type ContentMenuState = {
  x: number
  y: number
  item: InstalledContent
} | null

type VersionChangeTarget = {
  item: InstalledContent
  version: ContentVersion
}

type BulkStableTarget = {
  item: InstalledContent
  versionId: string
  versionNumber: string
}

function isStableRelease(versionType?: string): boolean {
  return !versionType || versionType === 'release'
}

export function ContentTab({ instance }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [removeTargets, setRemoveTargets] = useState<InstalledContent[] | null>(null)
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [bulkTargets, setBulkTargets] = useState<BulkStableTarget[]>([])
  const [bulkResolving, setBulkResolving] = useState(false)
  const [versionPickItem, setVersionPickItem] = useState<InstalledContent | null>(null)
  const [versionChange, setVersionChange] = useState<VersionChangeTarget | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [shareItems, setShareItems] = useState<InstalledContent[] | null>(null)
  const [menu, setMenu] = useState<ContentMenuState>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const selectAllRef = useRef<HTMLInputElement>(null)

  const listFilter = parseContentFilter(searchParams.get('category'))
  const listCategories = useMemo(
    () => contentCategoriesForLoader(instance.loader),
    [instance.loader],
  )
  const instanceLoaders = useMemo(
    () => loaderToContentFilters(instance.loader),
    [instance.loader],
  )

  useEffect(() => {
    const browse = searchParams.get('browse') === '1'
    const project = searchParams.get('project')
    if (!browse && !project) return
    if (browse) {
      navigate(
        project
          ? `/library/${instance.id}/browse?project=${encodeURIComponent(project)}`
          : `/library/${instance.id}/browse`,
        { replace: true },
      )
      return
    }
    if (project) {
      navigate(`/library/${instance.id}/project/${encodeURIComponent(project)}`, { replace: true })
    }
  }, [instance.id, navigate, searchParams])

  const changeFilter = useCallback(
    (next: ContentListFilter) => {
      if (next === listFilter) return
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev)
        writeContentFilter(params, next)
        return params
      })
    },
    [listFilter, setSearchParams],
  )

  useEffect(() => {
    if (listFilter !== 'all' && !listCategories.includes(listFilter)) {
      changeFilter('all')
    }
  }, [listFilter, listCategories, changeFilter])

  const openBrowsePage = useCallback(() => {
    navigate(`/library/${instance.id}/browse`)
  }, [instance.id, navigate])

  const openInstalledProject = useCallback(
    (item: InstalledContent) => {
      if (item.provider === 'local') return
      navigate(`/library/${instance.id}/project/${encodeURIComponent(item.projectId)}`)
    },
    [instance.id, navigate],
  )

  const installedQuery = useQuery({
    queryKey: ['content-installed', instance.id, listFilter],
    queryFn: () =>
      fledgeApi.content.listInstalled(
        instance.id,
        listFilter === 'all' ? undefined : listFilter,
      ),
    placeholderData: keepPreviousData,
  })

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['content-installed', instance.id] })
  }, [instance.id, queryClient])

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      fledgeApi.content.setEnabled(instance.id, id, enabled),
    onSuccess: () => void invalidate(),
  })

  const removeMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await fledgeApi.content.remove(instance.id, id)
      }
    },
    onSuccess: () => void invalidate(),
  })

  const bulkToggleMutation = useMutation({
    mutationFn: async (input: { ids: string[]; enabled: boolean }) => {
      for (const id of input.ids) {
        await fledgeApi.content.setEnabled(instance.id, id, input.enabled)
      }
    },
    onSuccess: () => void invalidate(),
  })

  const installLocalMutation = useMutation({
    mutationFn: (paths: string[]) =>
      fledgeApi.content.installLocal({ instanceId: instance.id, paths }),
    onSuccess: async (result) => {
      await invalidate()
      if (result.errors.length > 0) {
        const message = result.errors
          .map((err) => (err.startsWith('content.error.') ? t(err) : err))
          .join('\n')
        window.alert(message)
      }
    },
    onError: (err) => {
      const key = err instanceof Error ? err.message : String(err)
      window.alert(key.startsWith('content.error.') ? t(key) : key)
    },
  })

  const onDropPaths = useCallback(
    (paths: string[]) => {
      if (paths.length === 0 || installLocalMutation.isPending) return
      installLocalMutation.mutate(paths)
    },
    [installLocalMutation],
  )

  const { active: dropActive, previews: dropPreviews } = useContentFileDrop({
    enabled: true,
    onDropPaths,
  })

  const updatesMutation = useMutation({
    mutationFn: () => fledgeApi.content.checkUpdates(instance.id),
    onSuccess: () => void invalidate(),
  })

  const installVersionMutation = useMutation({
    mutationFn: (input: { item: InstalledContent; versionId: string }) =>
      fledgeApi.content.install({
        instanceId: instance.id,
        provider: input.item.provider,
        projectId: input.item.projectId,
        category: input.item.category,
        versionId: input.versionId,
        gameVersion: instance.minecraftVersion,
      }),
    onSuccess: () => void invalidate(),
  })

  const bulkUpdateMutation = useMutation({
    mutationFn: async (targets: BulkStableTarget[]) => {
      for (const target of targets) {
        await fledgeApi.content.install({
          instanceId: instance.id,
          provider: target.item.provider,
          projectId: target.item.projectId,
          category: target.item.category,
          versionId: target.versionId,
          gameVersion: instance.minecraftVersion,
        })
      }
    },
    onSuccess: () => void invalidate(),
  })

  const versionsQuery = useQuery({
    queryKey: [
      'content-installed-versions',
      versionPickItem?.projectId,
      instance.minecraftVersion,
      instance.loader,
      versionPickItem?.category,
    ],
    queryFn: () => {
      const item = versionPickItem!
      const useLoaders = item.category === 'mod' || item.category === 'modpack'
      return fledgeApi.content.listVersions({
        projectId: item.projectId,
        gameVersion: instance.minecraftVersion,
        loaders: useLoaders ? instanceLoaders : [],
      })
    },
    enabled: versionPickItem != null,
    staleTime: 60_000,
  })

  const rawItems = installedQuery.data ?? []
  const items = rawItems

  useEffect(() => {
    setSelectedIds(new Set())
  }, [listFilter, instance.id])

  useEffect(() => {
    const visible = new Set(items.map((item) => item.id))
    setSelectedIds((prev) => {
      let changed = false
      const next = new Set<string>()
      for (const id of prev) {
        if (visible.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [items])

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  )
  const selectedCount = selectedItems.length
  const allSelected = items.length > 0 && selectedCount === items.length
  const someSelected = selectedCount > 0 && !allSelected

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (items.length > 0 && prev.size === items.length) return new Set()
      return new Set(items.map((item) => item.id))
    })
  }, [items])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const hasStableUpdate = (item: InstalledContent) =>
    item.provider !== 'local' &&
    Boolean(
      item.updateAvailable &&
        item.latestVersionId &&
        item.latestVersionType === 'release',
    )

  const updatableItems = useMemo(
    () => items.filter(hasStableUpdate),
    [items],
  )
  const hasUpdates = updatableItems.length > 0

  const openBulkUpdate = useCallback(async () => {
    const candidates = items.filter(
      (item) =>
        item.updateAvailable &&
        item.latestVersionType === 'release' &&
        item.latestVersionId &&
        !item.latestVersionId.endsWith('-dev-preview'),
    )
    setBulkResolving(true)
    try {
      const resolved: BulkStableTarget[] = []
      for (const item of candidates) {
        const useLoaders = item.category === 'mod' || item.category === 'modpack'
        const versions = await fledgeApi.content.listVersions({
          projectId: item.projectId,
          gameVersion: instance.minecraftVersion,
          loaders: useLoaders ? instanceLoaders : [],
        })
        const latestStableIndex = versions.findIndex((v) => isStableRelease(v.versionType))
        if (latestStableIndex < 0) continue
        const latestStable = versions[latestStableIndex]
        if (!latestStable || latestStable.id === item.versionId) continue
        const currentIndex = versions.findIndex((v) => v.id === item.versionId)
        if (currentIndex >= 0 && latestStableIndex > currentIndex) continue
        resolved.push({
          item,
          versionId: latestStable.id,
          versionNumber: latestStable.versionNumber,
        })
      }
      setBulkTargets(resolved)
      setBulkConfirmOpen(true)
    } finally {
      setBulkResolving(false)
    }
  }, [instance.minecraftVersion, instanceLoaders, items])

  const jobs = useTransferStore((s) => s.jobs)
  const installingProjectIds = useMemo(() => {
    const ids = new Set<string>()
    for (const job of Object.values(jobs)) {
      if (
        job.kind === 'content' &&
        job.meta.instanceId === instance.id &&
        typeof job.meta.projectId === 'string'
      ) {
        ids.add(job.meta.projectId)
      }
    }
    return ids
  }, [jobs, instance.id])

  const closeMenu = useCallback(() => setMenu(null), [])

  useLayoutEffect(() => {
    if (!menu) return
    const el = menuRef.current
    const pad = 8
    const width = el?.offsetWidth ?? 180
    const height = el?.offsetHeight ?? 120
    setMenuPos({
      x: Math.max(pad, Math.min(menu.x, window.innerWidth - width - pad)),
      y: Math.max(pad, Math.min(menu.y, window.innerHeight - height - pad)),
    })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    const onPointer = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return
      closeMenu()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [menu, closeMenu])

  const openContextMenu = (event: MouseEvent, item: InstalledContent) => {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY, item })
  }

  const versionGroups = useMemo(() => {
    const versions = versionsQuery.data ?? []
    if (!versionPickItem || versions.length === 0) {
      return [{ items: [] as ListPickItem[] }]
    }

    const isPrerelease = (v: (typeof versions)[number]) =>
      v.versionType === 'beta' || v.versionType === 'alpha'
    const isStable = (v: (typeof versions)[number]) => !isPrerelease(v)

    const latestStable = versions.find(isStable)
    const latestPrerelease = versions.find(isPrerelease)
    const currentId = versionPickItem.versionId
    const current = versions.find((v) => v.id === currentId)

    const toItem = (
      v: (typeof versions)[number],
      tone?: 'latest' | 'prerelease',
    ): ListPickItem => ({
      value: v.id,
      label: v.versionNumber,
      suffix: v.versionType,
      suffixTone:
        v.versionType === 'release'
          ? 'release'
          : v.versionType === 'beta' || v.versionType === 'alpha'
            ? v.versionType
            : undefined,
      tone,
    })

    const groups: ListPickGroup[] = []

    if (latestStable) {
      groups.push({
        label: t('content.versionLatestStable'),
        labelTone: 'latest',
        items: [toItem(latestStable, 'latest')],
      })
    }
    if (latestPrerelease) {
      groups.push({
        label: t('content.versionLatestPrerelease'),
        labelTone: 'prerelease',
        items: [toItem(latestPrerelease, 'prerelease')],
      })
    }
    if (
      current &&
      current.id !== latestStable?.id &&
      current.id !== latestPrerelease?.id
    ) {
      groups.push({
        label: t('content.versionCurrent'),
        items: [toItem(current)],
      })
    }

    // 対応バージョンをすべて一覧（ピン済みも含め、過去版も漏れなく）
    groups.push({
      label: t('content.versionAll'),
      items: versions.map((v) => {
        if (v.id === latestStable?.id) return toItem(v, 'latest')
        if (v.id === latestPrerelease?.id) return toItem(v, 'prerelease')
        return toItem(v)
      }),
    })

    return groups
  }, [versionsQuery.data, versionPickItem, t])

  const menuPortal =
    menu != null
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[120] min-w-44 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 text-[var(--color-text)] shadow-sm"
            style={{ left: menuPos.x, top: menuPos.y }}
          >
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm transition hover:bg-[var(--color-hover)]"
              disabled={toggleMutation.isPending}
              onClick={() => {
                toggleMutation.mutate({ id: menu.item.id, enabled: !menu.item.enabled })
                closeMenu()
              }}
            >
              {menu.item.enabled ? t('content.disable') : t('content.enable')}
            </button>
            {menu.item.provider !== 'local' ? (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm transition hover:bg-[var(--color-hover)]"
                onClick={() => {
                  setVersionPickItem(menu.item)
                  closeMenu()
                }}
              >
                {t('content.changeVersion')}
              </button>
            ) : null}
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm transition hover:bg-[var(--color-hover)]"
              onClick={() => {
                setShareItems([menu.item])
                closeMenu()
              }}
            >
              {t('content.share')}
            </button>
            <div className="my-1 border-t border-[var(--color-border)]" />
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-[var(--color-danger)] transition hover:bg-[var(--color-danger)]/10"
              onClick={() => {
                setRemoveTargets([menu.item])
                closeMenu()
              }}
            >
              {t('content.remove')}
            </button>
          </div>,
          getFledgeUiScaleRoot(),
        )
      : null

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-1.5">
      <ContentDropOverlay active={dropActive} previews={dropPreviews} />
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <SlidingPillTabs
          className="min-w-0 flex-1"
          activeId={listFilter}
          onChange={(id) => changeFilter(id as ContentListFilter)}
          items={[
            {
              id: 'all',
              label: <ContentFilterAllLabel iconSize={14} />,
            },
            ...listCategories.map((c) => ({
              id: c,
              label: <ContentCategoryLabel category={c} iconSize={14} />,
            })),
          ]}
        />
        <div className="flex shrink-0 flex-wrap gap-1">
          <Button
            variant={hasUpdates ? 'primary' : 'secondary'}
            className="px-2 py-1 text-xs"
            disabled={!hasUpdates || bulkUpdateMutation.isPending || bulkResolving}
            onClick={() => void openBulkUpdate()}
          >
            <IconArrowUp size={14} stroke={1.75} />
            {t('content.bulkUpdate')}
          </Button>
          <Button
            variant={hasUpdates ? 'primary' : 'secondary'}
            className="px-2 py-1 text-xs"
            disabled={updatesMutation.isPending}
            onClick={() => updatesMutation.mutate()}
          >
            <IconRefresh size={14} stroke={1.75} />
            {t('content.refreshData')}
          </Button>
          <Button variant="primary" className="px-2.5 py-1 text-xs" onClick={openBrowsePage}>
            <IconPlus size={14} stroke={1.75} />
            {t('content.add')}
          </Button>
        </div>
      </div>

      {installedQuery.isPending && !installedQuery.data ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] px-3 py-6 text-center">
          {listFilter === 'all' ? (
            <IconLayoutGrid size={22} className="mx-auto opacity-80 text-[var(--color-text-muted)]" />
          ) : (
            <ContentCategoryIcon category={listFilter} size={22} className="mx-auto opacity-80" />
          )}
          <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
            {listFilter === 'all' ? t('content.empty') : t('content.emptyFiltered')}
          </p>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">{t('content.dropHint')}</p>
          <Button className="mt-2 px-2.5 py-1 text-xs" variant="primary" onClick={openBrowsePage}>
            <IconPlus size={14} stroke={1.75} />
            {t('content.add')}
          </Button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          {selectedCount > 0 ? (
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5">
              <span className="mr-1 text-xs font-medium text-[var(--color-text)]">
                {t('content.selectedCount', { count: selectedCount })}
              </span>
              <Button
                variant="secondary"
                className="px-2 py-1 text-xs"
                disabled={bulkToggleMutation.isPending}
                onClick={() =>
                  bulkToggleMutation.mutate(
                    { ids: selectedItems.map((item) => item.id), enabled: false },
                    { onSettled: clearSelection },
                  )
                }
              >
                {t('content.disable')}
              </Button>
              <Button
                variant="secondary"
                className="px-2 py-1 text-xs"
                disabled={bulkToggleMutation.isPending}
                onClick={() =>
                  bulkToggleMutation.mutate(
                    { ids: selectedItems.map((item) => item.id), enabled: true },
                    { onSettled: clearSelection },
                  )
                }
              >
                {t('content.enable')}
              </Button>
              <Button
                variant="secondary"
                className="px-2 py-1 text-xs"
                onClick={() => setShareItems(selectedItems)}
              >
                <IconShare size={14} stroke={1.75} />
                {t('content.share')}
              </Button>
              <Button
                variant="danger"
                className="px-2 py-1 text-xs"
                onClick={() => setRemoveTargets(selectedItems)}
              >
                <IconTrash size={14} stroke={1.75} />
                {t('content.remove')}
              </Button>
              <button
                type="button"
                className="ml-auto text-xs text-[var(--color-accent)] hover:underline"
                onClick={clearSelection}
              >
                {t('content.selectNone')}
              </button>
            </div>
          ) : null}
          <ul className="min-h-0 flex-1 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <li className="sticky top-0 z-[1] flex items-center border-b border-[var(--color-border)] bg-[var(--color-surface)] py-2.5">
              <label className="inline-flex cursor-pointer items-center gap-2 pl-3 pr-2 text-xs text-[var(--color-text-muted)]">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  className="size-4 shrink-0 accent-[var(--color-accent)]"
                  checked={allSelected}
                  aria-label={t('content.selectAll')}
                  onChange={toggleSelectAll}
                />
                {t('content.selectAll')}
              </label>
            </li>
            {items.map((item, index) => {
              const installing = installingProjectIds.has(item.projectId)
              const checked = selectedIds.has(item.id)
              return (
                <li
                  key={item.id}
                  className={[
                    'flex cursor-pointer items-stretch border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-hover)]/60',
                    index % 2 === 1 ? 'bg-[var(--color-zebra)]' : 'bg-[var(--color-surface)]',
                    checked ? 'bg-[var(--color-accent-soft)]/35' : '',
                  ].join(' ')}
                  onClick={() => openInstalledProject(item)}
                  onContextMenu={(e) => openContextMenu(e, item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openInstalledProject(item)
                    }
                  }}
                >
                  <div
                    className="flex shrink-0 items-center pl-3 pr-3"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-[var(--color-accent)]"
                      checked={checked}
                      aria-label={t('content.selectItem', { name: item.name })}
                      onChange={() => toggleSelected(item.id)}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-3 py-4 pl-1.5 pr-3">
                    {item.iconUrl && item.provider !== 'local' ? (
                      <img
                        src={item.iconUrl}
                        alt=""
                        width={40}
                        height={40}
                        loading="lazy"
                        decoding="async"
                        className="size-10 shrink-0 rounded-[var(--radius-sm)] object-cover"
                      />
                    ) : (
                      <ContentFallbackIcon size={20} boxClassName="size-10" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium leading-snug">{item.name}</div>
                      <div className="truncate text-xs leading-snug text-[var(--color-text-muted)]">
                        {listFilter === 'all' ? (
                          <>
                            {t(`content.category.${item.category}`)}
                            {' · '}
                          </>
                        ) : null}
                        {item.versionNumber}
                        {hasStableUpdate(item) && item.latestVersionNumber
                          ? ` → ${item.latestVersionNumber}`
                          : ''}
                        {' · '}
                        {item.provider === 'local'
                          ? t('content.provider.local')
                          : item.provider}
                        {!item.enabled ? ` · ${t('content.disabled')}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 py-4 pr-5">
                    <div className="mr-3">
                      <HoverTip
                        label={
                          hasStableUpdate(item)
                            ? t('content.changeVersionUpdateAvailable')
                            : t('content.changeVersion')
                        }
                        disabled={installing}
                      >
                        <button
                          type="button"
                          className={[
                            'relative inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] transition-colors',
                            hasStableUpdate(item)
                              ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/35 hover:bg-[color-mix(in_srgb,var(--color-accent-soft)_80%,var(--color-accent))]'
                              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
                          ].join(' ')}
                          aria-label={
                            hasStableUpdate(item)
                              ? t('content.changeVersionUpdateAvailable')
                              : t('content.changeVersion')
                          }
                          disabled={installing}
                          onClick={(e) => {
                            e.stopPropagation()
                            setVersionPickItem(item)
                          }}
                        >
                          <IconArrowsExchange size={18} stroke={1.6} aria-hidden />
                          {hasStableUpdate(item) ? (
                            <span
                              className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-on-accent)] shadow-sm"
                              aria-hidden
                            >
                              <IconArrowUp size={9} stroke={2.5} />
                            </span>
                          ) : null}
                        </button>
                      </HoverTip>
                    </div>
                    <div
                      className="inline-flex h-[27px] w-[45px] shrink-0 items-center justify-center"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <Switch
                        checked={item.enabled}
                        disabled={toggleMutation.isPending && toggleMutation.variables?.id === item.id}
                        aria-label={item.enabled ? t('content.disable') : t('content.enable')}
                        onChange={(enabled) => toggleMutation.mutate({ id: item.id, enabled })}
                      />
                    </div>
                    <button
                      type="button"
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10"
                      aria-label={t('content.remove')}
                      onClick={(e) => {
                        e.stopPropagation()
                        setRemoveTargets([item])
                      }}
                    >
                      <IconTrash size={24} stroke={1.25} aria-hidden />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {menuPortal}

      <ListPickDialog
        open={versionPickItem != null}
        title={
          versionPickItem
            ? t('content.versionPickTitle', { name: versionPickItem.name })
            : t('content.changeVersion')
        }
        size="sm"
        value={versionPickItem?.versionId ?? ''}
        groups={versionGroups}
        empty={
          versionsQuery.isPending
            ? t('common.loading')
            : t('content.noCompatibleVersions', { game: instance.minecraftVersion })
        }
        header={
          versionPickItem ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              {t('content.versionPickHint', {
                game: instance.minecraftVersion,
                current: versionPickItem.versionNumber,
              })}
            </p>
          ) : null
        }
        onClose={() => setVersionPickItem(null)}
        onSelect={(versionId) => {
          const item = versionPickItem
          const version = (versionsQuery.data ?? []).find((v) => v.id === versionId)
          if (!item || !version) return
          if (version.id === item.versionId) {
            setVersionPickItem(null)
            return
          }
          setVersionPickItem(null)
          setVersionChange({ item, version })
        }}
      />

      <ConfirmDialog
        open={removeTargets != null}
        title={t('content.remove')}
        body={
          removeTargets && removeTargets.length > 1
            ? t('content.bulkRemoveConfirm', { count: removeTargets.length })
            : t('content.removeConfirm')
        }
        confirmLabel={t('content.remove')}
        pending={removeMutation.isPending}
        onCancel={() => setRemoveTargets(null)}
        onConfirm={() => {
          if (!removeTargets || removeTargets.length === 0) return
          const ids = removeTargets.map((item) => item.id)
          removeMutation.mutate(ids, {
            onSettled: () => {
              setRemoveTargets(null)
              clearSelection()
            },
          })
        }}
      />
      <ContentShareDialog
        open={shareItems != null}
        items={shareItems ?? []}
        onClose={() => setShareItems(null)}
      />
      <Dialog
        open={bulkConfirmOpen}
        title={t('content.bulkUpdateConfirmTitle')}
        subtitle={t('content.bulkUpdateConfirmSubtitle', {
          game: instance.minecraftVersion,
          count: bulkTargets.length,
        })}
        size="md"
        overlayClassName="z-[90]"
        onClose={() => setBulkConfirmOpen(false)}
        footer={
          <>
            <Button
              type="button"
              disabled={bulkUpdateMutation.isPending}
              onClick={() => setBulkConfirmOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={bulkUpdateMutation.isPending || bulkTargets.length === 0}
              onClick={() => {
                const targets = bulkTargets
                setBulkConfirmOpen(false)
                bulkUpdateMutation.mutate(targets)
              }}
            >
              {t('content.bulkUpdate')}
            </Button>
          </>
        }
      >
        {bulkTargets.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t('content.bulkUpdateStableEmpty')}</p>
        ) : (
        <ul className="max-h-[min(22rem,50vh)] space-y-2 overflow-y-auto pr-0.5">
          {bulkTargets.map((target) => {
            const item = target.item
            return (
            <li
              key={item.id}
              className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)]/40 px-2.5 py-2"
            >
              {item.iconUrl ? (
                <img
                  src={item.iconUrl}
                  alt=""
                  width={36}
                  height={36}
                  className="size-9 shrink-0 rounded-[var(--radius-sm)] object-cover"
                />
              ) : (
                <ContentFallbackIcon size={16} boxClassName="size-9" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[var(--color-text)]">
                  {item.name}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-[var(--color-text-muted)]">
                  <span className="rounded bg-[var(--color-hover)] px-1.5 py-0.5 font-mono">
                    {item.versionNumber}
                  </span>
                  <IconArrowUp
                    size={12}
                    stroke={2}
                    className="rotate-90 text-[var(--color-accent)]"
                    aria-hidden
                  />
                  <span className="rounded bg-[var(--color-accent-soft)] px-1.5 py-0.5 font-mono font-medium text-[var(--color-accent)]">
                    {target.versionNumber}
                  </span>
                </div>
              </div>
            </li>
            )
          })}
        </ul>
        )}
      </Dialog>
      <ConfirmDialog
        open={versionChange != null}
        title={t('content.updateConfirmTitle')}
        body={
          versionChange
            ? t('content.updateConfirmBody', {
                name: versionChange.item.name,
                from: versionChange.item.versionNumber,
                to: versionChange.version.versionNumber,
                game: instance.minecraftVersion,
              })
            : ''
        }
        confirmLabel={t('content.applyVersion')}
        danger={false}
        pending={installVersionMutation.isPending}
        onCancel={() => setVersionChange(null)}
        onConfirm={() => {
          if (!versionChange) return
          const target = versionChange
          setVersionChange(null)
          installVersionMutation.mutate({
            item: target.item,
            versionId: target.version.id,
          })
        }}
      />
    </div>
  )
}
