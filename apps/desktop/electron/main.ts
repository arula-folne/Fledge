import { app, BrowserWindow, Menu, net, protocol } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createLauncherApp, GithubReleaseUpdater, Logger, NoopUpdater, resolvePathLayout, type LauncherApp } from '@fledge/core'
import { IPC_EVENTS, type LaunchStateEvent } from '@fledge/shared'
import { MicrosoftAuthProvider } from './auth/MicrosoftAuthProvider'
import { DiscordPresence } from './discord/DiscordPresence'
import { defaultEnvCandidatePaths, loadFledgeEnvFiles } from './env/loadEnv'
import { registerIpc } from './ipc/registerIpc'
import { TokenVault } from './security/tokenVault'
import { createMainWindow, resolveFledgeRoot } from './windows/MainWindow'

let mainWindow: BrowserWindow | null = null
let launcherApp: LauncherApp | null = null
let discordPresence: DiscordPresence | null = null
let cachedClientId: string | undefined
let allowQuit = false
let relaunchScheduled = false

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
    app.relaunch({ execPath: process.execPath })
  }
  app.quit()
}

/** 設定リセット等: 終了して同じ exe を起動し直す */
async function scheduleAppRelaunch(options?: {
  skipBackupFlush?: boolean
  delayMs?: number
}): Promise<void> {
  await scheduleAppExit({ ...options, relaunch: true })
}

/** settings.json を同期読み（app.ready 前の HA 切替用。失敗時は既定 ON） */
function peekHardwareAcceleration(root: string): boolean {
  try {
    const file = path.join(root, 'Data', 'Settings', 'settings.json')
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { hardwareAcceleration?: unknown }
    if (typeof raw.hardwareAcceleration === 'boolean') return raw.hardwareAcceleration
  } catch {
    // missing / invalid → default
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
  loadFledgeEnvFiles(
    defaultEnvCandidatePaths(root, app.getAppPath(), path.dirname(process.execPath)),
  )
  const logger = new Logger()
  const vault = new TokenVault(path.join(root, 'Data', 'Accounts'))
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
    auth,
    logger,
    events: events as never,
    newsBundledPath: path.join(app.getAppPath(), 'resources', 'news.ja.json'),
    defaultSkinsDir: resolveBundledSkinsDir(),
    updater: app.isPackaged
      ? new GithubReleaseUpdater(resolvePathLayout(root))
      : new NoopUpdater(),
  })

  const settings = await launcherApp.settings.get()
  cachedClientId = settings.msaClientId
  await presence.setEnabled(settings.discordRichPresence)

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
      void scheduleAppRelaunch({ skipBackupFlush: true, delayMs: 400 })
    },
    onRelaunch: () => {
      void scheduleAppRelaunch()
    },
    onQuitForUpdate: () => {
      // ロック解除のため少し待ってから終了。relaunch はせず NSIS に任せる
      void scheduleAppExit({ relaunch: false, delayMs: 500 })
    },
  })
  mainWindow = createMainWindow({
    width: settings.launcherWindowWidth,
    height: settings.launcherWindowHeight,
    frame: settings.useOsWindowChrome,
    uiScale: settings.uiScale,
  })
  logger.info('system', `Fledge root: ${root}`)
  if (settings.backupSyncEnabled) launcherApp.backup.scheduleSync()

  const warmupId = settings.lastPlayedInstanceId ?? settings.selectedInstanceId
  if (warmupId) {
    void launcherApp.launch.warmup(warmupId).catch((err) => {
      logger.warn(
        'launcher',
        `Launch warmup skipped: ${err instanceof Error ? err.message : String(err)}`,
      )
    })
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
  protocol.handle('fledge-skin', (request) => {
    const name = path.basename(new URL(request.url).pathname)
    if (!DEFAULT_SKIN_FILE.test(name)) {
      return new Response('Not found', { status: 404 })
    }
    const file = path.join(resolveBundledSkinsDir(), name)
    return net.fetch(pathToFileURL(file).href)
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
      mainWindow = createMainWindow({
        width: s?.launcherWindowWidth,
        height: s?.launcherWindowHeight,
        frame: s?.useOsWindowChrome ?? false,
        uiScale: s?.uiScale ?? 'normal',
      })
    })()
  }
})
