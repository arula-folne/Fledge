import { useCallback, useMemo, useState, type MouseEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { InstanceProfile } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { InstanceWizard } from './InstanceWizard'
import { InstanceCard } from './InstanceCard'
import {
  InstanceContextMenu,
  type InstanceContextMenuState,
} from './InstanceContextMenu'
import { useUiStore } from '../../stores/appStores'

function sortInstances(items: InstanceProfile[]): InstanceProfile[] {
  return [...items].sort((a, b) => {
    const at = a.lastPlayedAt ? Date.parse(a.lastPlayedAt) : 0
    const bt = b.lastPlayedAt ? Date.parse(b.lastPlayedAt) : 0
    if (bt !== at) return bt - at
    return a.name.localeCompare(b.name, 'ja')
  })
}

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
  const setEditingInstanceId = useUiStore((s) => s.setEditingInstanceId)
  const [menu, setMenu] = useState<InstanceContextMenuState>(null)
  const [pendingDelete, setPendingDelete] = useState<InstanceProfile | null>(null)

  const removeMutation = useMutation({
    mutationFn: (id: string) => fledgeApi.instances.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['instances'] })
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => fledgeApi.instances.duplicate(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })

  const items = useMemo(() => sortInstances(instances), [instances])
  const empty = items.length === 0
  const menuInstance = items.find((item) => item.id === menu?.instanceId) ?? null

  const closeMenu = useCallback(() => setMenu(null), [])

  const openMenu = (event: MouseEvent, instance: InstanceProfile) => {
    setMenu({ x: event.clientX, y: event.clientY, instanceId: instance.id })
  }

  return (
    <section className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-[var(--color-text-muted)]">{t('library.title')}</h2>
        <Button variant="primary" onClick={() => setWizardOpen(true)}>
          {t('library.create')}
        </Button>
      </div>

      {empty ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-8 text-center">
          <p className="font-medium">{t('library.empty')}</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t('library.emptyHint')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <InstanceCard
              key={item.id}
              instance={item}
              className="h-full min-w-0"
              onContextMenu={openMenu}
            />
          ))}
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
        onEdit={() => {
          if (!menuInstance) return
          setEditingInstanceId(menuInstance.id)
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

      <InstanceWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </section>
  )
}
