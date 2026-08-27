import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  IconAlertTriangle,
  IconCircleFilled,
  IconCopy,
  IconFolderOpen,
  IconRefresh,
  IconTerminal2,
} from '@tabler/icons-react'
import type { ContentMediaItem } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'

type Props = {
  instanceId: string
  files: ContentMediaItem[]
  onOpenFolder: () => void
  onRefreshList: () => void
}

type LogTone = 'error' | 'warn' | 'info' | 'debug' | 'plain'

type LogRow = {
  key: string
  lineNo: number
  tone: LogTone
  text: string
}

function pickDefaultLog(files: ContentMediaItem[]): string | null {
  if (files.length === 0) return null
  const latest = files.find((f) => f.name.toLowerCase() === 'latest.log')
  return (latest ?? files[0]!).name
}

function detectTone(line: string): LogTone {
  if (/\b(ERROR|FATAL|SEVERE|Exception|Traceback)\b/i.test(line)) return 'error'
  if (/\b(WARN|WARNING)\b/i.test(line)) return 'warn'
  if (/\b(INFO|SUCCESS)\b/i.test(line)) return 'info'
  if (/\b(DEBUG|TRACE)\b/i.test(line)) return 'debug'
  return 'plain'
}

function parseLogRows(text: string): LogRow[] {
  if (!text) return []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  // 末尾の空行は落とす
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.map((line, i) => ({
    key: `${i}-${line.slice(0, 24)}`,
    lineNo: i + 1,
    tone: detectTone(line),
    text: line.length > 0 ? line : ' ',
  }))
}

const TONE_CLASS: Record<LogTone, string> = {
  error: 'text-[#ff8e8e]',
  warn: 'text-[#f0c674]',
  info: 'text-[#9ece6a]',
  debug: 'text-[#7aa2f7]/80',
  plain: 'text-[#c8d0dc]',
}

function formatBytes(size?: number): string {
  if (size == null || !Number.isFinite(size)) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function InstanceLogConsole({ instanceId, files, onOpenFolder, onRefreshList }: Props) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string | null>(() => pickDefaultLog(files))
  const [copied, setCopied] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  useEffect(() => {
    if (!selected || !files.some((f) => f.name === selected)) {
      setSelected(pickDefaultLog(files))
    }
  }, [files, selected])

  const isLive = selected?.toLowerCase() === 'latest.log'

  const logQuery = useQuery({
    queryKey: ['instance-log', instanceId, selected],
    queryFn: () => fledgeApi.content.readLog(instanceId, selected!),
    enabled: Boolean(instanceId && selected),
    refetchInterval: isLive ? 2000 : false,
  })

  const text = logQuery.data?.text ?? ''
  const truncated = Boolean(logQuery.data?.truncated)
  const rows = useMemo(() => parseLogRows(text), [text])
  const selectedMeta = files.find((f) => f.name === selected)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el || !stickToBottom.current) return
    el.scrollTop = el.scrollHeight
  }, [text, rows.length])

  const copyLog = async () => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* ignore */
    }
  }

  if (files.length === 0) {
    return (
      <EmptyState onOpenFolder={onOpenFolder}>
        <p className="text-sm text-[var(--color-text-muted)]">{t('library.logsEmpty')}</p>
      </EmptyState>
    )
  }

  return (
    <div className="flex min-h-0 flex-col gap-3 lg:flex-row lg:items-stretch">
      <aside className="flex shrink-0 flex-col gap-2 lg:w-52">
        <div className="px-0.5 text-[11px] font-semibold tracking-wide text-[var(--color-text-muted)] uppercase">
          {t('library.logsFiles')}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 lg:max-h-[min(70vh,40rem)] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:pb-0">
          {files.map((file) => {
            const active = file.name === selected
            const live = file.name.toLowerCase() === 'latest.log'
            return (
              <button
                key={file.name}
                type="button"
                onClick={() => {
                  stickToBottom.current = true
                  setSelected(file.name)
                }}
                className={[
                  'group flex min-w-[9.5rem] flex-col gap-0.5 rounded-[var(--radius-md)] border px-3 py-2 text-left transition lg:min-w-0',
                  active
                    ? 'border-[var(--color-accent)]/50 bg-[var(--color-accent-soft)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-accent)_25%,transparent)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)]/60 hover:border-[var(--color-accent)]/35 hover:bg-[var(--color-hover)]',
                ].join(' ')}
              >
                <span className="flex items-center gap-1.5 truncate text-xs font-semibold text-[var(--color-text)]">
                  {live ? (
                    <IconCircleFilled
                      size={8}
                      className={active ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'}
                    />
                  ) : null}
                  <span className="truncate">{file.name}</span>
                </span>
                <span className="truncate text-[10px] text-[var(--color-text-muted)]">
                  {formatBytes(file.size)}
                  {file.mtime ? ` · ${new Date(file.mtime).toLocaleString()}` : ''}
                </span>
              </button>
            )
          })}
        </div>
      </aside>

      <section className="flex min-h-[24rem] min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <header className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-surface)_92%,var(--color-accent)_8%),var(--color-surface))] px-3 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
              <IconTerminal2 size={18} stroke={1.6} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-[var(--color-text)]">
                  {selected ?? t('library.tab.logs')}
                </h3>
                {isLive ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success)]/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--color-success)] uppercase">
                    <IconCircleFilled size={6} className="animate-pulse" />
                    {t('library.logsLive')}
                  </span>
                ) : null}
              </div>
              <p className="truncate text-[11px] text-[var(--color-text-muted)]">
                {selectedMeta?.mtime
                  ? new Date(selectedMeta.mtime).toLocaleString()
                  : t('library.tab.logs')}
                {selectedMeta?.size != null ? ` · ${formatBytes(selectedMeta.size)}` : ''}
                {rows.length > 0 ? ` · ${t('library.logsLines', { count: rows.length })}` : ''}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button
              variant="secondary"
              onClick={() => {
                stickToBottom.current = true
                void logQuery.refetch()
                onRefreshList()
              }}
            >
              <IconRefresh size={16} stroke={1.75} className={logQuery.isFetching ? 'animate-spin' : ''} />
              {t('library.logsRefresh')}
            </Button>
            <Button variant="secondary" onClick={() => void copyLog()} disabled={!text}>
              <IconCopy size={16} stroke={1.75} />
              {copied ? t('library.logsCopied') : t('library.logsCopy')}
            </Button>
            <Button variant="secondary" onClick={onOpenFolder}>
              <IconFolderOpen size={16} stroke={1.75} />
              {t('instances.openLogs')}
            </Button>
          </div>
        </header>

        {truncated ? (
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-accent-soft)]/50 px-3 py-1.5 text-[11px] text-[var(--color-text-muted)]">
            <IconAlertTriangle size={14} stroke={1.75} className="text-[var(--color-accent)]" />
            {t('library.logsTruncated')}
          </div>
        ) : null}

        <div
          ref={scrollerRef}
          onScroll={(e) => {
            const el = e.currentTarget
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 56
          }}
          className="log-console-scroll relative min-h-0 flex-1 overflow-auto bg-[radial-gradient(120%_80%_at_0%_0%,color-mix(in_srgb,var(--color-accent)_12%,transparent),transparent_55%),linear-gradient(180deg,#12161e_0%,#0d1016_100%)]"
        >
          {logQuery.isError ? (
            <p className="p-4 text-sm text-[var(--color-danger)]">
              {logQuery.error instanceof Error ? logQuery.error.message : String(logQuery.error)}
            </p>
          ) : logQuery.isLoading && !text ? (
            <p className="p-6 text-sm text-[#8b93a7]">{t('common.loading')}</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-[#8b93a7]">{t('library.logsEmptyBody')}</p>
          ) : (
            <div className="min-w-full py-2 font-mono text-[12.5px] leading-[1.65] tracking-[0.01em]">
              {rows.map((row) => (
                <div
                  key={row.key}
                  className="group grid grid-cols-[3.25rem_minmax(0,1fr)] gap-0 px-0 hover:bg-white/[0.035]"
                >
                  <span className="select-none border-r border-white/5 pr-2 text-right text-[11px] tabular-nums text-[#5c6578] group-hover:text-[#7a8499]">
                    {row.lineNo}
                  </span>
                  <span
                    className={[
                      'whitespace-pre-wrap break-all px-3',
                      TONE_CLASS[row.tone],
                      row.tone === 'error' ? 'bg-[#ff8e8e]/[0.06]' : '',
                      row.tone === 'warn' ? 'bg-[#f0c674]/[0.05]' : '',
                    ].join(' ')}
                  >
                    {row.text}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function EmptyState({
  children,
  onOpenFolder,
}: {
  children: ReactNode
  onOpenFolder: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[16rem] flex-col items-center justify-center gap-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/50 px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
        <IconTerminal2 size={24} stroke={1.5} />
      </span>
      {children}
      <Button variant="secondary" onClick={onOpenFolder}>
        <IconFolderOpen size={16} stroke={1.75} />
        {t('instances.openLogs')}
      </Button>
    </div>
  )
}
