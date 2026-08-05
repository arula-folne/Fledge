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
    bg: '#f4f6fa',
    surface: '#ffffff',
    input: '#ffffff',
    border: '#d8e0ea',
    text: '#152033',
    textMuted: '#5a6b7d',
    accent: '#3d8fc9',
    accentSoft: '#e4f1fb',
    hover: 'rgba(21, 32, 51, 0.06)',
    onAccent: '#ffffff',
    scrollbar: '#b8c5d4',
    scheme: 'light',
    bodyBg: 'linear-gradient(180deg, #f4f6fa 0%, #e8eef5 100%)',
  }
}

function tokensForDark(): ThemeTokens {
  return {
    bg: '#0f141b',
    surface: '#1a222d',
    input: '#121820',
    border: '#334055',
    text: '#eef3f9',
    textMuted: '#9eafc2',
    accent: '#6bb0df',
    accentSoft: '#243445',
    hover: 'rgba(238, 243, 249, 0.08)',
    onAccent: '#0b1218',
    scrollbar: '#3a4a5c',
    scheme: 'dark',
    bodyBg: 'linear-gradient(180deg, #121820 0%, #0c1016 100%)',
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

function tokensForColor(r: number, g: number, b: number): ThemeTokens {
  const base = { r, g, b }
  const lum = relativeLuminance(r, g, b)
  const darkFg = lum < 0.42
  const white = { r: 255, g: 255, b: 255 }
  const black = { r: 0, g: 0, b: 0 }

  if (darkFg) {
    return {
      bg: mixRgb(base, white, 0.08),
      surface: mixRgb(base, white, 0.14),
      input: mixRgb(base, black, 0.18),
      border: mixRgb(base, white, 0.28),
      text: '#f3f6fb',
      textMuted: '#b7c3d4',
      accent: mixRgb(base, white, 0.45),
      accentSoft: 'rgba(255,255,255,0.12)',
      hover: 'rgba(255,255,255,0.1)',
      onAccent: '#0a0f14',
      scrollbar: mixRgb(base, white, 0.35),
      scheme: 'dark',
      bodyBg: `linear-gradient(180deg, ${mixRgb(base, white, 0.06)} 0%, ${mixRgb(base, black, 0.35)} 100%)`,
    }
  }

  return {
    bg: mixRgb(base, white, 0.55),
    surface: mixRgb(base, white, 0.78),
    input: '#ffffff',
    border: mixRgb(base, black, 0.18),
    text: '#152033',
    textMuted: '#4d5d6e',
    accent: mixRgb(base, black, 0.35),
    accentSoft: mixRgb(base, white, 0.45),
    hover: 'rgba(21, 32, 51, 0.07)',
    onAccent: '#ffffff',
    scrollbar: mixRgb(base, black, 0.25),
    scheme: 'light',
    bodyBg: `linear-gradient(180deg, ${mixRgb(base, white, 0.5)} 0%, ${mixRgb(base, white, 0.2)} 100%)`,
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

/** 確定時用。グラデーション込みのフル CSS 変数を即時反映（IPC なし） */
export function applyThemeColor(color: ThemeColor): void {
  cancelThemeColorPreview()
  const c = clampThemeColor(color)
  applyTokens(tokensForColor(c.r, c.g, c.b))
}

/**
 * ドラッグ中プレビュー用。React / IPC を通さず CSS 変数だけを 1フレーム1回更新する。
 * body のグラデーションはプレビュー中は単色にしてコストを抑える。
 */
export function scheduleThemeColorPreview(color: ThemeColor): void {
  previewPending = clampThemeColor(color)
  if (previewRaf) return
  previewRaf = requestAnimationFrame(() => {
    previewRaf = 0
    const c = previewPending
    previewPending = null
    if (!c) return
    const tokens = tokensForColor(c.r, c.g, c.b)
    applyTokens({ ...tokens, bodyBg: tokens.bg })
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
