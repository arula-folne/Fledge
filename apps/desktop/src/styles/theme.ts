import type { Settings } from '@fledge/shared'
import { getSeasonTheme } from './themeSeasons'

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

/** アクセント等の上に載せる文字色（明るい→黒 / 濃い→白） */
export function contrastTextOnColor(color: { r: number; g: number; b: number }): '#1a1a1c' | '#ffffff' {
  // 知覚輝度（YIQ）。WCAG 線形輝度より「明るい／濃い」の体感に近い
  const y = (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255
  return y >= 0.55 ? '#1a1a1c' : '#ffffff'
}

function rgbCss(c: { r: number; g: number; b: number }): string {
  return `rgb(${c.r}, ${c.g}, ${c.b})`
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

const NEUTRAL_LIGHT = { r: 232, g: 228, b: 222 }
const NEUTRAL_LIGHT_SURFACE = { r: 248, g: 246, b: 242 }
const NEUTRAL_LIGHT_INPUT = { r: 252, g: 251, b: 248 }
const NEUTRAL_LIGHT_BORDER = { r: 210, g: 205, b: 198 }
const NEUTRAL_LIGHT_BODY_TOP = { r: 238, g: 234, b: 228 }
const NEUTRAL_LIGHT_BODY_BOT = { r: 226, g: 222, b: 216 }
const NEUTRAL_LIGHT_ZEBRA = { r: 240, g: 236, b: 230 }
const NEUTRAL_DARK = { r: 30, g: 31, b: 34 }
const NEUTRAL_DARK_SURFACE = { r: 49, g: 51, b: 56 }
const NEUTRAL_DARK_INPUT = { r: 30, g: 31, b: 34 }
const NEUTRAL_DARK_ZEBRA = { r: 43, g: 45, b: 49 }

export type ThemeTokens = {
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
  zebra: string
  scheme: 'light' | 'dark'
  bodyBg: string
}

function tokensForLight(): ThemeTokens {
  return {
    bg: '#e8e4de',
    surface: '#f8f6f2',
    input: '#fcfbf8',
    border: '#d2cdc6',
    text: '#2c2a27',
    textMuted: '#6e6a64',
    accent: '#5fa0c4',
    accentSoft: '#eee9e2',
    hover: 'rgba(44, 42, 39, 0.07)',
    onAccent: '#f8f6f2',
    scrollbar: '#b4aea6',
    zebra: '#f0ece6',
    scheme: 'light',
    bodyBg: 'linear-gradient(180deg, #eeeae4 0%, #e4e0da 100%)',
  }
}

/** Discord ダークに近いニュートラル階層（#1e1f22 / #2b2d31 / #313338） */
function tokensForDark(): ThemeTokens {
  return {
    bg: '#1e1f22',
    surface: '#313338',
    input: '#1e1f22',
    border: '#3f4147',
    text: '#dbdee1',
    textMuted: '#949ba4',
    accent: '#5865f2',
    accentSoft: '#2b2d31',
    hover: 'rgba(79, 84, 92, 0.32)',
    onAccent: '#ffffff',
    scrollbar: '#1a1b1e',
    zebra: '#2b2d31',
    scheme: 'dark',
    bodyBg: 'linear-gradient(180deg, #2b2d31 0%, #1e1f22 100%)',
  }
}

function tokensForOled(): ThemeTokens {
  return {
    bg: '#000000',
    surface: '#121212',
    input: '#050505',
    border: '#2a2a2a',
    text: '#f5f5f5',
    textMuted: '#a3a3a3',
    accent: '#8ec8ef',
    accentSoft: '#161616',
    hover: 'rgba(255, 255, 255, 0.08)',
    onAccent: '#000000',
    scrollbar: '#333333',
    zebra: '#0a0a0a',
    scheme: 'dark',
    bodyBg: '#000000',
  }
}

/**
 * 色テーマ。
 * base: 背景・面・ソフト面などテーマ全体（ボタン以外）
 * accent: プライマリボタン（とその上の文字色）のみ。全体の色味には混ぜない。
 */
function tokensForColor(
  base: { r: number; g: number; b: number },
  accentIn: { r: number; g: number; b: number },
): ThemeTokens {
  const colorBase = base
  const darkFg = relativeLuminance(base.r, base.g, base.b) < 0.42
  const black = { r: 0, g: 0, b: 0 }

  // ボタン文字色はアクセントの明るさだけで決める（ベースの明暗は見ない）
  const accentRgb = softMute(accentIn, 0.04)
  const onAccent = contrastTextOnColor(accentRgb)

  if (darkFg) {
    const tint = softMute(colorBase, 0.14)
    const soft = blendRgb(NEUTRAL_DARK_SURFACE, tint, 0.28)
    return {
      bg: mixRgb(NEUTRAL_DARK, tint, 0.22),
      surface: mixRgb(NEUTRAL_DARK_SURFACE, tint, 0.2),
      input: mixRgb(NEUTRAL_DARK_INPUT, tint, 0.16),
      border: mixRgb({ r: 63, g: 65, b: 71 }, tint, 0.22),
      text: '#dbdee1',
      textMuted: '#949ba4',
      accent: rgbCss(accentRgb),
      accentSoft: rgbCss(soft),
      hover: 'rgba(79, 84, 92, 0.32)',
      onAccent,
      scrollbar: mixRgb({ r: 26, g: 27, b: 30 }, tint, 0.2),
      zebra: mixRgb(NEUTRAL_DARK_ZEBRA, tint, 0.18),
      scheme: 'dark',
      bodyBg: `linear-gradient(180deg, ${mixRgb(NEUTRAL_DARK_ZEBRA, tint, 0.14)} 0%, ${mixRgb(NEUTRAL_DARK, black, 0.2)} 100%)`,
    }
  }

  // ライトベース: 面の色みはベースのみ。アクセントはボタン色だけ
  const tint = softMute(colorBase, 0.1)
  const lum = relativeLuminance(base.r, base.g, base.b)
  const mix = 0.04 + 0.1 * (1 - Math.min(1, (lum - 0.42) / 0.58))
  const soft = blendRgb(NEUTRAL_LIGHT_SURFACE, tint, Math.min(0.4, mix * 2.2))
  return {
    bg: mixRgb(NEUTRAL_LIGHT, tint, mix),
    surface: mixRgb(NEUTRAL_LIGHT_SURFACE, tint, mix * 0.45),
    input: mixRgb(NEUTRAL_LIGHT_INPUT, tint, mix * 0.28),
    border: mixRgb(NEUTRAL_LIGHT_BORDER, tint, 0.16),
    text: '#2c2a27',
    textMuted: '#6e6a64',
    accent: rgbCss(accentRgb),
    accentSoft: rgbCss(soft),
    hover: 'rgba(44, 42, 39, 0.07)',
    onAccent,
    scrollbar: mixRgb({ r: 168, g: 162, b: 154 }, tint, 0.2),
    zebra: mixRgb(NEUTRAL_LIGHT_ZEBRA, tint, mix * 0.55),
    scheme: 'light',
    bodyBg: `linear-gradient(180deg, ${mixRgb(NEUTRAL_LIGHT_BODY_TOP, tint, mix * 0.7)} 0%, ${mixRgb(NEUTRAL_LIGHT_BODY_BOT, tint, mix * 0.55)} 100%)`,
  }
}

export function applyTokens(tokens: ThemeTokens): void {
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
  // メニュー選択など: アクセントに追従
  root.style.setProperty('--color-selection', tokens.accent)
  root.style.setProperty('--color-on-selection', tokens.onAccent)
  root.style.setProperty(
    '--color-selection-soft',
    `color-mix(in srgb, ${tokens.accent} 28%, transparent)`,
  )
  root.style.setProperty('--color-scrollbar', tokens.scrollbar)
  root.style.setProperty('--color-zebra', tokens.zebra)
  root.style.setProperty('color-scheme', tokens.scheme)
  root.style.color = tokens.text
  document.body.style.background = tokens.bodyBg
  document.body.style.color = tokens.text
}

const DEFAULT_THEME_BASE = { r: 255, g: 255, b: 255 }
const DEFAULT_THEME_ACCENT = { r: 91, g: 164, b: 217 }

function resolveThemeColor(
  color: { r: number; g: number; b: number } | null | undefined,
  fallback: { r: number; g: number; b: number },
): { r: number; g: number; b: number } {
  if (!color || typeof color.r !== 'number' || typeof color.g !== 'number' || typeof color.b !== 'number') {
    return { ...fallback }
  }
  return {
    r: Math.min(255, Math.max(0, Math.round(color.r))),
    g: Math.min(255, Math.max(0, Math.round(color.g))),
    b: Math.min(255, Math.max(0, Math.round(color.b))),
  }
}

export function applyTheme(settings: Settings): void {
  const root = document.documentElement
  if (settings.themeFamily === 'season') {
    const season = getSeasonTheme(settings.seasonThemeId)
    if (season) {
      root.dataset.themeSeason = season.id
      root.dataset.themeSeasonTone = resolveSeasonDark(settings) ? 'dark' : 'light'
      applyTokens(resolveSeasonDark(settings) ? season.dark : season.light)
      return
    }
  }
  delete root.dataset.themeSeason
  delete root.dataset.themeSeasonTone

  const mode = resolveMode(settings)
  if (mode === 'oled') applyTokens(tokensForOled())
  else if (mode === 'dark') applyTokens(tokensForDark())
  else if (mode === 'color') {
    applyTokens(
      tokensForColor(
        resolveThemeColor(settings.themeColor, DEFAULT_THEME_BASE),
        resolveThemeColor(settings.themeAccentColor, DEFAULT_THEME_ACCENT),
      ),
    )
  } else applyTokens(tokensForLight())
}

/** シーズンテーマ用。color→light / oled→dark、system は OS に従う */
export function resolveSeasonDark(settings: Settings): boolean {
  if (settings.themeMode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return settings.themeMode === 'dark' || settings.themeMode === 'oled'
}

type ThemeColor = { r: number; g: number; b: number }

export type ThemeColorPair = {
  base: ThemeColor
  accent: ThemeColor
}

let previewRaf = 0
let previewPending: ThemeColorPair | null = null

function clampThemeColor(color: ThemeColor): ThemeColor {
  return {
    r: Math.min(255, Math.max(0, Math.round(color.r))),
    g: Math.min(255, Math.max(0, Math.round(color.g))),
    b: Math.min(255, Math.max(0, Math.round(color.b))),
  }
}

function clampThemePair(pair: ThemeColorPair): ThemeColorPair {
  return { base: clampThemeColor(pair.base), accent: clampThemeColor(pair.accent) }
}

/**
 * パレット表示用。選択後に出やすい見た目へ寄せた色（保存値自体は生の RGB のまま）。
 */
export function themeColorSwatchPreview(color: ThemeColor, role: 'base' | 'accent' = 'base'): string {
  const c = clampThemeColor(color)
  if (role === 'accent') {
    return `rgb(${c.r}, ${c.g}, ${c.b})`
  }
  const darkFg = relativeLuminance(c.r, c.g, c.b) < 0.42
  const white = { r: 255, g: 255, b: 255 }
  const black = { r: 0, g: 0, b: 0 }

  let applied: ThemeColor
  if (darkFg) {
    const tint = softMute(c, 0.1)
    const surface = blendRgb(NEUTRAL_DARK_SURFACE, tint, 0.34)
    applied = blendRgb(surface, white, 0.08)
  } else {
    const tint = softMute(c, 0.1)
    const surface = blendRgb(NEUTRAL_LIGHT_SURFACE, tint, 0.12)
    applied = blendRgb(surface, black, 0.02)
  }

  const shown = blendRgb(c, applied, 0.5)
  return `rgb(${shown.r}, ${shown.g}, ${shown.b})`
}

/** 確定時用。グラデーション込みのフル CSS 変数を即時反映（IPC なし） */
export function applyThemeColor(pair: ThemeColorPair): void {
  cancelThemeColorPreview()
  const next = clampThemePair(pair)
  applyTokens(tokensForColor(next.base, next.accent))
}

/**
 * ドラッグ中プレビュー用。全面トークンを再計算して反映する。
 */
export function scheduleThemeColorPreview(pair: ThemeColorPair): void {
  previewPending = clampThemePair(pair)
  if (previewRaf) return
  previewRaf = requestAnimationFrame(() => {
    previewRaf = 0
    const next = previewPending
    previewPending = null
    if (!next) return
    applyTokens(tokensForColor(next.base, next.accent))
  })
}

export function cancelThemeColorPreview(): void {
  if (previewRaf) {
    cancelAnimationFrame(previewRaf)
    previewRaf = 0
  }
  previewPending = null
}

const DEFAULT_ACCENT = { r: 91, g: 164, b: 217 }
const DEFAULT_BASE = { r: 255, g: 255, b: 255 }

/** ライト／システム(明) → 白ベース、ダーク／OLED／システム(暗) → 黒ベース。アクセントは既定の青 */
export function defaultThemeColorsForMode(from: Settings['themeMode']): ThemeColorPair {
  const resolved =
    from === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : from
  if (resolved === 'dark' || resolved === 'oled') {
    return { base: { r: 0, g: 0, b: 0 }, accent: { ...DEFAULT_ACCENT } }
  }
  return { base: { ...DEFAULT_BASE }, accent: { ...DEFAULT_ACCENT } }
}

/** @deprecated defaultThemeColorsForMode を使う */
export function defaultThemeColorForMode(from: Settings['themeMode']): ThemeColor {
  return defaultThemeColorsForMode(from).base
}
