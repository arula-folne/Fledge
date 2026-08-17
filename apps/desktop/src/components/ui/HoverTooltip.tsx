import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const GAP = 8
const VIEW_PAD = 8

type Props = {
  content: ReactNode
  children: ReactNode
  disabled?: boolean
}

/**
 * 親の overflow に欠けないよう、document.body へ出して表示する。
 */
export function HoverTooltip({ content, children, disabled }: Props) {
  const triggerRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })

  const show = open && !disabled

  useLayoutEffect(() => {
    if (!show) return
    const trigger = triggerRef.current
    const tip = tipRef.current
    if (!trigger || !tip) return

    const place = () => {
      const r = trigger.getBoundingClientRect()
      const tw = tip.offsetWidth
      const th = tip.offsetHeight
      let left = r.left
      let top = r.top - th - GAP
      if (top < VIEW_PAD) top = r.bottom + GAP
      const maxLeft = window.innerWidth - VIEW_PAD - tw
      if (left > maxLeft) left = Math.max(VIEW_PAD, maxLeft)
      if (left < VIEW_PAD) left = VIEW_PAD
      setCoords((prev) => (prev.top === top && prev.left === left ? prev : { top, left }))
    }

    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [show, content])

  return (
    <div
      ref={triggerRef}
      className="inline-flex"
      onMouseEnter={() => {
        if (!disabled) setOpen(true)
      }}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => {
        if (!disabled) setOpen(true)
      }}
      onBlurCapture={() => setOpen(false)}
    >
      {children}
      {show
        ? createPortal(
            <div
              ref={tipRef}
              role="tooltip"
              className="pointer-events-none fixed z-[200] w-max max-w-[14rem] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 shadow-md"
              style={{ top: coords.top, left: coords.left }}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
