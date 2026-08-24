import { Auth, types, lexicon as msmcLexicon, type Minecraft, type Xbox } from 'msmc'
import type { AuthProvider } from '@fledge/core'
import { AuthError, type LaunchCredentials } from '@fledge/core'
import type { AccountView, AuthStatus } from '@fledge/shared'
import type { Logger } from '@fledge/core'
import type { TokenVault } from '../security/tokenVault'
import {
  formatMsmcError,
  minecraftFromXbox,
  openMicrosoftLoginWindow,
  xboxFromAuthCode,
  xboxFromRefreshToken,
} from './microsoftLogin'

type Prompt = types.Prompt
type MSToken = types.MSToken

type StatusListener = (status: AuthStatus, account?: AccountView | null) => void

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

/** microsoftLogin.ts の原因マーカー → ユーザー向け i18n キー */
const LOGIN_FAILURE_KEYS: Array<[marker: string, code: 'failed' | 'minecraft_not_owned', key: string]> = [
  ['error.auth.xsts.noXboxAccount', 'failed', 'auth.error.noXboxAccount'],
  ['error.auth.xsts.childAccount', 'failed', 'auth.error.childAccount'],
  ['error.auth.xsts.adultVerification', 'failed', 'auth.error.adultVerification'],
  ['error.auth.xsts.region', 'failed', 'auth.error.region'],
  ['error.auth.xsts', 'failed', 'auth.error.xbox'],
  ['error.auth.xboxLive', 'failed', 'auth.error.xbox'],
  ['error.auth.minecraft.notOwned', 'minecraft_not_owned', 'auth.error.notOwned'],
  ['error.auth.minecraft.profile', 'failed', 'auth.error.noProfile'],
  ['error.auth.minecraft.login', 'failed', 'auth.error.mcLogin'],
  ['error.auth.microsoft', 'failed', 'auth.error.microsoft'],
]

function loginFailureInfo(err: unknown): ['failed' | 'minecraft_not_owned', string] {
  const message = err instanceof Error ? err.message : String(err)
  for (const [marker, code, key] of LOGIN_FAILURE_KEYS) {
    if (message.includes(marker)) return [code, key]
  }
  if (err instanceof Error && (err.name === 'AbortError' || /fetch failed/i.test(message))) {
    return ['failed', 'auth.error.network']
  }
  return ['failed', 'auth.error.failed']
}

/**
 * msmc を閉じ込めた Microsoft 認証実装（複数アカウント対応）。
 */
export class MicrosoftAuthProvider implements AuthProvider {
  private status: AuthStatus = 'logged_out'
  private listeners = new Set<StatusListener>()
  private cache = new Map<string, CachedEntry>()
  private activeId: string | null = null
  /** 進行中 / 完了済みの更新世代。古い fire-and-forget 更新が成功ログインを上書きしない */
  private refreshEpoch = new Map<string, number>()
  /** アカウントごとの更新直列化（リフレッシュトークンの単回利用競合を防ぐ） */
  private refreshChains = new Map<string, Promise<unknown>>()

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

  private setStatus(status: AuthStatus, account?: AccountView | null): void {
    this.status = status
    for (const l of this.listeners) l(status, account)
  }

  private bumpRefreshEpoch(accountId: string): number {
    const next = (this.refreshEpoch.get(accountId) ?? 0) + 1
    this.refreshEpoch.set(accountId, next)
    return next
  }

  private currentEpoch(accountId: string): number {
    return this.refreshEpoch.get(accountId) ?? 0
  }

  private runRefreshExclusive<T>(accountId: string, op: () => Promise<T>): Promise<T> {
    const prev = this.refreshChains.get(accountId) ?? Promise.resolve()
    const next = prev.then(op, op)
    this.refreshChains.set(
      accountId,
      next.then(
        () => undefined,
        () => undefined,
      ),
    )
    return next
  }

  async listAccounts(): Promise<AccountView[]> {
    return this.vault.listAccounts()
  }

  async switchAccount(accountId: string): Promise<AccountView> {
    const account = await this.vault.setActive(accountId)
    this.activeId = accountId
    this.setStatus('logged_in', account)
    const epoch = this.bumpRefreshEpoch(accountId)
    try {
      await this.refreshIfNeeded(accountId)
      if (this.currentEpoch(accountId) === epoch && this.activeId === accountId) {
        this.setStatus('logged_in', account)
      }
    } catch {
      if (this.currentEpoch(accountId) === epoch && this.activeId === accountId) {
        this.setStatus('expired', account)
      }
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
      const code = await openMicrosoftLoginWindow(auth, {
        width: 520,
        height: 700,
        title: 'Fledge - Microsoft アカウント',
      })
      const xbox = await xboxFromAuthCode(auth, code)
      const minecraft = await minecraftFromXbox(xbox)
      const account = this.toAccountView(minecraft)
      await this.runRefreshExclusive(account.id, async () => {
        // ログイン完了前に走っていた更新失敗が、直後の logged_in を expired に戻さないように無効化
        this.bumpRefreshEpoch(account.id)
        this.cache.set(account.id, { minecraft, xbox })
        this.activeId = account.id
        await this.persist(account.id, xbox, minecraft, account)
      })
      this.setStatus('logged_in', account)
      this.logger.info('auth', `Logged in as ${account.displayName}`)
      return account
    } catch (err) {
      let remaining: AccountView | null = null
      try {
        remaining = await this.vault.readAccount()
      } catch {
        remaining = null
      }
      this.setStatus(remaining ? 'logged_in' : 'logged_out', remaining)
      const detail = formatMsmcError(err)
      const cancelled = /cancel|close|closed/i.test(detail)
      this.logger.error('auth', cancelled ? 'Login cancelled' : `Login failed: ${detail}`)
      if (!cancelled) console.error('Fledge login failed:', err)
      if (err instanceof AuthError) throw err
      if (cancelled) {
        throw new AuthError('cancelled', 'auth.error.cancelled', { cause: err })
      }
      throw new AuthError(...loginFailureInfo(err), { cause: err })
    }
  }

  async logout(accountId?: string): Promise<void> {
    const id = accountId ?? this.activeId ?? (await this.vault.getActiveId())
    if (!id) {
      this.setStatus('logged_out', null)
      return
    }
    this.cache.delete(id)
    this.bumpRefreshEpoch(id)
    await this.vault.removeAccount(id)
    this.activeId = await this.vault.getActiveId()
    if (!this.activeId) {
      this.setStatus('logged_out', null)
      this.logger.info('auth', 'Logged out (no accounts left)')
      return
    }
    const remaining = await this.vault.readAccount()
    const epoch = this.bumpRefreshEpoch(this.activeId)
    try {
      await this.refreshIfNeeded(this.activeId)
      if (this.currentEpoch(this.activeId) === epoch) {
        this.setStatus('logged_in', remaining)
      }
    } catch {
      if (this.currentEpoch(this.activeId) === epoch) {
        this.setStatus('expired', remaining)
      }
    }
    this.logger.info('auth', `Removed account ${id}; active=${this.activeId}`)
  }

  async getSession(): Promise<AccountView | null> {
    const account = await this.vault.readAccount()
    if (!account) {
      this.activeId = null
      if (this.status !== 'logging_in') this.setStatus('logged_out', null)
      return null
    }
    this.activeId = account.id
    if (this.status === 'logging_in') return account

    const cached = this.cache.get(account.id)
    if (cached?.minecraft.validate()) {
      if (this.status !== 'logged_in') this.setStatus('logged_in', account)
      return account
    }

    this.setStatus(this.status === 'expired' ? 'expired' : 'logged_in', account)
    const accountId = account.id
    const epoch = this.currentEpoch(accountId)
    void this.refreshIfNeeded(accountId)
      .then(() => {
        if (
          this.status !== 'logging_in' &&
          this.activeId === accountId &&
          this.currentEpoch(accountId) === epoch
        ) {
          this.setStatus('logged_in', account)
        }
      })
      .catch(() => {
        if (
          this.status !== 'logging_in' &&
          this.activeId === accountId &&
          this.currentEpoch(accountId) === epoch
        ) {
          this.setStatus('expired', account)
        }
      })
    return account
  }

  async getLaunchCredentials(accountId?: string): Promise<LaunchCredentials> {
    return this.ensureCredentials(accountId, { announce: true })
  }

  async ensureCredentials(
    accountId?: string,
    opts?: { force?: boolean; announce?: boolean },
  ): Promise<LaunchCredentials> {
    const id = accountId ?? this.activeId ?? (await this.vault.getActiveId())
    if (!id) {
      throw new AuthError('not_logged_in', 'auth.error.notLoggedIn')
    }
    if (opts?.announce) this.setStatus('refreshing')
    const epoch = this.currentEpoch(id)
    try {
      const mc = await this.refreshIfNeeded(id, opts?.force === true)
      const profile = mc.profile
      if (!profile?.id || !profile.name) {
        throw new AuthError('failed', 'auth.error.failed')
      }
      // ログイン等で世代が進んだ場合は、古い更新結果でステータスを上書きしない
      if (this.currentEpoch(id) === epoch) {
        if (!accountId || accountId === this.activeId) {
          const active = await this.vault.readAccount()
          this.setStatus('logged_in', active)
        } else {
          const active = await this.vault.readAccount()
          this.setStatus(active ? 'logged_in' : 'logged_out', active)
        }
      }
      return {
        uuid: profile.id,
        name: profile.name,
        accessToken: mc.mcToken,
        userType: 'msa',
      }
    } catch (err) {
      if (this.currentEpoch(id) !== epoch) {
        throw err instanceof AuthError
          ? err
          : new AuthError('refresh_failed', 'auth.error.refreshFailed', { cause: err })
      }
      if (err instanceof AuthError) {
        this.setStatus(
          err.code === 'not_logged_in' ? 'logged_out' : 'expired',
          err.code === 'not_logged_in' ? null : undefined,
        )
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

  private async refreshIfNeeded(accountId: string, force = false): Promise<Minecraft> {
    return this.runRefreshExclusive(accountId, () => this.refreshIfNeededUnlocked(accountId, force))
  }

  private async refreshIfNeededUnlocked(accountId: string, force = false): Promise<Minecraft> {
    return this.refreshOnce(accountId, force, true)
  }

  private async refreshOnce(
    accountId: string,
    force: boolean,
    allowRetry: boolean,
  ): Promise<Minecraft> {
    const cached = this.cache.get(accountId)
    if (!force && cached?.minecraft.validate()) {
      return cached.minecraft
    }

    const epochAtStart = this.currentEpoch(accountId)
    const secrets = await this.vault.readSecrets(accountId)
    if (!secrets?.microsoft.refreshToken) {
      throw new AuthError('not_logged_in', 'auth.error.notLoggedIn')
    }

    const auth = this.createAuth()
    // msmc Auth.refresh / Xbox.getMinecraft は node-fetch 依存のため製品版で不安定。
    // ログイン時と同じネイティブ fetch 経路で更新する。
    const xbox = await xboxFromRefreshToken(auth, secrets.microsoft.refreshToken)
    const minecraft = await minecraftFromXbox(xbox)

    if (this.currentEpoch(accountId) !== epochAtStart) {
      const newer = this.cache.get(accountId)
      if (!force && newer?.minecraft.validate()) return newer.minecraft
      if (allowRetry) return this.refreshOnce(accountId, force, false)
      if (newer) return newer.minecraft
    }

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
    const refreshToken = xbox.save()
    if (!refreshToken) {
      throw new AuthError('failed', 'auth.error.failed')
    }
    await this.vault.upsertAccount(account)
    try {
      await this.vault.writeSecrets(accountId, {
        version: 1,
        microsoft: {
          accessToken: mc.mcToken,
          refreshToken,
          expiresAt: mc.exp,
        },
      })
    } catch (err) {
      await this.vault.removeAccount(accountId).catch(() => undefined)
      if (err instanceof AuthError) throw err
      throw new AuthError('safe_storage_unavailable', 'auth.error.safeStorage', { cause: err })
    }
  }
}
