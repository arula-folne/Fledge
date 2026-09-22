import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { AppShell } from './components/layout/AppShell'
import { CrystalClickEffect } from './components/effects/CrystalClickEffect'
import { PrivacyNoticeDialog } from './components/PrivacyNoticeDialog'
import { UpdateCompleteDialog } from './components/UpdateCompleteDialog'
import { InstallOnboardingHost } from './features/onboarding/InstallOnboardingHost'
import { SkinWarmupHost } from './features/skin/SkinWarmupHost'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'
import { WindowChrome } from './components/layout/WindowChrome'
import { fledgeApi } from './api/fledgeApi'
import { applyAuthStatusEvent } from './features/auth/sessionCache'
import { createProgressThrottler } from './features/launch/progressThrottle'
import { useLaunchStore, useTransferStore, useUiStore, useInstanceCreateStore } from './stores/appStores'
import type { Settings } from '@fledge/shared'

// メインナビは即時切替のため eager import（初回クリックのチャンク待ちを避ける）
import HomePage from './pages/HomePage'
import BrowsePage from './pages/BrowsePage'
import GalleryPage from './pages/GalleryPage'
import SkinPage from './pages/SkinPage'
import SettingsPage from './pages/SettingsPage'

const LibraryDetailPage = lazy(() => import('./pages/LibraryDetailPage'))
const InstanceContentBrowsePage = lazy(() => import('./pages/InstanceContentBrowsePage'))

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

    const deliverProgress = createProgressThrottler((e) => {
      applyProgress(e)
      applyTransfer(e)
      if (e.kind === 'content' && e.meta?.instanceReady && typeof e.meta.instanceId === 'string') {
        const id = e.meta.instanceId
        if (e.status === 'active') {
          useInstanceCreateStore.getState().markCreating(id)
        } else if (e.status === 'completed' || e.status === 'failed') {
          useInstanceCreateStore.getState().unmarkCreating(id)
        }
        void queryClient.invalidateQueries({ queryKey: ['instances'] })
        void queryClient.invalidateQueries({ queryKey: ['settings'] })
      }
      if (e.kind === 'content' && (e.status === 'completed' || e.status === 'failed')) {
        scheduleContentInvalidate()
      }
      if (e.kind === 'java' && (e.status === 'completed' || e.status === 'failed')) {
        void queryClient.invalidateQueries({ queryKey: ['java-runtimes'] })
      }
    }, 150)

    const offs = [
      fledgeApi.on.progress((e) => {
        deliverProgress(e)
      }),
      fledgeApi.on.launchPhase((e) => applyPhase(e.phase, e.messageKey, e.sessionId)),
      fledgeApi.on.launchState((e) => {
        // progress クリア前に履歴へ確定
        if (e.sessionId && (e.state === 'running' || e.state === 'idle' || e.state === 'error')) {
          const launch = useLaunchStore.getState()
          const progress = launch.progressBySessionId[e.sessionId]
          const phaseKey = launch.phaseMessageBySessionId[e.sessionId]
          const sessionInfo = Object.values(launch.byProfileId).find(
            (s) => s.sessionId === e.sessionId,
          )
          const wasPreparing =
            sessionInfo?.state === 'preparing' || sessionInfo?.state === 'launching'
          // prepare 完了の idle / 起動開始の running / 失敗の error のみ履歴化
          // （ゲーム終了後の idle では二重登録しない）
          const shouldFinalize =
            e.state === 'error' ||
            e.state === 'running' ||
            (e.state === 'idle' && wasPreparing)
          if (shouldFinalize) {
            useTransferStore.getState().finalizeSession({
              sessionId: e.sessionId,
              profileId: e.profileId,
              status: e.state === 'error' ? 'failed' : 'completed',
              messageKey:
                e.state === 'error'
                  ? (e.errorMessageKey ?? progress?.messageKey ?? phaseKey)
                  : (progress?.messageKey ?? phaseKey ?? 'library.prepareDone'),
              meta: {
                ...((progress?.meta as Record<string, string | number | boolean> | undefined) ?? {}),
                ...(e.profileId ? { instanceId: e.profileId } : {}),
              },
              percent: progress?.percent,
              current: progress?.current,
              total: progress?.total,
              kind: 'install',
            })
          }
        }
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

function DisableBrowserDefaults() {
  useEffect(() => {
    const onDragStart = (e: DragEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
    }
    // Edge / WebView2 の右クリックメニューをアプリ全体で抑止（独自メニューは各所の onContextMenu で表示）
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }
    document.addEventListener('dragstart', onDragStart)
    document.addEventListener('contextmenu', onContextMenu, true)
    return () => {
      document.removeEventListener('dragstart', onDragStart)
      document.removeEventListener('contextmenu', onContextMenu, true)
    }
  }, [])
  return null
}

export default function App() {
  const { t } = useTranslation()

  return (
    <>
      <EventBridge />
      <SkinWarmupHost />
      <DisableBrowserDefaults />
      <CrystalClickEffect />
      <InstallOnboardingHost />
      <UpdateCompleteDialog />
      <PrivacyNoticeDialog />
      <WindowChrome>
        <RouteErrorBoundary
          title={t('common.loadErrorTitle')}
          description={t('common.loadErrorBody')}
          retryLabel={t('common.retry')}
        >
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="browse" element={<BrowsePage />} />
              <Route path="gallery" element={<GalleryPage />} />
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
              <Route
                path="library/:instanceId/browse"
                element={
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
                        {t('common.loading')}
                      </div>
                    }
                  >
                    <InstanceContentBrowsePage mode="browse" />
                  </Suspense>
                }
              />
              <Route
                path="library/:instanceId/project/:projectId"
                element={
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
                        {t('common.loading')}
                      </div>
                    }
                  >
                    <InstanceContentBrowsePage mode="project" />
                  </Suspense>
                }
              />
              <Route path="skin" element={<SkinPage />} />
              <Route
                path="settings"
                element={
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <SettingsPage />
                  </div>
                }
              />
            </Route>
          </Routes>
        </RouteErrorBoundary>
      </WindowChrome>
    </>
  )
}
