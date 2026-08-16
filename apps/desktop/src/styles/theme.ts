import type { Settings } from '@fledge/shared'

type ResolvedMode = 'light' | 'dark' | 'color' | 'oled'

function resolveMode(settings: Settings): ResolvedMode {
  if (settings.themeMode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return settings.themeMode
}

function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function clampByte(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)))
}

function mixRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
): string {
  return `rgb(${clampByte(a.r + (b.r - a.r) * t)}, ${clampByte(a.g + (b.g - a.g) * t)}, ${clampByte(a.b + (b.b - a.b) * t)})`
}

function blendRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number } {
  return {
    r: clampByte(a.r + (b.r - a.r) * t),
    g: clampByte(a.g + (b.g - a.g) * t),
    b: clampByte(a.b + (b.b - a.b) * t),
  }
}

/** 同輝度グレーへ寄せてビビッドさを抑える */
function softMute(
  c: { r: number; g: number; b: number },
  amount = 0.3,
): { r: number; g: number; b: number } {
  const y = Math.round(0.299 * c.r + 0.587 * c.g + 0.114 * c.b)
  return blendRgb(c, { r: y, g: y, b: y }, amount)
}

const NEUTRAL_LIGHT = { r: 228, g: 225, b: 220 } // #e4e1dc
const NEUTRAL_LIGHT_SURFACE = { r: 238, g: 235, b: 230 } // #eeebe6
const NEUTRAL_LIGHT_INPUT = { r: 242, g: 239, b: 233 } // #f2efe9
const NEUTRAL_LIGHT_BORDER = { r: 212, g: 207, b: 200 } // #d4cfc8
const NEUTRAL_LIGHT_BODY_TOP = { r: 231, g: 228, b: 222 }
const NEUTRAL_LIGHT_BODY_BOT = { r: 221, g: 217, b: 211 }
const NEUTRAL_DARK = { r: 44, g: 44, b: 46 } // #2c2c2e
const NEUTRAL_DARK_SURFACE = { r: 54, g: 54, b: 56 }
const NEUTRAL_DARK_INPUT = { r: 37, g: 37, b: 39 }

type ThemeTokens = {
  bg: string
  surface: string
  input: string
  border: string
  text: string
  textMuted: string
  accent: string
  accentSoft: string
  hover: string
  onAccent: string
  scrollbar: string
  scheme: 'light' | 'dark'
  bodyBg: string
}

function tokensForLight(): ThemeTokens {
  return {
    bg: '#e4e1dc',
    surface: '#eeebe6',
    input: '#f2efe9',
    border: '#d4cfc8',
    text: '#2c2a27',
    textMuted: '#6e6a64',
    accent: '#5a8fb0',
    accentSoft: '#e4e0da',
    hover: 'rgba(44, 42, 39, 0.06)',
    onAccent: '#f4f1eb',
    scrollbar: '#b0aba5',
    scheme: 'light',
    bodyBg: 'linear-gradient(180deg, #e7e4de 0%, #ddd9d3 100%)',
  }
}

function tokensForDark(): ThemeTokens {
  return {
    bg: '#2c2c2e',
    surface: '#363638',
    input: '#252527',
    border: '#48484a',
    text: '#f2f2f4',
    textMuted: '#a1a1a6',
    accent: '#6bb0df',
    accentSoft: '#3a4550',
    hover: 'rgba(242, 242, 244, 0.08)',
    onAccent: '#1a1a1c',
    scrollbar: '#555558',
    scheme: 'dark',
    bodyBg: 'linear-gradient(180deg, #2c2c2e 0%, #262628 100%)',
  }
}

function tokensForOled(): ThemeTokens {
  return {
    bg: '#000000',
    surface: '#0c0c0c',
    input: '#050505',
    border: '#2a2a2a',
    text: '#f5f5f5',
    textMuted: '#a3a3a3',
    accent: '#6bb0df',
    accentSoft: '#161616',
    hover: 'rgba(255, 255, 255, 0.08)',
    onAccent: '#000000',
    scrollbar: '#333333',
    scheme: 'dark',
    bodyBg: '#000000',
  }
}

/** 色の明るさでライト／ダークベースを自動判定。彩度は少し抑えつつ色味はしっかり出す */
function tokensForColor(r: number, g: number, b: number): ThemeTokens {
  const colorBase = { r, g, b }
  const darkFg = relativeLuminance(r, g, b) < 0.42
  const muted = softMute(colorBase, 0.14)
  const white = { r: 255, g: 255, b: 255 }
  const black = { r: 0, g: 0, b: 0 }

  if (darkFg) {
    const tint = softMute(colorBase, 0.16)
    return {
      bg: mixRgb(NEUTRAL_DARK, tint, 0.34),
      surface: mixRgb(NEUTRAL_DARK_SURFACE, tint, 0.3),
      input: mixRgb(NEUTRAL_DARK_INPUT, tint, 0.24),
      border: mixRgb({ r: 72, g: 72, b: 74 }, tint, 0.34),
      text: '#f2f2f4',
      textMuted: '#a1a1a6',
      accent: mixRgb(muted, white, 0.28),
      accentSoft: `rgba(${muted.r}, ${muted.g}, ${muted.b}, 0.22)`,
      hover: 'rgba(242, 242, 244, 0.08)',
      onAccent: '#1a1a1c',
      scrollbar: mixRgb({ r: 85, g: 85, b: 88 }, tint, 0.32),
      scheme: 'dark',
      bodyBg: `linear-gradient(180deg, ${mixRgb(NEUTRAL_DARK, tint, 0.28)} 0%, ${mixRgb(NEUTRAL_DARK, black, 0.22)} 100%)`,
    }
  }

  const tint = softMute(colorBase, 0.32)
  const lum = relativeLuminance(r, g, b)
  const mix = 0.1 + 0.16 * (1 - Math.min(1, (lum - 0.42) / 0.58))
  return {
    bg: mixRgb(NEUTRAL_LIGHT, tint, mix),
    surface: mixRgb(NEUTRAL_LIGHT_SURFACE, tint, mix * 0.7),
    input: mixRgb(NEUTRAL_LIGHT_INPUT, tint, mix * 0.4),
    border: mixRgb(NEUTRAL_LIGHT_BORDER, tint, 0.2),
    text: '#2c2a27',
    textMuted: '#6e6a64',
    accent: mixRgb(softMute(colorBase, 0.18), black, 0.2),
    accentSoft: mixRgb(NEUTRAL_LIGHT_SURFACE, tint, 0.18),
    hover: 'rgba(44, 42, 39, 0.06)',
    onAccent: '#f4f1eb',
    scrollbar: mixRgb({ r: 176, g: 172, b: 166 }, tint, 0.24),
    scheme: 'light',
    bodyBg: `linear-gradient(180deg, ${mixRgb(NEUTRAL_LIGHT_BODY_TOP, tint, mix * 0.8)} 0%, ${mixRgb(NEUTRAL_LIGHT_BODY_BOT, tint, mix * 0.7)} 100%)`,
  }
}

function applyTokens(tokens: ThemeTokens): void {
  const root = document.documentElement
  root.style.setProperty('--color-bg', tokens.bg)
  root.style.setProperty('--color-surface', tokens.surface)
  root.style.setProperty('--color-input', tokens.input)
  root.style.setProperty('--color-border', tokens.border)
  root.style.setProperty('--color-text', tokens.text)
  root.style.setProperty('--color-text-muted', tokens.textMuted)
  root.style.setProperty('--color-accent', tokens.accent)
  root.style.setProperty('--color-accent-soft', tokens.accentSoft)
  root.style.setProperty('--color-hover', tokens.hover)
  root.style.setProperty('--color-on-accent', tokens.onAccent)
  root.style.setProperty('--color-scrollbar', tokens.scrollbar)
  root.style.setProperty('color-scheme', tokens.scheme)
  root.style.color = tokens.text
  document.body.style.background = tokens.bodyBg
  document.body.style.color = tokens.text
}

export function applyTheme(settings: Settings): void {
  const mode = resolveMode(settings)
  if (mode === 'oled') applyTokens(tokensForOled())
  else if (mode === 'dark') applyTokens(tokensForDark())
  else if (mode === 'color')
    applyTokens(tokensForColor(settings.themeColor.r, settings.themeColor.g, settings.themeColor.b))
  else applyTokens(tokensForLight())
}

type ThemeColor = { r: number; g: number; b: number }

let previewRaf = 0
let previewPending: ThemeColor | null = null

function clampThemeColor(color: ThemeColor): ThemeColor {
  return {
    r: Math.min(255, Math.max(0, Math.round(color.r))),
    g: Math.min(255, Math.max(0, Math.round(color.g))),
    b: Math.min(255, Math.max(0, Math.round(color.b))),
  }
}

/**
 * パレット／プリセット表示用。選択後に出やすい見た目へ寄せた色（保存値自体は生の RGB のまま）。
 */
export function themeColorSwatchPreview(color: ThemeColor): string {
  const c = clampThemeColor(color)
  const darkFg = relativeLuminance(c.r, c.g, c.b) < 0.42
  const white = { r: 255, g: 255, b: 255 }
  const black = { r: 0, g: 0, b: 0 }

  let applied: ThemeColor
  if (darkFg) {
    const tint = softMute(c, 0.16)
    const surface = blendRgb(NEUTRAL_DARK_SURFACE, tint, 0.3)
    const accent = blendRgb(softMute(c, 0.14), white, 0.28)
    applied = blendRgb(surface, accent, 0.55)
  } else {
    const tint = softMute(c, 0.32)
    const surface = blendRgb(NEUTRAL_LIGHT_SURFACE, tint, 0.18)
    const accent = blendRgb(softMute(c, 0.18), black, 0.2)
    applied = blendRgb(surface, accent, 0.4)
  }

  // 純色を少し残しつつ、実際の反映色に寄せる
  const shown = blendRgb(c, applied, 0.58)
  return `rgb(${shown.r}, ${shown.g}, ${shown.b})`
}

/** 確定時用。グラデーション込みのフル CSS 変数を即時反映（IPC なし） */
export function applyThemeColor(color: ThemeColor): void {
  cancelThemeColorPreview()
  const c = clampThemeColor(color)
  applyTokens(tokensForColor(c.r, c.g, c.b))
}

/**
 * ドラッグ中プレビュー用。全面トークン再計算はせず、アクセント系だけ更新して滑らかにする。
 * 確定時は applyThemeColor でフルテーマを適用する。
 */
export function scheduleThemeColorPreview(color: ThemeColor): void {
  previewPending = clampThemeColor(color)
  if (previewRaf) return
  previewRaf = requestAnimationFrame(() => {
    previewRaf = 0
    const c = previewPending
    previewPending = null
    if (!c) return
    const darkFg = relativeLuminance(c.r, c.g, c.b) < 0.42
    const muted = softMute(c, darkFg ? 0.14 : 0.18)
    const accent = darkFg
      ? mixRgb(muted, { r: 255, g: 255, b: 255 }, 0.28)
      : mixRgb(muted, { r: 0, g: 0, b: 0 }, 0.2)
    const soft = darkFg
      ? `rgba(${muted.r}, ${muted.g}, ${muted.b}, 0.22)`
      : mixRgb(NEUTRAL_LIGHT_SURFACE, muted, 0.18)
    const root = document.documentElement
    root.style.setProperty('--color-accent', accent)
    root.style.setProperty('--color-accent-soft', soft)
  })
}

export function cancelThemeColorPreview(): void {
  if (previewRaf) {
    cancelAnimationFrame(previewRaf)
    previewRaf = 0
  }
  previewPending = null
}

/** ライト／システム(明) → 白、ダーク／OLED／システム(暗) → 黒 */
export function defaultThemeColorForMode(from: Settings['themeMode']): { r: number; g: number; b: number } {
  const resolved =
    from === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : from
  if (resolved === 'dark' || resolved === 'oled') return { r: 0, g: 0, b: 0 }
  return { r: 255, g: 255, b: 255 }
}
