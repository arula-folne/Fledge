import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { useInstallOnboardingStore } from '../../stores/appStores'

type Props = {
  open: boolean
  onClose: () => void
  /** 初回インストール時のみ true — 完了時に settings へ保存 */
  persistOnComplete?: boolean
  dismissible?: boolean
}

/** ようこそ／規約は出さず、チュートリアル可否だけ確認する */
export function InstallOnboardingFlowDialog({
  open,
  onClose,
  persistOnComplete = false,
  dismissible = false,
}: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const startInteractive = useInstallOnboardingStore((s) => s.startInteractive)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
  }, [open])

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (persistOnComplete) {
        return fledgeApi.settings.set({
          installOnboardingCompleted: true,
          termsAcceptedInApp: true,
        })
      }
      return null
    },
    onMutate: () => setError(null),
    onSuccess: (next) => {
      if (persistOnComplete) {
        if (!next || next.installOnboardingCompleted !== true) {
          setError(t('onboarding.saveError'))
          return
        }
        queryClient.setQueryData(['settings'], next)
      }
      onClose()
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err))
    },
  })

  if (!open) return null

  const finish = () => {
    if (completeMutation.isPending) return
    if (persistOnComplete) {
      completeMutation.mutate()
      return
    }
    onClose()
  }

  const beginInteractive = () => {
    startInteractive({ persistOnComplete })
  }

  return (
    <Dialog
      open
      title={t('onboarding.tutorialOfferTitle')}
      onClose={dismissible ? onClose : () => undefined}
      dismissible={dismissible}
      size="md"
      overlayClassName="z-[95]"
      footer={
        <div className="flex w-full flex-col gap-2">
          {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" type="button" disabled={completeMutation.isPending} onClick={finish}>
              {t('onboarding.tutorialNo')}
            </Button>
            <Button
              variant="primary"
              type="button"
              disabled={completeMutation.isPending}
              onClick={beginInteractive}
            >
              {t('onboarding.tutorialYes')}
            </Button>
          </div>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-[var(--color-text)]">{t('onboarding.tutorialOfferBody')}</p>
    </Dialog>
  )
}
