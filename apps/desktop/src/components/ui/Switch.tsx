import { useCallback, useEffect, useRef, useState } from 'react'

type Props = {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  'aria-label'?: string
}

const TRACK_W = 45
const TRACK_H = 27
const THUMB = 23
const PAD = 2
const TRAVEL = TRACK_W - THUMB - PAD * 2
const SPRING = 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1), background-color 280ms ease'

/**
 * iPhone 風トグル。クリックと左右スワイプの両方に対応。
 */
export function Switch({ checked, onChange, disabled, 'aria-label': ariaLabel }: Props) {
  const trackRef = useRef<HTMLButtonElement>(null)
  const draggingRef = useRef(false)
  const startXRef = useRef(0)
  const startCheckedRef = useRef(checked)
  const movedRef = useRef(false)
  /** ドラッグ中のつまみ位置（0〜TRAVEL）。null = 通常表示 */
  const [dragX, setDragX] = useState<number | null>(null)
  const [optimistic, setOptimistic] = useState<boolean | null>(null)

  const visual = optimistic ?? checked

  useEffect(() => {
    if (optimistic !== null && checked === optimistic) {
      setOptimistic(null)
    }
  }, [checked, optimistic])

  const commit = useCallback(
    (next: boolean) => {
      if (disabled) return
      if (next === checked && optimistic === null) return
      setOptimistic(next)
      onChange(next)
    },
    [checked, disabled, onChange, optimistic],
  )

  const thumbBase = visual ? TRAVEL : 0
  const thumbX = dragX !== null ? dragX : thumbBase
  const dragging = dragX !== null

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return
    e.preventDefault()
    draggingRef.current = true
    movedRef.current = false
    startXRef.current = e.clientX
    startCheckedRef.current = visual
    setDragX(visual ? TRAVEL : 0)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return
    const delta = e.clientX - startXRef.current
    if (Math.abs(delta) > 2) movedRef.current = true
    const origin = startCheckedRef.current ? TRAVEL : 0
    const next = Math.min(TRAVEL, Math.max(0, origin + delta))
    setDragX(next)
  }

  const finishPointer = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }

    const delta = e.clientX - startXRef.current
    const origin = startCheckedRef.current ? TRAVEL : 0
    const x = Math.min(TRAVEL, Math.max(0, origin + delta))
    setDragX(null)

    if (!movedRef.current) {
      // クリック／タップ → トグル
      commit(!startCheckedRef.current)
      return
    }

    // スワイプ → 中点で判定（動かした方向にも少し感度）
    const next = x >= TRAVEL / 2
    commit(next)
  }

  return (
    <button
      ref={trackRef}
      type="button"
      role="switch"
      aria-checked={visual}
      aria-label={ariaLabel}
      disabled={disabled}
      className={[
        'relative shrink-0 touch-none select-none rounded-full p-0',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]',
        disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
      ].join(' ')}
      style={{
        width: TRACK_W,
        height: TRACK_H,
        backgroundColor: visual ? 'var(--color-accent)' : 'rgba(120, 120, 128, 0.32)',
        transition: dragging ? 'none' : SPRING,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute top-[2px] left-[2px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.22),0_1px_1px_rgba(0,0,0,0.12)] will-change-transform"
        style={{
          width: THUMB,
          height: THUMB,
          transform: `translateX(${thumbX}px)`,
          transition: dragging ? 'none' : SPRING,
        }}
      />
    </button>
  )
}
