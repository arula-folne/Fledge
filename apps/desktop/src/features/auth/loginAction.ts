import type { QueryClient } from '@tanstack/react-query'
import { fledgeApi } from '../../api/fledgeApi'
import { useUiStore } from '../../stores/appStores'
import { applyLoggedInAccount, sessionQueryKey, type SessionQueryData } from './sessionCache'

const AUTH_ERROR_KEY = /auth\.error\.[a-zA-Z]+/

/** IPC 越しのエラーメッセージから auth.error.* キーを取り出す */
export function extractAuthErrorKey(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return AUTH_ERROR_KEY.exec(message)?.[0] ?? 'auth.error.failed'
}

/**
 * すべてのログイン導線の共通処理。
 * 状態遷移と、失敗時の原因ダイアログ表示（キャンセルを除く）まで面倒を見る。
 */
export async function startLogin(queryClient: QueryClient): Promise<void> {
  const ui = useUiStore.getState()
  if (ui.authStatus === 'logging_in') return
  ui.setAuthStatus('logging_in')
  ui.setAuthErrorKey(null)
  await queryClient.cancelQueries({ queryKey: sessionQueryKey })
  try {
    const account = await fledgeApi.auth.login()
    useUiStore.getState().setAuthStatus('logged_in')
    applyLoggedInAccount(queryClient, account)
  } catch (err) {
    const key = extractAuthErrorKey(err)
    const state = useUiStore.getState()
    if (state.authStatus === 'logging_in') {
      const session = queryClient.getQueryData<SessionQueryData>(sessionQueryKey)
      state.setAuthStatus(session?.account ? 'logged_in' : 'logged_out')
    }
    if (key !== 'auth.error.cancelled') {
      state.setAuthErrorKey(key)
    }
  }
}
