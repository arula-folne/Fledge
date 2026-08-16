import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconChevronRight, IconPalette } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import {
  applyThemeColor,
  cancelThemeColorPreview,
  scheduleThemeColorPreview,
  themeColorSwatchPreview,
} from '../../styles/theme'
import { Dialog } from './Dialog'

type ThemeColor = { r: number; g: number; b: number }

type Props = {
  value: ThemeColor
  /** クリック確定時のみ。IPC・設定保存は親側 */
  onChange: (value: ThemeColor) => void
  title: string
}

/** ニュートラル + 代表色 */
const PRESET_SWATCHES: ThemeColor[] = [
  { r: 255, g: 255, b: 255 },
  { r: 232, g: 236, b: 241 },
  { r: 180, g: 188, b: 198 },
  { r: 90, g: 98, b: 110 },
  { r: 34, g: 40, b: 49 },
  { r: 0, g: 0, b: 0 },
  { r: 91, g: 164, b: 217 },
  { r: 46, g: 196, b: 182 },
  { r: 255, g: 159, b: 28 },
  { r: 255, g: 77, b: 109 },
  { r: 123, g: 44, b: 191 },
  { r: 47, g: 111, b: 168 },
]

const HUE_STEPS = 12
const LIGHT_STEPS = [92, 78, 64, 48, 34, 22] as const

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

/** HSL → RGB（h: 0–360, s/l: 0–100） */
function hslToRgb(h: number, s: number, l: number): ThemeColor {
  const S = s / 100
  const L = l / 100
  const C = (1 - Math.abs(2 * L - 1)) * S
  const Hp = (((h % 360) + 360) % 360) / 60
  const X = C * (1 - Math.abs((Hp % 2) - 1))
  let r1 = 0
  let g1 = 0
  let b1 = 0
  if (Hp < 1) [r1, g1, b1] = [C, X, 0]
  else if (Hp < 2) [r1, g1, b1] = [X, C, 0]
  else if (Hp < 3) [r1, g1, b1] = [0, C, X]
  else if (Hp < 4) [r1, g1, b1] = [0, X, C]
  else if (Hp < 5) [r1, g1, b1] = [X, 0, C]
  else [r1, g1, b1] = [C, 0, X]
  const m = L - C / 2
  return {
    r: clampByte((r1 + m) * 255),
    g: clampByte((g1 + m) * 255),
    b: clampByte((b1 + m) * 255),
  }
}

function buildGradientGrid(): ThemeColor[] {
  const cells: ThemeColor[] = []
  for (const light of LIGHT_STEPS) {
    for (let i = 0; i < HUE_STEPS; i++) {
      const hue = (i / HUE_STEPS) * 360
      const sat = light >= 78 ? 55 : light <= 34 ? 72 : 68
      cells.push(hslToRgb(hue, sat, light))
    }
  }
  return cells
}

const GRADIENT_GRID = buildGradientGrid()

/**
 * 入口チップをクリック → ぼかし付きポップアップでパレット表示。
 * ホバーで仮プレビュー、クリックで確定して閉じる。
 * ライト／ダークは色の明るさから自動判定。
 */
export const ThemeColorPicker = memo(function ThemeColorPicker({ value, onChange, title }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const draftRef = useRef(value)
  const lastCommittedRef = useRef(value)
  const draggingRef = useRef(false)
  const chipRef = useRef<HTMLSpanElement>(null)
  const popupChipRef = useRef<HTMLSpanElement>(null)
  const hexRef = useRef<HTMLInputElement>(null)
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
    if (popupChipRef.current) popupChipRef.current.style.background = hex
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

  const preview = useCallback(
    (next: ThemeColor) => {
      const normalized = normalize(next)
      draftRef.current = normalized
      syncDom(normalized)
      scheduleThemeColorPreview(normalized)
    },
    [syncDom],
  )

  const commit = useCallback(
    (next: ThemeColor, closeAfter = false) => {
      const normalized = normalize(next)
      draggingRef.current = false
      draftRef.current = normalized
      syncDom(normalized)
      applyThemeColor(normalized)
      if (!sameColor(normalized, lastCommittedRef.current)) {
        lastCommittedRef.current = normalized
        onChange(normalized)
      }
      if (closeAfter) setOpen(false)
    },
    [onChange, syncDom],
  )

  const closeWithoutCommit = useCallback(() => {
    cancelThemeColorPreview()
    const restored = lastCommittedRef.current
    draftRef.current = restored
    syncDom(restored)
    applyThemeColor(restored)
    setOpen(false)
  }, [syncDom])

  const selectedHex = useMemo(() => toHex(value), [value.r, value.g, value.b])
  const menuTitle = t('settings.themeColorMenu')
  const changeLabel = t('settings.themeColorChange')

  const openMenu = useCallback(() => {
    draftRef.current = value
    lastCommittedRef.current = value
    syncDom(value)
    applyThemeColor(value)
    setOpen(true)
  }, [syncDom, value])

  return (
    <>
      <button
        type="button"
        title={changeLabel}
        aria-label={changeLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={[
          'flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)]',
          'bg-[var(--color-surface)] px-4 py-3 text-left transition',
          'hover:bg-[var(--color-hover)]',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]',
        ].join(' ')}
        onClick={openMenu}
      >
        <IconPalette size={18} stroke={1.75} className="shrink-0 text-[var(--color-text-muted)]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-[var(--color-text)]">{title}</h3>
            <span className="text-[var(--color-text-muted)]" aria-hidden>
              |
            </span>
            <span
              ref={chipRef}
              className="size-4 shrink-0 rounded-full border border-black/15 shadow-inner"
              style={{ background: toHex(value) }}
              aria-hidden
            />
          </div>
          <p className="mt-0.5 font-mono text-xs tabular-nums text-[var(--color-text-muted)]">
            {selectedHex}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--color-text-muted)]">
          {changeLabel}
          <IconChevronRight size={16} stroke={1.75} aria-hidden />
        </span>
      </button>

      <Dialog
        open={open}
        title={menuTitle}
        onClose={closeWithoutCommit}
        size="sm"
        backdrop="soft"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              ref={popupChipRef}
              className="size-9 shrink-0 rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-inner"
              style={{ background: toHex(value) }}
              aria-hidden
            />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[11px] text-[var(--color-text-muted)]">カラーコード</p>
              <input
                ref={hexRef}
                type="text"
                defaultValue={toHex(value)}
                spellCheck={false}
                className="w-[6.5rem] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-2 py-1 font-mono text-xs tabular-nums text-[var(--color-text)]"
                onBlur={(e) => {
                  const next = fromHex(e.currentTarget.value)
                  if (next) commit(next)
                  else e.currentTarget.value = toHex(draftRef.current)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] text-[var(--color-text-muted)]">{t('settings.themeColorPresets')}</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_SWATCHES.map((swatch) => {
                const hex = toHex(swatch)
                const selected = hex.toLowerCase() === toHex(draftRef.current).toLowerCase()
                return (
                  <button
                    key={hex}
                    type="button"
                    title={hex}
                    aria-label={hex}
                    aria-pressed={selected}
                    className={[
                      'size-6 rounded-md border transition',
                      selected
                        ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/50'
                        : 'border-black/15 hover:scale-105',
                    ].join(' ')}
                    style={{ background: themeColorSwatchPreview(swatch) }}
                    onPointerEnter={() => preview(swatch)}
                    onClick={() => commit(swatch, true)}
                  />
                )
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] text-[var(--color-text-muted)]">{t('settings.themeColorPalette')}</p>
            <div
              className="grid gap-0.5 rounded-[var(--radius-sm)] p-0.5"
              style={{
                gridTemplateColumns: `repeat(${HUE_STEPS}, minmax(0, 1fr))`,
                background:
                  'linear-gradient(90deg, #ff5a5a, #ffb347, #ffe066, #7dffb3, #66d9ef, #748ffc, #da77f2, #ff5a5a)',
              }}
            >
              {GRADIENT_GRID.map((cell, idx) => {
                const hex = toHex(cell)
                return (
                  <button
                    key={`${idx}-${hex}`}
                    type="button"
                    title={hex}
                    aria-label={hex}
                    className="aspect-square min-h-4 rounded-[2px] border border-black/10 transition hover:brightness-110 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-white/80"
                    style={{ background: themeColorSwatchPreview(cell) }}
                    onPointerEnter={() => preview(cell)}
                    onClick={() => commit(cell, true)}
                  />
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] text-[var(--color-text-muted)]">{t('settings.themeColorRgb')}</p>
            {(['r', 'g', 'b'] as const).map((channel) => (
              <label key={channel} className="flex items-center gap-2 text-xs">
                <span className="w-4 font-medium uppercase text-[var(--color-text-muted)]">{channel}</span>
                <input
                  ref={rangeRef(channel)}
                  type="range"
                  min={0}
                  max={255}
                  step={1}
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
                  className="w-11 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-1.5 py-0.5 text-right tabular-nums text-[var(--color-text)]"
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
      </Dialog>
    </>
  )
})
