import { convertFileSrc } from '@tauri-apps/api/core'

const SCREENSHOT_NAME_RE = /^[^/\\]+\.(png|jpe?g|webp|gif)$/i

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * スクリーンショット表示用 URL。
 * Tauri では絶対パスを asset プロトコルへ変換する。
 * プロモ／ブラウザデモでは data URL・http(s)・相対パスをそのまま返す。
 */
export function instanceScreenshotUrl(
  instanceId: string,
  fileName: string,
  absolutePath?: string | null,
): string {
  void instanceId
  void fileName
  if (
    absolutePath &&
    (absolutePath.startsWith('data:') ||
      absolutePath.startsWith('http://') ||
      absolutePath.startsWith('https://') ||
      absolutePath.startsWith('blob:') ||
      absolutePath.startsWith('/'))
  ) {
    return absolutePath
  }
  if (absolutePath && isTauriRuntime()) {
    try {
      return convertFileSrc(absolutePath)
    } catch {
      /* fall through */
    }
  }
  return absolutePath ?? ''
}

export function isScreenshotFileName(name: string): boolean {
  return SCREENSHOT_NAME_RE.test(name) && !name.includes('..')
}
