import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { AppShell } from './components/layout/AppShell'
import { PrivacyNoticeDialog } from './components/PrivacyNoticeDialog'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'
import { fledgeApi } from './api/fledgeApi'
import { applyAuthStatusEvent } from './features/auth/sessionCache'
import { useLaunchStore, useLogStore, useTransferStore, useUiStore } from './stores/appStores'

const HomePage = lazy(() => import('./pages/HomePage'))
const LibraryDetailPage = lazy(() => import('./pages/LibraryDetailPage'))
const SkinPage = lazy(() => import('./pages/SkinPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

function EventBridge() {
  const queryClient = useQueryClient()
  const applyStateEvent = useLaunchStore((s) => s.applyStateEvent)
  const applyPhase = useLaunchStore((s) => s.applyPhase)
  const applyProgress = useLaunchStore((s) => s.applyProgress)
  const applyTransfer = useTransferStore((s) => s.applyProgress)
  const appendLog = useLogStore((s) => s.append)
  const setAllLogs = useLogStore((s) => s.setAll)
  const setAuthStatus = useUiStore((s) => s.setAuthStatus)

  useEffect(() => {
    void fledgeApi.logs.recent().then(setAllLogs)

    const offs = [
      fledgeApi.on.progress((e) => {
        applyProgress(e)
        applyTransfer(e)
        if (e.kind === 'content' && (e.status === 'completed' || e.status === 'failed')) {
          void queryClient.invalidateQueries({ queryKey: ['content-installed'] })
        }
        if (e.kind === 'java' && (e.status === 'completed' || e.status === 'failed')) {
          void queryClient.invalidateQueries({ queryKey: ['java-runtimes'] })
        }
      }),
      fledgeApi.on.launchPhase((e) => applyPhase(e.phase, e.messageKey, e.sessionId)),
      fledgeApi.on.launchState((e) => {
        applyStateEvent(e)
        if (e.state === 'running' || e.state === 'exited') {
          void queryClient.invalidateQueries({ queryKey: ['settings'] })
        }
      }),
      fledgeApi.on.logLine(appendLog),
      fledgeApi.on.authStatus((event) => {
        applyAuthStatusEvent(queryClient, setAuthStatus, event)
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [applyPhase, applyProgress, applyTransfer, applyStateEvent, appendLog, setAllLogs, setAuthStatus, queryClient])

  return null
}

function DisableNonInputDrag() {
  useEffect(() => {
    const onDragStart = (e: DragEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
    }
    document.addEventListener('dragstart', onDragStart)
    return () => document.removeEventListener('dragstart', onDragStart)
  }, [])
  return null
}

export default function App() {
  const { t } = useTranslation()

  return (
    <>
      <EventBridge />
      <DisableNonInputDrag />
      <PrivacyNoticeDialog />
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
            {t('common.loading')}
          </div>
        }
      >
        <RouteErrorBoundary
          title={t('common.loadErrorTitle')}
          description={t('common.loadErrorBody')}
          retryLabel={t('common.retry')}
        >
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="library" element={<Navigate to="/" replace />} />
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
