import { convertFileSrc } from '@tauri-apps/api/core'
import type { SkinEntry } from '@fledge/shared'

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * ローカル絶対パスを WebView 表示用 URL にする。
 * Tauri: asset プロトコル（巨大 base64 IPC を避ける）
 * Electron: 未対応（呼び出し側で protocol / data URL にフォールバック）
 */
export function localFileAssetUrl(absolutePath: string | null | undefined): string | undefined {
  if (!absolutePath || !isTauriRuntime()) return undefined
  try {
    return convertFileSrc(absolutePath)
  } catch {
    return undefined
  }
}

/** Electron の同梱デフォルトスキン（ストリーム配信） */
export function electronDefaultSkinUrl(skinId: string): string {
  return `fledge-skin://${skinId}.png`
}

export function preferElectronDefaultProtocol(skin: SkinEntry): string | undefined {
  if (isTauriRuntime() || skin.source !== 'default') return undefined
  return electronDefaultSkinUrl(skin.id)
}

export function isTauriApp(): boolean {
  return isTauriRuntime()
}
