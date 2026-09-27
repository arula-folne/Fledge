import { useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { contentUiZoomFactor, type UiScale } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { FLEDGE_UI_SCALE_ROOT_ID } from './fledgeUiScaleRoot'
import { TitleBar } from './TitleBar'

/** page zoom の影響を避け、ウィンドウの論理サイズに近い値を取る */
function readWindowLogicalSize(): { w: number; h: number } {
  if (typeof window === 'undefined') return { w: 1280, h: 720 }
  const w = window.outerWidth || window.innerWidth || 1280
  const h = window.outerHeight || window.innerHeight || 720
  return { w, h }
}

/**
 * 独自タイトルバー（× 等）をアプリ最上位に常時表示する。
 *
 * WebView zoom は常にノーマル相当。UI サイズはタイトルバー下だけ CSS zoom で変える。
 * これによりタイトルバーの最小化等アイコンがスケール再ラスタでぼやけない。
 */
export function WindowChrome({ children }: { children: ReactNode }) {
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })
  const uiScale: UiScale = settingsQuery.data?.uiScale ?? 'normal'
  const [viewport, setViewport] = useState(() => readWindowLogicalSize())

  useEffect(() => {
    const onResize = () => setViewport(readWindowLogicalSize())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const contentZoom = contentUiZoomFactor(uiScale, viewport.w, viewport.h)

  useEffect(() => {
    document.documentElement.style.setProperty('--titlebar-offset', '2rem')
    document.documentElement.style.setProperty('--fledge-content-zoom', String(contentZoom))
  }, [contentZoom])

  return (
    <div className="flex h-full flex-col">
      <div className="relative z-[110] h-8 shrink-0 overflow-hidden">
        <TitleBar />
      </div>
      <div
        id={FLEDGE_UI_SCALE_ROOT_ID}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col"
        style={{ zoom: contentZoom }}
      >
        {children}
      </div>
    </div>
  )
}
