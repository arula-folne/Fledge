import { memo, useCallback, useEffect, useRef } from 'react'
import { IconPalette } from '@tabler/icons-react'
import {
  applyThemeColor,
  cancelThemeColorPreview,
  scheduleThemeColorPreview,
} from '../../styles/theme'

type ThemeColor = { r: number; g: number; b: number }

type Props = {
  value: ThemeColor
  /** pointerup / 確定時のみ。IPC・設定保存は親側 */
  onChange: (value: ThemeColor) => void
  title: string
}

const SWATCHES: ThemeColor[] = [
  { r: 255, g: 255, b: 255 },
  { r: 0, g: 0, b: 0 },
  { r: 232, g: 244, b: 252 },
  { r: 91, g: 164, b: 217 },
  { r: 47, g: 111, b: 168 },
  { r: 46, g: 196, b: 182 },
  { r: 255, g: 159, b: 28 },
  { r: 255, g: 77, b: 109 },
  { r: 123, g: 44, b: 191 },
  { r: 34, g: 40, b: 49 },
  { r: 27, g: 34, b: 48 },
  { r: 250, g: 248, b: 245 },
]

function clampByte(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(255, Math.max(0, Math.round(n)))
}

function toHex({ r, g, b }: ThemeColor): string {
  const h = (n: number) => clampByte(n).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function fromHex(hex: string): ThemeColor | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = Number.parseInt(m[1]!, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function sameColor(a: ThemeColor, b: ThemeColor): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b
}

function normalize(c: ThemeColor): ThemeColor {
  return { r: clampByte(c.r), g: clampByte(c.g), b: clampByte(c.b) }
}

/**
 * ドラッグ中は React state / IPC を触らず、
 * CSS 変数プレビュー（RAF）＋ローカル DOM だけ更新する。
 */
export const ThemeColorPicker = memo(function ThemeColorPicker({ value, onChange, title }: Props) {
  const draftRef = useRef(value)
  const lastCommittedRef = useRef(value)
  const draggingRef = useRef(false)
  const chipRef = useRef<HTMLSpanElement>(null)
  const chipMiniRef = useRef<HTMLSpanElement>(null)
  const hexRef = useRef<HTMLInputElement>(null)
  const colorInputRef = useRef<HTMLInputElement>(null)
  const rangeRRef = useRef<HTMLInputElement>(null)
  const rangeGRef = useRef<HTMLInputElement>(null)
  const rangeBRef = useRef<HTMLInputElement>(null)
  const rgbRRef = useRef<HTMLInputElement>(null)
  const rgbGRef = useRef<HTMLInputElement>(null)
  const rgbBRef = useRef<HTMLInputElement>(null)

  const rangeRef = (ch: 'r' | 'g' | 'b') =>
    ch === 'r' ? rangeRRef : ch === 'g' ? rangeGRef : rangeBRef
  const rgbTextRef = (ch: 'r' | 'g' | 'b') => (ch === 'r' ? rgbRRef : ch === 'g' ? rgbGRef : rgbBRef)

  const syncDom = useCallback((c: ThemeColor) => {
    const hex = toHex(c)
    if (chipRef.current) chipRef.current.style.background = hex
    if (chipMiniRef.current) chipMiniRef.current.style.background = hex
    if (colorInputRef.current) colorInputRef.current.value = hex
    if (hexRef.current && document.activeElement !== hexRef.current) {
      hexRef.current.value = hex
    }
    for (const ch of ['r', 'g', 'b'] as const) {
      const range = rangeRef(ch).current
      if (range && document.activeElement !== range) range.value = String(c[ch])
      const text = rgbTextRef(ch).current
      if (text && document.activeElement !== text) text.value = String(c[ch])
    }
  }, [])

  useEffect(() => {
    if (draggingRef.current) return
    draftRef.current = value
    lastCommittedRef.current = value
    syncDom(value)
  }, [value.r, value.g, value.b, syncDom])

  useEffect(() => () => cancelThemeColorPreview(), [])

  /** ドラッグ中: DOM + CSS 変数のみ（setState なし） */
  const preview = useCallback(
    (next: ThemeColor) => {
      const normalized = normalize(next)
      draftRef.current = normalized
      syncDom(normalized)
      scheduleThemeColorPreview(normalized)
    },
    [syncDom],
  )

  /** 確定: フルテーマ CSS +（色が変わったときだけ）親へ保存 */
  const commit = useCallback(
    (next: ThemeColor) => {
      const normalized = normalize(next)
      draggingRef.current = false
      draftRef.current = normalized
      syncDom(normalized)
      applyThemeColor(normalized)
      if (!sameColor(normalized, lastCommittedRef.current)) {
        lastCommittedRef.current = normalized
        onChange(normalized)
      }
    },
    [onChange, syncDom],
  )

  return (
    <div className="space-y-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center gap-2">
        <IconPalette size={18} stroke={1.75} className="text-[var(--color-text-muted)]" />
        <h3 className="text-sm font-medium text-[var(--color-text)]">{title}</h3>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative block size-12 shrink-0 overflow-hidden rounded-full border border-[var(--color-border)] shadow-inner">
          <span
            ref={chipRef}
            className="pointer-events-none absolute inset-0"
            style={{ background: toHex(value) }}
            aria-hidden
          />
          <input
            ref={colorInputRef}
            type="color"
            defaultValue={toHex(value)}
            aria-label="color palette"
            className="absolute inset-0 cursor-pointer opacity-0"
            onPointerDown={() => {
              draggingRef.current = true
            }}
            onInput={(e) => {
              draggingRef.current = true
              const next = fromHex(e.currentTarget.value)
              if (next) preview(next)
            }}
            onChange={(e) => {
              const next = fromHex(e.target.value)
              if (next) commit(next)
            }}
            onBlur={() => commit(draftRef.current)}
          />
        </label>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs text-[var(--color-text-muted)]">カラーパレット</p>
          <div className="flex items-center gap-2">
            <input
              ref={hexRef}
              type="text"
              defaultValue={toHex(value)}
              spellCheck={false}
              className="w-[7.5rem] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-2 py-1.5 font-mono text-sm tabular-nums text-[var(--color-text)]"
              onBlur={(e) => {
                const next = fromHex(e.currentTarget.value)
                if (next) commit(next)
                else e.currentTarget.value = toHex(draftRef.current)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
            />
            <span
              ref={chipMiniRef}
              className="inline-block size-6 rounded-md border border-[var(--color-border)]"
              style={{ background: toHex(value) }}
              aria-hidden
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-[var(--color-text-muted)]">スウォッチ</p>
        <div className="flex flex-wrap gap-2">
          {SWATCHES.map((swatch) => (
            <button
              key={toHex(swatch)}
              type="button"
              title={toHex(swatch)}
              aria-label={toHex(swatch)}
              className="size-7 rounded-full border border-black/15"
              style={{ background: toHex(swatch) }}
              onClick={() => commit(swatch)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs text-[var(--color-text-muted)]">RGB（数値）</p>
        {(['r', 'g', 'b'] as const).map((channel) => (
          <label key={channel} className="flex items-center gap-3 text-sm">
            <span className="w-5 font-medium uppercase text-[var(--color-text-muted)]">{channel}</span>
            <input
              ref={rangeRef(channel)}
              type="range"
              min={0}
              max={255}
              defaultValue={value[channel]}
              className="min-w-0 flex-1 accent-[var(--color-accent)]"
              onPointerDown={() => {
                draggingRef.current = true
              }}
              onInput={(e) => {
                draggingRef.current = true
                preview({
                  ...draftRef.current,
                  [channel]: Number(e.currentTarget.value),
                })
              }}
              onPointerUp={() => commit(draftRef.current)}
              onPointerCancel={() => commit(draftRef.current)}
              onLostPointerCapture={() => {
                if (draggingRef.current) commit(draftRef.current)
              }}
            />
            <input
              ref={rgbTextRef(channel)}
              type="text"
              inputMode="numeric"
              defaultValue={String(value[channel])}
              className="w-14 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-2 py-1 text-right tabular-nums text-[var(--color-text)]"
              onBlur={(e) => {
                const n = Number(e.currentTarget.value.replace(/[^\d]/g, ''))
                if (!Number.isFinite(n)) {
                  e.currentTarget.value = String(draftRef.current[channel])
                  return
                }
                commit({ ...draftRef.current, [channel]: n })
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
            />
          </label>
        ))}
      </div>
    </div>
  )
})
