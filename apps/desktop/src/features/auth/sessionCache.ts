import type { QueryClient } from '@tanstack/react-query'
import type { AccountView, AuthStatus, AuthStatusEvent } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { useUiStore } from '../../stores/appStores'

export const sessionQueryKey = ['session'] as const
export const accountsQueryKey = ['accounts'] as const

export const sessionQueryOptions = {
  staleTime: Infinity,
} as const

export type SessionQueryData = {
  account: AccountView | null
  status: AuthStatus
}

function upsertAccount(list: AccountView[] | undefined, account: AccountView): AccountView[] {
  if (!list?.length) return [account]
  const i = list.findIndex((a) => a.id === account.id)
  if (i < 0) return [...list, account]
  const next = list.slice()
  next[i] = { ...list[i], ...account }
  return next
}

export function applyLoggedInAccount(queryClient: QueryClient, account: AccountView): void {
  queryClient.setQueryData(sessionQueryKey, { account, status: 'logged_in' as const })
  queryClient.setQueryData(accountsQueryKey, (prev: AccountView[] | undefined) =>
    upsertAccount(prev, account),
  )
}

export async function loadSessionQuery(queryClient: QueryClient): Promise<SessionQueryData> {
  const result = await fledgeApi.auth.session()
  if (useUiStore.getState().authStatus === 'logging_in') {
    return queryClient.getQueryData<SessionQueryData>(sessionQueryKey) ?? result
  }
  return result
}

export function applyAuthStatusEvent(
  queryClient: QueryClient,
  setAuthStatus: (status: AuthStatus) => void,
  event: AuthStatusEvent | AuthStatus,
): void {
  const payload: AuthStatusEvent = typeof event === 'string' ? { status: event } : event
  const { status } = payload
  setAuthStatus(status)

  if (status === 'logging_in' || status === 'refreshing') return

  if (payload.account !== undefined) {
    queryClient.setQueryData(sessionQueryKey, { account: payload.account, status })
    if (payload.account) {
      queryClient.setQueryData(accountsQueryKey, (prev: AccountView[] | undefined) =>
        upsertAccount(prev, payload.account as AccountView),
      )
    } else {
      void queryClient.invalidateQueries({ queryKey: accountsQueryKey })
    }
    return
  }

  if (status === 'logged_out') {
    queryClient.setQueryData(sessionQueryKey, { account: null, status })
    void queryClient.invalidateQueries({ queryKey: accountsQueryKey })
    return
  }

  // expired など account 無しのステータスだけ更新（既存アカウントは維持）
  queryClient.setQueryData(sessionQueryKey, (prev: SessionQueryData | undefined) => ({
    account: prev?.account ?? null,
    status,
  }))
}
