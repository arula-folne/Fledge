import { convertFileSrc } from '@tauri-apps/api/core'

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * ローカル絶対パスを WebView 表示用 URL にする（Tauri asset プロトコル）。
 * ブラウザ／プロモデモでは undefined（呼び出し側で data URL 等へフォールバック）。
 */
export function localFileAssetUrl(absolutePath: string | null | undefined): string | undefined {
  if (!absolutePath || !isTauriRuntime()) return undefined
  try {
    return convertFileSrc(absolutePath)
  } catch {
    return undefined
  }
}

export function isTauriApp(): boolean {
  return isTauriRuntime()
}
