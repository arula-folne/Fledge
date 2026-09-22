/**
 * アプリバージョンの正本（Single Source of Truth）。
 *
 * ## 表記法（0.5.0 以降）
 * 表示は常に `Ver.` + APP_VERSION（例: Ver.0.5.0）
 *
 * | 範囲 | 扱い |
 * |------|------|
 * | `0.x.x` | ベータ |
 * | `1.0.0` 以降 | 正式版 |
 *
 * 接尾辞（`a` / `b` / `r` / `rc` / `ut` / `up` / `f` など）は **使わない**。
 * 旧リリースの比較用に `compareVersions` は歴史的サフィックスを解釈できる。
 *
 * ## 世代
 * - 第1世代最終: `0.2.4f`（0.3+ へは自動更新しない）
 * - 第2世代最終: `0.4.6`（0.5+ へは自動更新しない・技術スタック刷新のため）
 * - 第3世代: `0.5.x`（Tauri + Rust）
 *
 * バージョンを上げるとき:
 * 1. APP_VERSION だけを編集
 * 2. リポジトリルートで `pnpm version:sync` を実行
 *    （package.json / Cargo.toml / tauri.conf / Rust `APP_VERSION` まで同期）
 * 3. お知らせ（news/news.ja.json）にリリース条目を手動追加
 * 4. RELEASE_NOTES.md に GitHub Release 用の更新内容を書く
 * 5. `v{APP_VERSION}` タグを push（例: v0.5.0）
 */
export const APP_VERSION = '0.5.10' as const

/** UI 表示用（`Ver.X.X.X`） */
export const APP_VERSION_LABEL = `Ver.${APP_VERSION}` as const
export const APP_VERSION_FULL = `Fledge ${APP_VERSION_LABEL}` as const

/** Modrinth / NeoForge 等の User-Agent 用 */
export function fledgeUserAgent(feature: string): string {
  return `Fledge/${APP_VERSION} (${feature})`
}
