import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  IconHome,
  IconMenu2,
  IconSettings,
  IconShirt,
  IconStack2,
} from '@tabler/icons-react'
import { TextLogo } from '../brand/TextLogo'
import { AppCredits } from '../brand/AppCredits'
import { AccountChip } from '../../features/auth/AccountChip'
import { fledgeApi } from '../../api/fledgeApi'
import { applyTheme } from '../../styles/theme'
import { TitleBar } from './TitleBar'
import { TransferProgress } from './TransferProgress'

const SIDEBAR_COLLAPSED_KEY = 'fledge.sidebarCollapsed'

const navIcon = { size: 18, stroke: 1.75 } as const

const navClass = (collapsed: boolean) =>
  ({ isActive }: { isActive: boolean }) =>
    [
      'flex items-center rounded-[var(--radius-sm)] text-sm transition-colors',
      collapsed ? 'justify-center px-2 py-2.5' : 'gap-2.5 px-3 py-2',
      isActive
        ? 'bg-[var(--color-selection-soft)] text-[var(--color-selection)] font-medium'
        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
    ].join(' ')

export function AppShell() {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
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
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  const useOsChrome = settingsQuery.data?.useOsWindowChrome ?? true
  const itemClass = navClass(collapsed)

  return (
    <div className="flex h-full flex-col">
      {!useOsChrome ? <TitleBar /> : null}
      <div className="flex min-h-0 flex-1">
        <aside
          className={[
            'flex shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]/80 py-4 backdrop-blur-[2px] transition-[width]',
            collapsed ? 'w-[3.75rem] px-1.5' : 'w-44 px-2.5',
          ].join(' ')}
        >
          <div className={['mb-6 flex items-center', collapsed ? 'justify-center' : 'gap-1'].join(' ')}>
            <button
              type="button"
              className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
              aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
              title={collapsed ? t('nav.expand') : t('nav.collapse')}
              onClick={() => setCollapsed((v) => !v)}
            >
              <IconMenu2 size={20} stroke={1.75} />
            </button>
            {collapsed ? null : <TextLogo showIcon={false} />}
          </div>
          <nav className="flex flex-col gap-1">
            <NavLink to="/" end className={itemClass} title={collapsed ? t('nav.home') : undefined}>
              <IconHome {...navIcon} aria-hidden />
              {collapsed ? null : t('nav.home')}
            </NavLink>
            <NavLink
              to="/library"
              className={itemClass}
              end={false}
              title={collapsed ? t('nav.library') : undefined}
            >
              <IconStack2 {...navIcon} aria-hidden />
              {collapsed ? null : t('nav.library')}
            </NavLink>
            <NavLink to="/skin" className={itemClass} title={collapsed ? t('nav.skin') : undefined}>
              <IconShirt {...navIcon} aria-hidden />
              {collapsed ? null : t('nav.skin')}
            </NavLink>
            <NavLink
              to="/settings"
              className={itemClass}
              title={collapsed ? t('nav.settings') : undefined}
            >
              <IconSettings {...navIcon} aria-hidden />
              {collapsed ? null : t('nav.settings')}
            </NavLink>
          </nav>
          <div className={['mt-auto pt-4', collapsed ? 'px-0.5 text-center' : 'px-1'].join(' ')}>
            <AppCredits compact={collapsed} size="sidebar" />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="relative z-50 flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]/60 px-6 py-3 backdrop-blur-[2px]">
            <TransferProgress />
            <div className="ml-auto shrink-0">
              <AccountChip />
            </div>
          </header>
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
            <div className="min-h-0 flex-1 overflow-auto">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
