import { useCallback, useMemo, useState, type MouseEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { InstanceProfile } from '@fledge/shared'
import { fledgeApi } from '../api/fledgeApi'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { InstanceWizard } from '../features/instances/InstanceWizard'
import { InstanceCard } from '../features/instances/InstanceCard'
import {
  InstanceContextMenu,
  type InstanceContextMenuState,
} from '../features/instances/InstanceContextMenu'
import { useUiStore } from '../stores/appStores'

function sortInstances(items: InstanceProfile[]): InstanceProfile[] {
  return [...items].sort((a, b) => {
    const at = a.lastPlayedAt ? Date.parse(a.lastPlayedAt) : 0
    const bt = b.lastPlayedAt ? Date.parse(b.lastPlayedAt) : 0
    if (bt !== at) return bt - at
    return a.name.localeCompare(b.name, 'ja')
  })
}

export default function LibraryPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const wizardOpen = useUiStore((s) => s.instanceWizardOpen)
  const setWizardOpen = useUiStore((s) => s.setInstanceWizardOpen)
  const setLibraryFocus = useUiStore((s) => s.setLibraryFocus)
  const [menu, setMenu] = useState<InstanceContextMenuState>(null)
  const [pendingDelete, setPendingDelete] = useState<InstanceProfile | null>(null)

  const instancesQuery = useQuery({
    queryKey: ['instances'],
    queryFn: () => fledgeApi.instances.list(),
  })

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

  const items = useMemo(() => sortInstances(instancesQuery.data ?? []), [instancesQuery.data])
  const empty = items.length === 0
  const menuInstance = items.find((item) => item.id === menu?.instanceId) ?? null

  const closeMenu = useCallback(() => setMenu(null), [])

  const openMenu = (event: MouseEvent, instance: InstanceProfile) => {
    setMenu({ x: event.clientX, y: event.clientY, instanceId: instance.id })
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-xl font-semibold">{t('library.title')}</h1>

      {empty ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/60 px-6 py-16 text-center">
          <p className="font-medium">{t('library.empty')}</p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">{t('library.emptyHint')}</p>
          <Button className="mt-6" variant="primary" onClick={() => setWizardOpen(true)}>
            {t('library.create')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <InstanceCard key={item.id} instance={item} onContextMenu={openMenu} />
          ))}
        </div>
      )}

      <InstanceContextMenu
        menu={menuInstance ? menu : null}
        onClose={closeMenu}
        onOpen={() => {
          if (!menuInstance) return
          setLibraryFocus({ instanceId: menuInstance.id, tab: 'overview' })
          navigate(`/library/${menuInstance.id}`)
          closeMenu()
        }}
        onEdit={() => {
          if (!menuInstance) return
          setLibraryFocus({ instanceId: menuInstance.id, tab: 'settings' })
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
    </div>
  )
}
