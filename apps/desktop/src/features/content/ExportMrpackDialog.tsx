import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  IconChevronLeft,
  IconChevronRight,
  IconFile,
  IconFolder,
} from '@tabler/icons-react'
import type { MrpackExportDirEntry, MrpackExportOptions } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { TextField } from '../../components/ui/TextField'

type Props = {
  open: boolean
  instanceId: string
  instanceName: string
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

function formatMtime(ms: number, locale: string): string {
  if (!ms) return ''
  try {
    return new Intl.DateTimeFormat(locale, {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(ms))
  } catch {
    return ''
  }
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
}

function pathIsSelected(path: string, selected: Set<string>): boolean {
  const lower = normalizePath(path).toLowerCase()
  for (const raw of selected) {
    const sel = normalizePath(raw).toLowerCase()
    if (!sel) continue
    if (lower === sel || lower.startsWith(`${sel}/`)) return true
  }
  return false
}

function pathIsExactSelected(path: string, selected: Set<string>): boolean {
  const lower = normalizePath(path).toLowerCase()
  for (const raw of selected) {
    if (normalizePath(raw).toLowerCase() === lower) return true
  }
  return false
}

function toggleSelectedPath(path: string, selected: Set<string>): Set<string> {
  const norm = normalizePath(path)
  const lower = norm.toLowerCase()
  const next = new Set<string>()

  if (pathIsSelected(norm, selected)) {
    // Exact or inherited: drop matching / ancestor / descendant entries
    for (const raw of selected) {
      const sel = normalizePath(raw)
      const selLower = sel.toLowerCase()
      if (selLower === lower) continue
      if (lower.startsWith(`${selLower}/`)) continue
      if (selLower.startsWith(`${lower}/`)) continue
      next.add(sel)
    }
    return next
  }

  for (const raw of selected) {
    const sel = normalizePath(raw)
    const selLower = sel.toLowerCase()
    if (selLower.startsWith(`${lower}/`)) continue
    next.add(sel)
  }
  next.add(norm)
  return next
}

export function ExportMrpackDialog({
  open,
  instanceId,
  instanceName,
  onClose,
  onExported,
  onError,
}: Props) {
  const { t, i18n } = useTranslation()
  const [packName, setPackName] = useState(instanceName)
  const [versionId, setVersionId] = useState('1.0.0')
  const [browsePath, setBrowsePath] = useState('')
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set())
  const [selectionReady, setSelectionReady] = useState(false)
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

  const dirQuery = useQuery({
    queryKey: ['mrpack-export-dir', instanceId, browsePath],
    queryFn: async () => {
      const list = fledgeApi.content.listMrpackExportDir
      if (typeof list !== 'function') {
        throw new Error(t('instances.exportMrpack.restartRequired'))
      }
      return list.call(fledgeApi.content, instanceId, browsePath)
    },
    enabled: open && Boolean(instanceId),
  })

  useEffect(() => {
    if (!open) return
    setPackName(instanceName)
    setVersionId('1.0.0')
    setBrowsePath('')
    setSelectedPaths(new Set())
    setSelectionReady(false)
  }, [open, instanceId, instanceName])

  useEffect(() => {
    if (!open || selectionReady || !dirQuery.data || browsePath !== '') return
    const defaults = dirQuery.data.entries
      .filter((entry) => entry.defaultSelected)
      .map((entry) => normalizePath(entry.path))
    setSelectedPaths(new Set(defaults))
    setSelectionReady(true)
  }, [open, selectionReady, dirQuery.data, browsePath])

  useEffect(() => {
    if (!candidatesQuery.data?.name) return
    setPackName((prev) => (prev.trim() ? prev : candidatesQuery.data.name))
  }, [candidatesQuery.data?.name])

  const entries = dirQuery.data?.entries ?? []
  const crumbs = useMemo(() => {
    if (!browsePath) return [] as string[]
    return browsePath.split('/').filter(Boolean)
  }, [browsePath])

  const selectedCount = selectedPaths.size
  const nameOk = packName.trim().length > 0
  const versionOk = versionId.trim().length > 0
  const canExport =
    selectedCount > 0 && nameOk && versionOk && !exporting && !dirQuery.isLoading && selectionReady

  const goUp = () => {
    if (!browsePath) return
    const parts = browsePath.split('/').filter(Boolean)
    parts.pop()
    setBrowsePath(parts.join('/'))
  }

  const openDir = (entry: MrpackExportDirEntry) => {
    if (entry.kind !== 'directory') return
    setBrowsePath(normalizePath(entry.path))
  }

  const handleExport = async () => {
    if (!canExport) return
    setExporting(true)
    try {
      const contentIds = (candidatesQuery.data?.contents ?? [])
        .filter((item) => pathIsSelected(item.path, selectedPaths))
        .map((item) => item.id)

      const options: MrpackExportOptions = {
        contentIds,
        overridePaths: [...selectedPaths],
        name: packName.trim(),
        versionId: versionId.trim(),
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
      contentClassName="flex flex-col"
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
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="grid shrink-0 gap-2 sm:grid-cols-2">
          <TextField
            label={t('instances.exportMrpack.packName')}
            value={packName}
            onChange={(e) => setPackName(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <TextField
            label={t('instances.exportMrpack.versionName')}
            value={versionId}
            onChange={(e) => setVersionId(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="1.0.0"
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
            <button
              type="button"
              className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] disabled:opacity-40"
              disabled={!browsePath}
              onClick={goUp}
              aria-label={t('instances.exportMrpack.browseUp')}
            >
              <IconChevronLeft size={14} stroke={1.75} />
              {t('instances.exportMrpack.browseRoot')}
            </button>
            {crumbs.map((part, index) => {
              const target = crumbs.slice(0, index + 1).join('/')
              return (
                <span key={target} className="inline-flex items-center gap-1">
                  <span aria-hidden>/</span>
                  <button
                    type="button"
                    className="rounded px-1 py-0.5 hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
                    onClick={() => setBrowsePath(target)}
                  >
                    {part}
                  </button>
                </span>
              )
            })}
            <span className="ml-auto">
              {t('instances.exportMrpack.selectedPaths', { count: selectedCount })}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)]/40">
            {dirQuery.isLoading ? (
              <p className="px-3 py-6 text-center text-xs text-[var(--color-text-muted)]">
                {t('common.loading')}
              </p>
            ) : dirQuery.isError ? (
              <p className="px-3 py-6 text-center text-xs text-[var(--color-danger)]">
                {dirQuery.error instanceof Error
                  ? dirQuery.error.message
                  : String(dirQuery.error)}
              </p>
            ) : entries.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-[var(--color-text-muted)]">
                {t('instances.exportMrpack.folderEmpty')}
              </p>
            ) : (
              <ul>
                {entries.map((entry) => {
                  const checked = pathIsSelected(entry.path, selectedPaths)
                  const exact = pathIsExactSelected(entry.path, selectedPaths)
                  const isDir = entry.kind === 'directory'
                  return (
                    <li
                      key={entry.path}
                      className="flex items-center gap-2 border-b border-[var(--color-border)]/60 px-2.5 py-1.5 last:border-b-0 hover:bg-[var(--color-hover)]/70"
                    >
                      <input
                        type="checkbox"
                        className="size-3.5 shrink-0 accent-[var(--color-accent)]"
                        checked={checked}
                        aria-label={t('instances.exportMrpack.selectItem', { name: entry.name })}
                        onChange={() =>
                          setSelectedPaths((prev) => toggleSelectedPath(entry.path, prev))
                        }
                      />
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => {
                          if (isDir) openDir(entry)
                        }}
                        disabled={!isDir}
                      >
                        {isDir ? (
                          <IconFolder
                            size={16}
                            stroke={1.6}
                            className="shrink-0 text-[var(--color-accent)]"
                            aria-hidden
                          />
                        ) : (
                          <IconFile
                            size={16}
                            stroke={1.6}
                            className="shrink-0 text-[var(--color-text-muted)]"
                            aria-hidden
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--color-text)]">
                          {entry.name}
                          {exact && isDir ? (
                            <span className="ml-1 font-normal text-[var(--color-text-muted)]">
                              {t('instances.exportMrpack.folderSelected')}
                            </span>
                          ) : null}
                        </span>
                        {!isDir ? (
                          <span className="shrink-0 text-[10px] tabular-nums text-[var(--color-text-muted)]">
                            {formatBytes(entry.size)}
                          </span>
                        ) : null}
                        <span className="shrink-0 text-[10px] tabular-nums text-[var(--color-text-muted)]">
                          {formatMtime(entry.mtimeMs, i18n.language)}
                        </span>
                        {isDir ? (
                          <IconChevronRight
                            size={16}
                            stroke={1.6}
                            className="shrink-0 text-[var(--color-text-muted)]"
                            aria-hidden
                          />
                        ) : (
                          <span className="inline-block size-4 shrink-0" aria-hidden />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <p className="shrink-0 text-[10px] text-[var(--color-text-muted)]">
            {t('instances.exportMrpack.browseHint')}
          </p>
        </div>
      </div>
    </Dialog>
  )
}
