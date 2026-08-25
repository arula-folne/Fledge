import { useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fledgeApi } from '../../api/fledgeApi'
import { TitleBar } from './TitleBar'

/**
 * OS 枠なし時のタイトルバー（× 等）をアプリ最上位に常時表示する。
 * 画面エラーでコンテンツが差し替わってもウィンドウ操作を残す。
 */
export function WindowChrome({ children }: { children: ReactNode }) {
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })
  const useOsChrome = settingsQuery.data?.useOsWindowChrome ?? false

  useEffect(() => {
    document.documentElement.style.setProperty('--titlebar-offset', useOsChrome ? '0px' : '2rem')
  }, [useOsChrome])

  return (
    <div className="flex h-full flex-col">
      {!useOsChrome ? <TitleBar /> : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
