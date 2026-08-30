import { APP_VERSION, APP_VERSION_FULL } from './version.js'

export * from './version.js'

export const BRAND = {
  name: 'Fledge',
  versionFull: APP_VERSION_FULL,
  versionShort: APP_VERSION,
  author: 'folne',
  developedBy: 'Developed by folne',
} as const

/**
 * Discord Rich Presence 用 Application ID（デフォルト）。
 * Developer Portal でアプリ名を「Fledge」にすると「Fledgeをプレイ中」と表示される。
 * 上書きはデスクトップ側の FLEDGE_DISCORD_CLIENT_ID を使う。
 */
export const DISCORD_APPLICATION_ID = '1538229017608454205'

/** ユーザーがアップロードして保存できるスキンの上限 */
export const MAX_UPLOADED_SKINS = 10

/**
 * スキン一覧サムネイル（3D スナップショット）の解像度。
 * バージョンを上げると保存済みサムネイルは再生成される。
 */
export const SKIN_THUMB_VERSION = 3
export const SKIN_THUMB = {
  width: 336,
  height: 402,
  zoom: 0.72,
} as const

/** お知らせの GitHub 正本とキャッシュ設定 */
export const NEWS = {
  remoteUrl: 'https://raw.githubusercontent.com/arula-folne/Fledge/main/news/news.ja.json',
  localeFileName: 'news.ja.json',
  metaFileName: 'news.meta.json',
  /** 短い TTL。GitHub 上の更新をすぐ拾う（連打は in-flight でまとめる） */
  cacheTtlMs: 20_000,
  fetchTimeoutMs: 8_000,
} as const

/** GitHub Releases からの自動更新 */
export const UPDATER = {
  owner: 'arula-folne',
  repo: 'Fledge',
  /** GET /repos/{owner}/{repo}/releases/latest */
  latestReleaseUrl: 'https://api.github.com/repos/arula-folne/Fledge/releases/latest',
  /** プレリリース利用者向け。draft を除いてクライアント側で最新版を選ぶ。 */
  releasesUrl: 'https://api.github.com/repos/arula-folne/Fledge/releases?per_page=20',
  /** available 結果のキャッシュ寿命 */
  cacheTtlMs: 30 * 60 * 1000,
  /**
   * up-to-date のキャッシュ寿命。長すぎると「最新のまま」と誤認し、
   * その後に出た GitHub Release を見逃す。
   */
  upToDateCacheTtlMs: 60 * 1000,
  fetchTimeoutMs: 15_000,
  /** electron-builder の固定 artifactName と一致させる */
  installerNamePattern: /^Fledge-Setup\.exe$/i,
  installerFallbackPattern: /\.exe$/i,
  /** 第1世代の更新一覧取得件数（0.3+ を除外して最新 0.2.x を探す） */
  gen1ReleaseListPerPage: 30,
} as const

export const IPC = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsReset: 'settings:reset',
  instancesList: 'instances:list',
  instancesGet: 'instances:get',
  instancesCreate: 'instances:create',
  instancesUpdate: 'instances:update',
  instancesDuplicate: 'instances:duplicate',
  instancesRemove: 'instances:remove',
  instancesOpenFolder: 'instances:open-folder',
  instancesOpenSubfolder: 'instances:open-subfolder',
  instancesGetIcon: 'instances:get-icon',
  shellOpenPath: 'shell:open-path',
  pathsGet: 'paths:get',
  pathsGetAppDirectory: 'paths:get-app-directory',
  pathsSetAppDirectory: 'paths:set-app-directory',
  authLogin: 'auth:login',
  authLogout: 'auth:logout',
  authSession: 'auth:session',
  authList: 'auth:list',
  authSwitch: 'auth:switch',
  authRemove: 'auth:remove',
  versionsListMinecraft: 'versions:list-minecraft',
  versionsListLoaders: 'versions:list-loaders',
  versionsRefresh: 'versions:refresh',
  newsList: 'news:list',
  launchStart: 'launch:start',
  launchPrepare: 'launch:prepare',
  launchCancel: 'launch:cancel',
  launchKill: 'launch:kill',
  launchSessions: 'launch:sessions',
  updaterCheck: 'updater:check',
  updaterApply: 'updater:apply',
  skinsList: 'skins:list',
  skinsUpload: 'skins:upload',
  skinsUpdate: 'skins:update',
  skinsRemove: 'skins:remove',
  skinsSelect: 'skins:select',
  skinsGetData: 'skins:get-data',
  skinsGetThumb: 'skins:get-thumb',
  skinsSaveThumb: 'skins:save-thumb',
  cacheClear: 'cache:clear',
  appFactoryReset: 'app:factory-reset',
  appUninstall: 'app:uninstall',
  appRelaunch: 'app:relaunch',
  appDeviceSpecs: 'app:device-specs',
  appStartupInfo: 'app:startup-info',
  backupRun: 'backup:run',
  backupList: 'backup:list',
  backupRestore: 'backup:restore',
  backupSyncNow: 'backup:sync-now',
  dialogSelectFolder: 'dialog:select-folder',
  windowMinimize: 'window:minimize',
  windowMaximizeToggle: 'window:maximize-toggle',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  javaList: 'java:list',
  javaInstall: 'java:install',
  javaReinstall: 'java:reinstall',
  javaUninstall: 'java:uninstall',
  javaVerify: 'java:verify',
  javaOpenFolder: 'java:open-folder',
  contentSearch: 'content:search',
  contentGetProject: 'content:get-project',
  contentListVersions: 'content:list-versions',
  contentInstall: 'content:install',
  contentListInstalled: 'content:list-installed',
  contentSetEnabled: 'content:set-enabled',
  contentRemove: 'content:remove',
  contentCheckUpdates: 'content:check-updates',
  contentListMedia: 'content:list-media',
  contentReadLog: 'content:read-log',
  contentProviders: 'content:providers',
  contentListCategoryTags: 'content:list-category-tags',
  contentCreateInstance: 'content:create-instance',
  contentPickMrpack: 'content:pick-mrpack',
  contentImportMrpack: 'content:import-mrpack',
  contentImportMrpackFromPath: 'content:import-mrpack-from-path',
  contentListMrpackExportCandidates: 'content:list-mrpack-export-candidates',
  contentExportMrpack: 'content:export-mrpack',
} as const

export const IPC_EVENTS = {
  progress: 'event:progress',
  launchPhase: 'event:launch-phase',
  launchState: 'event:launch-state',
  authStatus: 'event:auth-status',
  newsUpdated: 'event:news-updated',
  windowSize: 'event:window-size',
} as const
