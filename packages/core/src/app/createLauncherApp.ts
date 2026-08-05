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
import { NoopUpdater } from '../updater/NoopUpdater.js'
import type { Updater } from '../updater/Updater.js'
import type { ProgressEvent } from '@fledge/shared'
import { SkinStore } from '../skins/SkinStore.js'
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
}

export type CreateLauncherAppOptions = {
  root: string
  auth: AuthProvider
  events: LaunchEventBus
  logger?: Logger
  newsBundledPath?: string
  onProgress?: (e: ProgressEvent) => void
}

export async function createLauncherApp(options: CreateLauncherAppOptions): Promise<LauncherApp> {
  const paths = resolvePathLayout(options.root)
  await ensurePathLayout(paths)

  const logger = options.logger ?? new Logger()
  const settings = new SettingsStore(paths)
  const instances = new InstanceStore(paths)
  const skins = new SkinStore(paths)
  const news = new LocalJsonNewsProvider(paths, options.newsBundledPath)
  const updater = new NoopUpdater()

  const queue = new DownloadQueue((e) => {
    options.onProgress?.(e)
    options.events.emitProgress(e)
  })

  const java = new JavaManager(paths, queue, logger)
  const minecraft = new MinecraftService(paths, queue, logger)
  const versions = new VersionService(paths, logger)
  const getCurseForgeApiKey = async () => {
    const fromEnv = process.env['FLEDGE_CURSEFORGE_API_KEY']?.trim()
    if (fromEnv) return fromEnv
    const s = await settings.get()
    const fromSettings = s.curseforgeApiKey?.trim()
    return fromSettings || undefined
  }
  const content = new ContentService(instances, queue, logger, getCurseForgeApiKey)
  const launch = new LaunchOrchestrator({
    auth: options.auth,
    instances,
    settings,
    java,
    minecraft,
    queue,
    logger,
    events: options.events,
  })

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
  }
}

export type { PathLayout, AuthProvider, LaunchEventBus }
