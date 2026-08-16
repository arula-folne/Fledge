import fs from 'node:fs/promises'
import path from 'node:path'
import type { BackupEntry, BackupKind } from '@fledge/shared'
import type { PathLayout } from '../app/paths.js'
import type { Logger } from '../logging/Logger.js'
import type { SettingsStore } from '../settings/SettingsStore.js'

const SYNC_DIR = 'fledge-sync'
const SNAPSHOT_PREFIX = 'fledge-backup-'
const MANIFEST = 'fledge-backup.json'
const SYNC_DEBOUNCE_MS = 8000

type Manifest = {
  kind: BackupKind
  createdAt: string
  app: 'Fledge'
}

function isInside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child))
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function mirrorDir(src: string, dest: string): Promise<void> {
  await fs.rm(dest, { recursive: true, force: true })
  if (!(await exists(src))) return
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.cp(src, dest, { recursive: true, force: true })
}

/**
 * Fledge 設定・スキン・インスタンス（Mod / ワールド等）のバックアップ。
 * Minecraft 本体・Java・キャッシュは含めない。
 */
export class BackupService {
  private timer: ReturnType<typeof setTimeout> | null = null
  private inflight: Promise<void> | null = null

  constructor(
    private readonly layout: PathLayout,
    private readonly settings: SettingsStore,
    private readonly logger: Logger,
    private readonly isGameRunning: () => boolean,
  ) {}

  scheduleSync(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.syncNow().catch((err) => {
        this.logger.warn(
          'system',
          `Backup sync failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      })
    }, SYNC_DEBOUNCE_MS)
  }

  async flushSync(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    await this.syncNow()
  }

  async snapshot(): Promise<BackupEntry> {
    const folder = await this.requireFolder()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const dest = path.join(folder, `${SNAPSHOT_PREFIX}${stamp}`)
    await this.writePayload(dest, 'snapshot')
    this.logger.info('system', `Backup snapshot: ${dest}`)
    return this.entryFromDir(dest, 'snapshot')
  }

  async syncNow(): Promise<void> {
    const settings = await this.settings.get()
    if (!settings.backupSyncEnabled || !settings.backupFolder) return
    if (this.inflight) return this.inflight
    this.inflight = this.writePayload(path.join(settings.backupFolder, SYNC_DIR), 'sync')
      .then(() => {
        this.logger.info('system', 'Backup sync updated')
      })
      .finally(() => {
        this.inflight = null
      })
    return this.inflight
  }

  async list(): Promise<BackupEntry[]> {
    const folder = await this.requireFolder()
    let names: string[] = []
    try {
      names = await fs.readdir(folder)
    } catch {
      return []
    }
    const entries: BackupEntry[] = []
    for (const name of names) {
      const full = path.join(folder, name)
      let stat
      try {
        stat = await fs.stat(full)
      } catch {
        continue
      }
      if (!stat.isDirectory()) continue
      if (name === SYNC_DIR) {
        entries.push(await this.entryFromDir(full, 'sync', stat.mtime.toISOString()))
        continue
      }
      if (name.startsWith(SNAPSHOT_PREFIX)) {
        entries.push(await this.entryFromDir(full, 'snapshot', stat.mtime.toISOString()))
      }
    }
    return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async restore(backupPath: string): Promise<void> {
    const folder = await this.requireFolder()
    const resolved = path.resolve(backupPath)
    if (!isInside(folder, resolved)) {
      throw new Error('バックアップの場所が不正です')
    }
    if (this.isGameRunning()) {
      throw new Error('ゲーム実行中は復元できません。終了してからやり直してください。')
    }
    if (!(await exists(resolved))) {
      throw new Error('バックアップが見つかりません')
    }

    const dataDir = path.join(resolved, 'Data')
    const settingsSrc = path.join(dataDir, 'Settings')
    const skinsSrc = path.join(dataDir, 'Skins')
    const instancesSrc = path.join(resolved, 'Instances')
    const hasManifest = await exists(path.join(resolved, MANIFEST))
    const hasSettings = await exists(path.join(settingsSrc, 'settings.json'))
    if (!hasManifest && !hasSettings) {
      throw new Error('このフォルダは Fledge のバックアップではありません')
    }

    const keep = await this.settings.get()
    await mirrorDir(settingsSrc, this.layout.settings)
    await mirrorDir(skinsSrc, this.layout.skins)
    await mirrorDir(instancesSrc, this.layout.instances)

    await this.settings.reload()
    await this.settings.set({
      backupFolder: keep.backupFolder,
      backupSyncEnabled: keep.backupSyncEnabled,
    })
    this.logger.info('system', `Backup restored from ${resolved}`)
  }

  private async requireFolder(): Promise<string> {
    const folder = (await this.settings.get()).backupFolder
    if (!folder) throw new Error('バックアップフォルダが設定されていません')
    this.assertFolder(folder)
    await fs.mkdir(folder, { recursive: true })
    return folder
  }

  assertFolder(folder: string): void {
    if (isInside(this.layout.root, folder) || path.resolve(folder) === path.resolve(this.layout.root)) {
      throw new Error('アプリフォルダの内側はバックアップ先にできません')
    }
  }

  private async writePayload(dest: string, kind: BackupKind): Promise<void> {
    await fs.mkdir(dest, { recursive: true })
    const dataDest = path.join(dest, 'Data')
    await fs.mkdir(dataDest, { recursive: true })
    await mirrorDir(this.layout.settings, path.join(dataDest, 'Settings'))
    await mirrorDir(this.layout.skins, path.join(dataDest, 'Skins'))
    await mirrorDir(this.layout.instances, path.join(dest, 'Instances'))
    const manifest: Manifest = {
      kind,
      createdAt: new Date().toISOString(),
      app: 'Fledge',
    }
    await fs.writeFile(path.join(dest, MANIFEST), JSON.stringify(manifest, null, 2), 'utf8')
  }

  private async entryFromDir(
    dir: string,
    fallbackKind: BackupKind,
    fallbackCreatedAt?: string,
  ): Promise<BackupEntry> {
    let kind = fallbackKind
    let createdAt = fallbackCreatedAt ?? new Date().toISOString()
    try {
      const raw = JSON.parse(await fs.readFile(path.join(dir, MANIFEST), 'utf8')) as Partial<Manifest>
      if (raw.kind === 'snapshot' || raw.kind === 'sync') kind = raw.kind
      if (typeof raw.createdAt === 'string') createdAt = raw.createdAt
    } catch {
      /* 旧バックアップ */
    }
    return {
      id: path.basename(dir),
      kind,
      path: dir,
      createdAt,
    }
  }
}
