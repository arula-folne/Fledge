import { z } from 'zod'

export const AuthStatusSchema = z.enum([
  'logged_out',
  'logging_in',
  'logged_in',
  'refreshing',
  'expired',
])
export type AuthStatus = z.infer<typeof AuthStatusSchema>

export const AccountViewSchema = z.object({
  id: z.string(),
  uuid: z.string(),
  displayName: z.string(),
  xuid: z.string().optional(),
  /** 将来ホーム表示用。MVP では未設定でも可 */
  skinUrl: z.string().optional(),
  capeUrl: z.string().optional(),
  avatarUrl: z.string().optional(),
})
export type AccountView = z.infer<typeof AccountViewSchema>

export type AuthStatusEvent = {
  status: AuthStatus
  /** 判明していれば即反映。logging_in / refreshing では省略する */
  account?: AccountView | null
}

export const LoaderSchema = z.enum(['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'])
export type Loader = z.infer<typeof LoaderSchema>

export const INSTANCE_ICON_VARIANTS = [
  'cube',
  'cubeOff',
  'cube3dSphere',
  'cube3dSphereOff',
  'cubePlus',
  'cubeSend',
  'cubeSpark',
  'box',
  'boxMultiple',
  'packages',
  'dice',
  'pyramid',
  'hexagonalPrism',
  'stack3',
] as const
export type InstanceIconVariant = (typeof INSTANCE_ICON_VARIANTS)[number]

export const INSTANCE_ICON_BACKDROPS = ['plain', 'sea', 'sky', 'grass', 'night'] as const
export type InstanceIconBackdrop = (typeof INSTANCE_ICON_BACKDROPS)[number]

export const InstanceIconPresetSchema = z.object({
  variant: z.enum(INSTANCE_ICON_VARIANTS).catch('cube'),
  color: z.string().min(4).max(9).default('#f4f7fa'),
  backdrop: z.enum(INSTANCE_ICON_BACKDROPS).default('plain'),
})
export type InstanceIconPreset = z.infer<typeof InstanceIconPresetSchema>

export const DEFAULT_INSTANCE_ICON_PRESET: InstanceIconPreset = {
  variant: 'cube',
  color: '#f4f7fa',
  backdrop: 'plain',
}

export const InstanceProfileSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(64),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  /** 最後にゲームを起動した日時 (ISO) */
  lastPlayedAt: z.string().optional(),
  minecraftVersion: z.string().min(1),
  loader: LoaderSchema,
  loaderVersion: z.string().optional(),
  java: z.object({
    strategy: z.enum(['auto', 'path']),
    path: z.string().optional(),
  }),
  memory: z.object({
    minMb: z.number().int().positive().optional(),
    maxMb: z.number().int().positive(),
  }),
  jvmArgs: z.array(z.string()),
  /** インスタンスフォルダ内のアイコンファイル名（例: icon.png） */
  iconFile: z.string().optional(),
  /** カスタム画像が無いときのプリセット */
  iconPreset: InstanceIconPresetSchema.optional(),
  notes: z.string().optional(),
  /**
   * 新規作成時にだけ立つ。既存インスタンスには無い。
   * true のとき、初回起動直前に凍結スナップショットを options.txt へ適用する候補になる。
   */
  minecraftInitialSettingsSeeded: z.boolean().optional(),
  /**
   * 初回起動での初期設定適用が完了したか。
   * 起動前の書き込み成功だけでは立てず、Minecraft が正常終了したあとで立てる。
   */
  minecraftInitialSettingsApplied: z.boolean().optional(),
  /**
   * 初期設定コミットの世代（記録用）。
   */
  minecraftInitialSettingsApplyGeneration: z.number().int().nonnegative().optional(),
  /** 作成時点で凍結した options.txt パッチ（ファイルへは初回起動直前まで書かない） */
  pendingMinecraftOptions: z.record(z.string()).optional(),
  /** 作成時点で凍結した debug.json パッチ（初回起動直前まで書かない） */
  pendingMinecraftDebugOverlay: z.record(z.string()).optional(),
})
export type InstanceProfile = z.infer<typeof InstanceProfileSchema>

/** インスタンス配下で開いてよいサブフォルダ */
export const INSTANCE_SUBFOLDERS = [
  'mods',
  'resourcepacks',
  'shaderpacks',
  'saves',
  'logs',
  'screenshots',
  'plugins',
] as const
export type InstanceSubfolder = (typeof INSTANCE_SUBFOLDERS)[number]

export const INSTANCE_ICON_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'] as const
export const MAX_INSTANCE_ICON_BYTES = 8 * 1024 * 1024

export const CreateInstanceIconSchema = z.object({
  bytes: z.array(z.number().int().min(0).max(255)).max(MAX_INSTANCE_ICON_BYTES),
  originalName: z.string().min(1).max(256),
})
export type CreateInstanceIcon = z.infer<typeof CreateInstanceIconSchema>

export const CreateInstanceInputSchema = z.object({
  name: z.string().min(1).max(64),
  minecraftVersion: z.string().min(1),
  loader: LoaderSchema,
  loaderVersion: z.string().optional(),
  memoryMaxMb: z.number().int().positive().default(2048),
  jvmArgs: z.array(z.string()).default([]),
  icon: CreateInstanceIconSchema.optional(),
  iconPreset: InstanceIconPresetSchema.optional(),
})
export type CreateInstanceInput = z.infer<typeof CreateInstanceInputSchema>

/** インスタンス更新。icon: null でカスタム画像を外してプリセットに戻す */
export const UpdateInstanceInputSchema = InstanceProfileSchema.partial()
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    icon: CreateInstanceIconSchema.nullable().optional(),
  })
export type UpdateInstanceInput = z.infer<typeof UpdateInstanceInputSchema>

export const MEMORY_PRESETS_NORMAL_MB = [
  512, // 512 MB
  1024, // 1.0 GB
  2048, // 2.0 GB
  4096, // 4.0 GB
  8192, // 8.0 GB
  16384, // 16.0 GB
  24576, // 24.0 GB
] as const

/** 詳細（高メモリ）。GC 負荷に注意 */
export const MEMORY_PRESETS_EXTENDED_MB = [
  49152, // 48.0 GB
] as const

export const MEMORY_PRESETS_MB = [
  ...MEMORY_PRESETS_NORMAL_MB,
  ...MEMORY_PRESETS_EXTENDED_MB,
] as const

/** この値を超えると GC 警告を出す（通常レンジの上限 = 24GB） */
export const MEMORY_GC_WARN_ABOVE_MB = 24576

export const ThemeModeSchema = z.enum(['light', 'dark', 'color', 'oled', 'system'])
export type ThemeMode = z.infer<typeof ThemeModeSchema>

/** スタンダードテーマ / シーズンテーマ（完全に別系統） */
export const ThemeFamilySchema = z.enum(['standard', 'season'])
export type ThemeFamily = z.infer<typeof ThemeFamilySchema>

/** ランチャー UI の大きさ。normal は 720p 時と同じ */
export const UiScaleSchema = z.enum(['minimal', 'normal', 'wide'])
export type UiScale = z.infer<typeof UiScaleSchema>

/** アプリ起動直後に開く画面 */
export const StartupPageSchema = z.enum(['home', 'library'])
export type StartupPage = z.infer<typeof StartupPageSchema>

export const LibrarySortModeSchema = z.enum([
  'lastPlayed',
  'name',
  'nameDesc',
  'created',
  'manual',
])
export type LibrarySortMode = z.infer<typeof LibrarySortModeSchema>

/** 手動順を現状の ID 集合に合わせる（削除分を落とし、新規を末尾へ） */
export function reconcileLibraryInstanceOrder(order: string[], ids: readonly string[]): string[] {
  const idSet = new Set(ids)
  const kept = order.filter((id) => idSet.has(id))
  const keptSet = new Set(kept)
  const missing = ids.filter((id) => !keptSet.has(id))
  return kept.length === order.length && missing.length === 0 ? order : [...kept, ...missing]
}

/** 手動順で ID を隣接と入れ替え。範囲外なら元配列を返す */
export function moveLibraryInstanceOrder(
  order: string[],
  id: string,
  delta: -1 | 1,
): string[] {
  const idx = order.indexOf(id)
  if (idx < 0) return order
  const next = idx + delta
  if (next < 0 || next >= order.length) return order
  const copy = [...order]
  const a = copy[idx]!
  const b = copy[next]!
  copy[idx] = b
  copy[next] = a
  return copy
}

export const SkinModelSchema = z.enum(['wide', 'slim'])
export type SkinModel = z.infer<typeof SkinModelSchema>

export const SkinEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.enum(['default', 'upload']),
  model: SkinModelSchema,
  /** 相対パスまたは data URL / 組み込み ID */
  fileName: z.string().optional(),
  previewColor: z.string().optional(),
})
export type SkinEntry = z.infer<typeof SkinEntrySchema>

export const MinecraftFpsLimitConditionSchema = z.enum(['afk', 'minimized'])
export type MinecraftFpsLimitCondition = z.infer<typeof MinecraftFpsLimitConditionSchema>

export const MinecraftFpsTextContrastSchema = z.enum(['none', 'background', 'shadow'])
export type MinecraftFpsTextContrast = z.infer<typeof MinecraftFpsTextContrastSchema>

/**
 * 新規インスタンスの初回起動専用。null = Minecraft 側のデフォルトを使う（書き込まない）。
 * 値はゲーム内表示に近い単位（FOV は度、音量・明るさは 0–1、感度は 0–1）。
 * keybinds は `key.attack` → `key.mouse.left`。空ならすべてゲーム側デフォルト。
 */
export const MinecraftInitialSettingsSchema = z.object({
  lang: z.string().min(1).nullable().default(null),
  showSubtitles: z.boolean().nullable().default(null),
  autoJump: z.boolean().nullable().default(null),
  bobView: z.boolean().nullable().default(null),
  operatorItemsTab: z.boolean().nullable().default(null),
  fovDegrees: z.number().min(30).max(110).nullable().default(null),
  masterVolume: z.number().min(0).max(1).nullable().default(null),
  musicVolume: z.number().min(0).max(1).nullable().default(null),
  weatherVolume: z.number().min(0).max(1).nullable().default(null),
  recordVolume: z.number().min(0).max(1).nullable().default(null),
  blockVolume: z.number().min(0).max(1).nullable().default(null),
  maxFps: z.number().int().min(10).max(260).nullable().default(null),
  enableVsync: z.boolean().nullable().default(null),
  inactivityFpsLimit: MinecraftFpsLimitConditionSchema.nullable().default(null),
  guiScale: z.number().int().min(0).max(4).nullable().default(null),
  gamma: z.number().min(0).max(1).nullable().default(null),
  renderDistance: z.number().int().min(2).max(32).nullable().default(null),
  simulationDistance: z.number().int().min(5).max(32).nullable().default(null),
  mouseSensitivity: z.number().min(0).max(1).nullable().default(null),
  showFps: z.boolean().nullable().default(null),
  fpsExtended: z.boolean().nullable().default(null),
  fpsTextContrast: MinecraftFpsTextContrastSchema.nullable().default(null),
  keybinds: z.record(z.string(), z.string()).default({}),
})
export type MinecraftInitialSettings = z.infer<typeof MinecraftInitialSettingsSchema>

export const EMPTY_MINECRAFT_INITIAL_SETTINGS: MinecraftInitialSettings =
  MinecraftInitialSettingsSchema.parse({})

export const DEFAULT_CONCURRENT_DOWNLOADS = 10
export const DEFAULT_MAX_WRITE_CONCURRENCY = 10

export const SettingsSchemaBase = z.object({
  selectedInstanceId: z.string().nullable(),
  lastPlayedInstanceId: z.string().nullable().default(null),
  locale: z.string().default('ja'),
  defaultMemoryMaxMb: z.number().int().positive().default(2048),
  defaultJvmArgs: z.array(z.string()).default([]),
  minecraftInitialSettings: MinecraftInitialSettingsSchema.default({}),
  /**
   * @deprecated ロック機能は廃止。読み込み互換のため残す（無視される）。
   */
  minecraftInitialSettingsLocked: z.boolean().optional(),
  msaClientId: z.string().optional(),
  showSnapshots: z.boolean().default(false),

  // Minecraft 表示設定（ランチャー窓ではなくゲーム側）
  gameFullscreen: z.boolean().default(false),
  gameWindowWidth: z.number().int().min(1280).max(7680).default(1280),
  gameWindowHeight: z.number().int().min(720).max(4320).default(720),
  // Fledge ランチャー窓（最小 540p）
  launcherWindowWidth: z.number().int().min(960).max(7680).default(1280),
  launcherWindowHeight: z.number().int().min(540).max(4320).default(720),
  uiScale: UiScaleSchema.default('normal'),
  startupPage: StartupPageSchema.default('home'),
  // 旧キー互換（読み込み時に吸収）
  fullscreen: z.boolean().optional(),
  windowWidth: z.number().int().optional(),
  windowHeight: z.number().int().optional(),

  // 表示設定
  /** standard = スタンダードテーマ / season = シーズンテーマ */
  themeFamily: ThemeFamilySchema.default('standard'),
  themeMode: ThemeModeSchema.default('light'),
  /** 選択中のシーズンテーマ ID（themeFamily が season のとき）。カタログに残る過去分も指定可 */
  seasonThemeId: z.string().min(1).nullable().default(null),
  /** カラーテーマのベース（背景・面の色み） */
  themeColor: z
    .object({
      r: z.number().int().min(0).max(255).default(255),
      g: z.number().int().min(0).max(255).default(255),
      b: z.number().int().min(0).max(255).default(255),
    })
    .default({ r: 255, g: 255, b: 255 }),
  /** カラーテーマのアクセント（ボタン・強調） */
  themeAccentColor: z
    .object({
      r: z.number().int().min(0).max(255).default(91),
      g: z.number().int().min(0).max(255).default(164),
      b: z.number().int().min(0).max(255).default(217),
    })
    .default({ r: 91, g: 164, b: 217 }),
  hardwareAcceleration: z.boolean().default(true),
  minimizeOnLaunch: z.boolean().default(false),
  discordRichPresence: z.boolean().default(false),
  /** 初回プライバシー注意の確認済み */
  privacyNoticeAcknowledged: z.boolean().default(false),

  // Java（管理対象メジャーのメモ。実際の導入は Java 設定画面から）
  javaPreferredMajors: z
    .array(z.union([z.literal(8), z.literal(17), z.literal(21), z.literal(25)]))
    .default([21, 17, 8]),

  // リソース
  concurrentDownloads: z.number().int().min(1).max(32).default(DEFAULT_CONCURRENT_DOWNLOADS),
  maxWriteConcurrency: z.number().int().min(1).max(32).default(DEFAULT_MAX_WRITE_CONCURRENCY),
  backupFolder: z.string().nullable().default(null),
  backupSyncEnabled: z.boolean().default(false),

  // スキン
  selectedSkinId: z.string().default('steve'),
  skinModel: SkinModelSchema.default('wide'),

  // ライブラリ並び
  librarySortMode: LibrarySortModeSchema.default('name'),
  /** manual 時のインスタンス ID 順。未知 ID は末尾に足す */
  libraryInstanceOrder: z.array(z.string()).default([]),
})

export const BackupKindSchema = z.enum(['snapshot', 'sync'])
export type BackupKind = z.infer<typeof BackupKindSchema>

export const BackupEntrySchema = z.object({
  id: z.string(),
  kind: BackupKindSchema,
  path: z.string(),
  createdAt: z.string(),
})
export type BackupEntry = z.infer<typeof BackupEntrySchema>

export const PathInfoSchema = z.object({
  root: z.string(),
  data: z.string(),
  settings: z.string(),
  accounts: z.string(),
  cache: z.string(),
  minecraft: z.string(),
  java: z.string(),
  logs: z.string(),
  news: z.string(),
  temp: z.string(),
  instances: z.string(),
  skins: z.string(),
})
export type PathInfo = z.infer<typeof PathInfoSchema>

/** アプリデータルートの表示・変更用（settings.json 外にポインタを持つ） */
export const AppDirectoryInfoSchema = z.object({
  configured: z.string(),
  active: z.string(),
  defaultPath: z.string(),
  isCustom: z.boolean(),
  restartRequired: z.boolean(),
})
export type AppDirectoryInfo = z.infer<typeof AppDirectoryInfoSchema>

export const NewsItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  publishedAt: z.string(),
  url: z.string().optional(),
})
export type NewsItem = z.infer<typeof NewsItemSchema>

export const VersionInfoSchema = z.object({
  id: z.string(),
  type: z.enum(['release', 'snapshot', 'old_beta', 'old_alpha']),
  releaseTime: z.string(),
})
export type VersionInfo = z.infer<typeof VersionInfoSchema>

export const LoaderVersionSchema = z.object({
  id: z.string(),
  /** 表示用（多くの場合 id と同じ） */
  version: z.string(),
  stable: z.boolean().optional(),
  recommended: z.boolean().optional(),
  /** 追加メタ（Forge type など） */
  type: z.string().optional(),
})
export type LoaderVersion = z.infer<typeof LoaderVersionSchema>

export const VersionListResultSchema = z.object({
  versions: z.array(VersionInfoSchema),
  fromCache: z.boolean(),
  stale: z.boolean().default(false),
  offline: z.boolean().default(false),
  fetchedAt: z.string().nullable(),
})
export type VersionListResult = z.infer<typeof VersionListResultSchema>

export const LoaderVersionListResultSchema = z.object({
  loader: LoaderSchema,
  minecraftVersion: z.string(),
  versions: z.array(LoaderVersionSchema),
  fromCache: z.boolean(),
  stale: z.boolean().default(false),
  offline: z.boolean().default(false),
  fetchedAt: z.string().nullable(),
})
export type LoaderVersionListResult = z.infer<typeof LoaderVersionListResultSchema>

export const DownloadKindSchema = z.enum([
  'metadata',
  'java',
  'minecraft-client',
  'library',
  'asset',
  'fabric-loader',
  'fabric-api',
  'forge-loader',
  'neoforge-loader',
  'quilt-loader',
  'content',
])
export type DownloadKind = z.infer<typeof DownloadKindSchema>

export const ProgressScopeSchema = z.enum(['launch', 'download', 'java', 'auth', 'updater'])
export type ProgressScope = z.infer<typeof ProgressScopeSchema>

export const TransferJobStatusSchema = z.enum([
  'queued',
  'active',
  'completed',
  'failed',
  'cancelled',
])
export type TransferJobStatus = z.infer<typeof TransferJobStatusSchema>

export const ProgressEventSchema = z.object({
  scope: ProgressScopeSchema,
  kind: z.string().optional(),
  sessionId: z.string().optional(),
  jobId: z.string().optional(),
  current: z.number(),
  total: z.number(),
  percent: z.number().optional(),
  bytesPerSecond: z.number().optional(),
  messageKey: z.string().optional(),
  status: TransferJobStatusSchema.optional(),
  meta: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
})
export type ProgressEvent = z.infer<typeof ProgressEventSchema>

export const LaunchPhaseSchema = z.enum([
  'auth',
  'java',
  'download',
  'install',
  'prepare-natives',
  'spawn',
  'running',
])
export type LaunchPhase = z.infer<typeof LaunchPhaseSchema>

export const LaunchStateSchema = z.enum([
  'idle',
  'preparing',
  'launching',
  'running',
  'exited',
  'error',
])
export type LaunchState = z.infer<typeof LaunchStateSchema>

export const LaunchStateEventSchema = z.object({
  sessionId: z.string().optional(),
  profileId: z.string().optional(),
  accountId: z.string().optional(),
  state: LaunchStateSchema,
  code: z.number().optional(),
  errorMessageKey: z.string().optional(),
})
export type LaunchStateEvent = z.infer<typeof LaunchStateEventSchema>

export const LaunchPhaseEventSchema = z.object({
  sessionId: z.string(),
  phase: LaunchPhaseSchema,
  messageKey: z.string(),
})
export type LaunchPhaseEvent = z.infer<typeof LaunchPhaseEventSchema>

export const LogSourceSchema = z.enum([
  'launcher',
  'game',
  'auth',
  'downloader',
  'java',
  'minecraft',
  'updater',
  'system',
  'discord',
])
export type LogSource = z.infer<typeof LogSourceSchema>

export const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error'])
export type LogLevel = z.infer<typeof LogLevelSchema>

export const LogLineSchema = z.object({
  id: z.string(),
  ts: z.number(),
  source: LogSourceSchema,
  level: LogLevelSchema,
  message: z.string(),
  context: z.record(z.string()).optional(),
})
export type LogLine = z.infer<typeof LogLineSchema>

export const UpdateChannelSchema = z.enum(['stable', 'prerelease'])
export type UpdateChannel = z.infer<typeof UpdateChannelSchema>

export const UpdateCheckResultSchema = z.object({
  status: z.enum(['idle', 'unavailable', 'up-to-date', 'available']),
  messageKey: z.string().optional(),
  currentVersion: z.string().optional(),
  nextVersion: z.string().optional(),
  downloadUrl: z.string().url().optional(),
  downloadSize: z.number().int().nonnegative().optional(),
  releaseUrl: z.string().url().optional(),
  /** GitHub Release の body（変更点） */
  releaseNotes: z.string().optional(),
  /** 対象リリースがプレリリースか */
  prerelease: z.boolean().optional(),
  channel: UpdateChannelSchema.optional(),
})
export type UpdateCheckResult = z.infer<typeof UpdateCheckResultSchema>

export const JAVA_MANAGED_MAJORS = [25, 21, 17, 8] as const
export type JavaManagedMajor = (typeof JAVA_MANAGED_MAJORS)[number]

export const JavaRuntimeViewSchema = z.object({
  major: z.union([z.literal(8), z.literal(17), z.literal(21), z.literal(25)]),
  installed: z.boolean(),
  javaPath: z.string().nullable(),
  displayPath: z.string(),
  installDir: z.string(),
  /** インストール済み、または消し残しがある（アンインストール可能） */
  removable: z.boolean().default(false),
})
export type JavaRuntimeView = z.infer<typeof JavaRuntimeViewSchema>

export const JavaVerifyResultSchema = z.object({
  ok: z.boolean(),
  major: z.union([z.literal(8), z.literal(17), z.literal(21), z.literal(25)]),
  detail: z.string(),
  detectedMajor: z.number().nullable(),
})
export type JavaVerifyResult = z.infer<typeof JavaVerifyResultSchema>

/** コンテンツ種別（インスタンス配下のカテゴリ） */
export const ContentCategorySchema = z.enum([
  'mod',
  'modpack',
  'resourcepack',
  'shader',
  'datapack',
  'plugin',
])
export type ContentCategory = z.infer<typeof ContentCategorySchema>

export const ContentSourceIdSchema = z.enum(['modrinth'])
export type ContentSourceId = z.infer<typeof ContentSourceIdSchema>

export const ContentProviderIdSchema = ContentSourceIdSchema
export type ContentProviderId = z.infer<typeof ContentProviderIdSchema>

export const ContentLoaderFilterSchema = z.enum([
  'fabric',
  'forge',
  'neoforge',
  'quilt',
  'vanilla',
])
export type ContentLoaderFilter = z.infer<typeof ContentLoaderFilterSchema>

export const ContentSearchSortSchema = z.enum([
  'relevance',
  'downloads',
  'follows',
  'newest',
  'updated',
])
export type ContentSearchSort = z.infer<typeof ContentSearchSortSchema>

/** Modrinth 検索: クライアント / サーバー対応 */
export const ContentEnvironmentFilterSchema = z.enum(['client', 'server'])
export type ContentEnvironmentFilter = z.infer<typeof ContentEnvironmentFilterSchema>

export const ContentSearchQuerySchema = z.object({
  query: z.string().default(''),
  category: ContentCategorySchema,
  gameVersion: z.string().optional(),
  loaders: z.array(ContentLoaderFilterSchema).default([]),
  /** Modrinth display category（adventure, optimization 等） */
  tags: z.array(z.string()).default([]),
  /** クライアント / サーバー対応で絞り込み */
  environments: z.array(ContentEnvironmentFilterSchema).default([]),
  provider: ContentProviderIdSchema.default('modrinth'),
  sort: ContentSearchSortSchema.default('relevance'),
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().positive().max(50).default(10),
})
export type ContentSearchQuery = z.infer<typeof ContentSearchQuerySchema>

export const ContentProjectSchema = z.object({
  provider: ContentSourceIdSchema,
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  /** 説明を日本語へ自動翻訳したとき true（元から日本語なら付かない） */
  descriptionTranslated: z.boolean().optional(),
  iconUrl: z.string().nullable(),
  downloads: z.number().nonnegative(),
  follows: z.number().nonnegative().optional(),
  author: z.string().optional(),
  displayCategories: z.array(z.string()).default([]),
  dateModified: z.string().optional(),
  clientSide: z.enum(['required', 'optional', 'unsupported']).optional(),
  serverSide: z.enum(['required', 'optional', 'unsupported']).optional(),
  categories: z.array(z.string()).default([]),
  gameVersions: z.array(z.string()).default([]),
  loaders: z.array(z.string()).default([]),
  projectType: ContentCategorySchema,
})
export type ContentProject = z.infer<typeof ContentProjectSchema>

/** コンテンツ検索のお気に入り（settings.json に保存） */
export const ContentFavoriteEntrySchema = z.object({
  projectId: z.string(),
  provider: ContentSourceIdSchema,
  savedAt: z.string(),
  project: ContentProjectSchema,
})
export type ContentFavoriteEntry = z.infer<typeof ContentFavoriteEntrySchema>

const SettingsSchemaWithContentFavorites = SettingsSchemaBase.extend({
  contentFavorites: z.array(ContentFavoriteEntrySchema).default([]),
})
export { SettingsSchemaWithContentFavorites as SettingsSchema }
export type Settings = z.infer<typeof SettingsSchemaWithContentFavorites>

export const ContentProjectDetailSchema = ContentProjectSchema.extend({
  body: z.string().default(''),
  bodyTranslated: z.boolean().optional(),
  publishedAt: z.string().optional(),
  licenseId: z.string().optional(),
  licenseName: z.string().optional(),
  licenseUrl: z.string().optional(),
  issuesUrl: z.string().optional(),
  sourceUrl: z.string().optional(),
  wikiUrl: z.string().optional(),
  discordUrl: z.string().optional(),
  donationUrls: z
    .array(
      z.object({
        platform: z.string(),
        url: z.string(),
      }),
    )
    .default([]),
  members: z
    .array(
      z.object({
        username: z.string(),
        role: z.string().optional(),
        avatarUrl: z.string().optional(),
      }),
    )
    .default([]),
  gallery: z
    .array(
      z.object({
        url: z.string(),
        title: z.string().optional(),
        featured: z.boolean().optional(),
      }),
    )
    .default([]),
})
export type ContentProjectDetail = z.infer<typeof ContentProjectDetailSchema>

export const ContentVersionSchema = z.object({
  id: z.string(),
  name: z.string(),
  versionNumber: z.string(),
  gameVersions: z.array(z.string()).default([]),
  loaders: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
  datePublished: z.string().optional(),
  downloads: z.number().nonnegative().default(0),
  versionType: z.enum(['release', 'beta', 'alpha']).optional(),
  changelog: z.string().optional(),
})
export type ContentVersion = z.infer<typeof ContentVersionSchema>

export const ContentProjectPageSchema = z.object({
  project: ContentProjectDetailSchema,
  versions: z.array(ContentVersionSchema).default([]),
})
export type ContentProjectPage = z.infer<typeof ContentProjectPageSchema>

export const ContentSearchResultSchema = z.object({
  hits: z.array(ContentProjectSchema),
  total: z.number().nonnegative(),
  offset: z.number().nonnegative(),
  limit: z.number().positive(),
})
export type ContentSearchResult = z.infer<typeof ContentSearchResultSchema>

export const ContentCategoryTagSchema = z.object({
  name: z.string(),
  projectType: z.string(),
  header: z.string(),
  icon: z.string(),
})
export type ContentCategoryTag = z.infer<typeof ContentCategoryTagSchema>

export const ContentInstallRequestSchema = z.object({
  instanceId: z.string().min(1),
  provider: ContentSourceIdSchema,
  projectId: z.string().min(1),
  category: ContentCategorySchema,
  /** 省略時はインスタンスの版・ローダーに合う最新を選ぶ */
  versionId: z.string().optional(),
  gameVersion: z.string().optional(),
  loaders: z.array(ContentLoaderFilterSchema).optional(),
})
export type ContentInstallRequest = z.infer<typeof ContentInstallRequestSchema>

/** 閲覧画面から Mod / Modpack 等でインスタンスを新規作成 */
export const ContentCreateInstanceRequestSchema = z.object({
  provider: ContentSourceIdSchema.default('modrinth'),
  projectId: z.string().min(1),
  category: ContentCategorySchema,
  versionId: z.string().optional(),
  gameVersion: z.string().optional(),
  loaders: z.array(ContentLoaderFilterSchema).optional(),
  instanceName: z.string().min(1).max(64).optional(),
})
export type ContentCreateInstanceRequest = z.infer<typeof ContentCreateInstanceRequestSchema>

export const InstalledContentSchema = z.object({
  id: z.string(),
  provider: ContentSourceIdSchema,
  projectId: z.string(),
  versionId: z.string(),
  slug: z.string(),
  name: z.string(),
  versionNumber: z.string(),
  category: ContentCategorySchema,
  fileName: z.string(),
  iconUrl: z.string().nullable().optional(),
  /** mrpack 再エクスポート用の配布情報（旧 index との互換のため optional） */
  downloadUrl: z.string().url().optional(),
  sha1: z.string().optional(),
  sha512: z.string().optional(),
  fileSize: z.number().int().nonnegative().optional(),
  env: z
    .object({
      client: z.enum(['required', 'optional', 'unsupported']).optional(),
      server: z.enum(['required', 'optional', 'unsupported']).optional(),
    })
    .optional(),
  /** Modrinth の正式な名前・slug・画像を取得済みか */
  projectMetadataResolved: z.boolean().optional(),
  enabled: z.boolean(),
  installedAt: z.string(),
  updateAvailable: z.boolean().optional(),
  latestVersionId: z.string().optional(),
  latestVersionNumber: z.string().optional(),
})
export type InstalledContent = z.infer<typeof InstalledContentSchema>

export const ContentMediaItemSchema = z.object({
  name: z.string(),
  path: z.string(),
  mtime: z.string().optional(),
  size: z.number().optional(),
})
export type ContentMediaItem = z.infer<typeof ContentMediaItemSchema>

/** mrpack エクスポート候補（Modrinth 式のファイル選択） */
export const MrpackExportContentCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: ContentCategorySchema,
  path: z.string(),
  size: z.number().int().nonnegative(),
  defaultSelected: z.boolean(),
  /** Modrinth CDN 参照（index.files）として出力可能 */
  indexEligible: z.boolean(),
})
export type MrpackExportContentCandidate = z.infer<typeof MrpackExportContentCandidateSchema>

export const MrpackExportOverrideCandidateSchema = z.object({
  path: z.string(),
  size: z.number().int().nonnegative(),
  defaultSelected: z.boolean(),
})
export type MrpackExportOverrideCandidate = z.infer<typeof MrpackExportOverrideCandidateSchema>

export const MrpackExportCandidatesSchema = z.object({
  name: z.string(),
  summary: z.string(),
  contents: z.array(MrpackExportContentCandidateSchema),
  overrides: z.array(MrpackExportOverrideCandidateSchema),
})
export type MrpackExportCandidates = z.infer<typeof MrpackExportCandidatesSchema>

export const MrpackExportOptionsSchema = z.object({
  contentIds: z.array(z.string()),
  overridePaths: z.array(z.string()),
  name: z.string().min(1).max(256).optional(),
  summary: z.string().max(2000).optional(),
})
export type MrpackExportOptions = z.infer<typeof MrpackExportOptionsSchema>
