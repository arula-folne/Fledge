import type { Settings } from './models.js'

/**
 * Renderer へ settings を渡す前に API キーを除去する。
 * env 由来のキー有無は別途 ContentService.listProviders で反映する。
 */
export function sanitizeSettingsForRenderer(
  settings: Settings,
  opts?: { envCurseforgeKeyConfigured?: boolean },
): Settings {
  const fromSettings = Boolean(settings.curseforgeApiKey?.trim())
  const fromEnv = Boolean(opts?.envCurseforgeKeyConfigured)
  return {
    ...settings,
    curseforgeApiKey: '',
    curseforgeApiKeyConfigured: fromSettings || fromEnv,
    curseforgeApiKeyFromEnv: fromEnv,
  }
}
