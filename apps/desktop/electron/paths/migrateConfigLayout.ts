import fs from 'node:fs'
import path from 'node:path'

function pathExists(file: string): boolean {
  try {
    fs.accessSync(file)
    return true
  } catch {
    return false
  }
}

function renameIfEmptyTarget(from: string, to: string): void {
  if (!pathExists(from)) return
  if (pathExists(to)) return
  fs.mkdirSync(path.dirname(to), { recursive: true })
  try {
    fs.renameSync(from, to)
  } catch {
    try {
      fs.cpSync(from, to, { recursive: true })
      fs.rmSync(from, { recursive: true, force: true })
    } catch {
      /* leave legacy in place */
    }
  }
}

/**
 * 旧レイアウト → 現行 Fledge レイアウト。
 *
 * configRoot/: instances  meta  caches  skins  temp
 * settingsRoot/: Settings  Accounts  logs  news
 */
export function migrateConfigLayout(configRoot: string, settingsRoot?: string): void {
  const root = path.resolve(configRoot)
  const settings = settingsRoot ? path.resolve(settingsRoot) : root

  // インスタンス（旧名含む）
  renameIfEmptyTarget(path.join(root, 'Instances'), path.join(root, 'instances'))
  renameIfEmptyTarget(path.join(root, 'profiles'), path.join(root, 'instances'))

  renameIfEmptyTarget(path.join(root, 'Data', 'Minecraft'), path.join(root, 'meta'))
  renameIfEmptyTarget(path.join(root, 'Data', 'Cache'), path.join(root, 'caches'))
  renameIfEmptyTarget(path.join(root, 'Data', 'java-version'), path.join(root, 'meta', 'java'))
  renameIfEmptyTarget(path.join(root, 'java'), path.join(root, 'meta', 'java'))
  renameIfEmptyTarget(path.join(root, 'meta', 'java_versions'), path.join(root, 'meta', 'java'))
  renameIfEmptyTarget(path.join(root, 'Data', 'Java'), path.join(root, 'meta', 'java', '_legacy-temurin'))
  renameIfEmptyTarget(path.join(root, 'Data', 'Skins'), path.join(root, 'skins'))
  renameIfEmptyTarget(path.join(root, 'Data', 'Temp'), path.join(root, 'temp'))

  // ランチャー系 → AppData
  renameIfEmptyTarget(path.join(root, 'Data', 'Logs'), path.join(settings, 'logs'))
  renameIfEmptyTarget(path.join(root, 'logs'), path.join(settings, 'logs'))
  renameIfEmptyTarget(path.join(settings, 'launcher_logs'), path.join(settings, 'logs'))
  renameIfEmptyTarget(path.join(root, 'Data', 'News'), path.join(settings, 'news'))
  renameIfEmptyTarget(path.join(root, 'news'), path.join(settings, 'news'))

  try {
    const dataDir = path.join(root, 'Data')
    if (pathExists(dataDir) && fs.readdirSync(dataDir).length === 0) {
      fs.rmdirSync(dataDir)
    }
  } catch {
    /* ignore */
  }
}

/** userData 直下にゲームデータがあった旧 0.3 レイアウト → data/ へ */
export function migrateUserDataRootToDataSubfolder(userDataRoot: string): void {
  const dataSub = path.join(userDataRoot, 'data')
  const markers = ['Instances', 'instances', 'profiles', 'Data', 'meta', 'caches']
  const hasGameDataAtRoot = markers.some((name) => pathExists(path.join(userDataRoot, name)))
  if (!hasGameDataAtRoot) return

  fs.mkdirSync(dataSub, { recursive: true })
  for (const name of fs.readdirSync(userDataRoot)) {
    if (
      name === 'Settings' ||
      name === 'Accounts' ||
      name === 'data' ||
      name === 'custom-root.json' ||
      name === 'logs' ||
      name === 'launcher_logs' ||
      name === 'news'
    ) {
      continue
    }
    if (name.endsWith('.json') && name !== 'custom-root.json') continue
    const lower = name.toLowerCase()
    if (
      [
        'cache',
        'code cache',
        'gpucache',
        'dawngraphitecache',
        'dawnwebgpucache',
        'local storage',
        'session storage',
        'shared dictionary',
        'sharedstorage',
        'blob_storage',
        'network',
        'preferences',
        'sentry',
        'lockfile',
      ].includes(lower)
    ) {
      continue
    }
    renameIfEmptyTarget(path.join(userDataRoot, name), path.join(dataSub, name))
  }
  migrateConfigLayout(dataSub, userDataRoot)
}
