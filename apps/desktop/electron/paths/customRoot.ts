import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const STORE_FILE = 'custom-root.json'

type CustomRootStore = {
  root?: string
}

function storePath(): string {
  return path.join(app.getPath('userData'), STORE_FILE)
}

/** パッケージ／開発時の既定ルート（カスタム未設定時） */
export function getDefaultFledgeRoot(): string {
  if (!app.isPackaged) {
    return path.join(app.getAppPath(), '.fledge-root')
  }
  return path.dirname(app.getPath('exe'))
}

export function readCustomRoot(): string | null {
  try {
    const raw = fs.readFileSync(storePath(), 'utf8')
    const data = JSON.parse(raw) as CustomRootStore
    if (typeof data.root === 'string' && data.root.trim()) {
      return path.resolve(data.root.trim())
    }
  } catch {
    /* missing or invalid */
  }
  return null
}

/** null / 空文字で既定に戻す（ポインタ削除） */
export function writeCustomRoot(root: string | null): void {
  const file = storePath()
  if (!root?.trim()) {
    try {
      fs.unlinkSync(file)
    } catch {
      /* ignore */
    }
    return
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    `${JSON.stringify({ root: path.resolve(root.trim()) }, null, 2)}\n`,
    'utf8',
  )
}

/**
 * 実効データルート。
 * 優先: FLEDGE_ROOT → userData のカスタム → 既定
 */
export function resolveFledgeRoot(): string {
  const fromEnv = process.env.FLEDGE_ROOT?.trim()
  if (fromEnv) return path.resolve(fromEnv)

  return readCustomRoot() ?? getDefaultFledgeRoot()
}

export type AppDirectoryInfo = {
  /** UI 表示用（設定済みパス。再起動前でも変更直後の値） */
  configured: string
  /** 現在プロセスが使っているルート */
  active: string
  /** カスタム未設定時の既定 */
  defaultPath: string
  isCustom: boolean
  /** 表示パスと稼働中ルートが異なる（再起動待ち） */
  restartRequired: boolean
}

export function getAppDirectoryInfo(activeRoot: string): AppDirectoryInfo {
  const defaultPath = getDefaultFledgeRoot()
  const custom = readCustomRoot()
  const configured = custom ?? defaultPath
  return {
    configured,
    active: activeRoot,
    defaultPath,
    isCustom: custom != null,
    restartRequired: path.resolve(configured) !== path.resolve(activeRoot),
  }
}
