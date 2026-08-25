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

/** 彩度を少し上げて鮮やかにする（ライト用アクセント） */
function boostChroma(
  c: { r: number; g: number; b: number },
  amount = 0.18,
): { r: number; g: number; b: number } {
  const y = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
  return {
    r: clampByte(y + (c.r - y) * (1 + amount)),
    g: clampByte(y + (c.g - y) * (1 + amount)),
    b: clampByte(y + (c.b - y) * (1 + amount)),
  }
}

const NEUTRAL_LIGHT = { r: 232, g: 228, b: 222 }
const NEUTRAL_LIGHT_SURFACE = { r: 248, g: 246, b: 242 }
const NEUTRAL_LIGHT_INPUT = { r: 252, g: 251, b: 248 }
const NEUTRAL_LIGHT_BORDER = { r: 210, g: 205, b: 198 }
const NEUTRAL_LIGHT_BODY_TOP = { r: 238, g: 234, b: 228 }
const NEUTRAL_LIGHT_BODY_BOT = { r: 226, g: 222, b: 216 }
const NEUTRAL_LIGHT_ZEBRA = { r: 240, g: 236, b: 230 }
const NEUTRAL_DARK = { r: 82, g: 82, b: 88 }
const NEUTRAL_DARK_SURFACE = { r: 96, g: 96, b: 102 }
const NEUTRAL_DARK_INPUT = { r: 74, g: 74, b: 80 }
const NEUTRAL_DARK_ZEBRA = { r: 88, g: 88, b: 94 }

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

function tokensForDark(): ThemeTokens {
  return {
    bg: '#525258',
    surface: '#606068',
    input: '#4a4a50',
    border: '#74747c',
    text: '#f5f5f7',
    textMuted: '#c0c0c6',
    accent: '#8ec8ef',
    accentSoft: '#555a64',
    hover: 'rgba(245, 245, 247, 0.11)',
    onAccent: '#1a1a1c',
    scrollbar: '#7a7a82',
    zebra: '#585860',
    scheme: 'dark',
    bodyBg: 'linear-gradient(180deg, #56565c 0%, #4e4e54 100%)',
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
 * ライトベース: 通常ライトに近い面色 + アクセントは鮮やかめ。
 * ダークベース: 面の明暗差は控えめ。
 */
function tokensForColor(r: number, g: number, b: number): ThemeTokens {
  const colorBase = { r, g, b }
  const darkFg = relativeLuminance(r, g, b) < 0.42
  const white = { r: 255, g: 255, b: 255 }
  const black = { r: 0, g: 0, b: 0 }

  if (darkFg) {
    const tint = softMute(colorBase, 0.1)
    const accentBase = boostChroma(softMute(colorBase, 0.06), 0.12)
    return {
      bg: mixRgb(NEUTRAL_DARK, tint, 0.38),
      surface: mixRgb(NEUTRAL_DARK_SURFACE, tint, 0.34),
      input: mixRgb(NEUTRAL_DARK_INPUT, tint, 0.26),
      border: mixRgb({ r: 116, g: 116, b: 124 }, tint, 0.34),
      text: '#f5f5f7',
      textMuted: '#c0c0c6',
      accent: mixRgb(accentBase, white, 0.34),
      accentSoft: `rgba(${tint.r}, ${tint.g}, ${tint.b}, 0.28)`,
      hover: 'rgba(245, 245, 247, 0.11)',
      onAccent: '#1a1a1c',
      scrollbar: mixRgb({ r: 122, g: 122, b: 130 }, tint, 0.32),
      zebra: mixRgb(NEUTRAL_DARK_ZEBRA, tint, 0.32),
      scheme: 'dark',
      bodyBg: `linear-gradient(180deg, ${mixRgb(NEUTRAL_DARK, tint, 0.18)} 0%, ${mixRgb(NEUTRAL_DARK, black, 0.06)} 100%)`,
    }
  }

  // ライトベース: 背景はニュートラル寄り、色はアクセントで主張
  const tint = softMute(colorBase, 0.1)
  const vivid = boostChroma(softMute(colorBase, 0.02), 0.22)
  const lum = relativeLuminance(r, g, b)
  const mix = 0.04 + 0.1 * (1 - Math.min(1, (lum - 0.42) / 0.58))
  return {
    bg: mixRgb(NEUTRAL_LIGHT, tint, mix),
    surface: mixRgb(NEUTRAL_LIGHT_SURFACE, tint, mix * 0.45),
    input: mixRgb(NEUTRAL_LIGHT_INPUT, tint, mix * 0.28),
    border: mixRgb(NEUTRAL_LIGHT_BORDER, tint, 0.16),
    text: '#2c2a27',
    textMuted: '#6e6a64',
    accent: mixRgb(vivid, black, 0.02),
    accentSoft: mixRgb(NEUTRAL_LIGHT_SURFACE, vivid, 0.32),
    hover: 'rgba(44, 42, 39, 0.07)',
    onAccent: '#f4f1eb',
    scrollbar: mixRgb({ r: 168, g: 162, b: 154 }, tint, 0.2),
    zebra: mixRgb(NEUTRAL_LIGHT_ZEBRA, tint, mix * 0.55),
    scheme: 'light',
    bodyBg: `linear-gradient(180deg, ${mixRgb(NEUTRAL_LIGHT_BODY_TOP, tint, mix * 0.7)} 0%, ${mixRgb(NEUTRAL_LIGHT_BODY_BOT, tint, mix * 0.55)} 100%)`,
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
  root.style.setProperty('--color-zebra', tokens.zebra)
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
    const tint = softMute(c, 0.1)
    const surface = blendRgb(NEUTRAL_DARK_SURFACE, tint, 0.34)
    const accent = blendRgb(boostChroma(softMute(c, 0.06), 0.12), white, 0.34)
    applied = blendRgb(surface, accent, 0.55)
  } else {
    const tint = softMute(c, 0.1)
    const surface = blendRgb(NEUTRAL_LIGHT_SURFACE, tint, 0.12)
    const accent = blendRgb(boostChroma(softMute(c, 0.02), 0.22), black, 0.06)
    applied = blendRgb(surface, accent, 0.45)
  }

  const shown = blendRgb(c, applied, 0.5)
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
    const root = document.documentElement
    if (darkFg) {
      const muted = softMute(c, 0.06)
      const accent = mixRgb(boostChroma(muted, 0.12), { r: 255, g: 255, b: 255 }, 0.34)
      root.style.setProperty('--color-accent', accent)
      root.style.setProperty('--color-accent-soft', `rgba(${muted.r}, ${muted.g}, ${muted.b}, 0.28)`)
    } else {
      const vivid = boostChroma(softMute(c, 0.02), 0.22)
      const accent = mixRgb(vivid, { r: 0, g: 0, b: 0 }, 0.02)
      const soft = mixRgb(NEUTRAL_LIGHT_SURFACE, vivid, 0.32)
      root.style.setProperty('--color-accent', accent)
      root.style.setProperty('--color-accent-soft', soft)
    }
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
