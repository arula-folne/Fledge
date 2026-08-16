import { AuthError } from '../auth/authTypes.js'
import type { AuthProvider } from '../auth/AuthProvider.js'
import type { Logger } from '../logging/Logger.js'
import type { SettingsStore } from '../settings/SettingsStore.js'
import type { SkinModel } from '@fledge/shared'
import { uploadMinecraftSkin } from './MojangSkinClient.js'
import type { SkinStore } from './SkinStore.js'

/**
 * 選択中スキンを Microsoft アカウントの公式プロフィールへ載せる。
 */
export class SkinApplier {
  constructor(
    private readonly skins: SkinStore,
    private readonly settings: SettingsStore,
    private readonly auth: AuthProvider,
    private readonly logger: Logger,
  ) {}

  async applySelected(accountId: string): Promise<void> {
    const settings = await this.settings.get()
    await this.apply(settings.selectedSkinId, settings.skinModel, accountId)
  }

  async apply(skinId: string, model: SkinModel, accountId: string): Promise<void> {
    const png = await this.skins.readPngBytes(skinId)
    if (!png) {
      throw new Error('スキン画像が見つかりません')
    }
    try {
      const creds = await this.auth.ensureCredentials(accountId)
      await uploadMinecraftSkin(creds.accessToken, png, model === 'slim' ? 'slim' : 'classic')
      this.logger.info('auth', `Applied skin ${skinId} to Minecraft profile`)
    } catch (err) {
      if (err instanceof AuthError && err.code === 'not_logged_in') return
      throw err
    }
  }
}
