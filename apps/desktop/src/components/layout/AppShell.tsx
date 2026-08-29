import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  IconHome,
  IconMenu2,
  IconPackages,
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
import { SeasonThemeAtmosphere } from '../theme/SeasonThemeAtmosphere'
import appIcon from '../../assets/app-icon.png'

const SIDEBAR_COLLAPSED_KEY = 'fledge.sidebarCollapsed'

const navIcon = { size: 23, stroke: 1.75 } as const

const navClass = (collapsed: boolean) =>
  ({ isActive }: { isActive: boolean }) =>
    [
      'flex items-center text-[16px] leading-tight transition-colors',
      collapsed
        ? 'size-10 justify-center rounded-[var(--radius-sm)]'
        : 'gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2',
      isActive
        ? 'bg-[var(--color-selection-soft)] font-medium text-[var(--color-selection)]'
        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
    ].join(' ')

export function AppShell() {
  const { t } = useTranslation()
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
    if (locale && i18n.language !== locale) void i18n.changeLanguage(locale)
  }, [settingsQuery.data?.locale])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? 'collapsed' : 'expanded')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  const itemClass = navClass(collapsed)
  const settings = settingsQuery.data
  const seasonId =
    settings?.themeFamily === 'season' && settings.seasonThemeId ? settings.seasonThemeId : null
  const seasonDark = settings && seasonId ? resolveSeasonDark(settings) : false

  return (
    <div className="relative flex h-full flex-col">
      {seasonId ? <SeasonThemeAtmosphere seasonId={seasonId} dark={seasonDark} /> : null}
      <div
        className="relative z-10 flex min-h-0 flex-1"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <aside
          data-fledge-tutorial="tutorial-sidebar"
          className={[
            'season-shell-panel flex shrink-0 flex-col border-r border-[var(--color-border)] py-2',
            seasonId ? '' : 'bg-[var(--color-surface)]/90',
            collapsed ? 'w-14 items-center px-1.5' : 'w-44 px-2',
          ].join(' ')}
        >
          <div
            className={['mb-3 flex items-center', collapsed ? 'flex-col gap-1' : 'gap-0.5'].join(' ')}
          >
            {collapsed ? (
              <img
                src={appIcon}
                alt=""
                width={24}
                height={24}
                className="mt-1 mb-1 shrink-0 rounded-[22%]"
                draggable={false}
              />
            ) : null}
            <button
              type="button"
              className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
              aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
              onClick={() => setCollapsed((v) => !v)}
            >
              <IconMenu2 size={20} stroke={1.75} />
            </button>
            {collapsed ? null : <TextLogo sidebar showIcon={false} />}
          </div>
          <nav className={['flex flex-col', collapsed ? 'items-center gap-1.5' : 'gap-1'].join(' ')}>
            <NavLink to="/" end className={itemClass} aria-label={t('nav.home')}>
              <IconHome {...navIcon} aria-hidden />
              {collapsed ? null : t('nav.home')}
            </NavLink>
            <NavLink to="/browse" className={itemClass} aria-label={t('nav.browse')}>
              <IconPackages {...navIcon} aria-hidden />
              {collapsed ? null : t('nav.browse')}
            </NavLink>
            <NavLink to="/skin" className={itemClass} aria-label={t('nav.skin')}>
              <IconShirt {...navIcon} aria-hidden />
              {collapsed ? null : t('nav.skin')}
            </NavLink>
            <NavLink to="/settings" className={itemClass} aria-label={t('nav.settings')}>
              <IconSettings {...navIcon} aria-hidden />
              {collapsed ? null : t('nav.settings')}
            </NavLink>
          </nav>
          <div className={['mt-auto pt-2', collapsed ? 'text-center' : 'px-0.5'].join(' ')}>
            <AppCredits compact={collapsed} size="sidebar" />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            className={[
              'season-shell-panel relative z-20 flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-1.5',
              seasonId ? '' : 'bg-[var(--color-surface)]/70',
            ].join(' ')}
          >
            <TransferProgress />
            <div className="ml-auto flex min-w-0 shrink-0 items-center gap-6">
              <UpdateAvailableBanner />
              <AccountChip />
            </div>
          </header>
          <main
            className={[
              'season-shell-main flex min-h-0 flex-1 flex-col overflow-hidden p-3',
            ].join(' ')}
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <LoginErrorDialog />
    </div>
  )
}
