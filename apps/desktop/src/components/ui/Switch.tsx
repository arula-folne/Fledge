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

/**
 * iPhone 風トグル。クリックと左右スワイプの両方に対応。
 *
 * ずれ対策:
 * - トラック寸法を固定し、つまみは left で止める（静止時に transform を使わない）
 * - ドラッグ中だけ translateX。終了時は必ずクリア
 * - 楽観的 UI は親の checked 反映 or タイムアウトで必ず解除
 */
export function Switch({ checked, onChange, disabled, 'aria-label': ariaLabel }: Props) {
  const draggingRef = useRef(false)
  const startXRef = useRef(0)
  const startCheckedRef = useRef(checked)
  const movedRef = useRef(false)
  /** ドラッグ中のつまみ位置（0〜TRAVEL）。null = 通常表示 */
  const [dragX, setDragX] = useState<number | null>(null)
  const [optimistic, setOptimistic] = useState<boolean | null>(null)

  const visual = optimistic ?? checked

  useEffect(() => {
    if (optimistic === null) return
    if (checked === optimistic) {
      setOptimistic(null)
      return
    }
    // mutation 失敗などで親が反映しない場合に取り残さない
    const timer = window.setTimeout(() => setOptimistic(null), 1800)
    return () => window.clearTimeout(timer)
  }, [checked, optimistic])

  const commit = useCallback(
    (next: boolean) => {
      if (disabled) return
      if (next === (optimistic ?? checked)) return
      setOptimistic(next)
      onChange(next)
    },
    [checked, disabled, onChange, optimistic],
  )

  const thumbBase = visual ? TRAVEL : 0
  const thumbX = Math.round(dragX !== null ? dragX : thumbBase)
  const dragging = dragX !== null

  const endDrag = () => {
    draggingRef.current = false
    setDragX(null)
  }

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
    const delta = e.clientX - startXRef.current
    const origin = startCheckedRef.current ? TRAVEL : 0
    const x = Math.min(TRAVEL, Math.max(0, origin + delta))
    const didMove = movedRef.current
    const startChecked = startCheckedRef.current

    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    endDrag()

    if (!didMove) {
      commit(!startChecked)
      return
    }
    commit(x >= TRAVEL / 2)
  }

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      style={{ width: TRACK_W, height: TRACK_H, minWidth: TRACK_W, minHeight: TRACK_H }}
    >
      <button
        type="button"
        role="switch"
        aria-checked={visual}
        aria-label={ariaLabel}
        disabled={disabled}
        className={[
          'relative box-border block shrink-0 touch-none select-none overflow-hidden rounded-full p-0',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]',
          disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
        ].join(' ')}
        style={{
          width: TRACK_W,
          height: TRACK_H,
          minWidth: TRACK_W,
          maxWidth: TRACK_W,
          backgroundColor: visual ? 'var(--color-accent)' : 'rgba(120, 120, 128, 0.32)',
          transition: dragging ? 'none' : 'background-color 280ms ease',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onLostPointerCapture={() => {
          if (draggingRef.current) endDrag()
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.22),0_1px_1px_rgba(0,0,0,0.12)]"
          style={{
            top: PAD,
            width: THUMB,
            height: THUMB,
            // 静止時は left のみ（サブピクセルずれしにくい）。ドラッグ中だけ translateX
            left: PAD + (dragging ? 0 : thumbX),
            transform: dragging ? `translateX(${thumbX}px)` : 'none',
            transition: dragging
              ? 'none'
              : 'left 320ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </button>
    </span>
  )
}
