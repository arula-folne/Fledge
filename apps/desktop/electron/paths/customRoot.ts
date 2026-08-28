import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const STORE_FILE = 'custom-root.json'
/** exe 横の冗長ポインタ。userData の custom-root.json が消えても復元できる */
const INSTALL_POINTER_FILE = 'data-root.json'

type RootPointerStore = {
  root?: string
}

function userDataStorePath(): string {
  return path.join(app.getPath('userData'), STORE_FILE)
}

function installPointerPath(): string {
  return path.join(getDefaultFledgeRoot(), INSTALL_POINTER_FILE)
}

function readRootFromFile(file: string): string | null {
  try {
    const raw = fs.readFileSync(file, 'utf8')
    const data = JSON.parse(raw) as RootPointerStore
    if (typeof data.root === 'string' && data.root.trim()) {
      return path.resolve(data.root.trim())
    }
  } catch {
    /* missing or invalid */
  }
  return null
}

function writeRootToFile(file: string, root: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify({ root: path.resolve(root) }, null, 2)}\n`, 'utf8')
}

function deleteFileIfExists(file: string): void {
  try {
    fs.unlinkSync(file)
  } catch {
    /* ignore */
  }
}

/** インストール先/exe 横へ実効ルートを記録（更新後の復元用） */
export function writeInstallDirPointer(root: string): void {
  writeRootToFile(installPointerPath(), root)
}

export function readInstallDirPointer(): string | null {
  return readRootFromFile(installPointerPath())
}

/** パッケージ／開発時の既定ルート（カスタム未設定時） */
export function getDefaultFledgeRoot(): string {
  if (!app.isPackaged) {
    return path.join(app.getAppPath(), '.fledge-root')
  }
  return path.dirname(app.getPath('exe'))
}

export function readCustomRoot(): string | null {
  return readRootFromFile(userDataStorePath())
}

function writeCustomRootToUserData(root: string | null): void {
  const file = userDataStorePath()
  if (!root?.trim()) {
    deleteFileIfExists(file)
    return
  }
  writeRootToFile(file, root.trim())
}

/** null / 空文字で既定に戻す（ポインタ削除） */
export function writeCustomRoot(root: string | null): void {
  const defaultPath = getDefaultFledgeRoot()
  const effective = root?.trim() ? path.resolve(root.trim()) : defaultPath

  if (!root?.trim() || path.resolve(effective) === path.resolve(defaultPath)) {
    writeCustomRootToUserData(null)
  } else {
    writeCustomRootToUserData(effective)
  }

  writeInstallDirPointer(effective)
}

function countInstanceProfiles(root: string): number {
  const instancesDir = path.join(root, 'Instances')
  try {
    const entries = fs.readdirSync(instancesDir, { withFileTypes: true })
    let count = 0
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        fs.accessSync(path.join(instancesDir, entry.name, 'profile.json'))
        count++
      } catch {
        /* no profile */
      }
    }
    return count
  } catch {
    return 0
  }
}

function uniqueRoots(roots: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const candidate of roots) {
    if (!candidate) continue
    const resolved = path.resolve(candidate)
    const key = resolved.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(resolved)
  }
  return out
}

function persistResolvedRoot(root: string): void {
  const defaultPath = getDefaultFledgeRoot()
  writeInstallDirPointer(root)
  if (path.resolve(root) === path.resolve(defaultPath)) {
    writeCustomRootToUserData(null)
  } else {
    writeCustomRootToUserData(root)
  }
}

let recoveredRootFrom: string | null = null

/** resolveFledgeRoot が代替ルートから復元した場合、そのパスを返す（1 回限り） */
export function takeRootRecoveryNotice(): string | null {
  const from = recoveredRootFrom
  recoveredRootFrom = null
  return from
}

/**
 * 実効データルート。
 * 優先: FLEDGE_ROOT → userData のカスタム → install 冗長ポインタ → 既定
 * 現ルートに Instances が無い場合は既知の代替ルートを探索して復元する。
 */
export function resolveFledgeRoot(): string {
  const fromEnv = process.env.FLEDGE_ROOT?.trim()
  if (fromEnv) return path.resolve(fromEnv)

  const defaultPath = getDefaultFledgeRoot()
  let root = readCustomRoot() ?? readInstallDirPointer() ?? defaultPath

  // userData のポインタだけ消えている場合、install 冗長ポインタから復元
  if (!readCustomRoot()) {
    const backup = readInstallDirPointer()
    if (backup && path.resolve(backup) !== path.resolve(defaultPath)) {
      root = backup
      writeCustomRootToUserData(backup)
    }
  }

  if (countInstanceProfiles(root) > 0) {
    writeInstallDirPointer(root)
    return root
  }

  const candidates = uniqueRoots([readInstallDirPointer(), defaultPath])
  for (const candidate of candidates) {
    if (path.resolve(candidate) === path.resolve(root)) continue
    if (countInstanceProfiles(candidate) > 0) {
      recoveredRootFrom = candidate
      persistResolvedRoot(candidate)
      return candidate
    }
  }

  writeInstallDirPointer(root)
  return root
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
