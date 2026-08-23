/**
 * アプリバージョンの正本（Single Source of Truth）。
 *
 * バージョンを上げるとき:
 * 1. APP_VERSION（必要なら APP_CHANNEL）だけを編集
 * 2. リポジトリルートで `pnpm version:sync` を実行
 * 3. お知らせ（news/news.ja.json）にリリース条目を手動追加
 */
export const APP_VERSION = '0.1.3' as const
export const APP_CHANNEL = 'Beta' as const

export const APP_VERSION_LABEL = `Ver.${APP_VERSION} - ${APP_CHANNEL}` as const
export const APP_VERSION_FULL = `Fledge ${APP_VERSION_LABEL}` as const

/** Modrinth / NeoForge 等の User-Agent 用 */
export function fledgeUserAgent(feature: string): string {
  return `Fledge/${APP_VERSION} (${feature})`
}
