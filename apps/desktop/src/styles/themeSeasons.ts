import type { ThemeTokens } from './theme'
import tidalSummerLight from '../assets/themes/tidal-summer-2026-bg-light.png'
import tidalSummerDark from '../assets/themes/tidal-summer-2026-bg-dark.png'

/**
 * シーズンテーマ（スタンダードとは完全に別系統）。
 * 季節・アップデート向けのテーマをここに蓄積していく（削除せず増やす想定）。
 */
export type SeasonThemeDefinition = {
  id: string
  /** i18n キー（例: settings.seasonTheme.tidalSummer2026） */
  labelKey: string
  /** ピッカー用プレビュー（グラデ or イラスト URL） */
  previewBg: string
  /** ランチャー全面のイラスト背景（任意） */
  illustration?: { light: string; dark: string }
  light: ThemeTokens
  dark: ThemeTokens
}

/**
 * Tidal Summer 2026
 * 砂浜・青い波・ヤドカリのイラスト季節テーマ
 * テキスト色はこのテーマ個別に調整（他シーズンとは独立）
 */
const TIDAL_SUMMER_2026_LIGHT: ThemeTokens = {
  bg: '#e6c992',
  surface: '#fff6e8',
  input: '#fffaf2',
  border: '#d9bf94',
  text: '#0f2430',
  textMuted: '#2c4554',
  accent: '#1f8fb5',
  accentSoft: '#d8eef5',
  hover: 'rgba(31, 58, 74, 0.08)',
  onAccent: '#f7fbff',
  scrollbar: '#c4a574',
  zebra: '#f3e4c8',
  scheme: 'light',
  bodyBg: '#c8dff0',
}

const TIDAL_SUMMER_2026_DARK: ThemeTokens = {
  bg: '#102a43',
  surface: '#1c3a52',
  input: '#152f44',
  border: '#2f5570',
  text: '#f7fbfe',
  textMuted: '#c5d6e2',
  accent: '#4eb8c9',
  accentSoft: '#243f54',
  hover: 'rgba(238, 244, 248, 0.08)',
  onAccent: '#0b1c2a',
  scrollbar: '#0c2236',
  zebra: '#18364c',
  scheme: 'dark',
  bodyBg: '#0b1c2a',
}

/** 蓄積カタログ。新しいシーズンは末尾に追加する（過去分も選択可能のまま残す） */
export const SEASON_THEMES: readonly SeasonThemeDefinition[] = [
  {
    id: 'tidal-summer-2026',
    labelKey: 'settings.seasonTheme.tidalSummer2026',
    previewBg: `url(${tidalSummerLight}) center/cover no-repeat`,
    illustration: { light: tidalSummerLight, dark: tidalSummerDark },
    light: TIDAL_SUMMER_2026_LIGHT,
    dark: TIDAL_SUMMER_2026_DARK,
  },
]

export function getSeasonTheme(id: string | null | undefined): SeasonThemeDefinition | undefined {
  if (!id) return undefined
  return SEASON_THEMES.find((theme) => theme.id === id)
}
