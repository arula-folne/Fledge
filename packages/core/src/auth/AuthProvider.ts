import type { AccountView, AuthStatus } from '@fledge/shared'
import type { LaunchCredentials } from './authTypes.js'

export type { AccountView, AuthStatus, LaunchCredentials }

export interface AuthProvider {
  /** Microsoft ログインを追加（同 UUID なら上書き）し、アクティブにする */
  login(): Promise<AccountView>
  /** 指定アカウントを削除。省略時はアクティブを削除 */
  logout(accountId?: string): Promise<void>
  /** 保存済みアカウント一覧 */
  listAccounts(): Promise<AccountView[]>
  /** アクティブアカウントを切替（実行中ゲームは殺さない） */
  switchAccount(accountId: string): Promise<AccountView>
  /** アクティブのプロフィール */
  getSession(): Promise<AccountView | null>
  getStatus(): AuthStatus
  /** 起動用クレデンシャル。accountId 省略時はアクティブ */
  getLaunchCredentials(accountId?: string): Promise<LaunchCredentials>
  onStatusChange?(listener: (status: AuthStatus) => void): () => void
}
