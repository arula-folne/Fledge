import type { AuthProvider } from '../auth/AuthProvider.js'
import { resolvePathLayout, ensurePathLayout, type PathLayout } from '../app/paths.js'
import { ContentService } from '../content/ContentService.js'
import { DownloadQueue } from '../download/DownloadQueue.js'
import { InstanceStore } from '../instances/InstanceStore.js'
import { JavaManager } from '../java/JavaManager.js'
import { Logger } from '../logging/Logger.js'
import { MinecraftService } from '../minecraft/MinecraftService.js'
import { LocalJsonNewsProvider } from '../news/LocalJsonNewsProvider.js'
import type { NewsProvider } from '../news/NewsProvider.js'
import { LaunchOrchestrator, type LaunchEventBus } from '../orchestration/LaunchOrchestrator.js'
import { SettingsStore } from '../settings/SettingsStore.js'
import { SkinStore } from '../skins/SkinStore.js'
import { NoopUpdater } from '../updater/NoopUpdater.js'
import type { Updater } from '../updater/Updater.js'
import type { ProgressEvent, NewsItem } from '@fledge/shared'
import { BackupService } from '../backup/BackupService.js'
import { SessionJoinProxy } from '../auth/SessionJoinProxy.js'
import { SkinApplier } from '../skins/SkinApplier.js'
import { VersionService } from '../versions/VersionService.js'

export type LauncherApp = {
  paths: PathLayout
  settings: SettingsStore
  instances: InstanceStore
  skins: SkinStore
  news: NewsProvider
  updater: Updater
  logger: Logger
  queue: DownloadQueue
  java: JavaManager
  minecraft: MinecraftService
  versions: VersionService
  launch: LaunchOrchestrator
  auth: AuthProvider
  content: ContentService
  backup: BackupService
  sessionProxy: SessionJoinProxy
  skinApplier: SkinApplier
}

export type CreateLauncherAppOptions = {
  root: string
  auth: AuthProvider
  events: LaunchEventBus
  logger?: Logger
  newsBundledPath?: string
  defaultSkinsDir?: string
  onProgress?: (e: ProgressEvent) => void
  onNews?: (items: NewsItem[]) => void
  updater?: Updater
}

export async function createLauncherApp(options: CreateLauncherAppOptions): Promise<LauncherApp> {
  const paths = resolvePathLayout(options.root)
  await ensurePathLayout(paths)

  const logger = options.logger ?? new Logger()
  const settings = new SettingsStore(paths)
  const initialSettings = await settings.get()
  const instances = new InstanceStore(paths)
  const skins = new SkinStore(paths, options.defaultSkinsDir)
  const news = new LocalJsonNewsProvider(paths, options.newsBundledPath, undefined, options.onNews)
  const updater = options.updater ?? new NoopUpdater()
  const sessionProxy = new SessionJoinProxy(options.auth, logger)
  const skinApplier = new SkinApplier(skins, settings, options.auth, logger)

  const queue = new DownloadQueue((e) => {
    options.onProgress?.(e)
    options.events.emitProgress(e)
  }, initialSettings.concurrentDownloads)

  const originalSettingsSet = settings.set.bind(settings)
  settings.set = async (partial) => {
    const next = await originalSettingsSet(partial)
    if (Object.prototype.hasOwnProperty.call(partial, 'concurrentDownloads')) {
      queue.setConcurrency(next.concurrentDownloads)
    }
    return next
  }

  const java = new JavaManager(paths, queue, logger)
  const minecraft = new MinecraftService(paths, queue, logger)
  const versions = new VersionService(paths, logger)
  const content = new ContentService(instances, queue, logger, settings, versions, (e) => {
    options.onProgress?.(e)
    options.events.emitProgress(e)
  })
  const launch = new LaunchOrchestrator({
    auth: options.auth,
    instances,
    settings,
    java,
    minecraft,
    queue,
    logger,
    events: options.events,
    sessionProxy,
    skinApplier,
  })
  const backup = new BackupService(paths, settings, logger, () =>
    launch.listActiveSessions().some((s) =>
      s.state === 'preparing' || s.state === 'launching' || s.state === 'running',
    ),
  )

  return {
    paths,
    settings,
    instances,
    skins,
    news,
    updater,
    logger,
    queue,
    java,
    minecraft,
    versions,
    launch,
    auth: options.auth,
    content,
    backup,
    sessionProxy,
    skinApplier,
  }
}

export type { PathLayout, AuthProvider, LaunchEventBus }
