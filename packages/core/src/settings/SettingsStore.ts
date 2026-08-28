import fs from 'node:fs/promises'
import path from 'node:path'
import {
  DEFAULT_CONCURRENT_DOWNLOADS,
  DEFAULT_MAX_WRITE_CONCURRENCY,
  GAME_WINDOW_MIN_HEIGHT,
  GAME_WINDOW_MIN_WIDTH,
  LAUNCHER_WINDOW_MIN_HEIGHT,
  LAUNCHER_WINDOW_MIN_WIDTH,
  SettingsSchema,
  type Settings,
} from '@fledge/shared'
import type { PathLayout } from '../app/paths.js'

const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({
  selectedInstanceId: null,
})

export class SettingsStore {
  private cache: Settings | null = null

  constructor(private readonly layout: PathLayout) {}

  private filePath(): string {
    return path.join(this.layout.settings, 'settings.json')
  }

  async get(): Promise<Settings> {
    if (this.cache) return this.cache
    try {
      const raw = await fs.readFile(this.filePath(), 'utf8')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      // 旧ランチャー窓設定キーを Minecraft 表示設定へ移行
      if (parsed.gameFullscreen === undefined && typeof parsed.fullscreen === 'boolean') {
        parsed.gameFullscreen = parsed.fullscreen
      }
      if (parsed.gameWindowWidth === undefined && typeof parsed.windowWidth === 'number') {
        parsed.gameWindowWidth = parsed.windowWidth
      }
      if (parsed.gameWindowHeight === undefined && typeof parsed.windowHeight === 'number') {
        parsed.gameWindowHeight = parsed.windowHeight
      }
      delete parsed.fullscreen
      delete parsed.windowWidth
      delete parsed.windowHeight
      // 旧 32/64GB 等は上限 48GB にクランプ
      if (typeof parsed.defaultMemoryMaxMb === 'number' && parsed.defaultMemoryMaxMb > 49152) {
        parsed.defaultMemoryMaxMb = 49152
      }
      const hadLegacySecret =
        Object.prototype.hasOwnProperty.call(parsed, 'curseforgeApiKey') ||
        Object.prototype.hasOwnProperty.call(parsed, 'curseforgeApiKeyConfigured') ||
        Object.prototype.hasOwnProperty.call(parsed, 'curseforgeApiKeyFromEnv')
      delete parsed.curseforgeApiKey
      delete parsed.curseforgeApiKeyConfigured
      delete parsed.curseforgeApiKeyFromEnv
      delete parsed.useOsWindowChrome
      // 旧既定（同時DL 8 / 書き込み 4）は両方 10 へ
      const hadLegacyConcurrency =
        parsed.concurrentDownloads === 8 && parsed.maxWriteConcurrency === 4
      if (hadLegacyConcurrency) {
        parsed.concurrentDownloads = DEFAULT_CONCURRENT_DOWNLOADS
        parsed.maxWriteConcurrency = DEFAULT_MAX_WRITE_CONCURRENCY
      }
      // 旧 480p ランチャー窓は 540p 下限へ
      let hadLegacyWindowSize = false
      if (typeof parsed.launcherWindowWidth === 'number' && parsed.launcherWindowWidth < LAUNCHER_WINDOW_MIN_WIDTH) {
        parsed.launcherWindowWidth = LAUNCHER_WINDOW_MIN_WIDTH
        hadLegacyWindowSize = true
      }
      if (typeof parsed.launcherWindowHeight === 'number' && parsed.launcherWindowHeight < LAUNCHER_WINDOW_MIN_HEIGHT) {
        parsed.launcherWindowHeight = LAUNCHER_WINDOW_MIN_HEIGHT
        hadLegacyWindowSize = true
      }
  // 旧 480p / 540p Minecraft 窓は 720p 下限へ
      if (typeof parsed.gameWindowWidth === 'number' && parsed.gameWindowWidth < GAME_WINDOW_MIN_WIDTH) {
        parsed.gameWindowWidth = GAME_WINDOW_MIN_WIDTH
        hadLegacyWindowSize = true
      }
      if (typeof parsed.gameWindowHeight === 'number' && parsed.gameWindowHeight < GAME_WINDOW_MIN_HEIGHT) {
        parsed.gameWindowHeight = GAME_WINDOW_MIN_HEIGHT
        hadLegacyWindowSize = true
      }
      // カラーテーマにアクセントが無い旧設定へ既定値を足す
      if (
        parsed.themeMode === 'color' &&
        (parsed.themeAccentColor === undefined || parsed.themeAccentColor === null)
      ) {
        parsed.themeAccentColor = { r: 91, g: 164, b: 217 }
        hadLegacyWindowSize = true
      }
      this.cache = SettingsSchema.parse({ ...DEFAULT_SETTINGS, ...parsed })
      if (hadLegacySecret || hadLegacyConcurrency || hadLegacyWindowSize) await this.save(this.cache)
    } catch (err) {
      const missing =
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      this.cache = { ...DEFAULT_SETTINGS }
      // 初回起動のみファイル作成。読み取り失敗時に上書きすると更新後などに設定が消えたように見える。
      if (missing) await this.save(this.cache)
    }
    return this.cache
  }

  async reload(): Promise<Settings> {
    this.cache = null
    return this.get()
  }

  async set(partial: Partial<Settings>): Promise<Settings> {
    const current = await this.get()
    const next = SettingsSchema.parse({ ...current, ...partial })
    await this.save(next)
    this.cache = next
    return next
  }

  async reset(): Promise<Settings> {
    const next = SettingsSchema.parse({ selectedInstanceId: null })
    await this.save(next)
    this.cache = next
    return next
  }

  private async save(settings: Settings): Promise<void> {
    await fs.mkdir(this.layout.settings, { recursive: true })
    const {
      fullscreen: _f,
      windowWidth: _w,
      windowHeight: _h,
      ...persist
    } = settings
    void _f
    void _w
    void _h
    await fs.writeFile(this.filePath(), JSON.stringify(persist, null, 2), 'utf8')
  }
}
