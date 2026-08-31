import { app, BrowserWindow, Menu, net, protocol } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createLauncherApp, GithubReleaseUpdater, Logger, NoopUpdater, resolvePathLayout, type LauncherApp } from '@fledge/core'
import { IPC_EVENTS, type LaunchStateEvent, type NewsItem, type Settings } from '@fledge/shared'
import { MicrosoftAuthProvider } from './auth/MicrosoftAuthProvider'
import { DiscordPresence } from './discord/DiscordPresence'
import { defaultEnvCandidatePaths, loadFledgeEnvFiles } from './env/loadEnv'
import { registerIpc } from './ipc/registerIpc'
import { TokenVault } from './security/tokenVault'
import { applyLightStartEnv, isLightStart } from './startup/lightStart'
import { preparePostUpdateSettings } from './startup/updateStartup'
import { attachWindowSizeSync, createMainWindow, resolveFledgeRoot } from './windows/MainWindow'
import { configureAppDataPaths } from './paths/configureAppDataPaths'
import { cleanupLegacyTempUpdateDirs } from './updater/staging'
import { getSettingsRoot, resolveSettingsFileCandidates } from './paths/customRoot'
import { takeRootRecoveryNotice } from './paths/customRoot'

configureAppDataPaths()
applyLightStartEnv()

// ready 前: 使わない Chromium 機能を落としてベースメモリを抑える
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService')

let mainWindow: BrowserWindow | null = null
let launcherApp: LauncherApp | null = null
let discordPresence: DiscordPresence | null = null
let cachedClientId: string | undefined
let allowQuit = false
let relaunchScheduled = false

type MainWindowOptions = {
  width?: number
  height?: number
  uiScale?: Settings['uiScale']
}

let lastMainWindowOptions: MainWindowOptions = {}

function setupMainWindow(options: MainWindowOptions): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy()
  }
  lastMainWindowOptions = options
  mainWindow = createMainWindow({
    width: options.width,
    height: options.height,
    uiScale: options.uiScale,
  })
  attachWindowSizeSync(mainWindow, {
    emit: (size) => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      mainWindow.webContents.send(IPC_EVENTS.windowSize, size)
    },
    persist: (size) => {
      void launcherApp?.settings
        .set({
          launcherWindowWidth: size.width,
          launcherWindowHeight: size.height,
        })
        .catch(() => undefined)
    },
  })
  return mainWindow
}

/** preload 変更時は renderer リロードだけでは API が更新されないため、開発時のみウィンドウを作り直す */
function attachDevPreloadHotReload(): void {
  if (app.isPackaged) return
  const preloadPath = path.join(__dirname, '../preload/index.js')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    fs.watch(preloadPath, () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        const bounds = mainWindow.getBounds()
        const maximized = mainWindow.isMaximized()
        console.log('[dev] Preload updated — recreating main window')
        setupMainWindow({
          ...lastMainWindowOptions,
          width: bounds.width,
          height: bounds.height,
        })
        if (maximized) mainWindow.maximize()
      }, 250)
    })
  } catch (err) {
    console.warn('[dev] Preload hot reload unavailable:', err)
  }
}

function getWindow(): BrowserWindow | null {
  return mainWindow
}

/**
 * アプリを終了する。必要なら同じ exe を起動し直す。
 * 開発版 (electron-vite) は Vite 無しの Electron だけが起きるため relaunch しない。
 */
async function scheduleAppExit(options?: {
  /** 完全リセット後は Data が消えているのでバックアップ flush を省略 */
  skipBackupFlush?: boolean
  /** ファイルハンドル解放待ち（完全リセット後・更新適用後など） */
  delayMs?: number
  /** true なら終了後に同じ exe を起動（更新適用時は false: NSIS が新版を起動） */
  relaunch?: boolean
  /** 再起動時の argv（省略時は現在の process.argv を引き継ぐ） */
  relaunchArgs?: string[]
}): Promise<void> {
  if (relaunchScheduled) return
  relaunchScheduled = true
  allowQuit = true

  if (options?.delayMs && options.delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, options.delayMs))
  }

  try {
    await discordPresence?.destroy()
  } catch {
    /* ignore */
  }

  if (!options?.skipBackupFlush) {
    try {
      await launcherApp?.backup.flushSync()
    } catch {
      /* ignore */
    }
    try {
      await launcherApp?.sessionProxy.stop()
    } catch {
      /* ignore */
    }
  }

  if (options?.relaunch !== false && app.isPackaged) {
    app.relaunch({
      execPath: process.execPath,
      args: options?.relaunchArgs ?? process.argv.slice(1),
    })
  }
  app.quit()
}

/** 設定リセット等: 終了して同じ exe を起動し直す */
async function scheduleAppRelaunch(options?: {
  skipBackupFlush?: boolean
  delayMs?: number
  relaunchArgs?: string[]
}): Promise<void> {
  await scheduleAppExit({ ...options, relaunch: true })
}

/** settings.json を同期読み（app.ready 前の HA 切替用。失敗時は既定 ON） */
function peekHardwareAcceleration(configRoot: string): boolean {
  for (const file of resolveSettingsFileCandidates(configRoot)) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { hardwareAcceleration?: unknown }
      if (typeof raw.hardwareAcceleration === 'boolean') return raw.hardwareAcceleration
    } catch {
      // missing / invalid → try next
    }
  }
  return true
}

function resolveBundledSkinsDir(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'skins')
  return path.join(__dirname, '../../resources/skins')
}

const DEFAULT_SKIN_FILE = /^[a-z]+\.png$/

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'fledge-skin',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
  {
    scheme: 'fledge-screenshot',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

async function syncPresenceFromLaunchState(e: LaunchStateEvent): Promise<void> {
  if (!discordPresence || !launcherApp) return

  if (e.state === 'preparing' || e.state === 'launching' || e.state === 'running') {
    const profileId = e.profileId ?? (await launcherApp.settings.get()).selectedInstanceId
    const profile = profileId ? await launcherApp.instances.get(profileId) : null
    discordPresence.setContext({
      phase: e.state,
      instanceName: profile?.name,
      minecraftVersion: profile?.minecraftVersion,
      loader: profile?.loader,
    })
    return
  }

  if (e.state === 'idle' || e.state === 'exited' || e.state === 'error') {
    const remaining = launcherApp.launch.listActiveSessions().filter((s) =>
      ['preparing', 'launching', 'running'].includes(s.state),
    )
    if (remaining[0]) {
      const profile = await launcherApp.instances.get(remaining[0].profileId)
      discordPresence.setContext({
        phase: remaining[0].state as 'preparing' | 'launching' | 'running',
        instanceName: profile?.name,
        minecraftVersion: profile?.minecraftVersion,
        loader: profile?.loader,
      })
      return
    }
    discordPresence.setContext({
      phase: 'idle',
      instanceName: undefined,
      minecraftVersion: undefined,
      loader: undefined,
    })
  }
}

async function bootstrap(): Promise<void> {
  const root = resolveFledgeRoot()
  const settingsRoot = getSettingsRoot()
  loadFledgeEnvFiles(
    defaultEnvCandidatePaths(root, app.getAppPath(), path.dirname(process.execPath)),
  )
  const logger = new Logger()
  const vault = new TokenVault(path.join(settingsRoot, 'Accounts'))
  const presence = new DiscordPresence(logger)
  discordPresence = presence

  const events = {
    emitProgress: (e: unknown) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_EVENTS.progress, e)
      }
    },
    emitPhase: (e: unknown) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_EVENTS.launchPhase, e)
      }
    },
    emitState: (e: unknown) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_EVENTS.launchState, e)
      }
      void syncPresenceFromLaunchState(e as LaunchStateEvent)
      if ((e as LaunchStateEvent).state === 'exited') {
        launcherApp?.backup.scheduleSync()
      }
    },
  }

  const auth = new MicrosoftAuthProvider(vault, logger, () => cachedClientId)

  launcherApp = await createLauncherApp({
    root,
    settingsRoot,
    auth,
    logger,
    events: events as never,
    newsBundledPath: path.join(app.getAppPath(), 'resources', 'news.ja.json'),
    defaultSkinsDir: resolveBundledSkinsDir(),
    onNews: (items: NewsItem[]) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_EVENTS.newsUpdated, items)
      }
    },
    updater:
      app.isPackaged || process.env.FLEDGE_DEV_UPDATER === '1'
        ? new GithubReleaseUpdater(resolvePathLayout(root, settingsRoot))
        : new NoopUpdater(),
  })

  const settings = await preparePostUpdateSettings(launcherApp)
  cachedClientId = settings.msaClientId
  const lightStart = isLightStart()
  if (lightStart) {
    // インストール直後は Discord 接続を後回しにしてウィンドウ表示を優先
    setTimeout(() => {
      void presence.setEnabled(settings.discordRichPresence)
    }, 12_000)
  } else {
    await presence.setEnabled(settings.discordRichPresence)
  }

  const originalSet = launcherApp.settings.set.bind(launcherApp.settings)
  launcherApp.settings.set = async (partial) => {
    const next = await originalSet(partial)
    cachedClientId = next.msaClientId
    if (Object.prototype.hasOwnProperty.call(partial, 'discordRichPresence')) {
      void presence.setEnabled(next.discordRichPresence)
    }
    return next
  }

  registerIpc(launcherApp, getWindow, {
    onFactoryReset: () => {
      // --updated 等を引き継ぐと更新完了ポップアップが消えない
      void scheduleAppRelaunch({ skipBackupFlush: true, delayMs: 400, relaunchArgs: [] })
    },
    onRelaunch: () => {
      void scheduleAppRelaunch()
    },
    onQuitForUpdate: () => {
      // WMI で待機スクリプト起動済み。すぐ終了して NSIS 待ち時間を短くする
      void scheduleAppExit({ relaunch: false, delayMs: 300 })
    },
    onUninstall: () => {
      void scheduleAppExit({ relaunch: false, skipBackupFlush: true, delayMs: 400 })
    },
  })
  setupMainWindow({
    width: settings.launcherWindowWidth,
    height: settings.launcherWindowHeight,
    uiScale: settings.uiScale,
  })
  attachDevPreloadHotReload()
  logger.info('system', `Fledge root: ${root}${lightStart ? ' (light start)' : ''}`)
  const recoveredRoot = takeRootRecoveryNotice()
  if (recoveredRoot) {
    logger.info('system', `Restored Fledge root from alternate location: ${recoveredRoot}`)
  }
  if (!lightStart && settings.backupSyncEnabled) launcherApp.backup.scheduleSync()

  const warmupId = settings.lastPlayedInstanceId ?? settings.selectedInstanceId
  if (!lightStart && warmupId) {
    // 起動直後のメモリを抑えるため、warmup は遅延実行
    setTimeout(() => {
      void launcherApp?.launch.warmup(warmupId).catch((err) => {
        logger.warn(
          'launcher',
          `Launch warmup skipped: ${err instanceof Error ? err.message : String(err)}`,
        )
      })
    }, 25_000)
  }
}
// ready 前に適用（Electron 要件）
{
  const root = resolveFledgeRoot()
  if (!peekHardwareAcceleration(root)) {
    app.disableHardwareAcceleration()
  }
}

app.whenReady().then(() => {
  // 更新直後はウィンドウ表示を優先（TEMP 掃除は後回し）
  if (isLightStart()) {
    setTimeout(() => {
      void cleanupLegacyTempUpdateDirs()
    }, 15_000)
  } else {
    void cleanupLegacyTempUpdateDirs()
  }
  protocol.handle('fledge-skin', (request) => {
    const name = path.basename(new URL(request.url).pathname)
    if (!DEFAULT_SKIN_FILE.test(name)) {
      return new Response('Not found', { status: 404 })
    }
    const file = path.join(resolveBundledSkinsDir(), name)
    return net.fetch(pathToFileURL(file).href)
  })
  protocol.handle('fledge-screenshot', (request) => {
    try {
      const url = new URL(request.url)
      const parts = url.pathname.split('/').filter(Boolean)
      // fledge-screenshot://local/{instanceId}/{fileName}
      if (parts.length < 2) {
        return new Response('Not found', { status: 404 })
      }
      const instanceId = decodeURIComponent(parts[0]!)
      const fileName = decodeURIComponent(parts.slice(1).join('/'))
      if (!/^[a-zA-Z0-9._-]+$/.test(instanceId)) {
        return new Response('Not found', { status: 404 })
      }
      const base = path.basename(fileName)
      if (!base || base !== fileName || base.includes('..')) {
        return new Response('Not found', { status: 404 })
      }
      if (!/\.(png|jpe?g|webp|gif)$/i.test(base)) {
        return new Response('Not found', { status: 404 })
      }
      const screenshotsDir = launcherApp
        ? path.resolve(launcherApp.instances.instanceDir(instanceId), 'screenshots')
        : path.resolve(resolveFledgeRoot(), 'instances', instanceId, 'screenshots')
      const full = path.resolve(screenshotsDir, base)
      const rel = path.relative(screenshotsDir, full)
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return new Response('Not found', { status: 404 })
      }
      return net.fetch(pathToFileURL(full).href)
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
  Menu.setApplicationMenu(null)
  void bootstrap().catch((err) => {
    console.error(err)
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (e) => {
  if (allowQuit) {
    void discordPresence?.destroy()
    return
  }
  e.preventDefault()
  void (async () => {
    try {
      await launcherApp?.backup.flushSync()
    } catch {
      /* ignore */
    }
    try {
      await launcherApp?.sessionProxy.stop()
    } catch {
      /* ignore */
    }
    await discordPresence?.destroy()
    allowQuit = true
    app.quit()
  })()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void (async () => {
      const s = await launcherApp?.settings.get()
      setupMainWindow({
        width: s?.launcherWindowWidth,
        height: s?.launcherWindowHeight,
        uiScale: s?.uiScale ?? 'normal',
      })
    })()
  }
})
