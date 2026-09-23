/**
 * Tauri bridge: injects `window.fledge` with the same surface as Electron preload.
 * Uses a single `fledge_invoke` command so ACL stays simple during migration.
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { IPC, IPC_EVENTS } from '@fledge/shared'
import type { FledgeApi } from '../api/fledgeApi'

async function call<T>(method: string, args?: unknown): Promise<T> {
  return invoke<T>('fledge_invoke', {
    method,
    args: args === undefined ? null : args,
  })
}

function packArgs(...args: unknown[]): unknown {
  if (args.length === 0) return null
  if (args.length === 1) return args[0] ?? null
  return args
}

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  let unlisten: UnlistenFn | undefined
  let cancelled = false
  void listen<T>(channel, (event) => {
    cb(event.payload)
  }).then((fn) => {
    if (cancelled) {
      fn()
      return
    }
    unlisten = fn
  })
  return () => {
    cancelled = true
    unlisten?.()
  }
}

export function createTauriFledgeApi(): FledgeApi {
  const api: FledgeApi = {
    settings: {
      get: () => call(IPC.settingsGet),
      set: (partial) => call(IPC.settingsSet, partial),
      reset: () => call(IPC.settingsReset),
      exportOptions: () => call(IPC.settingsExportOptions),
      importOptions: () => call(IPC.settingsImportOptions),
    },
    paths: {
      get: () => call(IPC.pathsGet),
      open: (target) => call(IPC.shellOpenPath, target),
      selectFolder: () => call(IPC.dialogSelectFolder),
      getAppDirectory: () => call(IPC.pathsGetAppDirectory),
      setAppDirectory: (next) => call(IPC.pathsSetAppDirectory, next),
    },
    instances: {
      list: () => call(IPC.instancesList),
      get: (id) => call(IPC.instancesGet, id),
      create: (input) => call(IPC.instancesCreate, input),
      update: (id, partial) => call(IPC.instancesUpdate, packArgs(id, partial)),
      duplicate: (id) => call(IPC.instancesDuplicate, id),
      remove: (id) => call(IPC.instancesRemove, id),
      openFolder: (id) => call(IPC.instancesOpenFolder, id),
      openSubfolder: (id, subfolder) =>
        call(IPC.instancesOpenSubfolder, packArgs(id, subfolder)),
      getIcon: (id) => call(IPC.instancesGetIcon, id),
    },
    content: {
      providers: () => call(IPC.contentProviders),
      search: (query) => call(IPC.contentSearch, query),
      getProject: (projectId) => call(IPC.contentGetProject, projectId),
      listVersions: (input) => call(IPC.contentListVersions, input),
      install: (req) => call(IPC.contentInstall, req),
      listInstalled: (instanceId, category) =>
        call(IPC.contentListInstalled, packArgs(instanceId, category)),
      setEnabled: (instanceId, entryId, enabled) =>
        call(IPC.contentSetEnabled, packArgs(instanceId, entryId, enabled)),
      remove: (instanceId, entryId) =>
        call(IPC.contentRemove, packArgs(instanceId, entryId)),
      checkUpdates: (instanceId) => call(IPC.contentCheckUpdates, instanceId),
      listMedia: (instanceId, kind) => call(IPC.contentListMedia, packArgs(instanceId, kind)),
      deleteMedia: (instanceId, kind, fileName) =>
        call(IPC.contentDeleteMedia, packArgs(instanceId, kind, fileName)),
      copyScreenshot: (instanceId, fileName) =>
        call(IPC.contentCopyScreenshot, packArgs(instanceId, fileName)),
      readLog: (instanceId, fileName) =>
        call(IPC.contentReadLog, packArgs(instanceId, fileName)),
      listCategoryTags: () => call(IPC.contentListCategoryTags),
      createInstance: (req) => call(IPC.contentCreateInstance, req),
      pickMrpack: () => call(IPC.contentPickMrpack),
      importMrpack: () => call(IPC.contentImportMrpack),
      importMrpackFromPath: (filePath) => call(IPC.contentImportMrpackFromPath, filePath),
      listMrpackExportCandidates: (instanceId) =>
        call(IPC.contentListMrpackExportCandidates, instanceId),
      exportMrpack: (instanceId, options) =>
        call(IPC.contentExportMrpack, packArgs(instanceId, options)),
    },
    skins: {
      list: () => call(IPC.skinsList),
      upload: (input) => call(IPC.skinsUpload, input),
      update: (input) => call(IPC.skinsUpdate, input),
      remove: (id) => call(IPC.skinsRemove, id),
      select: (input) => call(IPC.skinsSelect, input),
      getDataUrl: (id) => call(IPC.skinsGetData, id),
      getThumb: (id, model) => call(IPC.skinsGetThumb, packArgs(id, model)),
      saveThumb: (id, model, dataUrl) =>
        call(IPC.skinsSaveThumb, packArgs(id, model, dataUrl)),
      resolvePath: (id) => call(IPC.skinsResolvePath, id),
      resolveThumbPath: (id, model) => call(IPC.skinsResolveThumbPath, packArgs(id, model)),
    },
    capes: {
      list: () => call(IPC.capesList),
      select: (capeId) => call(IPC.capesSelect, capeId),
      fetchTexture: (url) => call(IPC.capesFetchTexture, url),
    },
    auth: {
      login: () => call(IPC.authLogin),
      logout: (accountId) => call(IPC.authLogout, accountId),
      session: () => call(IPC.authSession),
      list: () => call(IPC.authList),
      switch: (accountId) => call(IPC.authSwitch, accountId),
      remove: (accountId) => call(IPC.authRemove, accountId),
    },
    versions: {
      listMinecraft: (opts) => call(IPC.versionsListMinecraft, opts),
      listLoaders: (opts) => call(IPC.versionsListLoaders, opts),
      listLoaderGames: (opts) => call(IPC.versionsListLoaderGames, opts),
      refresh: (opts) => call(IPC.versionsRefresh, opts),
    },
    news: {
      list: () => call(IPC.newsList),
    },
    launch: {
      start: (profileId, opts) => call(IPC.launchStart, packArgs(profileId, opts)),
      prepare: (profileId) => call(IPC.launchPrepare, profileId),
      cancel: (sessionId) => call(IPC.launchCancel, sessionId),
      kill: (sessionId) => call(IPC.launchKill, sessionId),
      sessions: () => call(IPC.launchSessions),
    },
    updater: {
      check: (channel, opts) =>
        call(IPC.updaterCheck, {
          channel: channel ?? 'stable',
          force: Boolean(opts?.force),
        }),
      apply: (channel) => call(IPC.updaterApply, channel ?? 'stable'),
    },
    cache: {
      clear: () => call(IPC.cacheClear),
    },
    app: {
      factoryReset: () => call(IPC.appFactoryReset),
      uninstall: () => call(IPC.appUninstall),
      relaunch: () => call(IPC.appRelaunch),
      getStartupInfo: () => call(IPC.appStartupInfo),
    },
    window: {
      minimize: () => call(IPC.windowMinimize),
      maximizeToggle: () => call(IPC.windowMaximizeToggle),
      close: () => call(IPC.windowClose),
      isMaximized: () => call(IPC.windowIsMaximized),
    },
    java: {
      list: () => call(IPC.javaList),
      install: (major) => call(IPC.javaInstall, major),
      reinstall: (major) => call(IPC.javaReinstall, major),
      uninstall: (major) => call(IPC.javaUninstall, major),
      verify: (major) => call(IPC.javaVerify, major),
      openFolder: (major) => call(IPC.javaOpenFolder, major),
    },
    on: {
      progress: (cb) => subscribe(IPC_EVENTS.progress, cb),
      launchPhase: (cb) => subscribe(IPC_EVENTS.launchPhase, cb),
      launchState: (cb) => subscribe(IPC_EVENTS.launchState, cb),
      authStatus: (cb) => subscribe(IPC_EVENTS.authStatus, cb),
      newsUpdated: (cb) => subscribe(IPC_EVENTS.newsUpdated, cb),
      windowSize: (cb) => subscribe(IPC_EVENTS.windowSize, cb),
    },
  }
  return api
}

export function installTauriFledgeApi(): void {
  if (typeof window === 'undefined') return
  if (window.fledge) return
  window.fledge = createTauriFledgeApi()
}
