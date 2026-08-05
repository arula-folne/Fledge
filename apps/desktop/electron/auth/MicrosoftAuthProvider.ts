import { Auth, types, lexicon as msmcLexicon, type Minecraft, type Xbox } from 'msmc'
import type { AuthProvider } from '@fledge/core'
import { AuthError, type LaunchCredentials } from '@fledge/core'
import type { AccountView, AuthStatus } from '@fledge/shared'
import type { Logger } from '@fledge/core'
import type { TokenVault } from '../security/tokenVault'

type Prompt = types.Prompt
type MSToken = types.MSToken

type StatusListener = (status: AuthStatus) => void

type CachedEntry = {
  minecraft: Minecraft
  xbox: Xbox
}

/** Microsoft ログインページの表示言語（msmc の mkt パラメータ） */
const MSA_UI_LOCALE = 'ja-JP'

function applyMsaUiLocale(locale: string = MSA_UI_LOCALE): void {
  msmcLexicon.lexicon['gui.market'] = locale
  if (locale.startsWith('ja')) {
    msmcLexicon.lexicon['gui.title'] = 'アカウントにサインイン'
  }
}

/**
 * msmc を閉じ込めた Microsoft 認証実装（複数アカウント対応）。
 */
export class MicrosoftAuthProvider implements AuthProvider {
  private status: AuthStatus = 'logged_out'
  private listeners = new Set<StatusListener>()
  private cache = new Map<string, CachedEntry>()
  private activeId: string | null = null

  constructor(
    private readonly vault: TokenVault,
    private readonly logger: Logger,
    private readonly getClientId: () => string | undefined,
  ) {}

  getStatus(): AuthStatus {
    return this.status
  }

  onStatusChange(listener: StatusListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private setStatus(status: AuthStatus): void {
    this.status = status
    for (const l of this.listeners) l(status)
  }

  async listAccounts(): Promise<AccountView[]> {
    return this.vault.listAccounts()
  }

  async switchAccount(accountId: string): Promise<AccountView> {
    const account = await this.vault.setActive(accountId)
    this.activeId = accountId
    try {
      await this.refreshIfNeeded(accountId)
      this.setStatus('logged_in')
    } catch {
      this.setStatus('expired')
    }
    this.logger.info('auth', `Switched active account to ${account.displayName}`)
    return account
  }

  async login(): Promise<AccountView> {
    this.setStatus('logging_in')
    this.logger.info('auth', 'Microsoft login started')
    try {
      applyMsaUiLocale()
      const auth = this.createAuth()
      const xbox = await auth.launch('electron', {
        width: 520,
        height: 700,
        title: 'Fledge - Microsoft アカウント',
      })
      const minecraft = await xbox.getMinecraft()
      const account = this.toAccountView(minecraft)
      this.cache.set(account.id, { minecraft, xbox })
      this.activeId = account.id
      await this.persist(account.id, xbox, minecraft, account)
      this.setStatus('logged_in')
      this.logger.info('auth', `Logged in as ${account.displayName}`)
      return account
    } catch (err) {
      const accounts = await this.vault.listAccounts()
      this.setStatus(accounts.length ? 'logged_in' : 'logged_out')
      const cancelled = err instanceof Error && /cancel|close|closed/i.test(err.message)
      this.logger.error('auth', cancelled ? 'Login cancelled' : `Login failed: ${String(err)}`)
      throw new AuthError(
        cancelled ? 'cancelled' : 'failed',
        cancelled ? 'auth.error.cancelled' : 'auth.error.failed',
        { cause: err },
      )
    }
  }

  async logout(accountId?: string): Promise<void> {
    const id = accountId ?? this.activeId ?? (await this.vault.getActiveId())
    if (!id) {
      this.setStatus('logged_out')
      return
    }
    this.cache.delete(id)
    await this.vault.removeAccount(id)
    this.activeId = await this.vault.getActiveId()
    if (!this.activeId) {
      this.setStatus('logged_out')
      this.logger.info('auth', 'Logged out (no accounts left)')
      return
    }
    try {
      await this.refreshIfNeeded(this.activeId)
      this.setStatus('logged_in')
    } catch {
      this.setStatus('expired')
    }
    this.logger.info('auth', `Removed account ${id}; active=${this.activeId}`)
  }

  async getSession(): Promise<AccountView | null> {
    const account = await this.vault.readAccount()
    if (!account) {
      this.activeId = null
      this.setStatus('logged_out')
      return null
    }
    this.activeId = account.id
    try {
      await this.refreshIfNeeded(account.id)
      this.setStatus('logged_in')
      return account
    } catch {
      this.setStatus('expired')
      return account
    }
  }

  async getLaunchCredentials(accountId?: string): Promise<LaunchCredentials> {
    const id = accountId ?? this.activeId ?? (await this.vault.getActiveId())
    if (!id) {
      throw new AuthError('not_logged_in', 'auth.error.notLoggedIn')
    }
    this.setStatus('refreshing')
    try {
      const mc = await this.refreshIfNeeded(id)
      const profile = mc.profile
      if (!profile?.id || !profile.name) {
        throw new AuthError('failed', 'auth.error.failed')
      }
      // 起動専用に指定された場合でも UI のアクティブは変えない（呼び出し側で switch する）
      if (!accountId || accountId === this.activeId) {
        this.setStatus('logged_in')
      } else {
        // 別アカウントで起動中もアクティブ側の status を維持
        const active = await this.vault.readAccount()
        this.setStatus(active ? 'logged_in' : 'logged_out')
      }
      return {
        uuid: profile.id,
        name: profile.name,
        accessToken: mc.mcToken,
        userType: 'msa',
      }
    } catch (err) {
      if (err instanceof AuthError) {
        this.setStatus(err.code === 'not_logged_in' ? 'logged_out' : 'expired')
        throw err
      }
      this.setStatus('expired')
      throw new AuthError('refresh_failed', 'auth.error.refreshFailed', { cause: err })
    }
  }

  private createAuth(): Auth {
    const clientId = this.getClientId()
    if (clientId && clientId !== 'YOUR_AZURE_CLIENT_ID') {
      const token: MSToken = {
        client_id: clientId,
        redirect: 'https://login.live.com/oauth20_desktop.srf',
        prompt: 'select_account',
      }
      return new Auth(token)
    }
    const prompt: Prompt = 'select_account'
    return new Auth(prompt)
  }

  private async refreshIfNeeded(accountId: string): Promise<Minecraft> {
    const cached = this.cache.get(accountId)
    if (cached?.minecraft.validate()) {
      return cached.minecraft
    }
    if (cached?.minecraft) {
      try {
        const refreshed = await cached.minecraft.refresh(true)
        this.cache.set(accountId, { minecraft: refreshed, xbox: cached.xbox })
        return refreshed
      } catch {
        /* fall through */
      }
    }

    const secrets = await this.vault.readSecrets(accountId)
    if (!secrets?.microsoft.refreshToken) {
      throw new AuthError('not_logged_in', 'auth.error.notLoggedIn')
    }

    const auth = this.createAuth()
    const xbox = await auth.refresh(secrets.microsoft.refreshToken)
    const minecraft = await xbox.getMinecraft()
    const account = this.toAccountView(minecraft)
    this.cache.set(accountId, { minecraft, xbox })
    await this.persist(accountId, xbox, minecraft, account)
    return minecraft
  }

  private toAccountView(mc: Minecraft): AccountView {
    return {
      id: mc.profile?.id ?? 'unknown',
      uuid: mc.profile?.id ?? '',
      displayName: mc.profile?.name ?? 'Player',
      xuid: mc.xuid,
    }
  }

  private async persist(
    accountId: string,
    xbox: Xbox,
    mc: Minecraft,
    account: AccountView,
  ): Promise<void> {
    await this.vault.upsertAccount(account)
    try {
      await this.vault.writeSecrets(accountId, {
        version: 1,
        microsoft: {
          accessToken: mc.mcToken,
          refreshToken: xbox.save(),
          expiresAt: mc.exp,
        },
      })
    } catch {
      throw new AuthError('safe_storage_unavailable', 'auth.error.safeStorage')
    }
  }
}
