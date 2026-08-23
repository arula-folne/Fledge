import { MEMORY_PRESETS_NORMAL_MB, type UiScale } from './models.js'

export const WINDOW_SIZE_PRESETS = [
  { id: '720p', width: 1280, height: 720 },
  { id: '900p', width: 1600, height: 900 },
  { id: '1080p', width: 1920, height: 1080 },
  { id: '1440p', width: 2560, height: 1440 },
  { id: '2160p', width: 3840, height: 2160 },
] as const

export type WindowSizePresetId = (typeof WINDOW_SIZE_PRESETS)[number]['id']
export type WindowSizePreset = (typeof WINDOW_SIZE_PRESETS)[number]

export type DeviceSpecs = {
  totalMemMb: number
  cpuCount: number
  workAreaWidth: number
  workAreaHeight: number
  scaleFactor: number
}

export type DeviceRecommendedSettings = {
  defaultMemoryMaxMb: number
  concurrentDownloads: number
  maxWriteConcurrency: number
  launcherWindowWidth: number
  launcherWindowHeight: number
  gameWindowWidth: number
  gameWindowHeight: number
  gameFullscreen: false
  uiScale: UiScale
  hardwareAcceleration: true
}

function snapMemory(mb: number): number {
  const presets = [...MEMORY_PRESETS_NORMAL_MB]
  let best = presets[0]!
  for (const preset of presets) {
    if (preset <= mb) best = preset
  }
  return best
}

/** 作業領域に収まる最大の 720p / 900p などのプリセット。収まらなければ最小の 720p。 */
export function pickWindowPresetForWorkArea(
  workWidth: number,
  workHeight: number,
  options?: { maxHeight?: number },
): WindowSizePreset {
  const workW = Math.max(1, workWidth)
  const workH = Math.max(1, workHeight)
  const maxH = options?.maxHeight ?? Number.POSITIVE_INFINITY
  let chosen: WindowSizePreset = WINDOW_SIZE_PRESETS[0]
  for (const preset of WINDOW_SIZE_PRESETS) {
    if (preset.width <= workW && preset.height <= workH && preset.height <= maxH) {
      chosen = preset
    }
  }
  return chosen
}

/** 搭載メモリ・CPU・画面から、Fledge / Minecraft 向けの推奨値を決める。 */
export function recommendSettingsForDevice(specs: DeviceSpecs): DeviceRecommendedSettings {
  const total = Math.max(0, Math.round(specs.totalMemMb))
  const reserved = total <= 8192 ? 2048 : total <= 16384 ? 3072 : 4096
  const budget = Math.max(2048, total - reserved)
  const cap = total >= 32768 ? 16384 : total >= 16384 ? 8192 : budget
  const defaultMemoryMaxMb = snapMemory(Math.min(budget, cap))

  const cpu = Math.max(1, Math.round(specs.cpuCount))
  const concurrentDownloads = cpu <= 2 ? 4 : cpu <= 4 ? 8 : cpu <= 8 ? 10 : 16
  const maxWriteConcurrency = concurrentDownloads

  const launcherPreset = pickWindowPresetForWorkArea(specs.workAreaWidth, specs.workAreaHeight, {
    maxHeight: 900,
  })
  const gamePreset = pickWindowPresetForWorkArea(specs.workAreaWidth, specs.workAreaHeight)

  let uiScale: UiScale = 'normal'
  if (specs.workAreaHeight < 800) uiScale = 'minimal'
  else if (gamePreset.height >= 1440 || specs.scaleFactor >= 1.5) uiScale = 'wide'

  return {
    defaultMemoryMaxMb,
    concurrentDownloads,
    maxWriteConcurrency,
    launcherWindowWidth: launcherPreset.width,
    launcherWindowHeight: launcherPreset.height,
    gameWindowWidth: gamePreset.width,
    gameWindowHeight: gamePreset.height,
    gameFullscreen: false,
    uiScale,
    hardwareAcceleration: true,
  }
}

