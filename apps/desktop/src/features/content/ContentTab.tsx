import { useCallback, useMemo, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  IconPlus,
  IconPuzzle,
  IconRefresh,
  IconTrash,
  IconToggleLeft,
  IconToggleRight,
} from '@tabler/icons-react'
import type { ContentCategory, ContentProject, InstalledContent, InstanceProfile } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { RouteErrorBoundary } from '../../components/RouteErrorBoundary'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Dialog } from '../../components/ui/Dialog'
import {
  closeBrowse,
  openBrowse,
  parseContentCategory,
  writeContentCategory,
  writeProject,
} from '../../navigation/libraryDetailSearch'
import { AddContentModal } from './AddContentModal'
import { useTransferStore } from '../../stores/appStores'

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
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [removeTarget, setRemoveTarget] = useState<InstalledContent | null>(null)

  const category = parseContentCategory(searchParams.get('category'))
  const browseOpen = searchParams.get('browse') === '1'
  const projectId = searchParams.get('project')

  const changeCategory = useCallback(
    (next: ContentCategory) => {
      if (next === category) return
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev)
        writeContentCategory(params, next)
        return params
      })
    },
    [category, setSearchParams],
  )

  const openBrowseModal = useCallback(() => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      openBrowse(params)
      return params
    })
  }, [setSearchParams])

  const closeBrowseModal = useCallback(() => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        closeBrowse(params)
        return params
      },
      { replace: true },
    )
  }, [setSearchParams])

  const selectProject = useCallback(
    (hit: ContentProject) => {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev)
        writeProject(params, hit.slug || hit.id)
        return params
      })
    },
    [setSearchParams],
  )

  const backFromProject = useCallback(() => {
    navigate(-1)
  }, [navigate])

  const installedQuery = useQuery({
    queryKey: ['content-installed', instance.id, category],
    queryFn: () => fledgeApi.content.listInstalled(instance.id, category),
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => changeCategory(c)}
              className={[
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                category === c
                  ? 'bg-[var(--color-selection)] text-[var(--color-on-selection)]'
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
          <Button variant="primary" onClick={openBrowseModal}>
            <IconPlus size={16} stroke={1.75} />
            {t('content.add')}
          </Button>
        </div>
      </div>

      {installedQuery.isPending && !installedQuery.data ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] px-4 py-8 text-center">
          <IconPuzzle size={24} stroke={1.5} className="mx-auto text-[var(--color-text-muted)]" />
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">{t('content.empty')}</p>
          <Button className="mt-3" variant="primary" onClick={openBrowseModal}>
            <IconPlus size={16} stroke={1.75} />
            {t('content.add')}
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2.5 px-3 py-1.5">
              {item.iconUrl ? (
                <img
                  src={item.iconUrl}
                  alt=""
                  className="size-8 rounded-[var(--radius-sm)] object-cover"
                />
              ) : (
                <div className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                  <IconPuzzle size={16} stroke={1.6} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{item.name}</div>
                <div className="text-[11px] text-[var(--color-text-muted)]">
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
                  disabled={installingProjectIds.has(item.projectId)}
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
                  <IconToggleRight size={22} stroke={1.5} className="text-[var(--color-accent)]" />
                ) : (
                  <IconToggleLeft size={22} stroke={1.5} />
                )}
              </button>
              <Button
                variant="ghost"
                className="px-2 text-[var(--color-danger)]"
                onClick={() => setRemoveTarget(item)}
              >
                <IconTrash size={16} stroke={1.75} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <RouteErrorBoundary
        resetKeys={[browseOpen, category, projectId ?? '']}
        fallback={({ reset }) =>
          browseOpen ? (
            <Dialog
              open
              title={t('content.browseErrorTitle')}
              subtitle={instance.name}
              onClose={closeBrowseModal}
              size="md"
            >
              <div className="flex flex-col gap-3">
                <p className="text-sm text-[var(--color-text-muted)]">{t('content.browseErrorBody')}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="primary" onClick={reset}>
                    {t('common.retry')}
                  </Button>
                  <Button type="button" variant="secondary" onClick={closeBrowseModal}>
                    {t('common.close')}
                  </Button>
                </div>
              </div>
            </Dialog>
          ) : null
        }
      >
        <AddContentModal
          open={browseOpen}
          onClose={closeBrowseModal}
          instance={instance}
          category={category}
          onCategoryChange={changeCategory}
          projectId={projectId}
          onSelectProject={selectProject}
          onBackFromProject={backFromProject}
          onInstalled={() => {
            void invalidate()
          }}
        />
      </RouteErrorBoundary>
      <ConfirmDialog
        open={removeTarget != null}
        title={t('content.remove')}
        body={t('content.removeConfirm')}
        confirmLabel={t('content.remove')}
        pending={removeMutation.isPending}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (!removeTarget) return
          removeMutation.mutate(removeTarget.id, {
            onSettled: () => setRemoveTarget(null),
          })
        }}
      />
    </div>
  )
}
