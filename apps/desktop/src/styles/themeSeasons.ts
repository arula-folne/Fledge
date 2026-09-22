import type { ThemeTokens } from './theme'
import tidalSummerLight from '../assets/themes/tidal-summer-2026-bg-light.png'
import tidalSummerDark from '../assets/themes/tidal-summer-2026-bg-dark.png'
import autumnDriftLight from '../assets/themes/autumn-drift-2026-bg-light.png'
import autumnDriftDark from '../assets/themes/autumn-drift-2026-bg-dark.png'

/**
 * シーズンテーマ（スタンダードとは完全に別系統）。
 * 季節・アップデート向けのテーマをここに蓄積していく（削除せず増やす想定）。
 */
export type SeasonAtmosphereTone = {
  /** 画面上の半透明オーバーレイ（tailwind gradient 用クラス） */
  overlayClass: string
  waveA: string
  waveB: string
}

export type SeasonThemeDefinition = {
  id: string
  /** i18n キー（例: settings.seasonTheme.tidalSummer2026） */
  labelKey: string
  /**
   * 明暗切替対応。
   * - both: ライト／ダーク／システムを切り替え可能
   * - light / dark: 固定トーンのみ（切替 UI は無効）
   */
  toneSupport: 'both' | 'light' | 'dark'
  /** ピッカー用プレビュー（グラデ or イラスト URL） */
  previewBg: string
  /** ランチャー全面のイラスト背景（任意。片方のみでも可） */
  illustration?: { light?: string; dark?: string }
  atmosphere: { light: SeasonAtmosphereTone; dark: SeasonAtmosphereTone }
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

/**
 * Autumn Drift 2026
 * ライト: 紅葉の昼／ダーク: カボチャのハロウィン夜
 * 夏テーマと同系統の柔らかいイラスト質感
 */
const AUTUMN_DRIFT_2026_LIGHT: ThemeTokens = {
  bg: '#e8c49a',
  surface: '#fff7ef',
  input: '#fffaf5',
  border: '#d9b896',
  text: '#2a1810',
  textMuted: '#6a4535',
  accent: '#c45c2a',
  accentSoft: '#f3e0d2',
  hover: 'rgba(90, 48, 28, 0.08)',
  onAccent: '#fff8f2',
  scrollbar: '#c4a074',
  zebra: '#f4e6d4',
  scheme: 'light',
  bodyBg: '#f0d4a8',
}

const AUTUMN_DRIFT_2026_DARK: ThemeTokens = {
  bg: '#1a1224',
  surface: '#2a1f38',
  input: '#20182c',
  border: '#4a3558',
  text: '#fff4e8',
  textMuted: '#d4b8a0',
  accent: '#e67a2e',
  accentSoft: '#3a2830',
  hover: 'rgba(255, 236, 220, 0.08)',
  onAccent: '#1a0e08',
  scrollbar: '#120c1a',
  zebra: '#241a30',
  scheme: 'dark',
  bodyBg: '#120c1c',
}

/** 蓄積カタログ。新しいテーマは末尾に追加する（過去分も選択可能のまま残す） */
export const SEASON_THEMES: readonly SeasonThemeDefinition[] = [
  {
    id: 'tidal-summer-2026',
    labelKey: 'settings.seasonTheme.tidalSummer2026',
    toneSupport: 'both',
    previewBg: `url(${tidalSummerLight}) center/cover no-repeat`,
    illustration: { light: tidalSummerLight, dark: tidalSummerDark },
    atmosphere: {
      light: {
        overlayClass: 'bg-gradient-to-b from-[#c8dff0]/45 via-transparent to-[#e6c992]/35',
        waveA: 'rgba(255, 255, 255, 0.42)',
        waveB: 'rgba(31, 143, 181, 0.18)',
      },
      dark: {
        overlayClass: 'bg-gradient-to-b from-[#0b1c2a]/55 via-[#102a43]/25 to-[#0b1c2a]/50',
        waveA: 'rgba(78, 184, 201, 0.22)',
        waveB: 'rgba(160, 210, 230, 0.14)',
      },
    },
    light: TIDAL_SUMMER_2026_LIGHT,
    dark: TIDAL_SUMMER_2026_DARK,
  },
  {
    id: 'autumn-drift-2026',
    labelKey: 'settings.seasonTheme.autumnDrift2026',
    toneSupport: 'both',
    previewBg: `url(${autumnDriftLight}) center/cover no-repeat`,
    illustration: { light: autumnDriftLight, dark: autumnDriftDark },
    atmosphere: {
      light: {
        overlayClass: 'bg-gradient-to-b from-[#f0d4a8]/40 via-transparent to-[#e8c49a]/40',
        waveA: 'rgba(255, 248, 240, 0.38)',
        waveB: 'rgba(196, 92, 42, 0.16)',
      },
      dark: {
        overlayClass: 'bg-gradient-to-b from-[#120c1c]/55 via-[#2a1f38]/22 to-[#1a1224]/50',
        waveA: 'rgba(230, 122, 46, 0.22)',
        waveB: 'rgba(180, 120, 200, 0.14)',
      },
    },
    light: AUTUMN_DRIFT_2026_LIGHT,
    dark: AUTUMN_DRIFT_2026_DARK,
  },
]

/** 削除済みクリエイター系 ID（設定に残っていても未適用） */
const REMOVED_SEASON_THEME_IDS = new Set(['arula', 'creator-desk-2026'])

export function getSeasonTheme(id: string | null | undefined): SeasonThemeDefinition | undefined {
  if (!id || REMOVED_SEASON_THEME_IDS.has(id)) return undefined
  return SEASON_THEMES.find((theme) => theme.id === id)
}

/** 明暗切替 UI を有効にしてよいか */
export function seasonSupportsToneSwitch(
  id: string | null | undefined,
): boolean {
  return getSeasonTheme(id)?.toneSupport === 'both'
}
