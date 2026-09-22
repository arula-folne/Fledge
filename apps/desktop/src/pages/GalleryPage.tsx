import { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fledgeApi } from '../api/fledgeApi'
import { Select } from '../components/ui/Select'
import {
  ScreenshotGallery,
  type ScreenshotGalleryEntry,
} from '../features/instances/ScreenshotGallery'

const GALLERY_SORT_MODES = ['newest', 'oldest', 'instance'] as const
type GallerySortMode = (typeof GALLERY_SORT_MODES)[number]

function sortEntries(
  entries: ScreenshotGalleryEntry[],
  mode: GallerySortMode,
  instanceOrder: string[],
): ScreenshotGalleryEntry[] {
  const next = [...entries]
  if (mode === 'oldest') {
    next.sort((a, b) => (a.mtime ?? '').localeCompare(b.mtime ?? ''))
    return next
  }
  if (mode === 'newest') {
    next.sort((a, b) => (b.mtime ?? '').localeCompare(a.mtime ?? ''))
    return next
  }

  const orderIndex = new Map(instanceOrder.map((id, i) => [id, i]))
  next.sort((a, b) => {
    const ai = orderIndex.get(a.instanceId) ?? Number.MAX_SAFE_INTEGER
    const bi = orderIndex.get(b.instanceId) ?? Number.MAX_SAFE_INTEGER
    if (ai !== bi) return ai - bi
    const nameCmp = (a.instanceName ?? '').localeCompare(b.instanceName ?? '', 'ja')
    if (nameCmp !== 0) return nameCmp
    return (b.mtime ?? '').localeCompare(a.mtime ?? '')
  })
  return next
}

export default function GalleryPage() {
  const { t } = useTranslation()
  const [sortMode, setSortMode] = useState<GallerySortMode>('newest')

  const instancesQuery = useQuery({
    queryKey: ['instances'],
    queryFn: () => fledgeApi.instances.list(),
  })
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })

  const instances = instancesQuery.data ?? []
  const instanceOrder = settingsQuery.data?.libraryInstanceOrder ?? instances.map((i) => i.id)

  const mediaQueries = useQueries({
    queries: instances.map((instance) => ({
      queryKey: ['content-media', instance.id, 'screenshots'] as const,
      queryFn: () => fledgeApi.content.listMedia(instance.id, 'screenshots'),
      enabled: instancesQuery.isSuccess,
    })),
  })

  const mediaPending =
    instancesQuery.isSuccess && instances.length > 0 && mediaQueries.some((q) => q.isPending)

  const rawEntries = useMemo(() => {
    const list: ScreenshotGalleryEntry[] = []
    instances.forEach((instance, i) => {
      const files = mediaQueries[i]?.data ?? []
      for (const file of files) {
        list.push({
          instanceId: instance.id,
          instanceName: instance.name,
          fileName: file.name,
          filePath: file.path,
          mtime: file.mtime,
        })
      }
    })
    return list
  }, [instances, mediaQueries])

  const entries = useMemo(
    () => sortEntries(rawEntries, sortMode, instanceOrder),
    [rawEntries, sortMode, instanceOrder],
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <h1 className="shrink-0 text-lg font-semibold text-[var(--color-text)]">
        {t('gallery.title')}
      </h1>
      <p className="shrink-0 text-xs text-[var(--color-text-muted)]">
        {t('gallery.hint')}
      </p>
      <ScreenshotGallery
        entries={entries}
        pending={instancesQuery.isPending || (mediaPending && entries.length === 0)}
        showInstanceLabel={sortMode !== 'instance'}
        groupByInstance={sortMode === 'instance'}
        showOpenInstance
        emptyLabel={t('gallery.empty')}
        toolbarStart={
          <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            <span>{t('gallery.sort.label')}</span>
            <Select
              value={sortMode}
              onChange={(e) => {
                const next = e.currentTarget.value
                if (next === 'instance' || next === 'newest' || next === 'oldest') {
                  setSortMode(next)
                }
              }}
              className="min-w-[9rem]"
              options={GALLERY_SORT_MODES.map((mode) => ({
                value: mode,
                label: t(`gallery.sort.${mode}`),
              }))}
            />
          </label>
        }
      />
    </div>
  )
}
