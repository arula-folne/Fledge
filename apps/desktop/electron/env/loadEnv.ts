import fs from 'node:fs'
import path from 'node:path'

/**
 * `.env` から Fledge 用の環境変数を読み込む（dotenv 非依存）。
 * 既存の process.env は上書きしない。
 * APIキー等の値はログに出さないこと。
 * 注入するのは `FLEDGE_` プレフィックスのキーのみ。
 */
export function loadFledgeEnvFiles(candidates: string[]): void {
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue
      const text = fs.readFileSync(file, 'utf8')
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eq = trimmed.indexOf('=')
        if (eq <= 0) continue
        const key = trimmed.slice(0, eq).trim()
        if (!key.startsWith('FLEDGE_')) continue
        let value = trimmed.slice(eq + 1).trim()
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1)
        }
        if (process.env[key] === undefined) {
          process.env[key] = value
        }
      }
    } catch {
      // ignore unreadable files
    }
  }
}

/**
 * 候補順（先勝ちではない／未設定キーのみ注入）:
 * モノレポルート、アプリ配下、ランタイム root、exe 隣、cwd。
 */
export function defaultEnvCandidatePaths(root: string, appPath: string, exeDir: string): string[] {
  return [
    path.resolve(appPath, '../../.env'),
    path.resolve(appPath, '../.env'),
    path.join(appPath, '.env'),
    path.join(root, '.env'),
    path.join(exeDir, '.env'),
    path.join(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
  ]
}
