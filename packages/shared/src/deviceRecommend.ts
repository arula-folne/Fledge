import { MEMORY_PRESETS_NORMAL_MB, type UiScale } from './models.js'

/** Minecraft 窓用（最小 720p） */
export const GAME_WINDOW_SIZE_PRESETS = [
  { id: '720p', width: 1280, height: 720 },
  { id: '900p', width: 1600, height: 900 },
  { id: '1080p', width: 1920, height: 1080 },
  { id: '1440p', width: 2560, height: 1440 },
  { id: '2160p', width: 3840, height: 2160 },
] as const

/** Fledge 窓用（最小 540p） */
export const LAUNCHER_WINDOW_SIZE_PRESETS = [
  { id: '540p', width: 960, height: 540 },
  { id: '720p', width: 1280, height: 720 },
  { id: '900p', width: 1600, height: 900 },
  { id: '1080p', width: 1920, height: 1080 },
  { id: '1440p', width: 2560, height: 1440 },
  { id: '2160p', width: 3840, height: 2160 },
] as const

/** 表示名・一致判定用（ランチャー側が一覧として広い） */
export const WINDOW_SIZE_PRESETS = LAUNCHER_WINDOW_SIZE_PRESETS

/** ランチャー窓の下限（最小プリセット 540p） */
export const LAUNCHER_WINDOW_MIN_WIDTH = 960
export const LAUNCHER_WINDOW_MIN_HEIGHT = 540

/** Minecraft 窓の下限（最小プリセット 720p） */
export const GAME_WINDOW_MIN_WIDTH = 1280
export const GAME_WINDOW_MIN_HEIGHT = 720

export type WindowSizePresetId = (typeof WINDOW_SIZE_PRESETS)[number]['id']
export type WindowSizePreset = (typeof WINDOW_SIZE_PRESETS)[number]
export type LauncherWindowSizePreset = (typeof LAUNCHER_WINDOW_SIZE_PRESETS)[number]
export type GameWindowSizePreset = (typeof GAME_WINDOW_SIZE_PRESETS)[number]

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

/** 作業領域に収まる最大のウィンドウプリセット。収まらなければ一覧の最小。 */
export function pickWindowPresetForWorkArea(
  workWidth: number,
  workHeight: number,
  options?: { maxHeight?: number; presets?: readonly WindowSizePreset[] },
): WindowSizePreset {
  const workW = Math.max(1, workWidth)
  const workH = Math.max(1, workHeight)
  const maxH = options?.maxHeight ?? Number.POSITIVE_INFINITY
  const presets = options?.presets?.length ? options.presets : WINDOW_SIZE_PRESETS
  let chosen: WindowSizePreset = presets[0]!
  for (const preset of presets) {
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
    presets: LAUNCHER_WINDOW_SIZE_PRESETS,
  })
  const gamePreset = pickWindowPresetForWorkArea(specs.workAreaWidth, specs.workAreaHeight, {
    presets: GAME_WINDOW_SIZE_PRESETS,
  })

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
