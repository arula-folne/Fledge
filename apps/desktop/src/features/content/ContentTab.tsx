import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  IconPlus,
  IconPuzzle,
  IconRefresh,
  IconTrash,
  IconToggleLeft,
  IconToggleRight,
} from '@tabler/icons-react'
import type { ContentCategory, InstalledContent, InstanceProfile } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'
import { AddContentModal } from './AddContentModal'

const CATEGORIES: ContentCategory[] = [
  'mod',
  'resourcepack',
  'shader',
  'datapack',
  'plugin',
]

type Props = {
  instance: InstanceProfile
}

export function ContentTab({ instance }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [category, setCategory] = useState<ContentCategory>('mod')
  const [addOpen, setAddOpen] = useState(false)

  const installedQuery = useQuery({
    queryKey: ['content-installed', instance.id, category],
    queryFn: () => fledgeApi.content.listInstalled(instance.id, category),
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
    mutationFn: (id: string) => fledgeApi.content.remove(instance.id, id),
    onSuccess: () => void invalidate(),
  })

  const updatesMutation = useMutation({
    mutationFn: () => fledgeApi.content.checkUpdates(instance.id),
    onSuccess: () => void invalidate(),
  })

  const updateMutation = useMutation({
    mutationFn: (item: InstalledContent) =>
      fledgeApi.content.install({
        instanceId: instance.id,
        provider: item.provider,
        projectId: item.projectId,
        category: item.category,
        versionId: item.latestVersionId,
        gameVersion: instance.minecraftVersion,
      }),
    onSuccess: () => void invalidate(),
  })

  const items = installedQuery.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={[
                'rounded-[var(--radius-sm)] px-3 py-1.5 text-sm transition duration-150',
                category === c
                  ? 'bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]',
              ].join(' ')}
            >
              {t(`content.category.${c}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={updatesMutation.isPending}
            onClick={() => updatesMutation.mutate()}
          >
            <IconRefresh size={16} stroke={1.75} />
            {t('content.checkUpdates')}
          </Button>
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <IconPlus size={16} stroke={1.75} />
            {t('content.add')}
          </Button>
        </div>
      </div>

      {installedQuery.isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] px-5 py-12 text-center">
          <IconPuzzle size={28} stroke={1.5} className="mx-auto text-[var(--color-text-muted)]" />
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">{t('content.empty')}</p>
          <Button className="mt-4" variant="primary" onClick={() => setAddOpen(true)}>
            <IconPlus size={16} stroke={1.75} />
            {t('content.add')}
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              {item.iconUrl ? (
                <img
                  src={item.iconUrl}
                  alt=""
                  className="size-10 rounded-[var(--radius-sm)] object-cover"
                />
              ) : (
                <div className="flex size-10 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                  <IconPuzzle size={20} stroke={1.6} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{item.name}</div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {item.versionNumber}
                  {item.updateAvailable && item.latestVersionNumber
                    ? ` → ${item.latestVersionNumber}`
                    : ''}
                  {' · '}
                  {item.provider}
                  {!item.enabled ? ` · ${t('content.disabled')}` : ''}
                </div>
              </div>
              {item.updateAvailable ? (
                <Button
                  variant="secondary"
                  disabled={updateMutation.isPending}
                  onClick={() => updateMutation.mutate(item)}
                >
                  {t('content.update')}
                </Button>
              ) : null}
              <button
                type="button"
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                title={item.enabled ? t('content.disable') : t('content.enable')}
                onClick={() =>
                  toggleMutation.mutate({ id: item.id, enabled: !item.enabled })
                }
              >
                {item.enabled ? (
                  <IconToggleRight size={28} stroke={1.5} className="text-[var(--color-accent)]" />
                ) : (
                  <IconToggleLeft size={28} stroke={1.5} />
                )}
              </button>
              <Button
                variant="ghost"
                className="px-2 text-[var(--color-danger)]"
                onClick={() => {
                  if (window.confirm(t('content.removeConfirm'))) {
                    removeMutation.mutate(item.id)
                  }
                }}
              >
                <IconTrash size={16} stroke={1.75} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AddContentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        instance={instance}
        initialCategory={category}
        onInstalled={() => {
          void invalidate()
          setAddOpen(false)
        }}
      />
    </div>
  )
}
