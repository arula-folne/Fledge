import { Outlet, useLocation } from 'react-router-dom'

/**
 * サイドバー主要メニュー切替時のメイン領域アニメーション。
 * `/library/...` など深い遷移ではトップセグメント単位でキーを揃える。
 */
export function AnimatedOutlet() {
  const location = useLocation()
  const segment = location.pathname.split('/').filter(Boolean)[0] ?? 'home'

  return (
    <div
      key={segment}
      className="route-page flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <Outlet />
    </div>
  )
}
