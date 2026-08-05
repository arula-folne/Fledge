import fs from 'node:fs/promises'
import path from 'node:path'
import { safeStorage } from 'electron'
import type { AccountView } from '@fledge/shared'

export type StoredSecrets = {
  version: 1
  microsoft: {
    accessToken: string
    refreshToken: string
    expiresAt?: number
  }
  providerPayload?: unknown
}

type IndexFile = {
  version: 1
  activeId: string | null
  accounts: AccountView[]
}

/**
 * 複数 Microsoft アカウントを Data/Accounts に保存する。
 * 旧形式（active.json + secrets.dat）は初回読み込み時に移行する。
 */
export class TokenVault {
  constructor(private readonly accountsDir: string) {}

  private indexPath(): string {
    return path.join(this.accountsDir, 'index.json')
  }

  private secretsDir(): string {
    return path.join(this.accountsDir, 'secrets')
  }

  private secretsPath(accountId: string): string {
    return path.join(this.secretsDir(), `${accountId}.dat`)
  }

  /** 旧シングルトン形式 */
  private legacyActivePath(): string {
    return path.join(this.accountsDir, 'active.json')
  }

  private legacySecretsPath(): string {
    return path.join(this.accountsDir, 'secrets.dat')
  }

  private async ensureMigrated(): Promise<IndexFile> {
    await fs.mkdir(this.accountsDir, { recursive: true })
    try {
      const raw = await fs.readFile(this.indexPath(), 'utf8')
      const parsed = JSON.parse(raw) as IndexFile
      if (parsed.version === 1 && Array.isArray(parsed.accounts)) {
        return {
          version: 1,
          activeId: parsed.activeId ?? parsed.accounts[0]?.id ?? null,
          accounts: parsed.accounts,
        }
      }
    } catch {
      /* migrate or create */
    }

    const legacyAccount = await this.readLegacyAccount()
    const legacySecrets = await this.readLegacySecrets()
    const index: IndexFile = {
      version: 1,
      activeId: legacyAccount?.id ?? null,
      accounts: legacyAccount ? [legacyAccount] : [],
    }
    await this.writeIndex(index)
    if (legacyAccount && legacySecrets) {
      await this.writeSecrets(legacyAccount.id, legacySecrets)
    }
    await fs.rm(this.legacyActivePath(), { force: true })
    await fs.rm(this.legacySecretsPath(), { force: true })
    return index
  }

  private async readLegacyAccount(): Promise<AccountView | null> {
    try {
      const raw = await fs.readFile(this.legacyActivePath(), 'utf8')
      return JSON.parse(raw) as AccountView
    } catch {
      return null
    }
  }

  private async readLegacySecrets(): Promise<StoredSecrets | null> {
    if (!safeStorage.isEncryptionAvailable()) return null
    try {
      const buf = await fs.readFile(this.legacySecretsPath())
      return JSON.parse(safeStorage.decryptString(buf)) as StoredSecrets
    } catch {
      return null
    }
  }

  private async writeIndex(index: IndexFile): Promise<void> {
    await fs.mkdir(this.accountsDir, { recursive: true })
    await fs.writeFile(this.indexPath(), JSON.stringify(index, null, 2), 'utf8')
  }

  private async readIndex(): Promise<IndexFile> {
    return this.ensureMigrated()
  }

  async listAccounts(): Promise<AccountView[]> {
    const index = await this.readIndex()
    return index.accounts
  }

  async getActiveId(): Promise<string | null> {
    const index = await this.readIndex()
    return index.activeId
  }

  async readAccount(accountId?: string): Promise<AccountView | null> {
    const index = await this.readIndex()
    const id = accountId ?? index.activeId
    if (!id) return null
    return index.accounts.find((a) => a.id === id) ?? null
  }

  async setActive(accountId: string): Promise<AccountView> {
    const index = await this.readIndex()
    const account = index.accounts.find((a) => a.id === accountId)
    if (!account) throw new Error('account_not_found')
    index.activeId = accountId
    await this.writeIndex(index)
    return account
  }

  async upsertAccount(account: AccountView): Promise<void> {
    const index = await this.readIndex()
    const i = index.accounts.findIndex((a) => a.id === account.id)
    if (i >= 0) index.accounts[i] = account
    else index.accounts.push(account)
    if (!index.activeId) index.activeId = account.id
    // 新規ログイン時はアクティブにする
    index.activeId = account.id
    await this.writeIndex(index)
  }

  async removeAccount(accountId: string): Promise<void> {
    const index = await this.readIndex()
    index.accounts = index.accounts.filter((a) => a.id !== accountId)
    if (index.activeId === accountId) {
      index.activeId = index.accounts[0]?.id ?? null
    }
    await this.writeIndex(index)
    await fs.rm(this.secretsPath(accountId), { force: true })
  }

  async readSecrets(accountId: string): Promise<StoredSecrets | null> {
    if (!safeStorage.isEncryptionAvailable()) return null
    try {
      const buf = await fs.readFile(this.secretsPath(accountId))
      return JSON.parse(safeStorage.decryptString(buf)) as StoredSecrets
    } catch {
      return null
    }
  }

  async writeSecrets(accountId: string, secrets: StoredSecrets): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('safe_storage_unavailable')
    }
    await fs.mkdir(this.secretsDir(), { recursive: true })
    const encrypted = safeStorage.encryptString(JSON.stringify(secrets))
    await fs.writeFile(this.secretsPath(accountId), encrypted)
  }

  /** 全アカウント削除（設定リセットからは呼ばない） */
  async clear(): Promise<void> {
    const index = await this.readIndex()
    for (const a of index.accounts) {
      await fs.rm(this.secretsPath(a.id), { force: true })
    }
    await this.writeIndex({ version: 1, activeId: null, accounts: [] })
    await fs.rm(this.legacyActivePath(), { force: true })
    await fs.rm(this.legacySecretsPath(), { force: true })
  }
}
