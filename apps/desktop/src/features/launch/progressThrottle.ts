/** 進捗イベントをジョブ単位で間引き、UI スレッドへの洪水を抑える。
 * ゲーム系の定石: フォーカス外はシミュレーション更新を止め、復帰時に最新だけ反映。
 * 同一フレームに多ジョブを流しすぎない（フレーム予算）。
 */
import type { ProgressEvent } from '@fledge/shared'

function eventKey(e: ProgressEvent): string {
  return e.jobId ?? e.sessionId ?? `${e.scope}:${e.kind ?? ''}`
}

function isTerminal(e: ProgressEvent): boolean {
  const s = e.status
  return s === 'completed' || s === 'failed' || s === 'cancelled' || s === 'succeeded'
}

/** 1 フレームあたりに配送する進捗の上限（残りは次フレーム） */
const MAX_EVENTS_PER_FRAME = 4

/**
 * 同一ジョブの進捗を interval でまとめ、可能なら rAF で描画タイミングに合わせて配送する。
 * 完了・失敗などは即時配送。ウィンドウ非表示中は途中進捗を溜め、復帰時に最新だけ流す。
 */
export function createProgressThrottler(
  deliver: (e: ProgressEvent) => void,
  intervalMs = 200,
): (e: ProgressEvent) => void {
  const pending = new Map<string, ProgressEvent>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let raf: number | undefined
  let visibilityBound = false

  const flushSlice = () => {
    raf = undefined
    if (pending.size === 0) return

    // 非表示中は端末イベント以外を画面に出さない（復帰でまとめて反映）
    if (typeof document !== 'undefined' && document.hidden) {
      return
    }

    let delivered = 0
    for (const [key, ev] of pending) {
      pending.delete(key)
      deliver(ev)
      delivered += 1
      if (delivered >= MAX_EVENTS_PER_FRAME && pending.size > 0) {
        raf = requestAnimationFrame(flushSlice)
        return
      }
    }
  }

  const flush = () => {
    timer = undefined
    if (raf != null) {
      cancelAnimationFrame(raf)
      raf = undefined
    }
    if (pending.size === 0) return
    if (typeof requestAnimationFrame === 'function' && typeof document !== 'undefined' && !document.hidden) {
      raf = requestAnimationFrame(flushSlice)
      return
    }
    // hidden または rAF 不可: 端末以外は保留、端末は即時
    if (typeof document !== 'undefined' && document.hidden) {
      return
    }
    flushSlice()
  }

  const schedule = () => {
    if (typeof document !== 'undefined' && document.hidden) {
      // 復帰時にまとめて flush
      return
    }
    if (timer != null) return
    timer = setTimeout(flush, intervalMs)
  }

  const onVisibility = () => {
    if (typeof document === 'undefined' || document.hidden) return
    if (pending.size === 0) return
    schedule()
  }

  if (typeof document !== 'undefined' && !visibilityBound) {
    visibilityBound = true
    document.addEventListener('visibilitychange', onVisibility)
  }

  return (e: ProgressEvent) => {
    const key = eventKey(e)
    if (isTerminal(e)) {
      pending.delete(key)
      deliver(e)
      return
    }
    pending.set(key, e)
    schedule()
  }
}
