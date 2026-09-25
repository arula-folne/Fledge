import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export type SlidingPillRect = {
  top: number
  left: number
  width: number
  height: number
}

/**
 * メインサイドバーと同じ選択ピル追従。
 * - 項目切替: なめらかに移動
 * - レイアウト変化: ResizeObserver でサイズ追従（transition は一時オフ）
 */
export function useSlidingSelectionPill(activeId: string, layoutKey?: string | number | boolean) {
  const containerRef = useRef<HTMLElement | null>(null)
  const itemRefs = useRef<Record<string, HTMLElement | null>>({})
  const [pill, setPill] = useState<SlidingPillRect | null>(null)
  const [pillReady, setPillReady] = useState(false)

  const setItemRef = useCallback((id: string, el: HTMLElement | null) => {
    itemRefs.current[id] = el
  }, [])

  const updatePill = useCallback(() => {
    const container = containerRef.current
    const el = itemRefs.current[activeId]
    if (!container || !el) {
      setPill(null)
      return
    }
    const containerRect = container.getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    setPill({
      top: rect.top - containerRect.top + container.scrollTop,
      left: rect.left - containerRect.left + container.scrollLeft,
      width: rect.width,
      height: rect.height,
    })
  }, [activeId])

  useLayoutEffect(() => {
    updatePill()
    const el = itemRefs.current[activeId]
    const container = containerRef.current
    const ro = new ResizeObserver(() => updatePill())
    if (el) ro.observe(el)
    if (container) ro.observe(container)
    window.addEventListener('resize', updatePill)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updatePill)
    }
  }, [activeId, layoutKey, updatePill])

  useEffect(() => {
    setPillReady(true)
  }, [activeId])

  useLayoutEffect(() => {
    if (layoutKey === undefined) return
    setPillReady(false)
    updatePill()
    const timer = window.setTimeout(() => {
      updatePill()
      setPillReady(true)
    }, 180)
    return () => window.clearTimeout(timer)
  }, [layoutKey, updatePill])

  return { containerRef, setItemRef, pill, pillReady, updatePill }
}

export function SlidingSelectionPill({
  pill,
  ready,
}: {
  pill: SlidingPillRect | null
  ready: boolean
}) {
  if (!pill) return null
  return (
    <div
      aria-hidden
      className={[
        'pointer-events-none absolute top-0 left-0 rounded-[var(--radius-sm)] bg-[var(--color-selection-soft)]',
        ready
          ? 'transition-[transform,width,height] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none'
          : '',
      ].join(' ')}
      style={{
        width: pill.width,
        height: pill.height,
        transform: `translate3d(${pill.left}px, ${pill.top}px, 0)`,
      }}
    />
  )
}
