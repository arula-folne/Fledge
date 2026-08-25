import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC,
  IPC_EVENTS,
  type AccountView,
  type BackupEntry,
  type AuthStatus,
  type AuthStatusEvent,
  type ContentCategory,
  type ContentCategoryTag,
  type ContentCreateInstanceRequest,
  type ContentInstallRequest,
  type ContentLoaderFilter,
  type ContentMediaItem,
  type ContentProjectPage,
  type ContentSearchQuery,
  type ContentSearchResult,
  type ContentVersion,
  type CreateInstanceInput,
  type InstalledContent,
  type InstanceProfile,
  type DeviceSpecs,
  type LaunchPhaseEvent,
  type LaunchStateEvent,
  type Loader,
  type LoaderVersionListResult,
  type LogLine,
  type NewsItem,
  type PathInfo,
  type ProgressEvent,
  type Settings,
  type SkinEntry,
  type SkinModel,
  type UpdateCheckResult,
  type UpdateChannel,
  type VersionInfo,
  type VersionListResult,
  type JavaRuntimeView,
  type JavaVerifyResult,
} from '@fledge/shared'

export type FledgeApi = {
  settings: {
    get: () => Promise<Settings>
    set: (partial: Partial<Settings>) => Promise<Settings>
    reset: () => Promise<Settings>
  }
  paths: {
    get: () => Promise<PathInfo>
    open: (target: string) => Promise<void>
    selectFolder: () => Promise<string | null>
  }
  instances: {
    list: () => Promise<InstanceProfile[]>
    get: (id: string) => Promise<InstanceProfile | null>
    create: (input: CreateInstanceInput) => Promise<InstanceProfile>
    update: (id: string, partial: Partial<InstanceProfile>) => Promise<InstanceProfile>
    duplicate: (id: string) => Promise<InstanceProfile>
    remove: (id: string) => Promise<void>
    openFolder: (id: string) => Promise<void>
    openSubfolder: (
      id: string,
      subfolder: 'mods' | 'resourcepacks' | 'shaderpacks' | 'saves' | 'logs' | 'screenshots' | 'plugins',
    ) => Promise<void>
    getIcon: (id: string) => Promise<string | null>
  }
  content: {
    providers: () => Promise<
      Array<{
        id: 'modrinth'
        name: string
        available: boolean
        unavailableReasonKey?: string
      }>
    >
    search: (query: ContentSearchQuery) => Promise<ContentSearchResult>
    getProject: (projectId: string) => Promise<ContentProjectPage>
    listVersions: (input: {
      projectId: string
      gameVersion?: string
      loaders?: ContentLoaderFilter[]
    }) => Promise<ContentVersion[]>
    install: (req: ContentInstallRequest) => Promise<InstalledContent>
    listInstalled: (instanceId: string, category?: ContentCategory) => Promise<InstalledContent[]>
    setEnabled: (instanceId: string, entryId: string, enabled: boolean) => Promise<InstalledContent>
    remove: (instanceId: string, entryId: string) => Promise<void>
    checkUpdates: (instanceId: string) => Promise<InstalledContent[]>
    listMedia: (
      instanceId: string,
      kind: 'screenshots' | 'logs',
    ) => Promise<ContentMediaItem[]>
    listCategoryTags: () => Promise<ContentCategoryTag[]>
    createInstance: (req: ContentCreateInstanceRequest) => Promise<InstanceProfile>
    importMrpack: () => Promise<InstanceProfile | null>
    exportMrpack: (instanceId: string) => Promise<string | null>
  }
  skins: {
    list: () => Promise<SkinEntry[]>
    upload: (input: {
      name: string
      model: SkinModel
      bytes: number[]
      originalName: string
      thumbDataUrl?: string
    }) => Promise<SkinEntry>
    update: (input: { id: string; name?: string; model?: SkinModel }) => Promise<SkinEntry>
    remove: (id: string) => Promise<void>
    select: (input: { skinId: string; model?: SkinModel }) => Promise<Settings>
    getDataUrl: (id: string) => Promise<string | null>
    getThumb: (id: string, model: SkinModel) => Promise<string | null>
    saveThumb: (id: string, model: SkinModel, dataUrl: string) => Promise<void>
  }
  auth: {
    login: () => Promise<AccountView>
    logout: (accountId?: string) => Promise<void>
    session: () => Promise<{ account: AccountView | null; status: AuthStatus }>
    list: () => Promise<AccountView[]>
    switch: (accountId: string) => Promise<AccountView>
    remove: (accountId: string) => Promise<void>
  }
  versions: {
    list: (opts?: { includeSnapshots?: boolean }) => Promise<VersionInfo[]>
    listMinecraft: (opts?: {
      includeSnapshots?: boolean
      force?: boolean
    }) => Promise<VersionListResult>
    listLoaders: (opts: {
      loader: Loader
      minecraftVersion: string
      force?: boolean
    }) => Promise<LoaderVersionListResult>
    refresh: (opts?: {
      target?: 'minecraft' | Loader
      minecraftVersion?: string
    }) => Promise<void>
  }
  news: {
    list: () => Promise<NewsItem[]>
  }
  launch: {
    start: (profileId: string, opts?: { accountId?: string }) => Promise<{ sessionId: string }>
    prepare: (profileId: string) => Promise<{ sessionId: string }>
    cancel: (sessionId?: string) => Promise<void>
    kill: (sessionId?: string) => Promise<void>
    sessions: () => Promise<
      Array<{ sessionId: string; profileId: string; accountId: string; state: string }>
    >
  }
  logs: {
    recent: () => Promise<LogLine[]>
  }
  updater: {
    check: (channel?: UpdateChannel) => Promise<UpdateCheckResult>
    apply: (channel?: UpdateChannel) => Promise<void>
  }
  cache: {
    clear: () => Promise<void>
  }
  app: {
    factoryReset: () => Promise<void>
    uninstall: () => Promise<void>
    relaunch: () => Promise<void>
    deviceSpecs: () => Promise<DeviceSpecs>
  }
  backup: {
    run: () => Promise<string>
    list: () => Promise<BackupEntry[]>
    restore: (backupPath: string) => Promise<void>
    syncNow: () => Promise<void>
  }
  window: {
    minimize: () => Promise<void>
    maximizeToggle: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
  }
  java: {
    list: () => Promise<JavaRuntimeView[]>
    install: (major: 8 | 17 | 21 | 25) => Promise<JavaRuntimeView>
    reinstall: (major: 8 | 17 | 21 | 25) => Promise<JavaRuntimeView>
    uninstall: (major: 8 | 17 | 21 | 25) => Promise<JavaRuntimeView>
    verify: (major: 8 | 17 | 21 | 25) => Promise<JavaVerifyResult>
    openFolder: (major: 8 | 17 | 21 | 25) => Promise<void>
  }
  on: {
    progress: (cb: (e: ProgressEvent) => void) => () => void
    launchPhase: (cb: (e: LaunchPhaseEvent) => void) => () => void
    launchState: (cb: (e: LaunchStateEvent) => void) => () => void
    logLine: (cb: (e: LogLine) => void) => () => void
    authStatus: (cb: (e: AuthStatusEvent) => void) => () => void
    newsUpdated: (cb: (items: NewsItem[]) => void) => () => void
  }
}

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: FledgeApi = {
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    set: (partial) => ipcRenderer.invoke(IPC.settingsSet, partial),
    reset: () => ipcRenderer.invoke(IPC.settingsReset),
  },
  paths: {
    get: () => ipcRenderer.invoke(IPC.pathsGet),
    open: (target) => ipcRenderer.invoke(IPC.shellOpenPath, target),
    selectFolder: () => ipcRenderer.invoke(IPC.dialogSelectFolder),
  },
  instances: {
    list: () => ipcRenderer.invoke(IPC.instancesList),
    get: (id) => ipcRenderer.invoke(IPC.instancesGet, id),
    create: (input) => ipcRenderer.invoke(IPC.instancesCreate, input),
    update: (id, partial) => ipcRenderer.invoke(IPC.instancesUpdate, id, partial),
    duplicate: (id) => ipcRenderer.invoke(IPC.instancesDuplicate, id),
    remove: (id) => ipcRenderer.invoke(IPC.instancesRemove, id),
    openFolder: (id) => ipcRenderer.invoke(IPC.instancesOpenFolder, id),
    openSubfolder: (id, subfolder) =>
      ipcRenderer.invoke(IPC.instancesOpenSubfolder, id, subfolder),
    getIcon: (id) => ipcRenderer.invoke(IPC.instancesGetIcon, id),
  },
  content: {
    providers: () => ipcRenderer.invoke(IPC.contentProviders),
    search: (query) => ipcRenderer.invoke(IPC.contentSearch, query),
    getProject: (projectId) => ipcRenderer.invoke(IPC.contentGetProject, projectId),
    listVersions: (input) => ipcRenderer.invoke(IPC.contentListVersions, input),
    install: (req) => ipcRenderer.invoke(IPC.contentInstall, req),
    listInstalled: (instanceId, category) =>
      ipcRenderer.invoke(IPC.contentListInstalled, instanceId, category),
    setEnabled: (instanceId, entryId, enabled) =>
      ipcRenderer.invoke(IPC.contentSetEnabled, instanceId, entryId, enabled),
    remove: (instanceId, entryId) =>
      ipcRenderer.invoke(IPC.contentRemove, instanceId, entryId),
    checkUpdates: (instanceId) => ipcRenderer.invoke(IPC.contentCheckUpdates, instanceId),
    listMedia: (instanceId, kind) =>
      ipcRenderer.invoke(IPC.contentListMedia, instanceId, kind),
    listCategoryTags: () => ipcRenderer.invoke(IPC.contentListCategoryTags),
    createInstance: (req) => ipcRenderer.invoke(IPC.contentCreateInstance, req),
    importMrpack: () => ipcRenderer.invoke(IPC.contentImportMrpack),
    exportMrpack: (instanceId) => ipcRenderer.invoke(IPC.contentExportMrpack, instanceId),
  },
  skins: {
    list: () => ipcRenderer.invoke(IPC.skinsList),
    upload: (input) => ipcRenderer.invoke(IPC.skinsUpload, input),
    update: (input) => ipcRenderer.invoke(IPC.skinsUpdate, input),
    remove: (id) => ipcRenderer.invoke(IPC.skinsRemove, id),
    select: (input) => ipcRenderer.invoke(IPC.skinsSelect, input),
    getDataUrl: (id) => ipcRenderer.invoke(IPC.skinsGetData, id),
    getThumb: (id, model) => ipcRenderer.invoke(IPC.skinsGetThumb, id, model),
    saveThumb: (id, model, dataUrl) => ipcRenderer.invoke(IPC.skinsSaveThumb, id, model, dataUrl),
  },
  auth: {
    login: () => ipcRenderer.invoke(IPC.authLogin),
    logout: (accountId) => ipcRenderer.invoke(IPC.authLogout, accountId),
    session: () => ipcRenderer.invoke(IPC.authSession),
    list: () => ipcRenderer.invoke(IPC.authList),
    switch: (accountId) => ipcRenderer.invoke(IPC.authSwitch, accountId),
    remove: (accountId) => ipcRenderer.invoke(IPC.authRemove, accountId),
  },
  versions: {
    list: (opts) => ipcRenderer.invoke(IPC.versionsList, opts),
    listMinecraft: (opts) => ipcRenderer.invoke(IPC.versionsListMinecraft, opts),
    listLoaders: (opts) => ipcRenderer.invoke(IPC.versionsListLoaders, opts),
    refresh: (opts) => ipcRenderer.invoke(IPC.versionsRefresh, opts),
  },
  news: {
    list: () => ipcRenderer.invoke(IPC.newsList),
  },
  launch: {
    start: (profileId, opts) => ipcRenderer.invoke(IPC.launchStart, profileId, opts),
    prepare: (profileId) => ipcRenderer.invoke(IPC.launchPrepare, profileId),
    cancel: (sessionId) => ipcRenderer.invoke(IPC.launchCancel, sessionId),
    kill: (sessionId) => ipcRenderer.invoke(IPC.launchKill, sessionId),
    sessions: () => ipcRenderer.invoke(IPC.launchSessions),
  },
  logs: {
    recent: () => ipcRenderer.invoke(IPC.logsRecent),
  },
  updater: {
    check: (channel) => ipcRenderer.invoke(IPC.updaterCheck, channel ?? 'stable'),
    apply: (channel) => ipcRenderer.invoke(IPC.updaterApply, channel ?? 'stable'),
  },
  cache: {
    clear: () => ipcRenderer.invoke(IPC.cacheClear),
  },
  app: {
    factoryReset: () => ipcRenderer.invoke(IPC.appFactoryReset),
    uninstall: () => ipcRenderer.invoke(IPC.appUninstall),
    relaunch: () => ipcRenderer.invoke(IPC.appRelaunch),
    deviceSpecs: () => ipcRenderer.invoke(IPC.appDeviceSpecs),
  },
  backup: {
    run: () => ipcRenderer.invoke(IPC.backupRun),
    list: () => ipcRenderer.invoke(IPC.backupList),
    restore: (backupPath) => ipcRenderer.invoke(IPC.backupRestore, backupPath),
    syncNow: () => ipcRenderer.invoke(IPC.backupSyncNow),
  },
  window: {
    minimize: () => ipcRenderer.invoke(IPC.windowMinimize),
    maximizeToggle: () => ipcRenderer.invoke(IPC.windowMaximizeToggle),
    close: () => ipcRenderer.invoke(IPC.windowClose),
    isMaximized: () => ipcRenderer.invoke(IPC.windowIsMaximized),
  },
  java: {
    list: () => ipcRenderer.invoke(IPC.javaList),
    install: (major) => ipcRenderer.invoke(IPC.javaInstall, major),
    reinstall: (major) => ipcRenderer.invoke(IPC.javaReinstall, major),
    uninstall: (major) => ipcRenderer.invoke(IPC.javaUninstall, major),
    verify: (major) => ipcRenderer.invoke(IPC.javaVerify, major),
    openFolder: (major) => ipcRenderer.invoke(IPC.javaOpenFolder, major),
  },
  on: {
    progress: (cb) => subscribe(IPC_EVENTS.progress, cb),
    launchPhase: (cb) => subscribe(IPC_EVENTS.launchPhase, cb),
    launchState: (cb) => subscribe(IPC_EVENTS.launchState, cb),
    logLine: (cb) => subscribe(IPC_EVENTS.logLine, cb),
    authStatus: (cb) => subscribe(IPC_EVENTS.authStatus, cb),
    newsUpdated: (cb) => subscribe(IPC_EVENTS.newsUpdated, cb),
  },
}

contextBridge.exposeInMainWorld('fledge', api)
