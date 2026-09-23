import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { IconChevronDown, IconChevronUp, IconPlus } from '@tabler/icons-react'
import {
  LibrarySortModeSchema,
  moveLibraryInstanceOrder,
  reconcileLibraryInstanceOrder,
  type InstanceProfile,
  type LibrarySortMode,
  type Settings,
} from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Select } from '../../components/ui/Select'
import { InstanceCreationFlow } from './InstanceCreationFlow'
import { InstanceCard } from './InstanceCard'
import {
  InstanceContextMenu,
  type InstanceContextMenuState,
} from './InstanceContextMenu'
import { sortLibraryInstances } from './sortLibraryInstances'
import { useInstanceCreateStore, useUiStore } from '../../stores/appStores'
import { useDebugStore } from '../../stores/debugStore'

const SORT_MODES: LibrarySortMode[] = [
  'lastPlayed',
  'name',
  'nameDesc',
  'created',
  'manual',
]

const IS_DEV = import.meta.env.DEV

/** 開発デバッグ用の仮インスタンス */
const DEV_LIBRARY_PLACEHOLDERS: InstanceProfile[] = Array.from({ length: 9 }, (_, i) => {
  const n = i + 1
  return {
    id: `__dev_placeholder_${n}`,
    name: `仮インスタンス ${n}`,
    createdAt: new Date(2026, 0, n).toISOString(),
    lastPlayedAt: n % 3 === 0 ? new Date(2026, 8, n).toISOString() : undefined,
    minecraftVersion: n % 2 === 0 ? '1.21.1' : '1.20.1',
    loader: n % 3 === 0 ? 'fabric' : n % 3 === 1 ? 'neoforge' : 'vanilla',
    java: { strategy: 'auto' },
    memory: { maxMb: 4096 },
    jvmArgs: [],
    iconPreset: { variant: 'cube', color: '#f4f7fa', backdrop: 'grass' },
  }
})

function useLibraryGridDebug(enabled: boolean) {
  const [node, setNode] = useState<HTMLDivElement | null>(null)
  const [info, setInfo] = useState({ cols: 1, width: 0, bp: 'base' })

  const setGridRef = useCallback((el: HTMLDivElement | null) => {
    setNode(el)
  }, [])

  useEffect(() => {
    if (!enabled || !node) return
    const read = () => {
      const styles = getComputedStyle(node)
      const template = styles.gridTemplateColumns
      const cols = template && template !== 'none' ? template.split(' ').filter(Boolean).length : 1
      const width = Math.round(window.innerWidth)
      const bp = width >= 1024 ? 'lg' : width >= 640 ? 'sm' : 'base'
      setInfo({ cols, width, bp })
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(node)
    window.addEventListener('resize', read)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', read)
    }
  }, [enabled, node])

  return { gridRef: setGridRef, info }
}

type Props = {
  instances: InstanceProfile[]
  /** お知らせ最小化時はライブラリ幅が広がるので 1 行 4 件 */
  newsMinimized?: boolean
}

export function HomeLibrarySection({ instances, newsMinimized = false }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const wizardOpen = useUiStore((s) => s.instanceWizardOpen)
  const setWizardOpen = useUiStore((s) => s.setInstanceWizardOpen)
  const setLibraryFocus = useUiStore((s) => s.setLibraryFocus)
  const createError = useInstanceCreateStore((s) => s.lastError)
  const setCreateError = useInstanceCreateStore((s) => s.setLastError)
  const [menu, setMenu] = useState<InstanceContextMenuState>(null)
  const [pendingDelete, setPendingDelete] = useState<InstanceProfile | null>(null)

  const libraryGridDebug = useDebugStore((s) => s.libraryGridDebug)
  const libraryPlaceholders = useDebugStore((s) => s.libraryPlaceholders)
  const createSpinPreview = useDebugStore((s) => s.createSpinPreview)
  const showGridDebug = IS_DEV && libraryGridDebug
  const usePlaceholders = IS_DEV && libraryPlaceholders
  const { gridRef, info: gridDebug } = useLibraryGridDebug(showGridDebug)

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })

  const sortMode = settingsQuery.data?.librarySortMode ?? 'name'
  const savedOrder = settingsQuery.data?.libraryInstanceOrder ?? []

  const saveSettings = useMutation({
    mutationFn: (partial: Partial<Settings>) => fledgeApi.settings.set(partial),
    onMutate: async (partial) => {
      await queryClient.cancelQueries({ queryKey: ['settings'] })
      const previous = queryClient.getQueryData<Settings>(['settings'])
      if (previous) {
        queryClient.setQueryData<Settings>(['settings'], { ...previous, ...partial })
      }
      return { previous }
    },
    onError: (_err, _partial, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['settings'], ctx.previous)
    },
    onSuccess: (next) => {
      queryClient.setQueryData(['settings'], next)
    },
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => fledgeApi.instances.remove(id),
    onSuccess: async (_data, id) => {
      queryClient.removeQueries({ queryKey: ['content-installed', id] })
      await queryClient.invalidateQueries({ queryKey: ['instances'] })
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => fledgeApi.instances.duplicate(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['instances'] })
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const items = useMemo(() => {
    if (usePlaceholders) return DEV_LIBRARY_PLACEHOLDERS
    return sortLibraryInstances(instances, sortMode, savedOrder)
  }, [instances, sortMode, savedOrder, usePlaceholders])
  const empty = items.length === 0
  const menuInstance = items.find((item) => item.id === menu?.instanceId) ?? null
  const manual = sortMode === 'manual' && !usePlaceholders

  const spinPreviewIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!IS_DEV) return
    const store = useInstanceCreateStore.getState()
    if (createSpinPreview && usePlaceholders) {
      const id = DEV_LIBRARY_PLACEHOLDERS[0]?.id
      if (!id) return
      spinPreviewIdRef.current = id
      store.markCreating(id)
      return () => {
        store.unmarkCreating(id)
        spinPreviewIdRef.current = null
      }
    }
    if (spinPreviewIdRef.current) {
      store.unmarkCreating(spinPreviewIdRef.current)
      spinPreviewIdRef.current = null
    }
  }, [createSpinPreview, usePlaceholders])

  const closeMenu = useCallback(() => setMenu(null), [])

  const openMenu = (event: MouseEvent, instance: InstanceProfile) => {
    setMenu({ x: event.clientX, y: event.clientY, instanceId: instance.id })
  }

  const onSortModeChange = (raw: string) => {
    const mode = LibrarySortModeSchema.parse(raw)
    if (mode === 'manual') {
      const ids = instances.map((i) => i.id)
      const order =
        savedOrder.length > 0
          ? reconcileLibraryInstanceOrder(savedOrder, ids)
          : items.map((i) => i.id)
      saveSettings.mutate({ librarySortMode: mode, libraryInstanceOrder: order })
      return
    }
    saveSettings.mutate({ librarySortMode: mode })
  }

  const moveInstance = (id: string, delta: -1 | 1) => {
    const base = reconcileLibraryInstanceOrder(
      savedOrder.length > 0 ? savedOrder : items.map((i) => i.id),
      items.map((i) => i.id),
    )
    const next = moveLibraryInstanceOrder(base, id, delta)
    if (next === base) return
    saveSettings.mutate({ librarySortMode: 'manual', libraryInstanceOrder: next })
  }

  return (
    <section
      data-fledge-tutorial="tutorial-home-library"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-[var(--color-text-muted)]">
          {t('library.title')}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            <span className="hidden sm:inline">{t('library.sort.label')}</span>
            <Select
              value={sortMode}
              onChange={(e) => onSortModeChange(e.currentTarget.value)}
              className="min-w-[8.5rem]"
              options={SORT_MODES.map((mode) => ({
                value: mode,
                label: t(`library.sort.${mode}`),
              }))}
            />
          </label>
          <Button
            data-fledge-tutorial="tutorial-home-create"
            variant="secondary"
            onClick={() => setWizardOpen(true)}
          >
            <IconPlus size={16} stroke={1.75} className="text-[var(--color-menu-create)]" />
            {t('library.create')}
          </Button>
        </div>
      </div>

      {showGridDebug ? (
        <div className="sticky top-0 z-20 w-fit shrink-0 rounded bg-black/80 px-2 py-1 font-mono text-[11px] text-lime-300 shadow">
          debug · {gridDebug.cols} cols/row · bp={gridDebug.bp} · vw={gridDebug.width}px · items=
          {items.length}
          {newsMinimized ? ' · newsMin' : ''}
          {usePlaceholders ? ' · placeholders' : ''}
        </div>
      ) : null}

      {createError ? (
        <p className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/15 px-3 py-2 text-sm text-[var(--color-danger)]">
          <span>{createError}</span>
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setCreateError(null)}
          >
            {t('common.close')}
          </button>
        </p>
      ) : null}

      {empty ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-8 text-center">
          <p className="font-medium">{t('library.empty')}</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t('library.emptyHint')}</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
          <div
            ref={showGridDebug ? gridRef : undefined}
            className={[
              'grid grid-cols-1 gap-2 sm:grid-cols-2',
              newsMinimized ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
            ].join(' ')}
          >
            {items.map((item, index) => (
              <div key={item.id} className="flex h-full min-w-0 items-stretch gap-1">
                {manual ? (
                  <div className="flex shrink-0 flex-col justify-center gap-0.5">
                    <button
                      type="button"
                      className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] disabled:opacity-30"
                      aria-label={t('library.sort.moveUp')}
                      disabled={index === 0 || saveSettings.isPending}
                      onClick={(e) => {
                        e.stopPropagation()
                        moveInstance(item.id, -1)
                      }}
                    >
                      <IconChevronUp size={16} stroke={1.75} />
                    </button>
                    <button
                      type="button"
                      className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] disabled:opacity-30"
                      aria-label={t('library.sort.moveDown')}
                      disabled={index === items.length - 1 || saveSettings.isPending}
                      onClick={(e) => {
                        e.stopPropagation()
                        moveInstance(item.id, 1)
                      }}
                    >
                      <IconChevronDown size={16} stroke={1.75} />
                    </button>
                  </div>
                ) : null}
                <InstanceCard
                  instance={item}
                  density="compact"
                  className="h-full min-w-0 flex-1"
                  onContextMenu={usePlaceholders ? undefined : openMenu}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <InstanceContextMenu
        menu={menuInstance ? menu : null}
        onClose={closeMenu}
        onOpen={() => {
          if (!menuInstance) return
          setLibraryFocus({ instanceId: menuInstance.id, tab: 'content' })
          navigate(`/library/${menuInstance.id}`)
          closeMenu()
        }}
        onDuplicate={() => {
          if (!menuInstance) return
          duplicateMutation.mutate(menuInstance.id)
          closeMenu()
        }}
        onOpenFolder={() => {
          if (!menuInstance) return
          void fledgeApi.instances.openFolder(menuInstance.id)
          closeMenu()
        }}
        onDelete={() => {
          if (!menuInstance) return
          setPendingDelete(menuInstance)
          closeMenu()
        }}
      />

      <ConfirmDialog
        open={pendingDelete != null}
        title={t('instances.delete')}
        body={t('instances.deleteConfirm')}
        confirmLabel={t('instances.delete')}
        pending={removeMutation.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return
          removeMutation.mutate(pendingDelete.id, {
            onSettled: () => setPendingDelete(null),
          })
        }}
      />

      <InstanceCreationFlow open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </section>
  )
}
