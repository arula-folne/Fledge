import fs from 'node:fs/promises'
import path from 'node:path'
import { SettingsSchema, type Settings } from '@fledge/shared'
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
      this.cache = SettingsSchema.parse({ ...DEFAULT_SETTINGS, ...parsed })
    } catch {
      this.cache = { ...DEFAULT_SETTINGS }
      await this.save(this.cache)
    }
    return this.cache
  }

  async set(partial: Partial<Settings>): Promise<Settings> {
    const current = await this.get()
    const patch: Partial<Settings> = { ...partial }
    delete patch.curseforgeApiKeyConfigured
    delete patch.curseforgeApiKeyFromEnv
    // 空の API キーは未変更扱い（Renderer からは常に空文字で来るため）
    if (patch.curseforgeApiKey !== undefined && !patch.curseforgeApiKey.trim()) {
      delete patch.curseforgeApiKey
    }
    const next = SettingsSchema.parse({ ...current, ...patch })
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
      curseforgeApiKeyConfigured: _configured,
      curseforgeApiKeyFromEnv: _fromEnv,
      ...persist
    } = settings
    await fs.writeFile(this.filePath(), JSON.stringify(persist, null, 2), 'utf8')
  }
}
