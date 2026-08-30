import { app } from 'electron'
import { migrateConfigLayout, migrateUserDataRootToDataSubfolder } from './migrateConfigLayout.js'
import fs from 'node:fs'
import path from 'node:path'

const STORE_FILE = 'custom-root.json'
/** インストール先（exe 横）の冗長ポインタ。userData の custom-root.json が消えても復元できる */
const INSTALL_POINTER_FILE = 'data-root.json'

type RootPointerStore = {
  root?: string
}

function userDataStorePath(): string {
  return path.join(app.getPath('userData'), STORE_FILE)
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

function pathExists(file: string): boolean {
  try {
    fs.accessSync(file)
    return true
  } catch {
    return false
  }
}

function renameIfExists(from: string, to: string): void {
  if (!pathExists(from)) return
  if (pathExists(to)) return
  fs.mkdirSync(path.dirname(to), { recursive: true })
  try {
    fs.renameSync(from, to)
  } catch {
    // 別ディスク等 — コピーしてから削除
    try {
      fs.cpSync(from, to, { recursive: true })
      fs.rmSync(from, { recursive: true, force: true })
    } catch {
      /* leave legacy in place */
    }
  }
}

/**
 * アプリ本体のインストール先（Data を置かない）。
 * 本番レイアウトは `<install>/app/Fledge.exe` のため、exe 親が `app` ならその親を返す。
 */
export function getInstallDir(): string {
  if (!app.isPackaged) {
    return path.join(app.getAppPath())
  }
  const exeDir = path.dirname(app.getPath('exe'))
  if (path.basename(exeDir).toLowerCase() === 'app') {
    return path.dirname(exeDir)
  }
  return exeDir
}

/**
 * 設定・アカウントのルート（常に AppData / 開発時は .fledge-root）。
 * 更新でインストールフォルダが差し替わっても消えない。
 */
export function getSettingsRoot(): string {
  if (!app.isPackaged) {
    return path.join(app.getAppPath(), '.fledge-root')
  }
  return app.getPath('userData')
}

function installPointerPath(): string {
  return path.join(getInstallDir(), INSTALL_POINTER_FILE)
}

/** インストール先/exe 横へ実効 config ルートを記録（更新後の復元用） */
export function writeInstallDirPointer(root: string): void {
  try {
    writeRootToFile(installPointerPath(), root)
  } catch {
    /* Program Files 等で書けない場合は無視 */
  }
}

export function readInstallDirPointer(): string | null {
  return readRootFromFile(installPointerPath())
}

/**
 * ゲームデータ（instances / meta 等）の既定ルート。
 * 本番は %APPDATA%\\fledge\\data。開発は `.fledge-root/data`。
 */
export function getDefaultFledgeRoot(): string {
  if (!app.isPackaged) {
    return path.join(app.getAppPath(), '.fledge-root', 'data')
  }
  return path.join(app.getPath('userData'), 'data')
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
  for (const dirName of ['instances', 'Instances']) {
    const instancesDir = path.join(root, dirName)
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
      if (count > 0) return count
    } catch {
      /* try next */
    }
  }
  return 0
}

function hasPersistedUserData(root: string): boolean {
  if (countInstanceProfiles(root) > 0) return true
  const markers = [
    path.join(root, 'meta', 'versions'),
    path.join(root, 'Data', 'Minecraft', 'versions'),
    path.join(root, 'Data', 'Settings', 'settings.json'),
    path.join(root, 'Settings', 'settings.json'),
    path.join(root, 'Data', 'Accounts', 'index.json'),
    path.join(root, 'Accounts', 'index.json'),
  ]
  for (const file of markers) {
    if (pathExists(file)) return true
  }
  return false
}

function finalizeConfigRoot(root: string): string {
  const settingsRoot = getSettingsRoot()
  const defaultPath = getDefaultFledgeRoot()

  migrateSettingsAndAccounts(root)
  migrateUserDataRootToDataSubfolder(settingsRoot)

  let effective = root
  const custom = readCustomRoot()
  if (!custom && path.resolve(root) === path.resolve(settingsRoot)) {
    effective = defaultPath
    fs.mkdirSync(effective, { recursive: true })
  }

  migrateConfigLayout(effective)
  if (path.resolve(effective) !== path.resolve(root)) {
    migrateConfigLayout(root)
  }

  return effective
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

/**
 * 旧レイアウト `Data/Settings`・`Data/Accounts` を settingsRoot 直下へ移す。
 * config と settings が同じフォルダでも、Data の外へ出す（Modrinth 型）。
 */
function migrateSettingsAndAccounts(configRoot: string): void {
  const settingsRoot = getSettingsRoot()
  const legacySettings = path.join(configRoot, 'Data', 'Settings')
  const legacyAccounts = path.join(configRoot, 'Data', 'Accounts')
  const nextSettings = path.join(settingsRoot, 'Settings')
  const nextAccounts = path.join(settingsRoot, 'Accounts')

  renameIfExists(legacySettings, nextSettings)
  renameIfExists(legacyAccounts, nextAccounts)

  // settingsRoot と configRoot が違う場合、config 側に残ったレガシーも拾う
  if (path.resolve(settingsRoot) !== path.resolve(configRoot)) {
    renameIfExists(path.join(settingsRoot, 'Data', 'Settings'), nextSettings)
    renameIfExists(path.join(settingsRoot, 'Data', 'Accounts'), nextAccounts)
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
 * 実効 config ルート（Instances / Minecraft 等）。
 * 優先: FLEDGE_ROOT → userData のカスタム → install 冗長ポインタ → 既定（userData）
 * 現ルートにデータが無い場合はインストール先など既知の代替を探索する。
 */
export function resolveFledgeRoot(): string {
  const fromEnv = process.env.FLEDGE_ROOT?.trim()
  if (fromEnv) {
    const resolved = path.resolve(fromEnv)
    return finalizeConfigRoot(resolved)
  }

  const defaultPath = getDefaultFledgeRoot()
  const installDir = getInstallDir()
  let root = readCustomRoot() ?? readInstallDirPointer() ?? defaultPath

  // userData のポインタだけ消えている場合、install 冗長ポインタから復元
  if (!readCustomRoot()) {
    const backup = readInstallDirPointer()
    if (backup && path.resolve(backup) !== path.resolve(defaultPath)) {
      root = backup
      writeCustomRootToUserData(backup)
    }
  }

  if (hasPersistedUserData(root)) {
    writeInstallDirPointer(root)
    return finalizeConfigRoot(root)
  }

  // 旧既定（exe 横）にデータが残っていればそちらを優先（0.2.5b 以前からの移行）
  const candidates = uniqueRoots([readInstallDirPointer(), installDir, defaultPath])
  for (const candidate of candidates) {
    if (path.resolve(candidate) === path.resolve(root)) continue
    if (hasPersistedUserData(candidate)) {
      recoveredRootFrom = candidate
      persistResolvedRoot(candidate)
      return finalizeConfigRoot(candidate)
    }
  }

  writeInstallDirPointer(root)
  return finalizeConfigRoot(root)
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

/** settings.json の同期読取用パス（レガシー Data/Settings も候補） */
export function resolveSettingsFileCandidates(configRoot?: string): string[] {
  const settingsRoot = getSettingsRoot()
  const root = configRoot ?? getDefaultFledgeRoot()
  return [
    path.join(settingsRoot, 'Settings', 'settings.json'),
    path.join(root, 'Data', 'Settings', 'settings.json'),
    path.join(getInstallDir(), 'Data', 'Settings', 'settings.json'),
  ]
}
