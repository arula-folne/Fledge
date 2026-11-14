import type { ProgressEvent } from '@fledge/shared'
import type { TransferJob } from '../../stores/appStores'
import { displayPercentOf } from '../launch/progressDisplay'

/** ヘッダー再描画用: アクティブジョブの見た目が変わったときだけ変化 */
export function transferJobsDisplayKey(jobs: Record<string, TransferJob>): string {
  const parts: string[] = []
  for (const job of Object.values(jobs)) {
    const pct = displayPercentOf(job.percent, job.current, job.total)
    parts.push(
      `${job.jobId}:${job.status}:${pct}:${job.messageKey ?? ''}:${String(job.meta.projectId ?? '')}`,
    )
  }
  parts.sort()
  return parts.join('|')
}

export function launchProgressDisplayKey(
  byProfileId: Record<string, { sessionId: string; state: string }>,
  progressBySessionId: Record<string, ProgressEvent>,
  phaseMessageBySessionId: Record<string, string>,
): string {
  const parts: string[] = []
  for (const session of Object.values(byProfileId)) {
    if (session.state !== 'preparing' && session.state !== 'launching') continue
    const p = progressBySessionId[session.sessionId]
    const pct = p ? displayPercentOf(p.percent, p.current, p.total) : -1
    const msg = phaseMessageBySessionId[session.sessionId] ?? p?.messageKey ?? ''
    parts.push(`${session.sessionId}:${session.state}:${pct}:${msg}`)
  }
  parts.sort()
  return parts.join('|')
}

/** インスタンス向け content インストール中の projectId を安定キー化（%更新では変化しない） */
export function contentInstallingProjectIdsKey(
  jobs: Record<string, TransferJob>,
  instanceId: string,
  activeOnly: boolean,
): string {
  const ids: string[] = []
  for (const job of Object.values(jobs)) {
    if (job.kind !== 'content') continue
    if (job.meta.instanceId !== instanceId) continue
    if (typeof job.meta.projectId !== 'string') continue
    if (activeOnly && job.status !== 'queued' && job.status !== 'active') continue
    ids.push(job.meta.projectId)
  }
  ids.sort()
  return ids.join('\0')
}

export function parseProjectIdsKey(key: string): Set<string> {
  if (!key) return new Set()
  return new Set(key.split('\0'))
}

/** Java ジョブの表示用スナップショット（major → 整数%|message）。変化時だけ再描画 */
export function javaJobsDisplayKey(jobs: Record<string, TransferJob>): string {
  const parts: string[] = []
  for (const job of Object.values(jobs)) {
    if (job.kind !== 'java') continue
    if (job.status !== 'queued' && job.status !== 'active') continue
    const major = String(job.meta.major ?? '')
    const pct =
      job.percent != null && Number.isFinite(job.percent)
        ? Math.round(job.percent)
        : job.total > 0
          ? Math.round((job.current / job.total) * 100)
          : 0
    parts.push(`${major}:${pct}:${job.messageKey ?? ''}:${job.jobId}`)
  }
  parts.sort()
  return parts.join('|')
}

export function javaActiveJob(
  jobs: Record<string, TransferJob>,
  major: number,
): TransferJob | undefined {
  return Object.values(jobs).find(
    (j) =>
      j.kind === 'java' &&
      Number(j.meta.major) === major &&
      (j.status === 'queued' || j.status === 'active'),
  )
}
