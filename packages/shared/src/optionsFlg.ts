import { z } from 'zod'
import { SettingsSchema, type Settings } from './models.js'

/** 既定のファイル名（拡張子 .flg） */
export const OPTIONS_FLG_DEFAULT_NAME = 'option.flg'

/** テキスト形式の識別子 */
export const OPTIONS_FLG_FORMAT = 'fledge-option' as const

/** 現行フォーマット版 */
export const OPTIONS_FLG_VERSION = 1 as const

/**
 * 別マシン／再インストール向けに持ち出せない（または持ち出すと危険な）キー。
 * インスタンス ID・絶対パス・一時状態・認証クライアント ID など。
 */
export const OPTIONS_FLG_EXCLUDED_KEYS = [
  'selectedInstanceId',
  'lastPlayedInstanceId',
  'libraryInstanceOrder',
  'msaClientId',
  'updateAckPending',
  'lastAppVersion',
  'fullscreen',
  'windowWidth',
  'windowHeight',
  'minecraftInitialSettingsLocked',
] as const

export type OptionsFlgExcludedKey = (typeof OPTIONS_FLG_EXCLUDED_KEYS)[number]

const excludedSet = new Set<string>(OPTIONS_FLG_EXCLUDED_KEYS)

export const OptionsFlgEnvelopeSchema = z.object({
  format: z.literal(OPTIONS_FLG_FORMAT),
  version: z.number().int().positive(),
  exportedAt: z.string().min(1),
  settings: z.record(z.unknown()),
})
export type OptionsFlgEnvelope = z.infer<typeof OptionsFlgEnvelopeSchema>

/** エクスポート用に持ち出し可能な設定だけを取り出す */
export function pickPortableSettings(settings: Settings): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(settings)) {
    if (excludedSet.has(key)) continue
    if (value === undefined) continue
    out[key] = value
  }
  return out
}

/** settings オブジェクトから .flg テキスト（整形 JSON）を作る */
export function buildOptionsFlgText(settings: Settings, exportedAt = new Date().toISOString()): string {
  const envelope: OptionsFlgEnvelope = {
    format: OPTIONS_FLG_FORMAT,
    version: OPTIONS_FLG_VERSION,
    exportedAt,
    settings: pickPortableSettings(settings),
  }
  return `${JSON.stringify(envelope, null, 2)}\n`
}

/**
 * .flg テキストをパースし、settings.set に渡せる Partial を返す。
 * 未知キーは捨て、Zod で型を整える。
 */
export function parseOptionsFlgText(raw: string): Partial<Settings> {
  const trimmed = raw.replace(/^\uFEFF/, '').trim()
  if (!trimmed) {
    throw new Error('設定ファイルが空です')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error('設定ファイルの形式が正しくありません（JSON テキストである必要があります）')
  }

  // 旧・簡易形式: エンベロープ無しで settings 本体だけ書かれた場合も受け入れる
  let settingsRaw: unknown
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    'format' in parsed &&
    (parsed as { format?: unknown }).format === OPTIONS_FLG_FORMAT
  ) {
    const envelope = OptionsFlgEnvelopeSchema.parse(parsed)
    if (envelope.version > OPTIONS_FLG_VERSION) {
      throw new Error(
        `この設定ファイルは新しい形式（version ${envelope.version}）です。アプリを更新してください。`,
      )
    }
    settingsRaw = envelope.settings
  } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    settingsRaw = parsed
  } else {
    throw new Error('設定ファイルの内容を読めませんでした')
  }

  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(settingsRaw as Record<string, unknown>)) {
    if (excludedSet.has(key)) continue
    if (value === undefined) continue
    cleaned[key] = value
  }

  return SettingsSchema.partial().parse(cleaned)
}
