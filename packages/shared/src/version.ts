/**
 * アプリバージョンの正本（Single Source of Truth）。
 *
 * ## 表記法
 * 表示は常に `Ver.` + APP_VERSION（例: Ver.0.1.4a）
 *
 * | 区分           | 例           |
 * |----------------|--------------|
 * | アルファ版     | `0.0.0a`     |
 * | ベータ版       | `0.0.0b`     |
 * | 第1世代ファイナル | `0.0.0f`  | … 0.2.4f など。第2世代（0.3+）へは自動更新しない |
 * | 製品版         | `0.0.0`      |
 *
 * バージョンを上げるとき:
 * 1. APP_VERSION だけを編集（接尾辞 a / b を含める）
 * 2. リポジトリルートで `pnpm version:sync` を実行
 * 3. お知らせ（news/news.ja.json）にリリース条目を手動追加
 * 4. RELEASE_NOTES.md に GitHub Release 用の更新内容を書く（リリースページ本文）
 * 5. main へマージ後、`v{APP_VERSION}` タグを push（例: v0.1.9a）
 */
export const APP_VERSION = '0.2.4f' as const

/** UI 表示用（`Ver.X.X.X[a|b|f]`） */
export const APP_VERSION_LABEL = `Ver.${APP_VERSION}` as const
export const APP_VERSION_FULL = `Fledge ${APP_VERSION_LABEL}` as const

/** Modrinth / NeoForge 等の User-Agent 用 */
export function fledgeUserAgent(feature: string): string {
  return `Fledge/${APP_VERSION} (${feature})`
}
