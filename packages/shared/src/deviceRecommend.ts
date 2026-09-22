/** Minecraft 窓用（最小 720p・16:9） */
export const GAME_WINDOW_SIZE_PRESETS = [
  { id: '720p', width: 1280, height: 720, aspect: '16:9' as const },
  { id: '900p', width: 1600, height: 900, aspect: '16:9' as const },
  { id: '1080p', width: 1920, height: 1080, aspect: '16:9' as const },
  { id: '1440p', width: 2560, height: 1440, aspect: '16:9' as const },
  { id: '2160p', width: 3840, height: 2160, aspect: '16:9' as const },
] as const

/** Fledge 窓用（16:9 + 16:10、高さ昇順） */
export const LAUNCHER_WINDOW_SIZE_PRESETS = [
  { id: '540p', width: 960, height: 540, aspect: '16:9' as const },
  { id: '600p', width: 960, height: 600, aspect: '16:10' as const },
  { id: '720p', width: 1280, height: 720, aspect: '16:9' as const },
  { id: '800p', width: 1280, height: 800, aspect: '16:10' as const },
  { id: '900p', width: 1600, height: 900, aspect: '16:9' as const },
  { id: '1000p', width: 1600, height: 1000, aspect: '16:10' as const },
  { id: '1080p', width: 1920, height: 1080, aspect: '16:9' as const },
  { id: '1200p', width: 1920, height: 1200, aspect: '16:10' as const },
  { id: '1440p', width: 2560, height: 1440, aspect: '16:9' as const },
  { id: '1600p', width: 2560, height: 1600, aspect: '16:10' as const },
  { id: '2160p', width: 3840, height: 2160, aspect: '16:9' as const },
  { id: '2400p', width: 3840, height: 2400, aspect: '16:10' as const },
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

/** 設定 UI 向けプリセット表示名 */
export function formatWindowSizePresetLabel(
  preset: Pick<WindowSizePreset, 'id' | 'aspect'>,
): string {
  return preset.id
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
