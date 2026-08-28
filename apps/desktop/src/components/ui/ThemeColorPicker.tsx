import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconChevronRight, IconDice, IconPalette } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import {
  applyThemeColor,
  contrastTextOnColor,
  type ThemeColorPair,
} from '../../styles/theme'
import { Dialog } from './Dialog'

type ThemeColor = { r: number; g: number; b: number }
type ColorRole = 'base' | 'accent'

type Props = {
  value: ThemeColorPair
  /** クリック確定時のみ。IPC・設定保存は親側 */
  onChange: (value: ThemeColorPair) => void
}

const HUE_STEPS = 12
const LIGHT_STEPS = [92, 78, 64, 48, 34, 22] as const
const FALLBACK_BASE = { r: 255, g: 255, b: 255 }
const FALLBACK_ACCENT = { r: 91, g: 164, b: 217 }

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

function normalize(c: ThemeColor): ThemeColor {
  return { r: clampByte(c.r), g: clampByte(c.g), b: clampByte(c.b) }
}

function normalizePair(pair: ThemeColorPair): ThemeColorPair {
  return { base: normalize(pair.base), accent: normalize(pair.accent) }
}

function normalizePairInput(value: ThemeColorPair | null | undefined): ThemeColorPair {
  return {
    base: normalize(value?.base ?? FALLBACK_BASE),
    accent: normalize(value?.accent ?? FALLBACK_ACCENT),
  }
}

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
      const sat = light >= 78 ? 68 : light <= 34 ? 78 : 74
      cells.push(hslToRgb(hue, sat, light))
    }
  }
  return cells
}

const GRADIENT_GRID = buildGradientGrid()

/** ベース / アクセントのプリセット（見た目で分かる組み合わせ） */
const COLOR_PAIR_PRESETS: ReadonlyArray<{ id: string; base: ThemeColor; accent: ThemeColor }> = [
  { id: 'snow-sky', base: { r: 255, g: 255, b: 255 }, accent: { r: 91, g: 164, b: 217 } },
  { id: 'paper-coral', base: { r: 248, g: 246, b: 242 }, accent: { r: 232, g: 112, b: 96 } },
  { id: 'mist-mint', base: { r: 236, g: 242, b: 238 }, accent: { r: 64, g: 168, b: 132 } },
  { id: 'cream-amber', base: { r: 250, g: 244, b: 230 }, accent: { r: 214, g: 148, b: 48 } },
  { id: 'lavender-violet', base: { r: 242, g: 238, b: 250 }, accent: { r: 132, g: 108, b: 214 } },
  { id: 'slate-blurple', base: { r: 30, g: 31, b: 34 }, accent: { r: 88, g: 101, b: 242 } },
  { id: 'charcoal-cyan', base: { r: 24, g: 28, b: 32 }, accent: { r: 64, g: 196, b: 210 } },
  { id: 'ink-rose', base: { r: 18, g: 18, b: 22 }, accent: { r: 232, g: 112, b: 152 } },
]

function sameColor(a: ThemeColor, b: ThemeColor): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b
}

function samePair(a: ThemeColorPair, b: ThemeColorPair): boolean {
  return sameColor(a.base, b.base) && sameColor(a.accent, b.accent)
}

const PaletteGrid = memo(function PaletteGrid({
  onPreview,
  onCommit,
  onPreviewEnd,
}: {
  onPreview: (color: ThemeColor) => void
  onCommit: (color: ThemeColor) => void
  onPreviewEnd: () => void
}) {
  return (
    <div
      className="grid max-w-[22rem] gap-0.5 rounded-[var(--radius-sm)] p-0.5"
      style={{
        gridTemplateColumns: `repeat(${HUE_STEPS}, minmax(0, 1fr))`,
        background:
          'linear-gradient(90deg, #ff5a5a, #ffb347, #ffe066, #7dffb3, #66d9ef, #748ffc, #da77f2, #ff5a5a)',
      }}
      onPointerLeave={onPreviewEnd}
    >
      {GRADIENT_GRID.map((cell, idx) => {
        const hex = toHex(cell)
        return (
          <button
            key={`${idx}-${hex}`}
            type="button"
            aria-label={hex}
            className="aspect-square min-h-0 rounded-[1px] border border-black/10 transition hover:brightness-110 focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-white/80"
            style={{ background: hex }}
            onPointerEnter={() => onPreview(cell)}
            onPointerDown={(e) => {
              e.preventDefault()
              onCommit(cell)
            }}
          />
        )
      })}
    </div>
  )
})

function randomThemeColor(): ThemeColor {
  return hslToRgb(Math.random() * 360, 52 + Math.random() * 38, 32 + Math.random() * 42)
}

type PreviewProps = {
  pair: ThemeColorPair
  role: ColorRole
  onSelectRole: (role: ColorRole) => void
}

/** 小さなウィンドウ風プレビュー（クリックでベース／アクセント切替） */
function ThemeColorPreview({ pair, role, onSelectRole }: PreviewProps) {
  const { t } = useTranslation()
  const base = toHex(pair.base)
  const accent = toHex(pair.accent)
  const darkBase = contrastTextOnColor(pair.base) === '#ffffff'
  const mutedFg = darkBase ? 'rgba(243,244,246,0.65)' : 'rgba(31,41,55,0.55)'
  const onAccent = contrastTextOnColor(pair.accent)
  const chrome = darkBase ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'
  const baseSelected = role === 'base'
  const accentSelected = role === 'accent'

  return (
    <div
      className={[
        'w-[7.5rem] shrink-0 overflow-hidden rounded-[10px] border shadow-sm transition',
        baseSelected
          ? 'border-[var(--color-selection)] ring-2 ring-[var(--color-selection)]/40'
          : 'border-[var(--color-border)]',
      ].join(' ')}
      style={{ background: base }}
      aria-label={t('settings.themeColorPreview')}
    >
      <button
        type="button"
        className="flex w-full items-center gap-1 border-b px-1.5 py-1 text-left"
        style={{ borderColor: chrome, background: chrome }}
        aria-pressed={baseSelected}
        onClick={() => onSelectRole('base')}
      >
        <span className="size-1 rounded-full bg-[#ff5f57]" aria-hidden />
        <span className="size-1 rounded-full bg-[#febc2e]" aria-hidden />
        <span className="size-1 rounded-full bg-[#28c840]" aria-hidden />
      </button>
      <button
        type="button"
        className="w-full space-y-1 px-1.5 py-1.5 text-left"
        aria-pressed={baseSelected}
        onClick={() => onSelectRole('base')}
      >
        <div className="h-1 w-3/5 rounded-sm" style={{ background: mutedFg }} />
        <div className="h-1 w-full rounded-sm" style={{ background: chrome }} />
      </button>
      <div className="px-1.5 pb-1.5">
        <button
          type="button"
          className={[
            'inline-flex rounded-[5px] px-1.5 py-0.5 text-[8px] font-semibold',
            accentSelected ? 'outline outline-1 outline-offset-1 outline-[var(--color-selection)]' : '',
          ].join(' ')}
          style={{ background: accent, color: onAccent }}
          aria-pressed={accentSelected}
          onClick={(e) => {
            e.stopPropagation()
            onSelectRole('accent')
          }}
        >
          A
        </button>
      </div>
    </div>
  )
}

/**
 * 入口からカラーメニュー（ポップアップ）を開き、
 * プレビューでベース／アクセントを選んで色を決める。
 */
export const ThemeColorPicker = memo(function ThemeColorPicker({ value, onChange }: Props) {
  const { t } = useTranslation()
  const safeValue = useMemo(
    () => normalizePairInput(value),
    [
      value?.base?.r,
      value?.base?.g,
      value?.base?.b,
      value?.accent?.r,
      value?.accent?.g,
      value?.accent?.b,
    ],
  )
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<ColorRole>('base')
  /** ミニウィンドウ等のホバープレビュー用（全体テーマは commit 時） */
  const [previewPair, setPreviewPair] = useState(safeValue)
  /** ベース／アクセントの〇は確定色だけ表示 */
  const [committedPair, setCommittedPair] = useState(safeValue)
  const draftRef = useRef(safeValue)
  const lastCommittedRef = useRef(safeValue)
  const roleRef = useRef<ColorRole>('base')
  const draggingRef = useRef(false)
  const previewRafRef = useRef(0)
  const hexRef = useRef<HTMLInputElement>(null)
  const nativeRef = useRef<HTMLInputElement>(null)
  const rangeRRef = useRef<HTMLInputElement>(null)
  const rangeGRef = useRef<HTMLInputElement>(null)
  const rangeBRef = useRef<HTMLInputElement>(null)
  const rgbRRef = useRef<HTMLInputElement>(null)
  const rgbGRef = useRef<HTMLInputElement>(null)
  const rgbBRef = useRef<HTMLInputElement>(null)

  const rangeRef = (ch: 'r' | 'g' | 'b') =>
    ch === 'r' ? rangeRRef : ch === 'g' ? rangeGRef : rangeBRef
  const rgbTextRef = (ch: 'r' | 'g' | 'b') => (ch === 'r' ? rgbRRef : ch === 'g' ? rgbGRef : rgbBRef)

  const activeColor = (pair: ThemeColorPair, r: ColorRole) => (r === 'base' ? pair.base : pair.accent)

  const syncInputs = useCallback((pair: ThemeColorPair, r: ColorRole) => {
    const c = activeColor(pair, r)
    const hex = toHex(c)
    if (hexRef.current && document.activeElement !== hexRef.current) hexRef.current.value = hex
    if (nativeRef.current && document.activeElement !== nativeRef.current) nativeRef.current.value = hex
    for (const ch of ['r', 'g', 'b'] as const) {
      const range = rangeRef(ch).current
      if (range && document.activeElement !== range) range.value = String(c[ch])
      const text = rgbTextRef(ch).current
      if (text && document.activeElement !== text) text.value = String(c[ch])
    }
  }, [])

  const syncDom = useCallback(
    (pair: ThemeColorPair, r: ColorRole) => {
      setPreviewPair(pair)
      syncInputs(pair, r)
    },
    [syncInputs],
  )

  useEffect(() => {
    roleRef.current = role
  }, [role])

  // ダイアログを閉じているときだけ props と同期
  useEffect(() => {
    if (open) return
    draftRef.current = safeValue
    lastCommittedRef.current = safeValue
    setPreviewPair(safeValue)
    setCommittedPair(safeValue)
  }, [
    open,
    safeValue.base.r,
    safeValue.base.g,
    safeValue.base.b,
    safeValue.accent.r,
    safeValue.accent.g,
    safeValue.accent.b,
  ])

  useEffect(() => {
    if (!open) return
    syncInputs(draftRef.current, role)
  }, [open, role, syncInputs])

  useEffect(
    () => () => {
      if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current)
    },
    [],
  )

  const withRoleColor = useCallback((pair: ThemeColorPair, r: ColorRole, color: ThemeColor): ThemeColorPair => {
    return r === 'base' ? { ...pair, base: color } : { ...pair, accent: color }
  }, [])

  const discardPreview = useCallback(() => {
    if (previewRafRef.current) {
      cancelAnimationFrame(previewRafRef.current)
      previewRafRef.current = 0
    }
    const committed = lastCommittedRef.current
    draftRef.current = committed
    setPreviewPair(committed)
    syncInputs(committed, roleRef.current)
  }, [syncInputs])

  const preview = useCallback(
    (nextColor: ThemeColor) => {
      const r = roleRef.current
      const normalized = normalizePair(withRoleColor(lastCommittedRef.current, r, nextColor))
      draftRef.current = normalized
      syncInputs(normalized, r)
      if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current)
      previewRafRef.current = requestAnimationFrame(() => {
        previewRafRef.current = 0
        setPreviewPair(normalized)
      })
    },
    [syncInputs, withRoleColor],
  )

  const commit = useCallback(
    (nextColor: ThemeColor) => {
      const r = roleRef.current
      const normalized = normalizePair(withRoleColor(lastCommittedRef.current, r, nextColor))
      draggingRef.current = false
      draftRef.current = normalized
      lastCommittedRef.current = normalized
      if (previewRafRef.current) {
        cancelAnimationFrame(previewRafRef.current)
        previewRafRef.current = 0
      }
      setCommittedPair(normalized)
      syncDom(normalized, r)
      applyThemeColor(normalized)
      onChange(normalized)
    },
    [onChange, syncDom, withRoleColor],
  )

  const selectRole = useCallback(
    (next: ColorRole) => {
      if (previewRafRef.current) {
        cancelAnimationFrame(previewRafRef.current)
        previewRafRef.current = 0
      }
      const committed = lastCommittedRef.current
      draftRef.current = committed
      setPreviewPair(committed)
      setRole(next)
      roleRef.current = next
      syncInputs(committed, next)
    },
    [syncInputs],
  )

  const openMenu = useCallback(() => {
    draftRef.current = safeValue
    lastCommittedRef.current = safeValue
    setRole('base')
    roleRef.current = 'base'
    setPreviewPair(safeValue)
    setCommittedPair(safeValue)
    syncInputs(safeValue, 'base')
    setOpen(true)
  }, [safeValue, syncInputs])

  const closeMenu = useCallback(() => {
    if (previewRafRef.current) {
      cancelAnimationFrame(previewRafRef.current)
      previewRafRef.current = 0
    }
    const restored = lastCommittedRef.current
    draftRef.current = restored
    setPreviewPair(restored)
    setCommittedPair(restored)
    applyThemeColor(restored)
    setOpen(false)
  }, [])

  const randomizeAll = useCallback(() => {
    const next = normalizePair({
      base: randomThemeColor(),
      accent: randomThemeColor(),
    })
    draggingRef.current = false
    draftRef.current = next
    lastCommittedRef.current = next
    if (previewRafRef.current) {
      cancelAnimationFrame(previewRafRef.current)
      previewRafRef.current = 0
    }
    setCommittedPair(next)
    syncDom(next, roleRef.current)
    applyThemeColor(next)
    onChange(next)
  }, [onChange, syncDom])

  /** プリセット: ベースとアクセントをまとめて確定 */
  const commitPair = useCallback(
    (pair: ThemeColorPair) => {
      const normalized = normalizePair(pair)
      draggingRef.current = false
      draftRef.current = normalized
      lastCommittedRef.current = normalized
      if (previewRafRef.current) {
        cancelAnimationFrame(previewRafRef.current)
        previewRafRef.current = 0
      }
      setCommittedPair(normalized)
      syncDom(normalized, roleRef.current)
      applyThemeColor(normalized)
      onChange(normalized)
    },
    [onChange, syncDom],
  )

  const draftActive = activeColor(previewPair, role)

  return (
    <>
      <button
        type="button"
        aria-label={t('settings.themeColorChange')}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={[
          'flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)]',
          'bg-[var(--color-surface)] px-4 py-3 text-left transition',
          'hover:bg-[var(--color-hover)]',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-selection)]',
        ].join(' ')}
        onClick={openMenu}
      >
        <IconPalette size={18} stroke={1.75} className="shrink-0 text-[var(--color-text-muted)]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-[var(--color-text)]">{t('settings.themeColorMenu')}</h3>
            <span className="text-[var(--color-text-muted)]" aria-hidden>
              |
            </span>
            <span
              className="size-4 shrink-0 rounded-full border border-black/15 shadow-inner"
              style={{ background: toHex(safeValue.base) }}
              aria-hidden
            />
            <span
              className="size-4 shrink-0 rounded-full border border-black/15 shadow-inner"
              style={{ background: toHex(safeValue.accent) }}
              aria-hidden
            />
          </div>
          <p className="mt-0.5 font-mono text-xs tabular-nums text-[var(--color-text-muted)]">
            {toHex(safeValue.base)} · {toHex(safeValue.accent)}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--color-text-muted)]">
          {t('settings.themeColorChange')}
          <IconChevronRight size={16} stroke={1.75} aria-hidden />
        </span>
      </button>

      <Dialog
        open={open}
        title={t('settings.themeColorMenu')}
        onClose={closeMenu}
        size="lg"
        backdrop="soft"
        panelClassName="w-[min(94vw,40rem)]"
      >
        <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
          <div className="flex flex-col gap-3 sm:w-[11.5rem]">
            <ThemeColorPreview pair={previewPair} role={role} onSelectRole={selectRole} />
            <p className="text-[11px] leading-snug text-[var(--color-text-muted)]">
              {t('settings.themeColorPreviewHint')}
            </p>
            <div className="flex flex-col items-start gap-2.5">
              {(
                [
                  { id: 'base' as const, label: t('settings.themeColorBase'), color: committedPair.base },
                  { id: 'accent' as const, label: t('settings.themeColorAccent'), color: committedPair.accent },
                ] as const
              ).map((item) => {
                const selected = role === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${item.label} ${toHex(item.color)}`}
                    className="flex items-center gap-2.5 rounded-[var(--radius-sm)] text-left transition"
                    onClick={() => selectRole(item.id)}
                  >
                    <span
                      className={[
                        'size-9 shrink-0 rounded-full border border-black/15 shadow-inner transition',
                        selected
                          ? 'ring-2 ring-[var(--color-selection)] ring-offset-2 ring-offset-[var(--color-surface)]'
                          : 'hover:scale-105',
                      ].join(' ')}
                      style={{ background: toHex(item.color) }}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-medium text-[var(--color-text)]">{item.label}</span>
                      <span className="block font-mono text-[10px] tabular-nums text-[var(--color-text-muted)]">
                        {toHex(item.color)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              className={[
                'flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)]',
                'bg-[var(--color-input)] px-2 py-1.5 text-[11px] font-medium text-[var(--color-text)]',
                'transition hover:bg-[var(--color-hover)]',
              ].join(' ')}
              aria-label={t('settings.themeColorRandomAll')}
              onClick={randomizeAll}
            >
              <IconDice size={15} stroke={1.6} className="shrink-0 text-[var(--color-text-muted)]" aria-hidden />
              {t('settings.themeColorRandomAll')}
            </button>
          </div>

          <div className="min-w-0 space-y-3">
            <div className="space-y-1.5">
              <p className="text-[11px] text-[var(--color-text-muted)]">{t('settings.themeColorPresets')}</p>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_PAIR_PRESETS.map((preset) => {
                  const selected = samePair(committedPair, preset)
                  const baseHex = toHex(preset.base)
                  const accentHex = toHex(preset.accent)
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      aria-label={`${t('settings.themeColorBase')} ${baseHex} / ${t('settings.themeColorAccent')} ${accentHex}`}
                      aria-pressed={selected}
                      className={[
                        'inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-1.5 py-1 transition',
                        selected
                          ? 'border-[var(--color-selection)] bg-[var(--color-selection-soft)] ring-1 ring-[var(--color-selection)]/40'
                          : 'border-[var(--color-border)] bg-[var(--color-input)] hover:bg-[var(--color-hover)]',
                      ].join(' ')}
                      onClick={() => commitPair({ base: preset.base, accent: preset.accent })}
                    >
                      <span
                        className="size-5 shrink-0 rounded-full border border-black/15 shadow-inner"
                        style={{ background: baseHex }}
                        aria-hidden
                      />
                      <span className="text-[10px] font-medium text-[var(--color-text-muted)]" aria-hidden>
                        /
                      </span>
                      <span
                        className="size-5 shrink-0 rounded-full border border-black/15 shadow-inner"
                        style={{ background: accentHex }}
                        aria-hidden
                      />
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[11px] text-[var(--color-text-muted)]">{t('settings.themeColorCode')}</p>
              <div className="flex items-center gap-2">
                <input
                  ref={hexRef}
                  type="text"
                  defaultValue={toHex(draftActive)}
                  spellCheck={false}
                  className="w-[6.5rem] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-2 py-1 font-mono text-xs tabular-nums text-[var(--color-text)]"
                  onBlur={(e) => {
                    const next = fromHex(e.currentTarget.value)
                    if (next) commit(next)
                    else e.currentTarget.value = toHex(activeColor(draftRef.current, roleRef.current))
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                  }}
                />
                <label
                  className={[
                    'relative grid size-8 shrink-0 cursor-pointer place-items-center overflow-hidden',
                    'rounded-[var(--radius-sm)] border border-black/15 shadow-inner transition',
                    'hover:brightness-110',
                  ].join(' ')}
                  style={{ background: toHex(draftActive) }}
                  aria-label={t('settings.themeColorNativePicker')}
                >
                  <IconPalette
                    size={18}
                    stroke={1.6}
                    className="drop-shadow-sm"
                    style={{ color: contrastTextOnColor(draftActive) }}
                    aria-hidden
                  />
                  <input
                    ref={nativeRef}
                    type="color"
                    defaultValue={toHex(draftActive)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label={t('settings.themeColorNativePicker')}
                    onInput={(e) => {
                      const next = fromHex(e.currentTarget.value)
                      if (next) preview(next)
                    }}
                    onChange={(e) => {
                      const next = fromHex(e.currentTarget.value)
                      if (next) commit(next)
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] text-[var(--color-text-muted)]">{t('settings.themeColorPalette')}</p>
              <PaletteGrid onPreview={preview} onCommit={commit} onPreviewEnd={discardPreview} />
            </div>

            <div className="space-y-1.5">
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
                    defaultValue={draftActive[channel]}
                    className="min-w-0 flex-1 accent-[var(--color-accent)]"
                    onPointerDown={() => {
                      draggingRef.current = true
                    }}
                    onInput={(e) => {
                      draggingRef.current = true
                      preview({
                        ...activeColor(draftRef.current, roleRef.current),
                        [channel]: Number(e.currentTarget.value),
                      })
                    }}
                    onPointerUp={() => commit(activeColor(draftRef.current, roleRef.current))}
                    onPointerCancel={() => commit(activeColor(draftRef.current, roleRef.current))}
                    onLostPointerCapture={() => {
                      if (draggingRef.current) commit(activeColor(draftRef.current, roleRef.current))
                    }}
                  />
                  <input
                    ref={rgbTextRef(channel)}
                    type="text"
                    inputMode="numeric"
                    defaultValue={String(draftActive[channel])}
                    className="w-11 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-1.5 py-0.5 text-right tabular-nums text-[var(--color-text)]"
                    onBlur={(e) => {
                      const n = Number(e.currentTarget.value.replace(/[^\d]/g, ''))
                      const current = activeColor(draftRef.current, roleRef.current)
                      if (!Number.isFinite(n)) {
                        e.currentTarget.value = String(current[channel])
                        return
                      }
                      commit({ ...current, [channel]: n })
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </Dialog>
    </>
  )
})
