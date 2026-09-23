import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'
import { useInstallOnboardingStore } from '../../stores/appStores'
import { type InstallOnboardingFlowStep } from './installOnboardingSteps'

type Props = {
  open: boolean
  onClose: () => void
  /** 初回インストール時のみ true — 完了時に settings へ保存 */
  persistOnComplete?: boolean
  dismissible?: boolean
}

/**
 * 初回ようこそ／利用規約／チュートリアル確認。
 * ダイアログ枠は使わず、背景ぼかし＋テキスト中心のオーバーレイにする。
 */
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
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    setStep({ kind: 'welcome' })
    setError(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open || !dismissible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dismissible, onClose])

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

  const actions = (() => {
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
          <div className="flex flex-wrap justify-center gap-3">
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
          <div className="flex flex-col items-center gap-3 text-center">
            <h2
              id={titleId}
              className="text-3xl font-bold tracking-tight text-white drop-shadow-sm sm:text-4xl"
            >
              {t('onboarding.welcomeHeadline')}
            </h2>
            <p className="max-w-md text-base text-white/80 sm:text-lg">{t('onboarding.welcomeSubline')}</p>
          </div>
        )
      case 'terms':
        return (
          <div className="mx-auto max-h-[min(60vh,28rem)] max-w-2xl space-y-3 overflow-y-auto text-left text-sm leading-relaxed text-white/90">
            <h2 id={titleId} className="text-center text-xl font-semibold text-white">
              {t('onboarding.termsTitle')}
            </h2>
            {t('onboarding.termsBody')
              .split('\n\n')
              .map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            <p className="text-xs text-white/60">
              {t('onboarding.termsFullLink')}{' '}
              <a
                href="https://github.com/arula-folne/Fledge/blob/main/TERMS.md"
                className="text-white underline underline-offset-2 hover:text-white/90"
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
          <div className="flex max-w-md flex-col items-center gap-3 text-center">
            <h2 id={titleId} className="text-2xl font-semibold text-white">
              {t('onboarding.tutorialOfferTitle')}
            </h2>
            <p className="text-sm leading-relaxed text-white/80">{t('onboarding.tutorialOfferBody')}</p>
          </div>
        )
      default:
        return null
    }
  })()

  return createPortal(
    <div
      className="fixed inset-x-0 bottom-0 top-[var(--titlebar-offset,0px)] z-[95] flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        aria-label={dismissible ? t('common.close') : undefined}
        tabIndex={dismissible ? 0 : -1}
        className="absolute inset-0 bg-black/45 backdrop-blur-md"
        onClick={dismissible ? onClose : undefined}
      />
      <div className="relative z-[1] flex w-full max-w-3xl flex-col items-center gap-8">
        {body}
        <div className="flex w-full flex-col items-center gap-2">
          {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
          {actions}
        </div>
      </div>
    </div>,
    document.body,
  )
}
