/**
 * アプリバージョンの正本（Single Source of Truth）。
 *
 * ## 表記法
 * 表示は常に `Ver.` + APP_VERSION（例: Ver.0.3.0ut）
 *
 * | 区分 | 例 | 説明 |
 * |------|-----|------|
 * | アルファ版 | `0.0.0a` | 通常プレリリース |
 * | ベータ版 | `0.0.0b` | ベータ |
 * | ベータ追修正 | `0.0.0c` | 同一 patch の追修正ベータ |
 * | アップデートテスター | `0.0.0ut` | 更新実験の **元** データを載せる版 |
 * | アップデートチェック | `0.0.0up` | `ut` から更新し、データが残ったか **確認** する版 |
 * | 更新止めファイナル | `0.0.0f` | その系統の最終版（それ以上は自動更新しない） |
 * | 製品版 | `0.0.0` | 接尾辞なし |
 *
 * バージョンを上げるとき:
 * 1. APP_VERSION だけを編集
 * 2. リポジトリルートで `pnpm version:sync` を実行
 * 3. お知らせ（news/news.ja.json）にリリース条目を手動追加
 * 4. RELEASE_NOTES.md に GitHub Release 用の更新内容を書く
 * 5. `v{APP_VERSION}` タグを push（例: v0.3.0ut）
 */
export const APP_VERSION = '0.3.3a' as const

/** UI 表示用（`Ver.X.X.X[suffix]`） */
export const APP_VERSION_LABEL = `Ver.${APP_VERSION}` as const
export const APP_VERSION_FULL = `Fledge ${APP_VERSION_LABEL}` as const

/** Modrinth / NeoForge 等の User-Agent 用 */
export function fledgeUserAgent(feature: string): string {
  return `Fledge/${APP_VERSION} (${feature})`
}
