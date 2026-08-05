import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TextLogo } from '../brand/TextLogo'
import { AccountChip } from '../../features/auth/AccountChip'
import { fledgeApi } from '../../api/fledgeApi'
import { applyTheme } from '../../styles/theme'
import { TitleBar } from './TitleBar'

const navClass = ({ isActive }: { isActive: boolean }) =>
  [
    'block rounded-[var(--radius-sm)] px-3 py-2 text-sm transition-colors',
    isActive
      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-medium'
      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
  ].join(' ')

export function AppShell() {
  const { t } = useTranslation()
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })

  useEffect(() => {
    if (settingsQuery.data) applyTheme(settingsQuery.data)
  }, [settingsQuery.data])

  const useOsChrome = settingsQuery.data?.useOsWindowChrome ?? true

  return (
    <div className="flex h-full flex-col">
      {!useOsChrome ? <TitleBar /> : null}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-52 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]/80 px-3 py-4 backdrop-blur-[2px]">
          <div className="mb-6 px-2">
            <TextLogo />
          </div>
          <nav className="flex flex-col gap-1">
            <NavLink to="/" end className={navClass}>
              {t('nav.home')}
            </NavLink>
            <NavLink to="/library" className={navClass} end={false}>
              {t('nav.library')}
            </NavLink>
            <NavLink to="/skin" className={navClass}>
              {t('nav.skin')}
            </NavLink>
            <NavLink to="/settings" className={navClass}>
              {t('nav.settings')}
            </NavLink>
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="relative z-50 flex items-center justify-end border-b border-[var(--color-border)] bg-[var(--color-surface)]/60 px-6 py-3 backdrop-blur-[2px]">
            <AccountChip />
          </header>
          <main className="min-h-0 flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
