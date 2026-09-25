import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, Fragment, type CSSProperties } from 'react'
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
import i18n from '../../i18n'
import { TransferProgress } from './TransferProgress'
import { UpdateAvailableBanner } from './UpdateAvailableBanner'
import { AnimatedOutlet } from './AnimatedOutlet'
import { SeasonThemeAtmosphere } from '../theme/SeasonThemeAtmosphere'
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
  const activeId = activeNavId(location.pathname)
  const navRef = useRef<HTMLElement>(null)
  const asideRef = useRef<HTMLElement>(null)
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({})
  const [pill, setPill] = useState<{ top: number; left: number; width: number; height: number } | null>(
    null,
  )
  const [pillReady, setPillReady] = useState(false)

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
  const seasonDark = settings && seasonId ? resolveSeasonDark(settings) : false

  return (
    <div className="relative flex h-full flex-col">
      <SeasonThemeAtmosphere seasonId={seasonId} dark={seasonDark} />
      <div className="relative z-10 flex min-h-0 flex-1">
        <aside
          ref={asideRef}
          data-fledge-tutorial="tutorial-sidebar"
          className={[
            'season-shell-panel flex shrink-0 flex-col border-r border-[var(--color-border)] py-2 transition-[width] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
            seasonId ? '' : 'bg-[var(--color-surface)]/90',
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
              seasonId ? '' : 'bg-[var(--color-surface)]/70',
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
              'season-shell-main flex min-h-0 flex-1 flex-col overflow-hidden p-3',
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
