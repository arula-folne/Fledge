import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MEMORY_GC_WARN_ABOVE_MB,
  MEMORY_PRESETS_MB,
  MEMORY_PRESETS_NORMAL_MB,
} from '@fledge/shared'

type Props = {
  value: number
  onChange: (value: number) => void
  label: string
  hint?: string
}

const PRESETS: number[] = [...MEMORY_PRESETS_MB]
const NORMAL: number[] = [...MEMORY_PRESETS_NORMAL_MB]
const MIN_MB = PRESETS[0]!
const MAX_MB = PRESETS[PRESETS.length - 1]!
const NORMAL_SET = new Set<number>(MEMORY_PRESETS_NORMAL_MB)
/** 通常レンジの末尾（24GB）をトラック中央に置く */
const NORMAL_END_RATIO = 0.5
/** iOS 風：離すと最近傍の刻みへ、つまみは spring で追いつく */
const SPRING = 'left 420ms cubic-bezier(0.22, 1, 0.36, 1), width 420ms cubic-bezier(0.22, 1, 0.36, 1)'

function clampMb(raw: number): number {
  return Math.min(MAX_MB, Math.max(MIN_MB, Math.round(raw)))
}

/**
 * レイアウト: 〇--〇--〇--〇--〇--〇--〇(24GB)-----〇(48GB)
 * 通常刻みは 0〜50% に均等、拡張は 50〜100%
 */
function presetRatio(index: number): number {
  const mb = PRESETS[index]
  if (mb === undefined) return 0
  const normalIdx = NORMAL.indexOf(mb as (typeof NORMAL)[number])
  if (normalIdx >= 0) {
    const last = NORMAL.length - 1
    if (last <= 0) return 0
    return (normalIdx / last) * NORMAL_END_RATIO
  }
  // 拡張刻みは 24GB〜100% を均等分割
  const ext = PRESETS.filter((p) => !NORMAL_SET.has(p))
  const extIdx = ext.indexOf(mb)
  if (extIdx < 0) return 1
  const steps = ext.length
  return NORMAL_END_RATIO + ((extIdx + 1) / steps) * (1 - NORMAL_END_RATIO)
}

function ratioFromValue(value: number): number {
  const v = clampMb(value)
  for (let i = 0; i < PRESETS.length - 1; i++) {
    const a = PRESETS[i]!
    const b = PRESETS[i + 1]!
    if (v >= a && v <= b) {
      const t = b === a ? 0 : (v - a) / (b - a)
      return presetRatio(i) + t * (presetRatio(i + 1) - presetRatio(i))
    }
  }
  return v <= MIN_MB ? 0 : 1
}

function valueFromRatio(ratio: number): number {
  const r = Math.min(1, Math.max(0, ratio))
  const last = PRESETS.length - 1
  for (let i = 0; i < last; i++) {
    const a = presetRatio(i)
    const b = presetRatio(i + 1)
    if (r >= a && r <= b) {
      const t = b === a ? 0 : (r - a) / (b - a)
      return clampMb(PRESETS[i]! + t * (PRESETS[i + 1]! - PRESETS[i]!))
    }
  }
  return MAX_MB
}

/** スナップ地点との距離（トラック比率）がこれ以下なら吸着 */
const SNAP_RATIO_EPS = 0.028

function nearestPreset(value: number): number {
  const v = clampMb(value)
  let best = PRESETS[0]!
  let bestDist = Math.abs(v - best)
  for (const p of PRESETS) {
    const d = Math.abs(v - p)
    if (d < bestDist) {
      best = p
      bestDist = d
    }
  }
  return best
}

/** スナップ付近なら刻みへ、そうでなければ止めた位置の連続値 */
function resolveReleaseValue(raw: number): number {
  const free = clampMb(raw)
  const ratio = ratioFromValue(free)
  let best = PRESETS[0]!
  let bestDist = Math.abs(presetRatio(0) - ratio)
  for (let i = 1; i < PRESETS.length; i++) {
    const d = Math.abs(presetRatio(i) - ratio)
    if (d < bestDist) {
      best = PRESETS[i]!
      bestDist = d
    }
  }
  if (bestDist <= SNAP_RATIO_EPS) return best
  return free
}

function isOnPreset(mb: number, preset: number): boolean {
  return Math.abs(mb - preset) < 0.5
}

function formatMemory(mb: number): string {
  if (mb < 1024) return `${mb} MB`
  const gb = mb / 1024
  return Number.isInteger(gb) ? `${gb}.0 GB` : `${gb.toFixed(1)} GB`
}

function ratioAtClientX(track: HTMLDivElement, clientX: number): number {
  const rect = track.getBoundingClientRect()
  if (rect.width <= 0) return 0
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
}

export function MemorySnapSlider({ value, onChange, label, hint }: Props) {
  const { t } = useTranslation()
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  /** ドラッグ中の視覚位置（親へは飛ばさない） */
  const [dragRatio, setDragRatio] = useState<number | null>(null)
  /** 離した直後〜親の value が追いつくまで */
  const [optimisticMb, setOptimisticMb] = useState<number | null>(null)
  const [text, setText] = useState(String(value))

  const committed = clampMb(value)
  useEffect(() => {
    if (optimisticMb !== null && committed === optimisticMb) {
      setOptimisticMb(null)
    }
  }, [committed, optimisticMb])

  const displayMb = dragRatio !== null ? valueFromRatio(dragRatio) : (optimisticMb ?? committed)
  const visualRatio = dragRatio ?? ratioFromValue(displayMb)
  const dragging = dragRatio !== null
  const showGcWarn = displayMb > MEMORY_GC_WARN_ABOVE_MB

  useEffect(() => {
    if (!dragging) setText(String(Math.round(displayMb)))
  }, [displayMb, dragging])

  const commit = useCallback(
    (raw: number, mode: 'release' | 'exact' = 'release') => {
      const next = mode === 'exact' ? clampMb(raw) : resolveReleaseValue(raw)
      setOptimisticMb(next)
      setDragRatio(null)
      onChange(next)
    },
    [onChange],
  )

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const track = trackRef.current
    if (!track) return
    draggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    setOptimisticMb(null)
    setDragRatio(ratioAtClientX(track, e.clientX))
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !trackRef.current) return
    setDragRatio(ratioAtClientX(trackRef.current, e.clientX))
  }

  const finishPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const track = trackRef.current
    const ratio = track ? ratioAtClientX(track, e.clientX) : (dragRatio ?? ratioFromValue(committed))
    commit(valueFromRatio(ratio))
  }

  const percent = visualRatio * 100

  const marks = useMemo(
    () =>
      PRESETS.map((mb, i) => ({
        mb,
        left: presetRatio(i) * 100,
        extended: !NORMAL_SET.has(mb),
      })),
    [],
  )

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium text-[var(--color-text)]">{label}</span>
          <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={text}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, '')
              setText(digits)
              if (digits === '') return
              const n = Number(digits)
              if (Number.isFinite(n)) {
                setOptimisticMb(null)
                setDragRatio(ratioFromValue(clampMb(n)))
              }
            }}
            onBlur={() => {
              const n = Number(text.replace(/[^\d]/g, ''))
              if (!Number.isFinite(n) || n <= 0) {
                setDragRatio(null)
                setText(String(Math.round(committed)))
                return
              }
              commit(n)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            className="w-[5.5rem] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-2 py-1 text-left tabular-nums text-[var(--color-text)]"
            aria-label={label}
          />
          <span className="text-[var(--color-text-muted)]">MB</span>
        </div>
        <span className="ml-auto text-xl font-semibold tabular-nums tracking-tight text-[var(--color-text)]">
          {formatMemory(displayMb)}
        </span>
        </div>
        {hint ? (
          <p className="mt-1 text-xs font-normal text-[var(--color-text-muted)]">{hint}</p>
        ) : null}
      </div>

      <div>
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-valuemin={MIN_MB}
          aria-valuemax={MAX_MB}
          aria-valuenow={Math.round(displayMb)}
          aria-valuetext={formatMemory(displayMb)}
          aria-label={label}
          className="relative flex h-11 w-full cursor-grab items-center touch-none select-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishPointer}
          onPointerCancel={finishPointer}
          onKeyDown={(e) => {
            const idx = PRESETS.indexOf(nearestPreset(committed))
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              e.preventDefault()
              const next = PRESETS[Math.max(0, idx - 1)]
              if (next !== undefined) commit(next, 'exact')
            }
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              e.preventDefault()
              const next = PRESETS[Math.min(PRESETS.length - 1, idx + 1)]
              if (next !== undefined) commit(next, 'exact')
            }
            if (e.key === 'Home') {
              e.preventDefault()
              commit(MIN_MB, 'exact')
            }
            if (e.key === 'End') {
              e.preventDefault()
              commit(MAX_MB, 'exact')
            }
          }}
        >
          <div className="pointer-events-none absolute inset-x-0 h-2 overflow-hidden rounded-full bg-[var(--color-border)]">
            <div
              className="h-full rounded-full bg-[var(--color-accent)] will-change-[width]"
              style={{
                width: `${percent}%`,
                transition: dragging ? 'none' : SPRING,
              }}
            />
          </div>

          {marks.map((mark) => {
            const active = isOnPreset(displayMb, mark.mb)
            return (
              <button
                key={mark.mb}
                type="button"
                title={formatMemory(mark.mb)}
                aria-label={formatMemory(mark.mb)}
                tabIndex={-1}
                className={[
                  /* 見た目は小さく、現在位置の下ではポインタを取らない（つまみが掴めるように） */
                  'absolute z-[5] size-2.5 -translate-x-1/2 rounded-full border-2 transition-[transform,background-color,border-color] duration-200',
                  active ? 'pointer-events-none' : '',
                  active
                    ? 'scale-125 border-[var(--color-accent)] bg-[var(--color-accent)]'
                    : mark.extended
                      ? 'border-amber-500/80 bg-[var(--color-surface)]'
                      : 'border-[var(--color-accent)]/55 bg-[var(--color-surface)]',
                ].join(' ')}
                style={{ left: `${mark.left}%` }}
                onPointerDown={(ev) => ev.stopPropagation()}
                onClick={(ev) => {
                  ev.stopPropagation()
                  commit(mark.mb, 'exact')
                }}
              />
            )
          })}

          {/* 見た目の丸より大きいヒット領域（~44px）。イベントは親トラックへ bubble */}
          <div
            className="pointer-events-auto absolute z-20 flex size-11 -translate-x-1/2 items-center justify-center will-change-[left]"
            style={{
              left: `${percent}%`,
              transition: dragging ? 'none' : SPRING,
            }}
            aria-hidden
          >
            <div className="size-[18px] rounded-full border-2 border-[var(--color-accent)] bg-[var(--color-surface)] shadow-md" />
          </div>
        </div>

        <div className="relative mt-1.5 h-4 text-xs text-[var(--color-text-muted)]">
          <span className="absolute left-0 -translate-x-0">{formatMemory(MIN_MB)}</span>
          <span
            className="absolute -translate-x-1/2 text-[10px] opacity-90"
            style={{ left: `${NORMAL_END_RATIO * 100}%` }}
          >
            {formatMemory(MEMORY_GC_WARN_ABOVE_MB)}
          </span>
          <span className="absolute right-0 translate-x-0">{formatMemory(MAX_MB)}</span>
        </div>
      </div>

      {showGcWarn ? (
        <p
          className="rounded-[var(--radius-sm)] px-3 py-2 text-xs font-semibold leading-relaxed"
          style={{ backgroundColor: '#ffcece', color: '#ea553a' }}
        >
          {t('settings.memoryGcWarn')}
        </p>
      ) : null}
    </div>
  )
}
