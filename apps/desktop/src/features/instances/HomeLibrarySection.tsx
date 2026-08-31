import { useCallback, useMemo, useState, type MouseEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import {
  LibrarySortModeSchema,
  moveLibraryInstanceOrder,
  reconcileLibraryInstanceOrder,
  type InstanceProfile,
  type LibrarySortMode,
  type Settings,
} from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { InstanceCreationFlow } from './InstanceCreationFlow'
import { InstanceCard } from './InstanceCard'
import {
  InstanceContextMenu,
  type InstanceContextMenuState,
} from './InstanceContextMenu'
import { sortLibraryInstances } from './sortLibraryInstances'
import { useInstanceCreateStore, useUiStore } from '../../stores/appStores'

const SORT_MODES: LibrarySortMode[] = [
  'lastPlayed',
  'name',
  'nameDesc',
  'created',
  'manual',
]

const selectClass =
  'rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-2 py-1 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]'

type Props = {
  instances: InstanceProfile[]
}

export function HomeLibrarySection({ instances }: Props) {
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
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['instances'] })
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      setLibraryFocus({ instanceId: created.id, tab: 'content' })
      navigate(`/library/${created.id}`)
    },
  })

  const items = useMemo(
    () => sortLibraryInstances(instances, sortMode, savedOrder),
    [instances, sortMode, savedOrder],
  )
  const empty = items.length === 0
  const menuInstance = items.find((item) => item.id === menu?.instanceId) ?? null
  const manual = sortMode === 'manual'

  const closeMenu = useCallback(() => setMenu(null), [])

  const openMenu = (event: MouseEvent, instance: InstanceProfile) => {
    setMenu({ x: event.clientX, y: event.clientY, instanceId: instance.id })
  }

  const onSortModeChange = (raw: string) => {
    const mode = LibrarySortModeSchema.parse(raw)
    if (mode === 'manual') {
      // 保存済みの手動順があればそれを優先。無ければ今見えている並びを初期値にする
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
        <h2 className="text-sm font-medium text-[var(--color-text-muted)]">{t('library.title')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {!empty ? (
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <span className="hidden sm:inline">{t('library.sort.label')}</span>
              <select
                value={sortMode}
                onChange={(e) => onSortModeChange(e.target.value)}
                className={selectClass}
                aria-label={t('library.sort.label')}
              >
                {SORT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`library.sort.${mode}`)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>

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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
                  onContextMenu={openMenu}
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
