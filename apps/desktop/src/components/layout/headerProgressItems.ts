import type { InstanceProfile } from '@fledge/shared'
import type { TransferJob } from '../../stores/appStores'
import { formatProgressMessage } from '../../features/launch/formatProgressMessage'
import { isSettingsJavaJob, jobInstanceId, jobPercent } from '../../features/transfers/transferJobs'

export type HeaderProgressItem = {
  id: string
  title: string
  detail: string
  percent: number
  sortKey: string
  kind: 'launch' | 'transfer'
  job?: TransferJob
  instanceId?: string
}

type Translate = (key: string, opts?: Record<string, unknown>) => string

function instanceName(instances: InstanceProfile[], instanceId: string | undefined): string | undefined {
  if (!instanceId) return undefined
  return instances.find((i) => i.id === instanceId)?.name
}

function transferDetail(job: TransferJob, t: Translate): string {
  if (isSettingsJavaJob(job)) {
    if (job.messageKey) return t(job.messageKey, { major: job.meta.major })
    return job.meta.action === 'reinstall'
      ? t('transfer.javaReinstall', { major: job.meta.major })
      : t('transfer.java', { major: job.meta.major })
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

function transferTitle(job: TransferJob, instances: InstanceProfile[], t: Translate): string {
  if (isSettingsJavaJob(job)) {
    return t('header.progress.javaTitle', { major: job.meta.major })
  }
  const instanceId = jobInstanceId(job)
  const name = instanceName(instances, instanceId)
  if (name) return name
  if (job.kind === 'content') {
    const project = job.meta.projectName ?? job.meta.name
    if (typeof project === 'string' && project.length > 0) return project
  }
  return t('header.progress.genericTitle')
}

export function buildHeaderProgressItems(input: {
  instances: InstanceProfile[]
  byProfileId: Record<string, { sessionId: string; state: string }>
  progressBySessionId: Record<string, { messageKey?: string; meta?: Record<string, unknown>; percent?: number; current?: number; total?: number }>
  phaseMessageBySessionId: Record<string, string>
  transferJobs: Record<string, TransferJob>
  t: Translate
}): HeaderProgressItem[] {
  const { instances, byProfileId, progressBySessionId, phaseMessageBySessionId, transferJobs, t } =
    input

  const activeLaunchProfiles = Object.entries(byProfileId).filter(
    ([, s]) => s.state === 'preparing' || s.state === 'launching',
  )
  const activeSessionIds = new Set(activeLaunchProfiles.map(([, s]) => s.sessionId))
  const activeProfileIds = new Set(activeLaunchProfiles.map(([id]) => id))

  const items: HeaderProgressItem[] = []

  for (const [profileId, session] of activeLaunchProfiles) {
    const progress = progressBySessionId[session.sessionId]
    const phaseKey = phaseMessageBySessionId[session.sessionId]
    const messageKey = progress?.messageKey ?? phaseKey
    const percent =
      progress?.percent ??
      (progress && progress.total && progress.total > 0
        ? ((progress.current ?? 0) / progress.total) * 100
        : 0)
    const title = instanceName(instances, profileId) ?? t('header.progress.genericTitle')
    const detail = formatProgressMessage(t, messageKey, progress?.meta as never, 'library.preparing')

    items.push({
      id: `launch:${profileId}`,
      title,
      detail,
      percent,
      sortKey: `launch:${profileId}`,
      kind: 'launch',
      instanceId: profileId,
    })
  }

  for (const job of Object.values(transferJobs)) {
    if (job.status !== 'queued' && job.status !== 'active') continue
    if (job.sessionId && activeSessionIds.has(job.sessionId)) continue
    const instanceId = jobInstanceId(job)
    if (instanceId && activeProfileIds.has(instanceId)) continue

    items.push({
      id: `transfer:${job.jobId}`,
      title: transferTitle(job, instances, t),
      detail: transferDetail(job, t),
      percent: jobPercent(job),
      sortKey: `transfer:${job.jobId}`,
      kind: 'transfer',
      job,
      instanceId,
    })
  }

  return items.sort((a, b) => a.sortKey.localeCompare(b.sortKey)).slice(0, 3)
}
