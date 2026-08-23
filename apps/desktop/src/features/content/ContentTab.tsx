import { useCallback, useMemo, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { IconLayoutGrid, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react'
import type { ContentCategory, ContentProject, InstalledContent, InstanceProfile } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { RouteErrorBoundary } from '../../components/RouteErrorBoundary'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Dialog } from '../../components/ui/Dialog'
import { Switch } from '../../components/ui/Switch'
import {
  closeBrowse,
  closeProject,
  type ContentListFilter,
  openBrowse,
  openProject,
  parseContentFilter,
  writeContentFilter,
  writeProject,
} from '../../navigation/libraryDetailSearch'
import { AddContentModal } from './AddContentModal'
import {
  ContentCategoryIcon,
  ContentCategoryLabel,
  ContentFilterAllLabel,
} from './contentCategoryIcons'
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

  const listFilter = parseContentFilter(searchParams.get('category'))
  const browseOpen = searchParams.get('browse') === '1'
  const projectId = searchParams.get('project')
  const contentModalOpen = browseOpen || Boolean(projectId)

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

  const openInstalledProject = useCallback(
    (item: InstalledContent) => {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev)
        openProject(params, item.slug || item.projectId)
        return params
      })
    },
    [setSearchParams],
  )

  const backFromProject = useCallback(() => {
    if (browseOpen) {
      navigate(-1)
      return
    }
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        closeProject(params)
        return params
      },
      { replace: true },
    )
  }, [browseOpen, navigate, setSearchParams])

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
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap gap-0.5">
          <button
            type="button"
            onClick={() => changeFilter('all')}
            className={[
              'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors',
              listFilter === 'all'
                ? 'bg-[var(--color-selection)] text-[var(--color-on-selection)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]',
            ].join(' ')}
          >
            <ContentFilterAllLabel iconSize={13} />
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => changeFilter(c)}
              className={[
                'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors',
                listFilter === c
                  ? 'bg-[var(--color-selection)] text-[var(--color-on-selection)]'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]',
              ].join(' ')}
            >
              <ContentCategoryLabel category={c} iconSize={13} />
            </button>
          ))}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          <Button
            variant="secondary"
            className="px-2 py-1 text-xs"
            disabled={updatesMutation.isPending}
            title={t('content.checkUpdates')}
            onClick={() => updatesMutation.mutate()}
          >
            <IconRefresh size={14} stroke={1.75} />
            {t('content.checkUpdates')}
          </Button>
          <Button variant="primary" className="px-2.5 py-1 text-xs" onClick={openBrowseModal}>
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
          <Button className="mt-2 px-2.5 py-1 text-xs" variant="primary" onClick={openBrowseModal}>
            <IconPlus size={14} stroke={1.75} />
            {t('content.add')}
          </Button>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-[var(--color-border)] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-3 py-2">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors hover:bg-[var(--color-hover)]/60 -mx-1 rounded-[var(--radius-sm)] px-1 py-0.5"
                aria-label={t('content.openDetail', { name: item.name })}
                onClick={() => openInstalledProject(item)}
              >
                {item.iconUrl ? (
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
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-accent-soft)]">
                    <ContentCategoryIcon category={item.category} size={18} />
                  </div>
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
                    {item.updateAvailable && item.latestVersionNumber
                      ? ` → ${item.latestVersionNumber}`
                      : ''}
                    {' · '}
                    {item.provider}
                    {!item.enabled ? ` · ${t('content.disabled')}` : ''}
                  </div>
                </div>
              </button>
              {item.updateAvailable ? (
                <Button
                  variant="secondary"
                  className="px-2.5 py-1 text-xs"
                  disabled={installingProjectIds.has(item.projectId)}
                  onClick={() => updateMutation.mutate(item)}
                >
                  {t('content.update')}
                </Button>
              ) : null}
              <Switch
                checked={item.enabled}
                disabled={toggleMutation.isPending && toggleMutation.variables?.id === item.id}
                aria-label={item.enabled ? t('content.disable') : t('content.enable')}
                onChange={(enabled) => toggleMutation.mutate({ id: item.id, enabled })}
              />
              <Button
                variant="ghost"
                className="size-9 shrink-0 px-0 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
                title={t('content.remove')}
                aria-label={t('content.remove')}
                onClick={() => setRemoveTarget(item)}
              >
                <IconTrash size={24} stroke={1.75} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <RouteErrorBoundary
        resetKeys={[browseOpen, listFilter, projectId ?? '']}
        fallback={({ reset }) =>
          contentModalOpen ? (
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
          open={contentModalOpen}
          browseMode={browseOpen}
          onClose={closeBrowseModal}
          instance={instance}
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
