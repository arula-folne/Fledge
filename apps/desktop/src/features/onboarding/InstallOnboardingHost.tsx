import { useQuery } from '@tanstack/react-query'
import { fledgeApi } from '../../api/fledgeApi'
import { useInstallOnboardingStore } from '../../stores/appStores'
import { InstallOnboardingFlowDialog } from './InstallOnboardingFlowDialog'
import { InteractiveTutorialOverlay } from './InteractiveTutorialOverlay'

/** 初回インストール時の自動表示と、設定からの手動再生を束ねる */
export function InstallOnboardingHost() {
  const manualOpen = useInstallOnboardingStore((s) => s.manualOpen)
  const closeManual = useInstallOnboardingStore((s) => s.closeManual)
  const interactiveActive = useInstallOnboardingStore((s) => s.interactiveActive)
  const interactivePersistOnComplete = useInstallOnboardingStore((s) => s.interactivePersistOnComplete)

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })

  const startupQuery = useQuery({
    queryKey: ['app-startup-info'],
    queryFn: () => fledgeApi.app.getStartupInfo(),
    staleTime: Infinity,
  })

  const autoOpen =
    settingsQuery.isSuccess &&
    startupQuery.isSuccess &&
    settingsQuery.data.installOnboardingCompleted !== true &&
    !startupQuery.data.isUpdatedStart &&
    !startupQuery.data.updateNotice

  const dialogOpen = (autoOpen || manualOpen) && !interactiveActive

  return (
    <>
      <InstallOnboardingFlowDialog
        open={dialogOpen}
        onClose={closeManual}
        persistOnComplete={autoOpen}
        dismissible={manualOpen && !autoOpen}
      />
      {interactiveActive ? (
        <InteractiveTutorialOverlay
          persistOnComplete={interactivePersistOnComplete}
          onDone={closeManual}
        />
      ) : null}
    </>
  )
}
