import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { MrpackExportOptions } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { ContentCategoryLabel } from './contentCategoryIcons'

type Props = {
  open: boolean
  instanceId: string
  onClose: () => void
  onExported: (savedPath: string) => void
  onError: (message: string) => void
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

type FileSectionProps = {
  title: string
  hint?: string
  empty: string
  selectedCount: number
  totalCount: number
  onSelectAll: () => void
  onSelectNone: () => void
  children: React.ReactNode
}

function FileSection({
  title,
  hint,
  empty,
  selectedCount,
  totalCount,
  onSelectAll,
  onSelectNone,
  children,
}: FileSectionProps) {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold">{title}</h3>
          {hint ? <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">{hint}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
          <span>{t('instances.exportMrpack.selectedCount', { count: selectedCount, total: totalCount })}</span>
          <button
            type="button"
            className="text-[var(--color-accent)] hover:underline disabled:opacity-50"
            disabled={totalCount === 0}
            onClick={onSelectAll}
          >
            {t('instances.exportMrpack.selectAll')}
          </button>
          <span aria-hidden>·</span>
          <button
            type="button"
            className="text-[var(--color-accent)] hover:underline disabled:opacity-50"
            disabled={totalCount === 0}
            onClick={onSelectNone}
          >
            {t('instances.exportMrpack.selectNone')}
          </button>
        </div>
      </div>
      <div className="max-h-[min(22vh,14rem)] overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)]/40">
        {totalCount === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-[var(--color-text-muted)]">{empty}</p>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

export function ExportMrpackDialog({ open, instanceId, onClose, onExported, onError }: Props) {
  const { t } = useTranslation()
  const [selectedContentIds, setSelectedContentIds] = useState<Set<string>>(new Set())
  const [selectedOverridePaths, setSelectedOverridePaths] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)

  const candidatesQuery = useQuery({
    queryKey: ['mrpack-export-candidates', instanceId],
    queryFn: async () => {
      const list = fledgeApi.content.listMrpackExportCandidates
      if (typeof list !== 'function') {
        throw new Error(t('instances.exportMrpack.restartRequired'))
      }
      return list.call(fledgeApi.content, instanceId)
    },
    enabled: open && Boolean(instanceId),
  })

  useEffect(() => {
    if (!candidatesQuery.data) return
    setSelectedContentIds(
      new Set(candidatesQuery.data.contents.filter((item) => item.defaultSelected).map((item) => item.id)),
    )
    setSelectedOverridePaths(
      new Set(
        candidatesQuery.data.overrides.filter((item) => item.defaultSelected).map((item) => item.path),
      ),
    )
  }, [candidatesQuery.data])

  const selectedTotal = selectedContentIds.size + selectedOverridePaths.size
  const canExport = selectedTotal > 0 && !exporting && !candidatesQuery.isLoading

  const contentRows = useMemo(() => candidatesQuery.data?.contents ?? [], [candidatesQuery.data?.contents])
  const overrideRows = useMemo(() => candidatesQuery.data?.overrides ?? [], [candidatesQuery.data?.overrides])

  const toggleContent = (id: string) => {
    setSelectedContentIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleOverride = (path: string) => {
    setSelectedOverridePaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const handleExport = async () => {
    if (!canExport) return
    setExporting(true)
    try {
      const options: MrpackExportOptions = {
        contentIds: [...selectedContentIds],
        overridePaths: [...selectedOverridePaths],
        name: candidatesQuery.data?.name,
        summary: candidatesQuery.data?.summary,
      }
      const savedPath = await fledgeApi.content.exportMrpack(instanceId, options)
      if (savedPath) {
        onExported(savedPath)
        onClose()
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  return (
    <Dialog
      open={open}
      title={t('instances.exportMrpack.title')}
      subtitle={t('instances.exportMrpack.subtitle')}
      size="lg"
      compact
      scrollable
      fixedHeight
      backdrop="soft"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" className="px-2.5 py-1 text-xs" disabled={exporting} onClick={onClose}>
            {t('instances.cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            className="px-3 py-1 text-xs"
            disabled={!canExport}
            onClick={() => void handleExport()}
          >
            {exporting ? t('instances.exporting') : t('instances.exportMrpack.confirm')}
          </Button>
        </>
      }
    >
      {candidatesQuery.isLoading ? (
        <p className="text-xs text-[var(--color-text-muted)]">{t('common.loading')}</p>
      ) : candidatesQuery.isError ? (
        <p className="text-xs text-[var(--color-danger)]">
          {candidatesQuery.error instanceof Error
            ? candidatesQuery.error.message
            : String(candidatesQuery.error)}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <FileSection
            title={t('instances.exportMrpack.contents')}
            hint={t('instances.exportMrpack.contentsHint')}
            empty={t('instances.exportMrpack.contentsEmpty')}
            selectedCount={selectedContentIds.size}
            totalCount={contentRows.length}
            onSelectAll={() => setSelectedContentIds(new Set(contentRows.map((item) => item.id)))}
            onSelectNone={() => setSelectedContentIds(new Set())}
          >
            <ul>
              {contentRows.map((item) => {
                const checked = selectedContentIds.has(item.id)
                return (
                  <li key={item.id} className="border-b border-[var(--color-border)]/60 last:border-b-0">
                    <label className="flex cursor-pointer items-start gap-2 px-2.5 py-2 hover:bg-[var(--color-hover)]">
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
                        checked={checked}
                        onChange={() => toggleContent(item.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{item.name}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--color-text-muted)]">
                          <ContentCategoryLabel category={item.category} iconSize={12} />
                          <span className="truncate">{item.path}</span>
                          <span>{formatBytes(item.size)}</span>
                          {item.indexEligible ? (
                            <span className="text-[var(--color-success)]">
                              {t('instances.exportMrpack.indexEligible')}
                            </span>
                          ) : (
                            <span>{t('instances.exportMrpack.overrideOnly')}</span>
                          )}
                        </span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </FileSection>

          <FileSection
            title={t('instances.exportMrpack.overrides')}
            hint={t('instances.exportMrpack.overridesHint')}
            empty={t('instances.exportMrpack.overridesEmpty')}
            selectedCount={selectedOverridePaths.size}
            totalCount={overrideRows.length}
            onSelectAll={() => setSelectedOverridePaths(new Set(overrideRows.map((item) => item.path)))}
            onSelectNone={() => setSelectedOverridePaths(new Set())}
          >
            <ul>
              {overrideRows.map((item) => {
                const checked = selectedOverridePaths.has(item.path)
                return (
                  <li key={item.path} className="border-b border-[var(--color-border)]/60 last:border-b-0">
                    <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 hover:bg-[var(--color-hover)]">
                      <input
                        type="checkbox"
                        className="shrink-0"
                        checked={checked}
                        onChange={() => toggleOverride(item.path)}
                      />
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{item.path}</span>
                      <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">
                        {formatBytes(item.size)}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </FileSection>
        </div>
      )}
    </Dialog>
  )
}
