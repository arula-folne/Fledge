import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { useInstallOnboardingStore } from '../../stores/appStores'
import { type InstallOnboardingFlowStep } from './installOnboardingSteps'

type Props = {
  open: boolean
  onClose: () => void
  /** 初回インストール時のみ true — 完了時に settings へ保存 */
  persistOnComplete?: boolean
  dismissible?: boolean
}

export function InstallOnboardingFlowDialog({
  open,
  onClose,
  persistOnComplete = false,
  dismissible = false,
}: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const startInteractive = useInstallOnboardingStore((s) => s.startInteractive)
  const [step, setStep] = useState<InstallOnboardingFlowStep>({ kind: 'welcome' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setStep({ kind: 'welcome' })
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

  const dialogTitle = (() => {
    switch (step.kind) {
      case 'welcome':
        return t('onboarding.welcomeTitle')
      case 'terms':
        return t('onboarding.termsTitle')
      case 'tutorial-offer':
        return t('onboarding.tutorialOfferTitle')
      default:
        return t('onboarding.welcomeTitle')
    }
  })()

  const footer = (() => {
    switch (step.kind) {
      case 'welcome':
        return (
          <Button variant="primary" type="button" onClick={() => setStep({ kind: 'terms' })}>
            {t('onboarding.next')}
          </Button>
        )
      case 'terms':
        return (
          <Button variant="primary" type="button" onClick={() => setStep({ kind: 'tutorial-offer' })}>
            {t('onboarding.termsAgree')}
          </Button>
        )
      case 'tutorial-offer':
        return (
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
        )
      default:
        return null
    }
  })()

  const body = (() => {
    switch (step.kind) {
      case 'welcome':
        return (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">
              {t('onboarding.welcomeHeadline')}
            </h2>
            <p className="text-sm text-[var(--color-text-muted)]">{t('onboarding.welcomeSubline')}</p>
          </div>
        )
      case 'terms':
        return (
          <div className="space-y-3 text-sm leading-relaxed text-[var(--color-text)]">
            {t('onboarding.termsBody')
              .split('\n\n')
              .map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            <p className="text-xs text-[var(--color-text-muted)]">
              {t('onboarding.termsFullLink')}{' '}
              <a
                href="https://github.com/arula-folne/Fledge/blob/main/TERMS.md"
                className="text-[var(--color-accent)] underline-offset-2 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                TERMS.md
              </a>
            </p>
          </div>
        )
      case 'tutorial-offer':
        return (
          <p className="text-sm leading-relaxed text-[var(--color-text)]">{t('onboarding.tutorialOfferBody')}</p>
        )
      default:
        return null
    }
  })()

  return (
    <Dialog
      open
      title={dialogTitle}
      onClose={dismissible ? onClose : () => undefined}
      dismissible={dismissible}
      size={step.kind === 'terms' ? 'lg' : 'md'}
      scrollable={step.kind === 'terms'}
      overlayClassName="z-[95]"
      footer={
        <div className="flex w-full flex-col gap-2">
          {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
          {footer}
        </div>
      }
    >
      {body}
    </Dialog>
  )
}
