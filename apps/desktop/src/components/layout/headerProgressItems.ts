import type { ContentCategory, InstanceProfile } from '@fledge/shared'
import type { TransferJob } from '../../stores/appStores'
import { formatProgressMessage } from '../../features/launch/formatProgressMessage'
import { isSettingsJavaJob, jobInstanceId, jobPercent } from '../../features/transfers/transferJobs'

export type HeaderProgressIcon =
  | { type: 'instance'; instanceId?: string }
  | { type: 'java' }
  | { type: 'content'; category: ContentCategory }
  | { type: 'generic' }

export type HeaderProgressItem = {
  id: string
  title: string
  detail: string
  percent: number
  sortKey: string
  kind: 'launch' | 'transfer'
  icon: HeaderProgressIcon
  job?: TransferJob
  instanceId?: string
}

type Translate = (key: string, opts?: Record<string, unknown>) => string

function instanceName(instances: InstanceProfile[], instanceId: string | undefined): string | undefined {
  if (!instanceId) return undefined
  return instances.find((i) => i.id === instanceId)?.name
}

function isInstanceCreateJob(job: TransferJob): boolean {
  return job.meta?.instanceReady === true || String(job.jobId).startsWith('instance-create-')
}

/** Mod / コンテンツ単体の転送（インスタンス単位にまとめる対象） */
function isContentTransferJob(job: TransferJob): boolean {
  return job.kind === 'content'
}

function transferIcon(job: TransferJob, instanceId: string | undefined): HeaderProgressIcon {
  if (isSettingsJavaJob(job) || job.kind === 'java') {
    return { type: 'java' }
  }
  // コンテンツもインスタンス単位表示（カテゴリアイコンは使わない）
  if (instanceId || isInstanceCreateJob(job) || isContentTransferJob(job)) {
    return { type: 'instance', instanceId }
  }
  return { type: 'generic' }
}

function contentDetail(job: TransferJob, t: Translate): string {
  if (job.status === 'completed') return t('content.installed')
  if (job.status === 'failed') return t('header.progress.status.failed')
  if (job.status === 'cancelled') return t('header.progress.status.cancelled')
  return t('content.installing')
}

function transferDetail(job: TransferJob, t: Translate): string {
  const atOrNearDone = (job.percent ?? 0) >= 99.5 || (job.total > 0 && job.current >= job.total)

  if (isContentTransferJob(job)) {
    return contentDetail(job, t)
  }

  if (job.status === 'completed') {
    if (
      job.kind === 'install' ||
      job.messageKey?.startsWith('launch.install.') ||
      job.messageKey === 'content.downloading'
    ) {
      return t('library.prepareDone')
    }
  }

  if (job.kind === 'factory-reset') {
    return t(job.messageKey ?? 'settings.factoryReset.progress.data')
  }
  if (isSettingsJavaJob(job)) {
    if (job.messageKey) return t(job.messageKey, { major: job.meta.major })
    return job.meta.action === 'reinstall'
      ? t('transfer.javaReinstall', { major: job.meta.major })
      : t('transfer.java', { major: job.meta.major })
  }
  if (
    (job.status === 'queued' || job.status === 'active') &&
    job.messageKey?.startsWith('launch.install.') &&
    atOrNearDone
  ) {
    return t('content.installing')
  }
  if (job.messageKey) {
    return formatProgressMessage(t, job.messageKey, job.meta)
  }
  return t('transfer.generic')
}

function transferTitle(job: TransferJob, instances: InstanceProfile[], t: Translate): string {
  if (job.kind === 'factory-reset') {
    return t('settings.factoryReset')
  }
  if (isSettingsJavaJob(job)) {
    return t('header.progress.javaTitle', { major: job.meta.major })
  }
  const instanceId = jobInstanceId(job)
  const name = instanceName(instances, instanceId)
  if (name) return name
  // コンテンツ名は出さない（インスタンス不明時も汎用タイトル）
  return t('header.progress.genericTitle')
}

function averagePercent(jobs: TransferJob[]): number {
  if (jobs.length === 0) return 0
  const sum = jobs.reduce((acc, job) => acc + jobPercent(job), 0)
  return sum / jobs.length
}

/**
 * 同一インスタンスのコンテンツ転送を 1 行にまとめる。
 * title / detail はインスタンス単位のみ（Mod 名・種別は出さない）。
 */
function pushContentInstanceItem(
  items: HeaderProgressItem[],
  instances: InstanceProfile[],
  jobs: TransferJob[],
  t: Translate,
  idPrefix: string,
) {
  if (jobs.length === 0) return
  const instanceId = jobInstanceId(jobs[0]!)
  const representative = jobs[0]!
  const failed = jobs.find((j) => j.status === 'failed' || j.status === 'cancelled')
  const allDone = jobs.every((j) => j.status === 'completed')
  const detailJob = failed ?? (allDone ? jobs[0]! : representative)

  items.push({
    id: `${idPrefix}:${instanceId ?? representative.jobId}`,
    title: transferTitle(representative, instances, t),
    detail: contentDetail(detailJob, t),
    percent: allDone || failed ? (failed ? jobPercent(failed) : 100) : averagePercent(jobs),
    sortKey: `${idPrefix}:${instanceId ?? representative.jobId}`,
    kind: 'transfer',
    icon: transferIcon(representative, instanceId),
    job: representative,
    instanceId,
  })
}

export function buildHeaderProgressItems(input: {
  instances: InstanceProfile[]
  byProfileId: Record<string, { sessionId: string; state: string }>
  progressBySessionId: Record<
    string,
    {
      messageKey?: string
      meta?: Record<string, unknown>
      percent?: number
      current?: number
      total?: number
    }
  >
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
    let messageKey = progress?.messageKey ?? phaseKey
    const percent =
      progress?.percent ??
      (progress && progress.total && progress.total > 0
        ? ((progress.current ?? 0) / progress.total) * 100
        : 0)
    if (
      percent >= 99.5 &&
      typeof messageKey === 'string' &&
      messageKey.startsWith('launch.install.')
    ) {
      messageKey = 'content.installing'
    }
    const title = instanceName(instances, profileId) ?? t('header.progress.genericTitle')
    const detail = formatProgressMessage(t, messageKey, progress?.meta as never, 'library.preparing')

    items.push({
      id: `launch:${profileId}`,
      title,
      detail,
      percent,
      sortKey: `launch:${profileId}`,
      kind: 'launch',
      icon: { type: 'instance', instanceId: profileId },
      instanceId: profileId,
    })
  }

  const contentByInstance = new Map<string, TransferJob[]>()
  const orphanContent: TransferJob[] = []
  const otherJobs: TransferJob[] = []

  for (const job of Object.values(transferJobs)) {
    if (job.status !== 'queued' && job.status !== 'active') continue
    if (job.sessionId && activeSessionIds.has(job.sessionId)) continue
    const instanceId = jobInstanceId(job)
    if (instanceId && activeProfileIds.has(instanceId)) continue

    if (isContentTransferJob(job)) {
      if (instanceId) {
        const list = contentByInstance.get(instanceId) ?? []
        list.push(job)
        contentByInstance.set(instanceId, list)
      } else {
        orphanContent.push(job)
      }
      continue
    }
    otherJobs.push(job)
  }

  for (const jobs of contentByInstance.values()) {
    pushContentInstanceItem(items, instances, jobs, t, 'transfer:content')
  }
  for (const job of orphanContent) {
    pushContentInstanceItem(items, instances, [job], t, 'transfer:content')
  }

  for (const job of otherJobs) {
    const instanceId = jobInstanceId(job)
    items.push({
      id: `transfer:${job.jobId}`,
      title: transferTitle(job, instances, t),
      detail: transferDetail(job, t),
      percent: jobPercent(job),
      sortKey: `transfer:${job.jobId}`,
      kind: 'transfer',
      icon: transferIcon(job, instanceId),
      job,
      instanceId,
    })
  }

  return items.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
}

export function buildHeaderHistoryItems(input: {
  instances: InstanceProfile[]
  history: Array<TransferJob & { finishedAt?: number }>
  t: Translate
}): HeaderProgressItem[] {
  const { instances, history, t } = input
  const items: HeaderProgressItem[] = []
  const seenContentInstances = new Set<string>()

  for (const job of history) {
    const instanceId = jobInstanceId(job)

    if (isContentTransferJob(job)) {
      const key = instanceId ?? job.jobId
      if (seenContentInstances.has(key)) continue
      seenContentInstances.add(key)
      pushContentInstanceItem(items, instances, [job], t, `history:${job.finishedAt ?? 0}`)
      continue
    }

    const percent =
      job.status === 'completed' ? 100 : job.percent != null ? job.percent : jobPercent(job)
    items.push({
      id: `history:${job.jobId}:${job.finishedAt ?? 0}`,
      title: transferTitle(job, instances, t),
      detail: transferDetail(job, t),
      percent,
      sortKey: `history:${job.jobId}`,
      kind: 'transfer',
      icon: transferIcon(job, instanceId),
      job,
      instanceId,
    })
  }

  return items
}
