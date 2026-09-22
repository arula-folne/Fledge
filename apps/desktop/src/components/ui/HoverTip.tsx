import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'

const DEFAULT_DELAY_MS = 450

type Props = {
  label: string
  children: ReactElement<{
    ref?: Ref<HTMLElement>
    onPointerEnter?: (e: ReactPointerEvent) => void
    onPointerLeave?: (e: ReactPointerEvent) => void
    onPointerDown?: (e: ReactPointerEvent) => void
    'aria-describedby'?: string
  }>
  /** 表示までの待ち時間。すぐクリックされた場合は出さない */
  delayMs?: number
  disabled?: boolean
}

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (value: T | null) => {
    for (const ref of refs) {
      if (!ref) continue
      if (typeof ref === 'function') ref(value)
      else ref.current = value
    }
  }
}

/**
 * カーソルをしばらくかざしたときだけ出るホバーテキスト。
 * ディレイ前にクリック／離脱した場合は表示しない。
 */
export function HoverTip({
  label,
  children,
  delayMs = DEFAULT_DELAY_MS,
  disabled = false,
}: Props) {
  const tipId = useId()
  const anchorRef = useRef<HTMLElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const hide = useCallback(() => {
    clearTimer()
    setOpen(false)
    setPos(null)
  }, [clearTimer])

  const showAtAnchor = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const tipWidth = Math.min(16 * 16, window.innerWidth - 16)
    let left = rect.left + rect.width / 2
    left = Math.max(8 + tipWidth / 2, Math.min(left, window.innerWidth - 8 - tipWidth / 2))
    setPos({ top: rect.top - 8, left })
    setOpen(true)
  }, [])

  const scheduleShow = useCallback(() => {
    if (disabled || !label) return
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      showAtAnchor()
    }, delayMs)
  }, [clearTimer, delayMs, disabled, label, showAtAnchor])

  useEffect(() => () => clearTimer(), [clearTimer])

  useEffect(() => {
    if (!open) return
    const onScroll = () => hide()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, hide])

  const child = cloneElement(children, {
    ref: mergeRefs(anchorRef, children.props.ref),
    'aria-describedby': open ? tipId : children.props['aria-describedby'],
    onPointerEnter: (e: ReactPointerEvent) => {
      children.props.onPointerEnter?.(e)
      scheduleShow()
    },
    onPointerLeave: (e: ReactPointerEvent) => {
      children.props.onPointerLeave?.(e)
      hide()
    },
    onPointerDown: (e: ReactPointerEvent) => {
      children.props.onPointerDown?.(e)
      hide()
    },
  })

  return (
    <>
      {child}
      {open && pos
        ? createPortal(
            <div
              id={tipId}
              role="tooltip"
              className="pointer-events-none fixed z-[11010] max-w-[16rem] -translate-x-1/2 -translate-y-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] leading-snug text-[var(--color-text)] shadow-sm"
              style={{ top: pos.top, left: pos.left }}
            >
              {label}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
