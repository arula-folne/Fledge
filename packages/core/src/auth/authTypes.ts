import type { AccountView, AuthStatus } from '@fledge/shared'

export type { AccountView, AuthStatus }

/** 起動時のみ Main/Core 内で使用（Renderer 非公開） */
export type LaunchCredentials = {
  uuid: string
  name: string
  accessToken: string
  /** Minecraft 起動引数の userType。MSA ログイン時は msa */
  userType: 'msa' | 'mojang'
}

export class AuthError extends Error {
  constructor(
    readonly code:
      | 'cancelled'
      | 'failed'
      | 'not_logged_in'
      | 'refresh_failed'
      | 'safe_storage_unavailable'
      | 'minecraft_not_owned',
    readonly messageKey: string,
    options?: { cause?: unknown },
  ) {
    super(messageKey, options)
    this.name = 'AuthError'
  }
}
