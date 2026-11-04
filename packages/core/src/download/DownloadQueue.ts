import { randomUUID } from 'node:crypto'
import type { DownloadKind, ProgressEvent, TransferJobStatus } from '@fledge/shared'

export type DownloadJobStatus = TransferJobStatus

/** interactive: ユーザー操作の単体導入。bulk: インスタンス準備・mrpack 一括など */
export type DownloadLane = 'interactive' | 'bulk'

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
  lane: DownloadLane
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
  report: (update: Partial<DownloadProgress> & {
    messageKey?: string
    meta?: Record<string, string | number | boolean>
  }) => void
}

export type EnqueueInput = {
  kind: DownloadKind
  labelKey: string
  priority?: number
  /** 既定 bulk。interactive は枠を予約して作成中でも Mod 導入できるようにする */
  lane?: DownloadLane
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
  lastEmitAt: number
}

const DEFAULT_CONCURRENCY = 8
/** 同時実行枠のうち interactive 用に確保する数（残りは bulk。interactive 待ちが空なら bulk が余剰を使用可） */
const INTERACTIVE_RESERVED = 2

export class DownloadQueue {
  private _concurrency: number
  private queued: InternalJob[] = []
  private active = new Map<string, InternalJob>()

  constructor(
    private readonly emitProgress: ProgressEmitter,
    concurrency = DEFAULT_CONCURRENCY,
  ) {
    this._concurrency = Math.max(1, Math.min(32, concurrency))
  }

  get concurrency(): number {
    return this._concurrency
  }

  /** 設定変更などから同時実行数を更新する */
  setConcurrency(concurrency: number): void {
    this._concurrency = Math.max(1, Math.min(32, Math.round(concurrency)))
    this.pump()
  }

  getSnapshot(): DownloadJob[] {
    const jobs = [...this.active.values(), ...this.queued]
    return jobs.map((job) => ({
      id: job.id,
      kind: job.kind,
      labelKey: job.labelKey,
      status: job.status,
      priority: job.priority,
      lane: job.lane,
      sessionId: job.sessionId,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      progress: { ...job.progress },
      errorCode: job.errorCode,
      errorMessageKey: job.errorMessageKey,
      meta: job.meta ? { ...job.meta } : undefined,
    }))
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
      lane: input.lane ?? 'bulk',
      sessionId: input.sessionId,
      createdAt: Date.now(),
      progress: { current: 0, total: 0, unit: 'count' },
      meta: input.meta,
      execute: input.execute,
      abort: new AbortController(),
      resolve,
      reject,
      lastEmitAt: 0,
    }
    this.queued.push(job)
    this.queued.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
    this.emitJobProgress(job, job.labelKey, true)
    this.pump()
    return { jobId: id, done }
  }

  cancel(jobId: string): void {
    const running = this.active.get(jobId)
    if (running) {
      running.abort.abort()
      running.status = 'cancelled'
      return
    }
    const idx = this.queued.findIndex((j) => j.id === jobId)
    if (idx >= 0) {
      const [job] = this.queued.splice(idx, 1)
      if (!job) return
      job.status = 'cancelled'
      this.emitJobProgress(job, 'download.cancelled', true)
      job.reject(Object.assign(new Error('cancelled'), { messageKey: 'download.cancelled' }))
    }
  }

  cancelBySession(sessionId: string): void {
    for (const job of [...this.queued]) {
      if (job.sessionId === sessionId) this.cancel(job.id)
    }
    for (const job of this.active.values()) {
      if (job.sessionId === sessionId) this.cancel(job.id)
    }
  }

  cancelBySessionPrefix(sessionPrefix: string): void {
    for (const job of [...this.queued]) {
      if (job.sessionId?.startsWith(sessionPrefix)) this.cancel(job.id)
    }
    for (const job of this.active.values()) {
      if (job.sessionId?.startsWith(sessionPrefix)) this.cancel(job.id)
    }
  }

  cancelAll(): void {
    for (const job of [...this.queued]) this.cancel(job.id)
    for (const job of this.active.values()) this.cancel(job.id)
  }

  /** ジョブを増やさず、セッションの表示用ステータスだけ更新する */
  emitStatus(
    sessionId: string,
    messageKey: string,
    meta?: Record<string, string | number | boolean>,
  ): void {
    this.emitProgress({
      scope: 'launch',
      sessionId,
      current: 0,
      total: 1,
      messageKey,
      status: 'active',
      meta,
    })
  }

  private interactiveReserved(): number {
    return Math.min(INTERACTIVE_RESERVED, this._concurrency)
  }

  private countActive(lane: DownloadLane): number {
    let n = 0
    for (const job of this.active.values()) {
      if (job.lane === lane) n += 1
    }
    return n
  }

  /** 空き枠のルール: interactive は常に予約枠＋余剰を使える。bulk は予約以外＋interactive 待ちが無い余剰 */
  private canStart(lane: DownloadLane): boolean {
    if (this.active.size >= this._concurrency) return false
    const reserved = this.interactiveReserved()
    const bulkCap = this._concurrency - reserved
    const activeInteractive = this.countActive('interactive')
    const activeBulk = this.countActive('bulk')
    const hasQueuedInteractive = this.queued.some((j) => j.lane === 'interactive')

    if (lane === 'interactive') {
      return this.active.size < this._concurrency
    }
    // bulk: 通常は bulkCap まで。interactive 待ちが無ければ予約枠も埋めてよい
    if (activeBulk < bulkCap) return true
    if (!hasQueuedInteractive && activeInteractive < reserved) {
      return this.active.size < this._concurrency
    }
    return false
  }

  private takeNextRunnable(): InternalJob | undefined {
    // interactive を優先して拾い、だめなら bulk
    for (const lane of ['interactive', 'bulk'] as const) {
      if (!this.canStart(lane)) continue
      const idx = this.queued.findIndex((j) => j.lane === lane)
      if (idx < 0) continue
      const [job] = this.queued.splice(idx, 1)
      return job
    }
    return undefined
  }

  private pump(): void {
    while (this.active.size < this._concurrency && this.queued.length > 0) {
      const job = this.takeNextRunnable()
      if (!job) return
      this.active.set(job.id, job)
      void this.run(job)
    }
  }

  private async run(job: InternalJob): Promise<void> {
    job.status = 'active'
    job.startedAt = Date.now()
    this.emitJobProgress(job, job.labelKey, true)

    const ctx: DownloadContext = {
      jobId: job.id,
      signal: job.abort.signal,
      setKind: (kind) => {
        job.kind = kind
      },
      report: (update) => {
        if (update.meta) job.meta = { ...job.meta, ...update.meta }
        job.progress = {
          current: update.current ?? job.progress.current,
          total: update.total ?? job.progress.total,
          unit: update.unit ?? job.progress.unit,
          bytesPerSecond: update.bytesPerSecond ?? job.progress.bytesPerSecond,
        }
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
      this.active.delete(job.id)
      this.emitJobProgress(job, job.labelKey, true)
      this.pump()
    }
  }

  private emitJobProgress(job: InternalJob, messageKey?: string, force = false): void {
    const now = Date.now()
    if (!force && now - job.lastEmitAt < 160 && job.progress.total > 0) {
      return
    }
    job.lastEmitAt = now
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
      status: job.status,
      meta: { unit: job.progress.unit, status: job.status, ...(job.meta ?? {}) },
    })
  }
}
