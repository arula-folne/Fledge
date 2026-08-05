import { randomUUID } from 'node:crypto'
import type { DownloadKind, ProgressEvent } from '@fledge/shared'

export type DownloadJobStatus = 'queued' | 'active' | 'completed' | 'failed' | 'cancelled'

export type DownloadProgress = {
  current: number
  total: number
  unit: 'bytes' | 'files' | 'count'
  bytesPerSecond?: number
}

export type DownloadJob = {
  id: string
  kind: DownloadKind
  labelKey: string
  status: DownloadJobStatus
  priority: number
  sessionId?: string
  createdAt: number
  startedAt?: number
  finishedAt?: number
  progress: DownloadProgress
  errorCode?: string
  errorMessageKey?: string
  meta?: Record<string, string | number | boolean>
}

export type DownloadContext = {
  jobId: string
  signal: AbortSignal
  setKind: (kind: DownloadKind) => void
  report: (update: Partial<DownloadProgress> & { messageKey?: string }) => void
}

export type EnqueueInput = {
  kind: DownloadKind
  labelKey: string
  priority?: number
  sessionId?: string
  meta?: Record<string, string | number | boolean>
  execute: (ctx: DownloadContext) => Promise<void>
}

export type ProgressEmitter = (event: ProgressEvent) => void

type InternalJob = DownloadJob & {
  execute: EnqueueInput['execute']
  abort: AbortController
  resolve: () => void
  reject: (err: unknown) => void
}

export class DownloadQueue {
  readonly concurrency = 1
  private queue: InternalJob[] = []
  private active: InternalJob | null = null
  private lastEmitAt = 0

  constructor(private readonly emitProgress: ProgressEmitter) {}

  getSnapshot(): DownloadJob[] {
    const jobs = [...this.queue]
    if (this.active) jobs.unshift(this.active)
    return jobs.map(({ execute: _e, abort: _a, resolve: _r, reject: _j, ...job }) => job)
  }

  enqueue(input: EnqueueInput): { jobId: string; done: Promise<void> } {
    const id = randomUUID()
    let resolve!: () => void
    let reject!: (err: unknown) => void
    const done = new Promise<void>((res, rej) => {
      resolve = res
      reject = rej
    })

    const job: InternalJob = {
      id,
      kind: input.kind,
      labelKey: input.labelKey,
      status: 'queued',
      priority: input.priority ?? 0,
      sessionId: input.sessionId,
      createdAt: Date.now(),
      progress: { current: 0, total: 0, unit: 'count' },
      meta: input.meta,
      execute: input.execute,
      abort: new AbortController(),
      resolve,
      reject,
    }
    this.queue.push(job)
    this.queue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
    void this.pump()
    return { jobId: id, done }
  }

  cancel(jobId: string): void {
    if (this.active?.id === jobId) {
      this.active.abort.abort()
      this.active.status = 'cancelled'
      return
    }
    const idx = this.queue.findIndex((j) => j.id === jobId)
    if (idx >= 0) {
      const [job] = this.queue.splice(idx, 1)
      if (!job) return
      job.status = 'cancelled'
      job.reject(Object.assign(new Error('cancelled'), { messageKey: 'download.cancelled' }))
    }
  }

  cancelBySession(sessionId: string): void {
    for (const job of [...this.queue]) {
      if (job.sessionId === sessionId) this.cancel(job.id)
    }
    if (this.active?.sessionId === sessionId) this.cancel(this.active.id)
  }

  private async pump(): Promise<void> {
    if (this.active || this.queue.length === 0) return
    const job = this.queue.shift()
    if (!job) return
    this.active = job
    job.status = 'active'
    job.startedAt = Date.now()

    const ctx: DownloadContext = {
      jobId: job.id,
      signal: job.abort.signal,
      setKind: (kind) => {
        job.kind = kind
      },
      report: (update) => {
        job.progress = { ...job.progress, ...update }
        this.emitJobProgress(job, update.messageKey)
      },
    }

    try {
      await job.execute(ctx)
      if (job.abort.signal.aborted) {
        job.status = 'cancelled'
        job.reject(Object.assign(new Error('cancelled'), { messageKey: 'download.cancelled' }))
      } else {
        job.status = 'completed'
        job.finishedAt = Date.now()
        job.resolve()
      }
    } catch (err) {
      job.status = job.abort.signal.aborted ? 'cancelled' : 'failed'
      job.finishedAt = Date.now()
      job.errorMessageKey =
        err && typeof err === 'object' && 'messageKey' in err
          ? String((err as { messageKey: string }).messageKey)
          : 'download.error.unknown'
      job.reject(err)
    } finally {
      this.active = null
      void this.pump()
    }
  }

  private emitJobProgress(job: InternalJob, messageKey?: string): void {
    const now = Date.now()
    if (now - this.lastEmitAt < 100 && job.progress.total > 0) {
      const percent = (job.progress.current / job.progress.total) * 100
      if (percent % 1 > 0.05) {
        // 間引き（最低100ms）
        return
      }
    }
    this.lastEmitAt = now
    const percent =
      job.progress.total > 0 ? (job.progress.current / job.progress.total) * 100 : undefined
    this.emitProgress({
      scope: 'download',
      kind: job.kind,
      sessionId: job.sessionId,
      jobId: job.id,
      current: job.progress.current,
      total: job.progress.total,
      percent,
      bytesPerSecond: job.progress.bytesPerSecond,
      messageKey: messageKey ?? job.labelKey,
      meta: { unit: job.progress.unit, status: job.status, ...(job.meta ?? {}) },
    })
  }
}
