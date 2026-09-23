import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  IconCheck,
  IconCoffee,
  IconDownload,
  IconPackages,
  IconX,
} from '@tabler/icons-react'
import type { InstanceProfile } from '@fledge/shared'
import { ProgressBar } from '../ui/ProgressBar'
import { fledgeApi } from '../../api/fledgeApi'
import { useLaunchStore, useTransferStore, useUiStore } from '../../stores/appStores'
import { isSettingsJavaJob, jobInstanceId } from '../../features/transfers/transferJobs'
import { ContentCategoryIcon } from '../../features/content/contentCategoryIcons'
import { InstanceIcon } from '../../features/instances/InstanceIcon'
import {
  buildHeaderHistoryItems,
  buildHeaderProgressItems,
  type HeaderProgressItem,
} from './headerProgressItems'

function ProgressItemIcon({
  item,
  instances,
}: {
  item: HeaderProgressItem
  instances: InstanceProfile[]
}) {
  const icon = item.icon
  if (icon.type === 'instance') {
    const instance = icon.instanceId
      ? instances.find((entry) => entry.id === icon.instanceId)
      : undefined
    return <InstanceIcon instance={instance} size="sm" className="!size-7" />
  }
  if (icon.type === 'java') {
    return (
      <span
        className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
        aria-hidden
      >
        <IconCoffee size={16} stroke={1.75} />
      </span>
    )
  }
  if (icon.type === 'content') {
    return (
      <span
        className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-bg)]"
        aria-hidden
      >
        <ContentCategoryIcon category={icon.category} size={16} />
      </span>
    )
  }
  return (
    <span
      className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-bg)] text-[var(--color-text-muted)]"
      aria-hidden
    >
      <IconPackages size={16} stroke={1.75} />
    </span>
  )
}

function openProgressItem(
  item: HeaderProgressItem,
  navigate: ReturnType<typeof useNavigate>,
  setSettingsSection: (section: 'java') => void,
  byProfileId: Record<string, { sessionId: string }>,
) {
  if (item.kind === 'launch' && item.instanceId) {
    navigate(`/library/${item.instanceId}`)
    return
  }

  const job = item.job
  if (!job) return

  if (isSettingsJavaJob(job)) {
    setSettingsSection('java')
    navigate('/settings')
    return
  }

  const instanceId =
    jobInstanceId(job) ??
    item.instanceId ??
    Object.entries(byProfileId).find(([, s]) => s.sessionId === job.sessionId)?.[0]

  if (instanceId) {
    navigate(`/library/${instanceId}`)
  }
}

function statusLabel(
  t: (key: string) => string,
  status: string | undefined,
): string | null {
  if (status === 'completed') return t('header.progress.status.completed')
  if (status === 'failed') return t('header.progress.status.failed')
  if (status === 'cancelled') return t('header.progress.status.cancelled')
  return null
}

function ProgressRow({
  item,
  instances,
  onOpen,
  compact,
  history,
}: {
  item: HeaderProgressItem
  instances: InstanceProfile[]
  onOpen: () => void
  compact?: boolean
  history?: boolean
}) {
  const { t } = useTranslation()
  const terminal = statusLabel(t, item.job?.status)
  const failed = item.job?.status === 'failed' || item.job?.status === 'cancelled'
  const showDone = Boolean(history && terminal)

  return (
    <button
      type="button"
      className={[
        'flex min-w-0 w-full items-start gap-2 rounded-[var(--radius-sm)] text-left hover:bg-[var(--color-hover)]',
        compact ? 'px-2 py-1.5' : 'px-1.5 py-0.5',
      ].join(' ')}
      onClick={onOpen}
    >
      <ProgressItemIcon item={item} instances={instances} />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-baseline gap-2">
          <span className="min-w-0 truncate text-xs font-medium leading-4 text-[var(--color-text)]">
            {item.title}
          </span>
          {showDone && terminal ? (
            <span
              className={[
                'inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium',
                failed ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]',
              ].join(' ')}
            >
              {failed ? <IconX size={11} stroke={2} /> : <IconCheck size={11} stroke={2} />}
              {terminal}
            </span>
          ) : (
            <span className="shrink-0 text-[10px] leading-4 tabular-nums text-[var(--color-text-muted)]">
              {Math.round(item.percent)}%
            </span>
          )}
        </div>
        <p className="mb-0.5 truncate text-[10px] leading-3 text-[var(--color-text-muted)]">
          {item.detail}
        </p>
        {history ? null : <ProgressBar percent={item.percent} />}
      </div>
    </button>
  )
}

/** ヘッダー左: 進行中バー + インストールビューパネル */
export function TransferProgress() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const jobsMap = useTransferStore((s) => s.jobs)
  const history = useTransferStore((s) => s.history)
  const clearHistory = useTransferStore((s) => s.clearHistory)
  const pinnedJobId = useTransferStore((s) => s.pinnedJobId)
  const byProfileId = useLaunchStore((s) => s.byProfileId)
  const progressBySessionId = useLaunchStore((s) => s.progressBySessionId)
  const phaseMessageBySessionId = useLaunchStore((s) => s.phaseMessageBySessionId)
  const setSettingsSection = useUiStore((s) => s.setSettingsSection)
  const [panelOpen, setPanelOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null)

  const instancesQuery = useQuery({
    queryKey: ['instances'],
    queryFn: () => fledgeApi.instances.list(),
  })

  const items = useMemo(
    () =>
      buildHeaderProgressItems({
        instances: instancesQuery.data ?? [],
        byProfileId,
        progressBySessionId,
        phaseMessageBySessionId,
        transferJobs: jobsMap,
        t,
      }),
    [
      instancesQuery.data,
      byProfileId,
      progressBySessionId,
      phaseMessageBySessionId,
      jobsMap,
      t,
      location.pathname,
    ],
  )

  const historyItems = useMemo(
    () =>
      buildHeaderHistoryItems({
        instances: instancesQuery.data ?? [],
        history,
        t,
      }),
    [instancesQuery.data, history, t],
  )

  const primary = useMemo(() => {
    if (items.length === 0) return null
    if (pinnedJobId) {
      const pinned = items.find((item) => item.kind === 'transfer' && item.job?.jobId === pinnedJobId)
      if (pinned) return pinned
    }
    return items[0]!
  }, [items, pinnedJobId])

  const activeCount = items.length

  useLayoutEffect(() => {
    if (!panelOpen) {
      setPanelPos(null)
      return
    }
    const update = () => {
      const el = rootRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const width = Math.min(22 * 16, window.innerWidth * 0.7)
      let left = rect.left
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
      setPanelPos({ top: rect.bottom + 6, left })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [panelOpen])

  useEffect(() => {
    if (!panelOpen) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      if ((target as Element).closest?.('[data-fledge-install-view]')) return
      setPanelOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanelOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [panelOpen])

  const instances = instancesQuery.data ?? []

  const openItem = (item: HeaderProgressItem) => {
    openProgressItem(item, navigate, setSettingsSection, byProfileId)
    setPanelOpen(false)
  }

  const togglePanel = () => setPanelOpen((v) => !v)
  const installing = activeCount > 0

  const panel =
    panelOpen && panelPos
      ? createPortal(
          <div
            data-fledge-install-view
            role="dialog"
            aria-label={t('header.progress.historyTitle')}
            className="fixed z-[120] w-[min(22rem,70vw)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm"
            style={{ top: panelPos.top, left: panelPos.left }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-2.5 py-1.5">
              <p className="text-xs font-medium text-[var(--color-text)]">
                {t('header.progress.historyTitle')}
              </p>
              {historyItems.length > 0 ? (
                <button
                  type="button"
                  className="shrink-0 font-normal leading-none text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  style={{ fontSize: '11px' }}
                  onClick={() => clearHistory()}
                >
                  {t('header.progress.historyClear')}
                </button>
              ) : null}
            </div>

            <div className="max-h-[min(20rem,50vh)] overflow-y-auto overscroll-contain">
              {items.length > 0 ? (
                <div className="border-b border-[var(--color-border)] py-1">
                  <p className="px-2.5 py-1 text-[10px] font-semibold tracking-wide text-[var(--color-text-muted)]">
                    {t('header.progress.historyActive')}
                    <span className="ml-1 tabular-nums">({items.length})</span>
                  </p>
                  {items.map((item) => (
                    <ProgressRow
                      key={item.id}
                      item={item}
                      instances={instances}
                      compact
                      onOpen={() => openItem(item)}
                    />
                  ))}
                </div>
              ) : null}

              {historyItems.length > 0 ? (
                <div className="py-1">
                  <p className="px-2.5 py-1 text-[10px] font-semibold tracking-wide text-[var(--color-text-muted)]">
                    {t('header.progress.historyRecent')}
                  </p>
                  {historyItems.map((item) => (
                    <ProgressRow
                      key={item.id}
                      item={item}
                      instances={instances}
                      compact
                      history
                      onOpen={() => openItem(item)}
                    />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-[var(--color-text-muted)]">
                  {t('header.progress.historyEmpty')}
                </p>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div ref={rootRef} className="relative flex min-w-0 items-center gap-3">
      <div className="relative size-10 shrink-0">
        {installing ? (
          <svg
            className="pointer-events-none absolute inset-0 size-full animate-spin motion-reduce:animate-none"
            viewBox="0 0 36 36"
            aria-hidden
          >
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="var(--color-accent)"
              strokeOpacity="0.22"
              strokeWidth="2.5"
            />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="22 76"
            />
          </svg>
        ) : null}
        <button
          type="button"
          className={[
            'absolute grid place-items-center rounded-full border transition',
            installing ? 'inset-[3px]' : 'inset-0',
            panelOpen
              ? 'border-[var(--color-border)] bg-[var(--color-hover)] text-[var(--color-text)]'
              : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
          ].join(' ')}
          aria-expanded={panelOpen}
          aria-label={t('header.progress.historyAria')}
          onClick={togglePanel}
        >
          <IconDownload size={18} stroke={1.75} aria-hidden />
        </button>
        {installing ? (
          <span className="absolute -right-0.5 -top-0.5 z-[1] grid min-w-[1.05rem] place-items-center rounded-full bg-[var(--color-surface)] px-1 text-[10px] font-semibold leading-[1.05rem] text-[var(--color-accent)] tabular-nums ring-1 ring-[var(--color-accent)]">
            {activeCount > 9 ? '9+' : activeCount}
          </span>
        ) : null}
      </div>

      {primary ? (
        <div className="w-[min(33vw,20rem)] min-w-[11rem] max-w-md shrink">
          <ProgressRow item={primary} instances={instances} onOpen={() => openItem(primary)} />
        </div>
      ) : null}

      {panel}
    </div>
  )
}
