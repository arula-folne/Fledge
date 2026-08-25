import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { IconDownload } from '@tabler/icons-react'
import { ProgressBar } from '../ui/ProgressBar'
import {
  useLaunchStore,
  useTransferStore,
  useUiStore,
  type TransferJob,
} from '../../stores/appStores'
import { formatProgressMessage } from '../../features/launch/formatProgressMessage'
import { isSettingsJavaJob, jobInstanceId, jobPercent } from '../../features/transfers/transferJobs'

function jobLabel(job: TransferJob, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (isSettingsJavaJob(job)) {
    const major = job.meta.major
    if (job.messageKey) return t(job.messageKey, { major })
    return job.meta.action === 'reinstall'
      ? t('transfer.javaReinstall', { major })
      : t('transfer.java', { major })
  }
  if (job.kind === 'content') {
    const name = job.meta.projectName ?? job.meta.name
    if (job.messageKey) return t(job.messageKey, { name })
    return typeof name === 'string' && name.length > 0
      ? t('transfer.content', { name })
      : t('content.installing')
  }
  if (job.messageKey) {
    return formatProgressMessage(t, job.messageKey, job.meta)
  }
  return t('transfer.generic')
}

function isOnTargetScreen(
  job: TransferJob,
  pathname: string,
  settingsSection: string,
  libraryFocus: { instanceId: string; tab: string } | null,
  launchProfileIds: Record<string, { sessionId: string }>,
): boolean {
  if (isSettingsJavaJob(job)) {
    return pathname === '/settings' && settingsSection === 'java'
  }

  const instanceId = jobInstanceId(job)
  if (job.kind === 'content') {
    return (
      Boolean(instanceId) &&
      pathname === `/library/${instanceId}` &&
      libraryFocus?.instanceId === instanceId &&
      libraryFocus?.tab === 'content'
    )
  }

  const launchInstanceId =
    instanceId ??
    Object.entries(launchProfileIds).find(([, s]) => s.sessionId === job.sessionId)?.[0]
  if (!launchInstanceId) return false
  if (pathname === '/') return true
  return pathname === `/library/${launchInstanceId}`
}

export function TransferProgress() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const jobsMap = useTransferStore((s) => s.jobs)
  const pinnedJobId = useTransferStore((s) => s.pinnedJobId)
  const settingsSection = useUiStore((s) => s.settingsSection)
  const libraryFocus = useUiStore((s) => s.libraryFocus)
  const setSettingsSection = useUiStore((s) => s.setSettingsSection)
  const setLibraryFocus = useUiStore((s) => s.setLibraryFocus)
  const byProfileId = useLaunchStore((s) => s.byProfileId)

  const visible = useMemo(() => {
    return Object.values(jobsMap)
      .filter((job) => {
        if (job.status !== 'queued' && job.status !== 'active') return false
        return !isOnTargetScreen(
          job,
          location.pathname,
          settingsSection,
          libraryFocus,
          byProfileId,
        )
      })
      .sort((a, b) => a.jobId.localeCompare(b.jobId))
  }, [jobsMap, location.pathname, settingsSection, libraryFocus, byProfileId])

  if (visible.length === 0) return null

  const primary =
    (pinnedJobId ? visible.find((j) => j.jobId === pinnedJobId) : undefined) ?? visible[0]!
  const extra = visible.length - 1
  const percent = jobPercent(primary)

  const open = (job: TransferJob) => {
    if (isSettingsJavaJob(job)) {
      setSettingsSection('java')
      navigate('/settings')
      return
    }
    const instanceId = jobInstanceId(job)
    if (job.kind === 'content' && instanceId) {
      setLibraryFocus({ instanceId, tab: 'content' })
      navigate(`/library/${instanceId}`)
      return
    }
    const launchInstanceId =
      instanceId ??
      Object.entries(byProfileId).find(([, s]) => s.sessionId === job.sessionId)?.[0]
    if (launchInstanceId) {
      setLibraryFocus({ instanceId: launchInstanceId, tab: 'content' })
      navigate(`/library/${launchInstanceId}`)
    }
  }

  return (
    <button
      type="button"
      className="min-w-0 max-w-md flex-1 rounded-[var(--radius-sm)] px-2 py-1 text-left hover:bg-[var(--color-hover)]"
      onClick={() => open(primary)}
    >
      <div className="mb-1 flex items-center gap-2">
        <IconDownload size={14} stroke={1.75} className="shrink-0 text-[var(--color-accent)]" />
        <span className="min-w-0 truncate text-xs text-[var(--color-text)]">
          {jobLabel(primary, t)}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-[var(--color-text-muted)]">
          {Math.round(percent)}%
        </span>
        {extra > 0 ? (
          <span className="shrink-0 text-[11px] text-[var(--color-text-muted)]">
            {t('transfer.more', { count: extra })}
          </span>
        ) : null}
      </div>
      <ProgressBar percent={percent} />
    </button>
  )
}
