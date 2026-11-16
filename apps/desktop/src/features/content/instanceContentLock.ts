import type { LaunchState } from '@fledge/shared'

/** 本体準備・起動処理中は、そのインスタンスへのコンテンツ変更を止める */
export function isInstanceContentOpsLocked(state: LaunchState | null | undefined): boolean {
  return state === 'preparing' || state === 'launching'
}
