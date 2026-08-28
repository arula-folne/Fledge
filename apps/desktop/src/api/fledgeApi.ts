import type {
  AccountView,
  AuthStatus,
  AuthStatusEvent,
  AppDirectoryInfo,
  BackupEntry,
  ContentCategory,
  ContentCategoryTag,
  ContentCreateInstanceRequest,
  ContentInstallRequest,
  ContentLoaderFilter,
  ContentMediaItem,
  ContentProjectPage,
  ContentSearchQuery,
  ContentSearchResult,
  ContentVersion,
  CreateInstanceInput,
  DeviceSpecs,
  InstalledContent,
  InstanceProfile,
  LaunchPhaseEvent,
  LaunchStateEvent,
  Loader,
  LoaderVersionListResult,
  MrpackExportCandidates,
  MrpackExportOptions,
  NewsItem,
  PathInfo,
  ProgressEvent,
  Settings,
  SkinEntry,
  SkinModel,
  UpdateInstanceInput,
  UpdateCheckResult,
  UpdateChannel,
  VersionListResult,
  JavaRuntimeView,
  JavaVerifyResult,
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
    getAppDirectory: () => Promise<AppDirectoryInfo>
    setAppDirectory: (path: string | null) => Promise<AppDirectoryInfo>
  }
  instances: {
    list: () => Promise<InstanceProfile[]>
    get: (id: string) => Promise<InstanceProfile | null>
    create: (input: CreateInstanceInput) => Promise<InstanceProfile>
    update: (id: string, partial: UpdateInstanceInput) => Promise<InstanceProfile>
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
    readLog: (
      instanceId: string,
      fileName: string,
    ) => Promise<{ name: string; text: string; truncated: boolean }>
    listCategoryTags: () => Promise<ContentCategoryTag[]>
    createInstance: (req: ContentCreateInstanceRequest) => Promise<InstanceProfile>
    pickMrpack: () => Promise<string | null>
    importMrpack: () => Promise<InstanceProfile | null>
    importMrpackFromPath: (filePath: string) => Promise<InstanceProfile>
    listMrpackExportCandidates: (instanceId: string) => Promise<MrpackExportCandidates>
    exportMrpack: (instanceId: string, options?: MrpackExportOptions) => Promise<string | null>
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
    authStatus: (cb: (e: AuthStatusEvent) => void) => () => void
    newsUpdated: (cb: (items: NewsItem[]) => void) => () => void
    windowSize: (cb: (size: { width: number; height: number }) => void) => () => void
  }
}

declare global {
  interface Window {
    fledge: FledgeApi
  }
}

function getApi(): FledgeApi {
  if (!window.fledge) {
    throw new Error(
      'Fledge API が利用できません。preload の読み込みに失敗している可能性があります。',
    )
  }
  return window.fledge
}

export const fledgeApi: FledgeApi = new Proxy({} as FledgeApi, {
  get(_target, prop, receiver) {
    const api = getApi()
    const value = Reflect.get(api, prop, receiver)
    return typeof value === 'function' ? value.bind(api) : value
  },
})
