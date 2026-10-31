import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  Fragment,
  type CSSProperties,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  IconHome,
  IconMenu2,
  IconPackages,
  IconPhoto,
  IconSettings,
  IconShirt,
} from '@tabler/icons-react'
import { TextLogo } from '../brand/TextLogo'
import { AppCredits } from '../brand/AppCredits'
import { AccountChip } from '../../features/auth/AccountChip'
import { LoginErrorDialog } from '../../features/auth/LoginErrorDialog'
import { fledgeApi } from '../../api/fledgeApi'
import { applyTheme, resolveSeasonDark } from '../../styles/theme'
import { getSeasonTheme } from '../../styles/themeSeasons'
import i18n from '../../i18n'
import { TransferProgress } from './TransferProgress'
import { UpdateAvailableBanner } from './UpdateAvailableBanner'
import { AnimatedOutlet } from './AnimatedOutlet'
import { ThemeIllustrationAtmosphere } from '../theme/ThemeIllustrationAtmosphere'
import { HoverTip } from '../ui/HoverTip'

const SIDEBAR_COLLAPSED_KEY = 'fledge.sidebarCollapsed'

const navIcon = { size: 23, stroke: 1.75 } as const

const NAV_ITEMS = [
  { id: 'home', to: '/', end: true, icon: IconHome, labelKey: 'nav.home', iconClass: 'text-[var(--color-nav-home)]' },
  { id: 'browse', to: '/browse', end: false, icon: IconPackages, labelKey: 'nav.browse', iconClass: 'text-[var(--color-nav-browse)]' },
  { id: 'gallery', to: '/gallery', end: false, icon: IconPhoto, labelKey: 'nav.gallery', iconClass: 'text-[var(--color-nav-gallery)]' },
  { id: 'skin', to: '/skin', end: false, icon: IconShirt, labelKey: 'nav.skin', iconClass: 'text-[var(--color-nav-skin)]' },
  { id: 'settings', to: '/settings', end: false, icon: IconSettings, labelKey: 'nav.settings', iconClass: 'text-[var(--color-nav-settings)]' },
] as const

function activeNavId(pathname: string): string {
  const segment = pathname.split('/').filter(Boolean)[0]
  if (!segment || segment === 'library') return 'home'
  if (NAV_ITEMS.some((item) => item.id === segment)) return segment
  return 'home'
}

export function AppShell() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const activeId = activeNavId(location.pathname)
  const navRef = useRef<HTMLElement>(null)
  const asideRef = useRef<HTMLElement>(null)
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({})
  const navWheelAccRef = useRef(0)
  const [pill, setPill] = useState<{ top: number; left: number; width: number; height: number } | null>(
    null,
  )
  const [pillReady, setPillReady] = useState(false)

  const onNavWheel = useCallback(
    (event: ReactWheelEvent<HTMLElement>) => {
      if (NAV_ITEMS.length < 2) return
      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      if (delta === 0) return

      event.preventDefault()
      event.stopPropagation()

      navWheelAccRef.current += delta
      const threshold = 36
      if (Math.abs(navWheelAccRef.current) < threshold) return
      const dir = navWheelAccRef.current > 0 ? 1 : -1
      navWheelAccRef.current = 0

      const idx = NAV_ITEMS.findIndex((item) => item.id === activeId)
      const current = idx < 0 ? 0 : idx
      const next = Math.max(0, Math.min(NAV_ITEMS.length - 1, current + dir))
      const item = NAV_ITEMS[next]
      if (!item || item.id === activeId) return
      navigate(item.to)
      requestAnimationFrame(() => {
        itemRefs.current[item.id]?.scrollIntoView({ block: 'nearest' })
      })
    },
    [activeId, navigate],
  )

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'collapsed'
    } catch {
      return false
    }
  })
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })

  useEffect(() => {
    if (settingsQuery.data) applyTheme(settingsQuery.data)
  }, [settingsQuery.data])

  useEffect(() => {
    const locale = settingsQuery.data?.locale
    if (!locale) return
    if (i18n.language !== locale) {
      void i18n.changeLanguage(locale)
      return
    }
    document.documentElement.lang = locale
  }, [settingsQuery.data?.locale])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? 'collapsed' : 'expanded')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  const updatePill = useCallback(() => {
    const nav = navRef.current
    const el = itemRefs.current[activeId]
    if (!nav || !el) {
      setPill(null)
      return
    }
    const navRect = nav.getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    setPill({
      top: rect.top - navRect.top + nav.scrollTop,
      left: rect.left - navRect.left + nav.scrollLeft,
      width: rect.width,
      height: rect.height,
    })
  }, [activeId])

  // 選択項目・折りたたみ・幅変化に追従（展開直後の誤サイズを防ぐ）
  useLayoutEffect(() => {
    updatePill()
    const el = itemRefs.current[activeId]
    const nav = navRef.current
    const aside = asideRef.current
    const ro = new ResizeObserver(() => updatePill())
    if (el) ro.observe(el)
    if (nav) ro.observe(nav)
    if (aside) ro.observe(aside)
    window.addEventListener('resize', updatePill)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updatePill)
    }
  }, [activeId, collapsed, t, updatePill])

  // メニュー項目切替時はピルをなめらかに移動
  useEffect(() => {
    setPillReady(true)
  }, [activeId])

  // 折りたたみ切替中はピルの transition を切り、幅追従を優先
  useLayoutEffect(() => {
    setPillReady(false)
    updatePill()
    const timer = window.setTimeout(() => {
      updatePill()
      setPillReady(true)
    }, 180)
    return () => window.clearTimeout(timer)
  }, [collapsed, updatePill])

  const settings = settingsQuery.data
  const seasonId =
    settings?.themeFamily === 'season' && settings.seasonThemeId ? settings.seasonThemeId : null
  const illustrated = Boolean(seasonId)

  let atmosphereKey: string | null = null
  let atmosphereSrc: string | null = null
  let atmosphereOverlay: string | null = null
  if (settings && seasonId) {
    const season = getSeasonTheme(seasonId)
    const dark = resolveSeasonDark(settings)
    atmosphereSrc =
      (dark
        ? (season?.illustration?.dark ?? season?.illustration?.light)
        : (season?.illustration?.light ?? season?.illustration?.dark)) ?? null
    atmosphereOverlay =
      (dark ? season?.atmosphere.dark.overlayClass : season?.atmosphere.light.overlayClass) ?? null
    atmosphereKey =
      atmosphereSrc && atmosphereOverlay ? `${seasonId}:${dark ? 'dark' : 'light'}` : null
  }

  return (
    <div className="relative flex h-full flex-col">
      <ThemeIllustrationAtmosphere
        layerKey={atmosphereKey}
        src={atmosphereSrc}
        overlayClass={atmosphereOverlay}
      />
      <div className="relative z-10 flex min-h-0 flex-1">
        <aside
          ref={asideRef}
          data-fledge-tutorial="tutorial-sidebar"
          className={[
            'season-shell-panel flex shrink-0 flex-col border-r border-[var(--color-border)] py-2 transition-[width] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
            illustrated ? '' : 'bg-[var(--color-surface)]/90',
            collapsed ? 'w-14 items-center px-1.5' : 'w-44 px-2',
          ].join(' ')}
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        >
          <div
            className={['mb-3 flex items-center', collapsed ? 'justify-center' : 'gap-0.5'].join(' ')}
          >
            <button
              type="button"
              className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
              aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
              onClick={() => setCollapsed((v) => !v)}
            >
              <IconMenu2 size={20} stroke={1.75} />
            </button>
            {collapsed ? null : <TextLogo sidebar showIcon={false} />}
          </div>
          <nav
            ref={navRef}
            className={['relative flex flex-col', collapsed ? 'items-center gap-1.5' : 'gap-1'].join(' ')}
            onWheel={onNavWheel}
          >
            {pill ? (
              <div
                aria-hidden
                className={[
                  'pointer-events-none absolute top-0 left-0 rounded-[var(--radius-sm)] bg-[var(--color-selection-soft)]',
                  pillReady
                    ? 'transition-[transform,width,height] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none'
                    : '',
                ].join(' ')}
                style={{
                  width: pill.width,
                  height: pill.height,
                  transform: `translate3d(${pill.left}px, ${pill.top}px, 0)`,
                }}
              />
            ) : null}
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const label = t(item.labelKey)
              const active = item.id === activeId
              const link = (
                <NavLink
                  ref={(el) => {
                    itemRefs.current[item.id] = el
                  }}
                  to={item.to}
                  end={item.end}
                  aria-label={label}
                  className={[
                    'relative z-[1] flex items-center text-[16px] leading-tight transition-colors duration-100',
                    collapsed
                      ? 'size-10 justify-center rounded-[var(--radius-sm)]'
                      : 'min-w-0 w-full gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2',
                    active
                      ? 'font-medium text-[var(--color-selection)]'
                      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
                  ].join(' ')}
                >
                  <Icon {...navIcon} className={['shrink-0', item.iconClass].join(' ')} aria-hidden />
                  {collapsed ? null : <span className="min-w-0 truncate">{label}</span>}
                </NavLink>
              )
              if (!collapsed) {
                return <Fragment key={item.id}>{link}</Fragment>
              }
              return (
                <HoverTip key={item.id} label={label} placement="right" delayMs={280}>
                  {link}
                </HoverTip>
              )
            })}
          </nav>
          <div className={['mt-auto pt-2', collapsed ? 'text-center' : 'px-0.5'].join(' ')}>
            <AppCredits compact={collapsed} size="sidebar" />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            data-tauri-drag-region
            className={[
              'season-shell-panel relative z-20 flex h-[3.75rem] shrink-0 items-center gap-2 overflow-x-clip border-b border-[var(--color-border)] px-3',
              illustrated ? '' : 'bg-[var(--color-surface)]/70',
            ].join(' ')}
            style={{ WebkitAppRegion: 'drag' } as CSSProperties}
          >
            <div
              className="min-w-0"
              style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            >
              <TransferProgress />
            </div>
            <div
              className="ml-auto flex min-w-0 shrink-0 items-center gap-6"
              style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            >
              <UpdateAvailableBanner />
              <AccountChip />
            </div>
          </header>
          <main
            className={[
              'season-shell-main flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-2',
            ].join(' ')}
            style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          >
            <AnimatedOutlet />
          </main>
        </div>
      </div>
      <LoginErrorDialog />
    </div>
  )
}
