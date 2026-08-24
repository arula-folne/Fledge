import { app, dialog, ipcMain, screen, shell } from 'electron'
import type { BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {
  CreateInstanceInputSchema,
  IPC,
  IPC_EVENTS,
  APP_VERSION,
  InstanceProfileSchema,
  SettingsSchema,
  SkinModelSchema,
  type CreateInstanceInput,
  type Settings,
  type SkinModel,
} from '@fledge/shared'
import { snapshotMinecraftDebugOverlay, snapshotMinecraftInitialOptions, factoryReset, type LauncherApp } from '@fledge/core'
import { applyWindowUiScale } from '../windows/MainWindow'
import { isLightStart } from '../startup/lightStart'
import {
  resolvePackagedInstallRoot,
  scheduleCompleteUninstall,
} from '../uninstall/scheduleCompleteUninstall'

function decodeThumbDataUrl(dataUrl: string): { bytes: Buffer; ext: 'webp' | 'png' } {
  if (typeof dataUrl !== 'string') throw new Error('Invalid skin thumb')
  const webp = 'data:image/webp;base64,'
  const png = 'data:image/png;base64,'
  const prefix = dataUrl.startsWith(webp) ? webp : dataUrl.startsWith(png) ? png : null
  if (!prefix) throw new Error('Invalid skin thumb')
  const buf = Buffer.from(dataUrl.slice(prefix.length), 'base64')
  if (buf.length === 0 || buf.length > 400_000) throw new Error('Invalid skin thumb size')
  return { bytes: buf, ext: prefix === webp ? 'webp' : 'png' }
}

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
  hooks?: {
    onFactoryReset?: () => void
    onRelaunch?: () => void
    /** インストーラー起動後に終了（relaunch しない）。NSIS が新版を起動する */
    onQuitForUpdate?: () => void
    /** アンインストール用スクリプト起動後に終了（relaunch しない） */
    onUninstall?: () => void
  },
): void {
  const win = () => getWindow()
  const touchBackup = () => appCtx.backup.scheduleSync()

  appCtx.logger.onLine((line) => send(win(), IPC_EVENTS.logLine, line))
  appCtx.auth.onStatusChange?.((status, account) => {
    send(win(), IPC_EVENTS.authStatus, {
      status,
      account: account ? enrichAccount(account) : account === null ? null : undefined,
    })
  })

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
      pendingMinecraftDebugOverlay: snapshotMinecraftDebugOverlay(
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
    const update = InstanceProfileSchema.partial()
      .omit({ id: true, createdAt: true, updatedAt: true })
      .parse(partial)
    const updated = await appCtx.instances.update(id, update)
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
  ipcMain.handle(IPC.contentListVersions, async (_e, input: unknown) =>
    appCtx.content.listVersions(input),
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
    await appCtx.content.remove(instanceId, entryId)
    touchBackup()
  })
  ipcMain.handle(IPC.contentCheckUpdates, async (_e, instanceId: string) =>
    appCtx.content.checkUpdates(instanceId),
  )
  ipcMain.handle(
    IPC.contentListMedia,
    async (_e, instanceId: string, kind: 'screenshots' | 'logs') =>
      appCtx.content.listMedia(instanceId, kind),
  )
  ipcMain.handle(IPC.contentListCategoryTags, async () => appCtx.content.listCategoryTags())
  ipcMain.handle(IPC.contentCreateInstance, async (_e, req: unknown) => {
    const profile = await appCtx.content.createInstanceFromProject(req)
    touchBackup()
    return profile
  })
  ipcMain.handle(IPC.contentImportMrpack, async () => {
    const result = await dialog.showOpenDialog(win() ?? undefined!, {
      title: 'mrpack からインスタンスを作成',
      properties: ['openFile'],
      filters: [{ name: 'Modrinth Modpack', extensions: ['mrpack'] }],
    })
    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) return null
    const profile = await appCtx.content.importMrpackFromFile(filePath)
    touchBackup()
    return profile
  })
  ipcMain.handle(IPC.contentExportMrpack, async (_e, instanceId: string) => {
    const profile = await appCtx.instances.get(instanceId)
    if (!profile) throw new Error(`Instance not found: ${instanceId}`)
    const safeName =
      [...profile.name.replace(/[<>:"/\\|?*]/g, '_')]
        .map((char) => (char.charCodeAt(0) < 32 ? '_' : char))
        .join('')
        .trim() || 'modpack'
    const result = await dialog.showSaveDialog(win() ?? undefined!, {
      title: 'mrpack としてエクスポート',
      defaultPath: `${safeName}.mrpack`,
      filters: [{ name: 'Modrinth Modpack', extensions: ['mrpack'] }],
    })
    if (result.canceled || !result.filePath) return null
    const destination = result.filePath.toLowerCase().endsWith('.mrpack')
      ? result.filePath
      : `${result.filePath}.mrpack`
    await appCtx.content.exportMrpack(instanceId, destination)
    return destination
  })

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
  ipcMain.handle(IPC.updaterCheck, async () => {
    if (isLightStart()) {
      return { status: 'up-to-date' as const, currentVersion: APP_VERSION }
    }
    return appCtx.updater.check()
  })
  ipcMain.handle(IPC.updaterApply, async () => {
    if (!app.isPackaged) {
      throw new Error('updater.noop')
    }

    const installerPath = await appCtx.updater.downloadInstaller()
    const installDir = path.dirname(app.getPath('exe'))

    // インストールツリー内だと上書き中に消えるため、OS 一時領域へ退避する
    const stagingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fledge-update-'))
    const stagedInstaller = path.join(stagingDir, path.basename(installerPath))
    await fs.copyFile(installerPath, stagedInstaller)
    await appCtx.updater.clearCache()

    // electron-builder の更新契約に合わせる。/D は必ず最後・引用符なし。
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        stagedInstaller,
        ['--updated', '/S', '--force-run', `/D=${installDir}`],
        {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        },
      )
      child.once('error', (err) => reject(err))
      child.once('spawn', () => {
        child.unref()
        resolve()
      })
    })

    // 実行中のままだと Fledge.exe がロックされ旧版のまま残る
    hooks?.onQuitForUpdate?.()
  })

  ipcMain.handle(IPC.skinsList, async () => appCtx.skins.list())
  ipcMain.handle(
    IPC.skinsUpload,
    async (
      _e,
      input: {
        name: string
        model: SkinModel
        bytes: number[]
        originalName: string
        thumbDataUrl?: string
      },
    ) => {
      const model = SkinModelSchema.parse(input.model)
      const skin = await appCtx.skins.upload({
        name: input.name,
        model,
        bytes: Uint8Array.from(input.bytes),
        originalName: input.originalName,
        thumb: input.thumbDataUrl ? decodeThumbDataUrl(input.thumbDataUrl) : undefined,
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
    const buf = await appCtx.skins.readPngBytes(id)
    if (!buf) return null
    return `data:image/png;base64,${Buffer.from(buf).toString('base64')}`
  })
  ipcMain.handle(IPC.skinsGetThumb, async (_e, id: string, model: SkinModel) => {
    return appCtx.skins.readThumbDataUrl(id, SkinModelSchema.parse(model))
  })
  ipcMain.handle(
    IPC.skinsSaveThumb,
    async (_e, id: string, model: SkinModel, dataUrl: string) => {
      const parsedModel = SkinModelSchema.parse(model)
      const thumb = decodeThumbDataUrl(dataUrl)
      await appCtx.skins.writeThumb(id, parsedModel, thumb.bytes, thumb.ext)
    },
  )
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

  ipcMain.handle(IPC.appUninstall, async () => {
    if (!app.isPackaged) {
      throw new Error('settings.uninstallDevOnly')
    }

    appCtx.backup.cancelPending()
    appCtx.queue.cancelAll()
    appCtx.launch.stopAll()
    appCtx.java.clearMemo()
    try {
      await appCtx.sessionProxy.stop()
    } catch {
      /* ignore */
    }
    await new Promise((resolve) => setTimeout(resolve, 600))

    await scheduleCompleteUninstall(resolvePackagedInstallRoot())
    hooks?.onUninstall?.()
  })

  ipcMain.handle(IPC.appRelaunch, async () => {
    hooks?.onRelaunch?.()
  })

  ipcMain.handle(IPC.appDeviceSpecs, async () => {
    const display = screen.getPrimaryDisplay()
    const area = display.workAreaSize
    return {
      totalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
      cpuCount: os.cpus().length,
      workAreaWidth: area.width,
      workAreaHeight: area.height,
      scaleFactor: display.scaleFactor,
    }
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
  const gameRunning = ids.length > 0
  if (!gameRunning) {
    const active = await appCtx.auth.getSession()
    if (active) ids.push(active.id)
  }
  for (const accountId of ids) {
    // ユーザー操作・起動中どちらもトークンを強制更新してから送る（反映漏れを減らす）
    await appCtx.skinApplier.apply(skinId, model, accountId, {
      forceCredentials: true,
    })
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
