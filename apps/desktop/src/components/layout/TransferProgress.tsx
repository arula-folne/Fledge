import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ProgressBar } from '../ui/ProgressBar'
import { fledgeApi } from '../../api/fledgeApi'
import { useLaunchStore, useTransferStore, useUiStore } from '../../stores/appStores'
import { isSettingsJavaJob, jobInstanceId } from '../../features/transfers/transferJobs'
import { buildHeaderProgressItems, type HeaderProgressItem } from './headerProgressItems'

const MAX_BARS = 3

function openProgressItem(
  item: HeaderProgressItem,
  navigate: ReturnType<typeof useNavigate>,
  setSettingsSection: (section: 'java') => void,
  setLibraryFocus: (focus: { instanceId: string; tab: 'content' } | null) => void,
  byProfileId: Record<string, { sessionId: string }>,
) {
  if (item.kind === 'launch' && item.instanceId) {
    setLibraryFocus({ instanceId: item.instanceId, tab: 'content' })
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
    Object.entries(byProfileId).find(([, s]) => s.sessionId === job.sessionId)?.[0]

  if (instanceId) {
    setLibraryFocus({
      instanceId,
      tab: job.kind === 'content' ? 'content' : 'content',
    })
    navigate(`/library/${instanceId}`)
    return
  }

}

function HeaderProgressBar({
  item,
  onOpen,
}: {
  item: HeaderProgressItem
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      className="min-w-0 flex-1 rounded-[var(--radius-sm)] px-2 py-1 text-left hover:bg-[var(--color-hover)]"
      onClick={onOpen}
    >
      <div className="mb-0.5 flex items-baseline gap-2">
        <span className="min-w-0 truncate text-xs font-medium text-[var(--color-text)]">
          {item.title}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-[var(--color-text-muted)]">
          {Math.round(item.percent)}%
        </span>
      </div>
      <p className="mb-1 truncate text-[10px] leading-snug text-[var(--color-text-muted)]">
        {item.detail}
      </p>
      <ProgressBar percent={item.percent} />
    </button>
  )
}

/** 起動・インストール・Java 取得などをヘッダーに最大 3 件横並びで表示 */
export function TransferProgress() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const jobsMap = useTransferStore((s) => s.jobs)
  const byProfileId = useLaunchStore((s) => s.byProfileId)
  const progressBySessionId = useLaunchStore((s) => s.progressBySessionId)
  const phaseMessageBySessionId = useLaunchStore((s) => s.phaseMessageBySessionId)
  const setSettingsSection = useUiStore((s) => s.setSettingsSection)
  const setLibraryFocus = useUiStore((s) => s.setLibraryFocus)

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

  if (items.length === 0) return null

  return (
    <div className="flex min-w-0 flex-1 items-stretch gap-1.5">
      {items.slice(0, MAX_BARS).map((item) => (
        <HeaderProgressBar
          key={item.id}
          item={item}
          onOpen={() =>
            openProgressItem(item, navigate, setSettingsSection, setLibraryFocus, byProfileId)
          }
        />
      ))}
    </div>
  )
}
