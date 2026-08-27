import { useEffect, type ReactNode } from 'react'
import { TitleBar } from './TitleBar'

/**
 * 独自タイトルバー（× 等）をアプリ最上位に常時表示する。
 * 画面エラーでコンテンツが差し替わってもウィンドウ操作を残す。
 */
export function WindowChrome({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.style.setProperty('--titlebar-offset', '2rem')
  }, [])

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
