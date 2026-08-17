import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { InstanceProfile } from '@fledge/shared'
import { fledgeApi } from '../api/fledgeApi'
import { Button } from '../components/ui/Button'
import { InstanceWizard } from '../features/instances/InstanceWizard'
import { useUiStore } from '../stores/appStores'
import { Dialog } from '../components/ui/Dialog'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { TextField } from '../components/ui/TextField'

type MenuState = {
  x: number
  y: number
  instance: InstanceProfile
} | null

export default function InstancesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const wizardOpen = useUiStore((s) => s.instanceWizardOpen)
  const setWizardOpen = useUiStore((s) => s.setInstanceWizardOpen)
  const [menu, setMenu] = useState<MenuState>(null)
  const [editing, setEditing] = useState<InstanceProfile | null>(null)
  const [pendingDelete, setPendingDelete] = useState<InstanceProfile | null>(null)
  const [editName, setEditName] = useState('')
  const [editMemory, setEditMemory] = useState(4096)
  const [editJvm, setEditJvm] = useState('')

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

  const updateMutation = useMutation({
    mutationFn: () =>
      fledgeApi.instances.update(editing!.id, {
        name: editName.trim(),
        memory: { maxMb: editMemory },
        jvmArgs: editJvm
          .split(/\s+/)
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    onSuccess: async () => {
      setEditing(null)
      await queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })

  const items = instancesQuery.data ?? []
  const empty = useMemo(() => items.length === 0, [items.length])

  return (
    <div className="flex h-full min-h-0 flex-col" onClick={() => setMenu(null)}>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t('instances.title')}</h1>
        <Button variant="primary" onClick={() => setWizardOpen(true)}>
          {t('instances.create')}
        </Button>
      </div>

      {empty ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-10 text-center">
          <p className="font-medium">{t('instances.empty')}</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t('instances.emptyHint')}</p>
          <Button className="mt-3" variant="primary" onClick={() => setWizardOpen(true)}>
            {t('instances.create')}
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between px-4 py-3 hover:bg-[var(--color-accent-soft)]/40"
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setMenu({ x: e.clientX, y: e.clientY, instance: item })
              }}
            >
              <div>
                <div className="font-medium">{item.name}</div>
                <div className="text-sm text-[var(--color-text-muted)]">
                  {item.loader} · {item.minecraftVersion} · {item.memory.maxMb} MB
                </div>
              </div>
              <Button
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  void fledgeApi.instances.openFolder(item.id)
                }}
              >
                {t('instances.openFolder')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {menu ? (
        <div
          className="fixed z-50 min-w-44 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 text-[var(--color-text)] shadow-sm"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem
            label={t('instances.edit')}
            onClick={() => {
              setEditing(menu.instance)
              setEditName(menu.instance.name)
              setEditMemory(menu.instance.memory.maxMb)
              setEditJvm(menu.instance.jvmArgs.join(' '))
              setMenu(null)
            }}
          />
          <MenuItem
            label={t('instances.duplicate')}
            onClick={() => {
              duplicateMutation.mutate(menu.instance.id)
              setMenu(null)
            }}
          />
          <MenuItem
            label={t('instances.openFolder')}
            onClick={() => {
              void fledgeApi.instances.openFolder(menu.instance.id)
              setMenu(null)
            }}
          />
          <MenuItem
            label={t('instances.delete')}
            danger
            onClick={() => {
              setPendingDelete(menu.instance)
              setMenu(null)
            }}
          />
        </div>
      ) : null}

      <InstanceWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />

      <Dialog
        open={Boolean(editing)}
        title={t('instances.edit')}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>{t('instances.cancel')}</Button>
            <Button variant="primary" onClick={() => updateMutation.mutate()} disabled={!editName.trim()}>
              {t('instances.save')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <TextField label={t('instances.name')} value={editName} onChange={(e) => setEditName(e.target.value)} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--color-text-muted)]">{t('instances.memory')}</span>
            <input
              type="number"
              min={1024}
              step={512}
              value={editMemory}
              onChange={(e) => setEditMemory(Number(e.target.value))}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2"
            />
          </label>
          <TextField
            label={t('instances.jvmArgs')}
            value={editJvm}
            onChange={(e) => setEditJvm(e.target.value)}
          />
        </div>
      </Dialog>
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
    </div>
  )
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      className={[
        'block w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-accent-soft)]',
        danger ? 'text-[var(--color-danger)]' : '',
      ].join(' ')}
      onClick={onClick}
    >
      {label}
    </button>
  )
}
