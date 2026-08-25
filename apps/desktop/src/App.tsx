import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { AppShell } from './components/layout/AppShell'
import { CrystalClickEffect } from './components/effects/CrystalClickEffect'
import { PrivacyNoticeDialog } from './components/PrivacyNoticeDialog'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'
import { WindowSizeHud } from './components/layout/WindowSizeHud'
import { fledgeApi } from './api/fledgeApi'
import { applyAuthStatusEvent } from './features/auth/sessionCache'
import { useLaunchStore, useTransferStore, useUiStore } from './stores/appStores'
import type { Settings } from '@fledge/shared'

// メインナビは即時切替のため eager import（初回クリックのチャンク待ちを避ける）
import HomePage from './pages/HomePage'
import BrowsePage from './pages/BrowsePage'
import SkinPage from './pages/SkinPage'
import SettingsPage from './pages/SettingsPage'

const LibraryDetailPage = lazy(() => import('./pages/LibraryDetailPage'))

function EventBridge() {
  const queryClient = useQueryClient()
  const applyStateEvent = useLaunchStore((s) => s.applyStateEvent)
  const applyPhase = useLaunchStore((s) => s.applyPhase)
  const applyProgress = useLaunchStore((s) => s.applyProgress)
  // ログはメイン側で保持。UI パネルが無い現状では renderer へミラーしない（メモリ節約）
  const applyTransfer = useTransferStore((s) => s.applyProgress)
  const setAuthStatus = useUiStore((s) => s.setAuthStatus)

  useEffect(() => {
    let contentInvalidateTimer: number | undefined
    const scheduleContentInvalidate = () => {
      window.clearTimeout(contentInvalidateTimer)
      contentInvalidateTimer = window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['content-installed'] })
      }, 450)
    }

    const offs = [
      fledgeApi.on.progress((e) => {
        applyProgress(e)
        applyTransfer(e)
        if (e.kind === 'content' && (e.status === 'completed' || e.status === 'failed')) {
          scheduleContentInvalidate()
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
      fledgeApi.on.authStatus((event) => {
        applyAuthStatusEvent(queryClient, setAuthStatus, event)
      }),
      fledgeApi.on.newsUpdated((items) => {
        queryClient.setQueryData(['news'], items)
      }),
      fledgeApi.on.windowSize((size) => {
        queryClient.setQueryData<Settings>(['settings'], (prev) =>
          prev
            ? {
                ...prev,
                launcherWindowWidth: size.width,
                launcherWindowHeight: size.height,
              }
            : prev,
        )
      }),
    ]
    return () => {
      window.clearTimeout(contentInvalidateTimer)
      offs.forEach((off) => off())
    }
  }, [applyPhase, applyProgress, applyTransfer, applyStateEvent, setAuthStatus, queryClient])

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
      <CrystalClickEffect />
      <WindowSizeHud />
      <PrivacyNoticeDialog />
      <RouteErrorBoundary
        title={t('common.loadErrorTitle')}
        description={t('common.loadErrorBody')}
        retryLabel={t('common.retry')}
      >
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="browse" element={<BrowsePage />} />
            <Route path="library" element={<Navigate to="/" replace />} />
            <Route
              path="library/:instanceId"
              element={
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
                      {t('common.loading')}
                    </div>
                  }
                >
                  <LibraryDetailPage />
                </Suspense>
              }
            />
            <Route path="skin" element={<SkinPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </RouteErrorBoundary>
    </>
  )
}
