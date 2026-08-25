import { useEffect, useRef, useState } from 'react'
import { fledgeApi } from '../../api/fledgeApi'

/**
 * ウィンドウ端ドラッグ中に現在サイズを右下へ表示する。
 */
export function WindowSizeHud() {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const hideTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    return fledgeApi.on.windowSize((next) => {
      setSize(next)
      window.clearTimeout(hideTimer.current)
      hideTimer.current = window.setTimeout(() => setSize(null), 900)
    })
  }, [])

  useEffect(() => () => window.clearTimeout(hideTimer.current), [])

  if (!size) return null

  return (
    <div
      className="pointer-events-none fixed right-3 bottom-3 z-[200] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-2.5 py-1.5 font-mono text-xs tabular-nums text-[var(--color-text)] shadow-sm"
      aria-live="polite"
    >
      {size.width} × {size.height}
    </div>
  )
}
