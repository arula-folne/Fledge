import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { AppShell } from './components/layout/AppShell'
import { PrivacyNoticeDialog } from './components/PrivacyNoticeDialog'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'
import { fledgeApi } from './api/fledgeApi'
import { useLaunchStore, useLogStore, useUiStore } from './stores/appStores'

const HomePage = lazy(() => import('./pages/HomePage'))
const LibraryPage = lazy(() => import('./pages/LibraryPage'))
const LibraryDetailPage = lazy(() => import('./pages/LibraryDetailPage'))
const SkinPage = lazy(() => import('./pages/SkinPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

function EventBridge() {
  const queryClient = useQueryClient()
  const applyStateEvent = useLaunchStore((s) => s.applyStateEvent)
  const applyPhase = useLaunchStore((s) => s.applyPhase)
  const applyProgress = useLaunchStore((s) => s.applyProgress)
  const appendLog = useLogStore((s) => s.append)
  const setAllLogs = useLogStore((s) => s.setAll)
  const setAuthStatus = useUiStore((s) => s.setAuthStatus)

  useEffect(() => {
    void fledgeApi.logs.recent().then(setAllLogs)

    const offs = [
      fledgeApi.on.progress(applyProgress),
      fledgeApi.on.launchPhase((e) => applyPhase(e.phase, e.messageKey, e.sessionId)),
      fledgeApi.on.launchState((e) => {
        applyStateEvent(e)
        if (e.state === 'running' || e.state === 'exited') {
          void queryClient.invalidateQueries({ queryKey: ['settings'] })
        }
      }),
      fledgeApi.on.logLine(appendLog),
      fledgeApi.on.authStatus((status) => {
        setAuthStatus(status)
        void queryClient.invalidateQueries({ queryKey: ['session'] })
        void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [applyPhase, applyProgress, applyStateEvent, appendLog, setAllLogs, setAuthStatus, queryClient])

  return null
}

export default function App() {
  const { t } = useTranslation()

  return (
    <>
      <EventBridge />
      <PrivacyNoticeDialog />
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
            {t('common.loading')}
          </div>
        }
      >
        <RouteErrorBoundary>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="library" element={<LibraryPage />} />
              <Route path="library/:instanceId" element={<LibraryDetailPage />} />
              <Route path="skin" element={<SkinPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </RouteErrorBoundary>
      </Suspense>
    </>
  )
}
