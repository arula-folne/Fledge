import { convertFileSrc } from '@tauri-apps/api/core'

const SCREENSHOT_NAME_RE = /^[^/\\]+\.(png|jpe?g|webp|gif)$/i

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * スクリーンショット表示用 URL。
 * - Tauri: 絶対パスを asset プロトコルへ（Electron の fledge-screenshot:// は使わない）
 * - Electron: 互換のためカスタムプロトコルを維持
 */
export function instanceScreenshotUrl(
  instanceId: string,
  fileName: string,
  absolutePath?: string | null,
): string {
  if (absolutePath && isTauriRuntime()) {
    try {
      return convertFileSrc(absolutePath)
    } catch {
      /* fall through to protocol URL */
    }
  }
  const id = encodeURIComponent(instanceId)
  const name = encodeURIComponent(fileName)
  return `fledge-screenshot://local/${id}/${name}`
}

export function isScreenshotFileName(name: string): boolean {
  return SCREENSHOT_NAME_RE.test(name) && !name.includes('..')
}
