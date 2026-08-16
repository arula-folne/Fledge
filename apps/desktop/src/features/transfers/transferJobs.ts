import type { TransferJob } from '../../stores/appStores'

export function isSettingsJavaJob(job: TransferJob): boolean {
  const sid = job.sessionId ?? ''
  return job.kind === 'java' && (sid.startsWith('java-install-') || sid.startsWith('java-reinstall-'))
}

export function jobInstanceId(job: TransferJob): string | undefined {
  const id = job.meta?.instanceId
  return typeof id === 'string' && id.length > 0 ? id : undefined
}

export function jobPercent(job: TransferJob): number {
  if (job.percent != null && Number.isFinite(job.percent)) return job.percent
  if (job.total > 0) return (job.current / job.total) * 100
  return job.status === 'queued' ? 0 : 8
}
