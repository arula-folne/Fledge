/** 進捗イベントをジョブ単位で間引き、UI スレッドへの洪水を抑える */
import type { ProgressEvent } from '@fledge/shared'

function eventKey(e: ProgressEvent): string {
  return e.jobId ?? e.sessionId ?? `${e.scope}:${e.kind ?? ''}`
}

function isTerminal(e: ProgressEvent): boolean {
  const s = e.status
  return s === 'completed' || s === 'failed' || s === 'cancelled' || s === 'succeeded'
}

/**
 * 同一ジョブの進捗を intervalMs ごとにまとめて配送する。
 * 完了・失敗などは即時配送。
 */
export function createProgressThrottler(
  deliver: (e: ProgressEvent) => void,
  intervalMs = 120,
): (e: ProgressEvent) => void {
  const pending = new Map<string, ProgressEvent>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const flush = () => {
    timer = undefined
    if (pending.size === 0) return
    const batch = [...pending.values()]
    pending.clear()
    for (const ev of batch) deliver(ev)
  }

  return (e: ProgressEvent) => {
    const key = eventKey(e)
    if (isTerminal(e)) {
      pending.delete(key)
      deliver(e)
      return
    }
    pending.set(key, e)
    if (timer != null) return
    timer = setTimeout(flush, intervalMs)
  }
}
