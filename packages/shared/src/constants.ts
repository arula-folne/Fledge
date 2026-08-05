export const BRAND = {
  name: 'Fledge',
  tagline: 'Ready to take flight.',
} as const

/**
 * Discord Rich Presence 用 Application ID（デフォルト）。
 * Developer Portal でアプリ名を「Fledge」にすると「Fledgeをプレイ中」と表示される。
 * 上書きはデスクトップ側の FLEDGE_DISCORD_CLIENT_ID を使う。
 */
export const DISCORD_APPLICATION_ID = '1357924680135792468'

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
  shellOpenPath: 'shell:open-path',
  pathsGet: 'paths:get',
  authLogin: 'auth:login',
  authLogout: 'auth:logout',
  authSession: 'auth:session',
  authList: 'auth:list',
  authSwitch: 'auth:switch',
  authRemove: 'auth:remove',
  versionsList: 'versions:list',
  versionsListMinecraft: 'versions:list-minecraft',
  versionsListLoaders: 'versions:list-loaders',
  versionsRefresh: 'versions:refresh',
  newsList: 'news:list',
  launchStart: 'launch:start',
  launchCancel: 'launch:cancel',
  launchKill: 'launch:kill',
  launchSessions: 'launch:sessions',
  logsRecent: 'logs:recent',
  updaterCheck: 'updater:check',
  skinsList: 'skins:list',
  skinsUpload: 'skins:upload',
  skinsRemove: 'skins:remove',
  skinsSelect: 'skins:select',
  skinsGetData: 'skins:get-data',
  cacheClear: 'cache:clear',
  backupRun: 'backup:run',
  dialogSelectFolder: 'dialog:select-folder',
  windowMinimize: 'window:minimize',
  windowMaximizeToggle: 'window:maximize-toggle',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  javaList: 'java:list',
  javaInstall: 'java:install',
  javaReinstall: 'java:reinstall',
  javaVerify: 'java:verify',
  javaOpenFolder: 'java:open-folder',
  contentSearch: 'content:search',
  contentInstall: 'content:install',
  contentListInstalled: 'content:list-installed',
  contentSetEnabled: 'content:set-enabled',
  contentRemove: 'content:remove',
  contentCheckUpdates: 'content:check-updates',
  contentListMedia: 'content:list-media',
  contentProviders: 'content:providers',
} as const

export const IPC_EVENTS = {
  progress: 'event:progress',
  launchPhase: 'event:launch-phase',
  launchState: 'event:launch-state',
  logLine: 'event:log-line',
  authStatus: 'event:auth-status',
} as const
