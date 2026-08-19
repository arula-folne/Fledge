import { dialog, ipcMain, shell } from 'electron'
import type { BrowserWindow } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  CreateInstanceInputSchema,
  IPC,
  IPC_EVENTS,
  SettingsSchema,
  SkinModelSchema,
  type CreateInstanceInput,
  type Settings,
  type SkinModel,
} from '@fledge/shared'
import { snapshotMinecraftInitialOptions, factoryReset, type LauncherApp } from '@fledge/core'
import { applyWindowUiScale } from '../windows/MainWindow'

function send(win: BrowserWindow | null, channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function applyLauncherWindowSize(win: BrowserWindow | null, settings: Settings): void {
  if (!win || win.isDestroyed()) return
  if (win.isFullScreen() || win.isMaximized()) return
  const width = Math.min(7680, Math.max(900, settings.launcherWindowWidth))
  const height = Math.min(4320, Math.max(600, settings.launcherWindowHeight))
  win.setSize(width, height)
}

function toRendererSettings(settings: Settings): Settings {
  return settings
}

export function registerIpc(
  appCtx: LauncherApp,
  getWindow: () => BrowserWindow | null,
  hooks?: { onFactoryReset?: () => void },
): void {
  const win = () => getWindow()
  const touchBackup = () => appCtx.backup.scheduleSync()

  appCtx.logger.onLine((line) => send(win(), IPC_EVENTS.logLine, line))
  appCtx.auth.onStatusChange?.((status) => send(win(), IPC_EVENTS.authStatus, status))

  ipcMain.handle(IPC.settingsGet, async () => toRendererSettings(await appCtx.settings.get()))
  ipcMain.handle(IPC.settingsSet, async (_e, partial: Partial<Settings>) => {
    const parsed = SettingsSchema.partial().parse(partial)
    if (typeof parsed.backupFolder === 'string' && parsed.backupFolder) {
      appCtx.backup.assertFolder(parsed.backupFolder)
    }
    const next = await appCtx.settings.set(parsed)
    if (
      Object.prototype.hasOwnProperty.call(parsed, 'launcherWindowWidth') ||
      Object.prototype.hasOwnProperty.call(parsed, 'launcherWindowHeight')
    ) {
      applyLauncherWindowSize(win(), next)
    }
    if (Object.prototype.hasOwnProperty.call(parsed, 'uiScale')) {
      const w = win()
      if (w) applyWindowUiScale(w, next.uiScale)
    }
    touchBackup()
    if (parsed.backupSyncEnabled === true) {
      void appCtx.backup.flushSync().catch((err) => {
        appCtx.logger.warn(
          'system',
          `Backup sync failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      })
    }
    return toRendererSettings(next)
  })
  ipcMain.handle(IPC.settingsReset, async () => {
    const next = await appCtx.settings.reset()
    applyLauncherWindowSize(win(), next)
    const w = win()
    if (w) applyWindowUiScale(w, next.uiScale)
    touchBackup()
    return toRendererSettings(next)
  })

  ipcMain.handle(IPC.pathsGet, async () => appCtx.paths)

  ipcMain.handle(IPC.shellOpenPath, async (_e, target: string) => {
    const allowed = [...Object.values(appCtx.paths), appCtx.paths.root]
    const normalized = target.replace(/\\/g, '/').toLowerCase()
    const ok = allowed.some((p) => normalized.startsWith(String(p).replace(/\\/g, '/').toLowerCase()))
    if (!ok) throw new Error('Path not allowed')
    await shell.openPath(target)
  })

  ipcMain.handle(IPC.dialogSelectFolder, async () => {
    const result = await dialog.showOpenDialog(win() ?? undefined!, {
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.instancesList, async () => appCtx.instances.list())
  ipcMain.handle(IPC.instancesGet, async (_e, id: string) => appCtx.instances.get(id))
  ipcMain.handle(IPC.instancesGetIcon, async (_e, id: string) => {
    if (typeof id !== 'string' || !id) return null
    return appCtx.instances.getIconDataUrl(id)
  })
  ipcMain.handle(IPC.instancesCreate, async (_e, input: CreateInstanceInput) => {
    const settings = await appCtx.settings.get()
    const profile = await appCtx.instances.create(CreateInstanceInputSchema.parse(input), {
      memoryMaxMb: settings.defaultMemoryMaxMb,
      jvmArgs: settings.defaultJvmArgs,
      seedMinecraftInitialSettings: true,
      pendingMinecraftOptions: snapshotMinecraftInitialOptions(
        settings.minecraftInitialSettings,
        input.minecraftVersion,
      ),
    })
    if (!settings.selectedInstanceId) {
      await appCtx.settings.set({ selectedInstanceId: profile.id })
    }
    touchBackup()
    return profile
  })
  ipcMain.handle(IPC.instancesUpdate, async (_e, id: string, partial: unknown) => {
    const updated = await appCtx.instances.update(id, partial as never)
    touchBackup()
    return updated
  })
  ipcMain.handle(IPC.instancesDuplicate, async (_e, id: string) => {
    const copied = await appCtx.instances.duplicate(id)
    touchBackup()
    return copied
  })
  ipcMain.handle(IPC.instancesRemove, async (_e, id: string) => {
    await appCtx.instances.remove(id)
    const settings = await appCtx.settings.get()
    if (settings.selectedInstanceId === id || settings.lastPlayedInstanceId === id) {
      const list = await appCtx.instances.list()
      await appCtx.settings.set({
        selectedInstanceId:
          settings.selectedInstanceId === id ? (list[0]?.id ?? null) : settings.selectedInstanceId,
        lastPlayedInstanceId:
          settings.lastPlayedInstanceId === id ? null : settings.lastPlayedInstanceId,
      })
    }
    touchBackup()
  })
  ipcMain.handle(IPC.instancesOpenFolder, async (_e, id: string) => {
    await shell.openPath(appCtx.instances.instanceDir(id))
  })
  ipcMain.handle(IPC.instancesOpenSubfolder, async (_e, id: string, subfolder: string) => {
    const allowed = new Set([
      'mods',
      'resourcepacks',
      'shaderpacks',
      'saves',
      'logs',
      'screenshots',
      'plugins',
    ])
    if (!allowed.has(subfolder)) throw new Error(`Invalid subfolder: ${subfolder}`)
    const dir = path.join(appCtx.instances.instanceDir(id), subfolder)
    await fs.mkdir(dir, { recursive: true })
    await shell.openPath(dir)
  })

  ipcMain.handle(IPC.contentProviders, async () => appCtx.content.listProviders())
  ipcMain.handle(IPC.contentSearch, async (_e, query: unknown) => appCtx.content.search(query))
  ipcMain.handle(IPC.contentGetProject, async (_e, projectId: string) =>
    appCtx.content.getProject(projectId),
  )
  ipcMain.handle(IPC.contentInstall, async (_e, req: unknown) => {
    const result = await appCtx.content.install(req)
    touchBackup()
    return result
  })
  ipcMain.handle(IPC.contentListInstalled, async (_e, instanceId: string, category?: string) =>
    appCtx.content.listInstalled(instanceId, category as never),
  )
  ipcMain.handle(
    IPC.contentSetEnabled,
    async (_e, instanceId: string, entryId: string, enabled: boolean) => {
      const result = await appCtx.content.setEnabled(instanceId, entryId, enabled)
      touchBackup()
      return result
    },
  )
  ipcMain.handle(IPC.contentRemove, async (_e, instanceId: string, entryId: string) => {
    const result = await appCtx.content.remove(instanceId, entryId)
    touchBackup()
    return result
  })
  ipcMain.handle(IPC.contentCheckUpdates, async (_e, instanceId: string) =>
    appCtx.content.checkUpdates(instanceId),
  )
  ipcMain.handle(
    IPC.contentListMedia,
    async (_e, instanceId: string, kind: 'screenshots' | 'logs') =>
      appCtx.content.listMedia(instanceId, kind),
  )

  ipcMain.handle(IPC.authLogin, async () => {
    const account = await appCtx.auth.login()
    return enrichAccount(account)
  })
  ipcMain.handle(IPC.authLogout, async (_e, accountId?: string) => appCtx.auth.logout(accountId))
  ipcMain.handle(IPC.authSession, async () => {
    const account = await appCtx.auth.getSession()
    return {
      account: account ? enrichAccount(account) : null,
      status: appCtx.auth.getStatus(),
    }
  })
  ipcMain.handle(IPC.authList, async () => {
    const list = await appCtx.auth.listAccounts()
    return list.map(enrichAccount)
  })
  ipcMain.handle(IPC.authSwitch, async (_e, accountId: string) => {
    const account = await appCtx.auth.switchAccount(accountId)
    return enrichAccount(account)
  })
  ipcMain.handle(IPC.authRemove, async (_e, accountId: string) => {
    await appCtx.auth.logout(accountId)
  })

  ipcMain.handle(IPC.versionsList, async (_e, opts?: { includeSnapshots?: boolean }) => {
    const settings = await appCtx.settings.get()
    return appCtx.versions.listVersions(opts?.includeSnapshots ?? settings.showSnapshots)
  })
  ipcMain.handle(
    IPC.versionsListMinecraft,
    async (_e, opts?: { includeSnapshots?: boolean; force?: boolean }) => {
      const settings = await appCtx.settings.get()
      return appCtx.versions.listMinecraftVersions({
        includeSnapshots: opts?.includeSnapshots ?? true,
        force: opts?.force,
      })
    },
  )
  ipcMain.handle(
    IPC.versionsListLoaders,
    async (
      _e,
      opts: { loader: string; minecraftVersion: string; force?: boolean },
    ) => {
      return appCtx.versions.listLoaderVersions({
        loader: opts.loader as never,
        minecraftVersion: opts.minecraftVersion,
        force: opts.force,
      })
    },
  )
  ipcMain.handle(
    IPC.versionsRefresh,
    async (
      _e,
      opts?: { target?: 'minecraft' | string; minecraftVersion?: string },
    ) => {
      await appCtx.versions.refresh({
        target: opts?.target as never,
        minecraftVersion: opts?.minecraftVersion,
      })
    },
  )

  ipcMain.handle(IPC.newsList, async () => appCtx.news.list())
  ipcMain.handle(IPC.logsRecent, async () => appCtx.logger.getRecent())
  ipcMain.handle(IPC.updaterCheck, async () => appCtx.updater.check())

  ipcMain.handle(IPC.skinsList, async () => appCtx.skins.list())
  ipcMain.handle(
    IPC.skinsUpload,
    async (
      _e,
      input: { name: string; model: SkinModel; bytes: number[]; originalName: string },
    ) => {
      const model = SkinModelSchema.parse(input.model)
      const skin = await appCtx.skins.upload({
        name: input.name,
        model,
        bytes: Uint8Array.from(input.bytes),
        originalName: input.originalName,
      })
      touchBackup()
      return skin
    },
  )
  ipcMain.handle(
    IPC.skinsUpdate,
    async (_e, input: { id: string; name?: string; model?: SkinModel }) => {
      const model = input.model ? SkinModelSchema.parse(input.model) : undefined
      const skin = await appCtx.skins.update(input.id, { name: input.name, model })
      const settings = await appCtx.settings.get()
      if (settings.selectedSkinId === skin.id && model) {
        await appCtx.settings.set({ skinModel: model })
        await applySkinToPlayableAccounts(appCtx, skin.id, model)
      }
      touchBackup()
      return skin
    },
  )
  ipcMain.handle(IPC.skinsRemove, async (_e, id: string) => {
    await appCtx.skins.remove(id)
    const settings = await appCtx.settings.get()
    if (settings.selectedSkinId === id) {
      await appCtx.settings.set({ selectedSkinId: 'steve', skinModel: 'wide' })
      await applySkinToPlayableAccounts(appCtx, 'steve', 'wide')
    }
    touchBackup()
  })
  ipcMain.handle(IPC.skinsGetData, async (_e, id: string) => {
    const skins = await appCtx.skins.list()
    const skin = skins.find((s) => s.id === id)
    if (!skin?.fileName) return null
    const filePath = appCtx.skins.resolveFilePath(skin.fileName)
    const buf = await fs.readFile(filePath)
    return `data:image/png;base64,${buf.toString('base64')}`
  })
  ipcMain.handle(
    IPC.skinsSelect,
    async (_e, input: { skinId: string; model?: SkinModel }) => {
      const patch: Partial<Settings> = { selectedSkinId: input.skinId }
      if (input.model) patch.skinModel = SkinModelSchema.parse(input.model)
      const next = await appCtx.settings.set(patch)
      await applySkinToPlayableAccounts(appCtx, next.selectedSkinId, next.skinModel)
      touchBackup()
      return toRendererSettings(next)
    },
  )

  ipcMain.handle(IPC.cacheClear, async () => {
    await fs.rm(appCtx.paths.cache, { recursive: true, force: true })
    await fs.rm(appCtx.paths.temp, { recursive: true, force: true })
    await fs.mkdir(appCtx.paths.cache, { recursive: true })
    await fs.mkdir(appCtx.paths.temp, { recursive: true })
    appCtx.logger.info('system', 'Cache cleared')
  })

  ipcMain.handle(IPC.appFactoryReset, async () => {
    await factoryReset(appCtx)
    hooks?.onFactoryReset?.()
  })

  ipcMain.handle(IPC.backupRun, async () => {
    const entry = await appCtx.backup.snapshot()
    return entry.path
  })
  ipcMain.handle(IPC.backupList, async () => appCtx.backup.list())
  ipcMain.handle(IPC.backupRestore, async (_e, backupPath: string) => {
    await appCtx.backup.restore(String(backupPath))
    const next = await appCtx.settings.get()
    applyLauncherWindowSize(win(), next)
    const w = win()
    if (w) applyWindowUiScale(w, next.uiScale)
  })
  ipcMain.handle(IPC.backupSyncNow, async () => {
    await appCtx.backup.syncNow()
  })

  ipcMain.handle(IPC.launchStart, async (_e, profileId: string, opts?: { accountId?: string }) => {
    const settings = await appCtx.settings.get()
    const result = await appCtx.launch.start(profileId, opts)
    if (settings.minimizeOnLaunch) {
      win()?.minimize()
    }
    return result
  })
  ipcMain.handle(IPC.launchPrepare, async (_e, profileId: string) => {
    return appCtx.launch.prepare(profileId)
  })
  ipcMain.handle(IPC.launchCancel, async (_e, sessionId?: string) => {
    appCtx.launch.cancel(sessionId)
  })
  ipcMain.handle(IPC.launchKill, async (_e, sessionId?: string) => {
    appCtx.launch.kill(sessionId)
  })
  ipcMain.handle(IPC.launchSessions, async () => appCtx.launch.listActiveSessions())

  ipcMain.handle(IPC.windowMinimize, async () => {
    win()?.minimize()
  })
  ipcMain.handle(IPC.windowMaximizeToggle, async () => {
    const w = win()
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.handle(IPC.windowClose, async () => {
    win()?.close()
  })
  ipcMain.handle(IPC.windowIsMaximized, async () => win()?.isMaximized() ?? false)

  ipcMain.handle(IPC.javaList, async () => appCtx.java.listRuntimes())
  ipcMain.handle(IPC.javaInstall, async (_e, major: number) => {
    const m = [8, 17, 21, 25].includes(major) ? (major as 8 | 17 | 21 | 25) : null
    if (!m) throw new Error('Unsupported Java major')
    return appCtx.java.install(m)
  })
  ipcMain.handle(IPC.javaReinstall, async (_e, major: number) => {
    const m = [8, 17, 21, 25].includes(major) ? (major as 8 | 17 | 21 | 25) : null
    if (!m) throw new Error('Unsupported Java major')
    return appCtx.java.reinstall(m)
  })
  ipcMain.handle(IPC.javaUninstall, async (_e, major: number) => {
    const m = [8, 17, 21, 25].includes(major) ? (major as 8 | 17 | 21 | 25) : null
    if (!m) throw new Error('Unsupported Java major')
    return appCtx.java.uninstall(m)
  })
  ipcMain.handle(IPC.javaVerify, async (_e, major: number) => {
    const m = [8, 17, 21, 25].includes(major) ? (major as 8 | 17 | 21 | 25) : null
    if (!m) throw new Error('Unsupported Java major')
    return appCtx.java.verify(m)
  })
  ipcMain.handle(IPC.javaOpenFolder, async (_e, major: number) => {
    const m = [8, 17, 21, 25].includes(major) ? (major as 8 | 17 | 21 | 25) : null
    if (!m) throw new Error('Unsupported Java major')
    const view = await appCtx.java.getRuntimeView(m)
    const target =
      view.installed && view.javaPath
        ? path.dirname(view.javaPath)
        : view.removable
          ? view.installDir
          : path.dirname(view.installDir)
    await fs.mkdir(target, { recursive: true })
    await shell.openPath(target)
  })
}

async function applySkinToPlayableAccounts(
  appCtx: LauncherApp,
  skinId: string,
  model: SkinModel,
): Promise<void> {
  const running = appCtx.launch
    .listActiveSessions()
    .filter((s) => ['preparing', 'launching', 'running'].includes(s.state))
    .map((s) => s.accountId)
  const ids = [...new Set(running)]
  if (ids.length === 0) {
    const active = await appCtx.auth.getSession()
    if (active) ids.push(active.id)
  }
  for (const accountId of ids) {
    await appCtx.skinApplier.apply(skinId, model, accountId)
  }
}

function enrichAccount<T extends { uuid: string; displayName: string; skinUrl?: string; avatarUrl?: string }>(
  account: T,
): T {
  const uuid = account.uuid.replaceAll('-', '')
  return {
    ...account,
    skinUrl: account.skinUrl ?? `https://mc-heads.net/skin/${uuid}`,
    avatarUrl: account.avatarUrl ?? `https://mc-heads.net/avatar/${uuid}/64`,
  }
}
