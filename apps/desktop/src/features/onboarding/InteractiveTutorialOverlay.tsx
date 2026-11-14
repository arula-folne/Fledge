import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { getFledgeUiScaleRoot } from '../../components/layout/fledgeUiScaleRoot'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'
import { useInstallOnboardingStore, useUiStore } from '../../stores/appStores'
import {
  INTERACTIVE_TUTORIAL_STEP_COUNT,
  INTERACTIVE_TUTORIAL_STEPS,
  tutorialStepBodyKey,
  tutorialStepRoute,
  tutorialStepTarget,
} from './interactiveTutorialSteps'

const SPOTLIGHT_PAD = 8
const OVERLAY_Z = 100
const CARD_MAX_WIDTH = 360
const SCENE_FADE_MS = 220
/** サイドバー左下（Fledge / クレジット付近）に固定 */
const CARD_LEFT = 12
const CARD_BOTTOM = 12

type Props = {
  persistOnComplete: boolean
  onDone: () => void
}

function useSpotlightRect(targetId: string, refreshKey: string) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [missing, setMissing] = useState(false)

  const measure = useCallback(() => {
    const el = document.querySelector(`[data-fledge-tutorial="${targetId}"]`)
    if (!el) return false
    setRect(el.getBoundingClientRect())
    setMissing(false)
    return true
  }, [targetId])

  useLayoutEffect(() => {
    setRect(null)
    setMissing(false)
    let cancelled = false
    let attempts = 0
    let observer: ResizeObserver | null = null

    const attach = () => {
      const el = document.querySelector(`[data-fledge-tutorial="${targetId}"]`)
      if (!el) return false
      observer = new ResizeObserver(() => measure())
      observer.observe(el)
      measure()
      return true
    }

    const tick = () => {
      if (cancelled) return
      if (attach()) return
      attempts += 1
      if (attempts >= 30) {
        setMissing(true)
        return
      }
      window.setTimeout(tick, 100)
    }

    tick()

    const onLayout = () => measure()
    window.addEventListener('resize', onLayout)
    window.addEventListener('scroll', onLayout, true)

    return () => {
      cancelled = true
      window.removeEventListener('resize', onLayout)
      window.removeEventListener('scroll', onLayout, true)
      observer?.disconnect()
    }
  }, [targetId, refreshKey, measure])

  return { rect, missing }
}

export function InteractiveTutorialOverlay({ persistOnComplete, onDone }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const stepIndex = useInstallOnboardingStore((s) => s.interactiveStepIndex)
  const nextInteractiveStep = useInstallOnboardingStore((s) => s.nextInteractiveStep)
  const prevInteractiveStep = useInstallOnboardingStore((s) => s.prevInteractiveStep)
  const stopInteractive = useInstallOnboardingStore((s) => s.stopInteractive)
  const setSettingsSection = useUiStore((s) => s.setSettingsSection)

  const [error, setError] = useState<string | null>(null)
  const [displayStepIndex, setDisplayStepIndex] = useState(stepIndex)
  const [sceneVisible, setSceneVisible] = useState(true)
  const fadeTimerRef = useRef<number | null>(null)

  const ctx = useMemo(() => ({} as const), [])
  const liveStep = INTERACTIVE_TUTORIAL_STEPS[stepIndex]
  const step = INTERACTIVE_TUTORIAL_STEPS[displayStepIndex]
  const route = liveStep ? tutorialStepRoute(liveStep, ctx) : '/'
  const targetId = step ? tutorialStepTarget(step, ctx) : ''
  const bodyKey = step ? tutorialStepBodyKey(step, ctx) : ''

  const routeKey = `${route}|${liveStep?.settingsSection ?? ''}|${displayStepIndex}`
  const { rect, missing } = useSpotlightRect(targetId, routeKey)

  useEffect(() => {
    if (stepIndex === displayStepIndex) return
    setSceneVisible(false)
    if (fadeTimerRef.current != null) window.clearTimeout(fadeTimerRef.current)
    fadeTimerRef.current = window.setTimeout(() => {
      setDisplayStepIndex(stepIndex)
      setError(null)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setSceneVisible(true))
      })
      fadeTimerRef.current = null
    }, SCENE_FADE_MS)
    return () => {
      if (fadeTimerRef.current != null) {
        window.clearTimeout(fadeTimerRef.current)
        fadeTimerRef.current = null
      }
    }
  }, [stepIndex, displayStepIndex])

  useEffect(() => {
    if (!liveStep) return
    const qIndex = route.indexOf('?')
    const pathname = qIndex >= 0 ? route.slice(0, qIndex) : route
    const search = qIndex >= 0 ? route.slice(qIndex) : ''
    const next = `${pathname}${search}`
    const current = `${location.pathname}${location.search}`
    if (current !== next) {
      navigate(next)
    }
    if (liveStep.settingsSection) {
      setSettingsSection(liveStep.settingsSection)
    }
  }, [liveStep, route, location.pathname, location.search, navigate, setSettingsSection])

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (persistOnComplete) {
        return fledgeApi.settings.set({
          installOnboardingCompleted: true,
          termsAcceptedInApp: true,
          privacyNoticeAcknowledged: true,
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
      setSettingsSection('appGeneral')
      stopInteractive()
      navigate('/')
      onDone()
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err))
    },
  })

  const finish = () => {
    if (completeMutation.isPending) return
    if (persistOnComplete) {
      completeMutation.mutate()
      return
    }
    setSettingsSection('appGeneral')
    stopInteractive()
    navigate('/')
    onDone()
  }

  if (!step) return null

  const isFirst = displayStepIndex === 0
  const isLast = displayStepIndex >= INTERACTIVE_TUTORIAL_STEP_COUNT - 1

  const spotlightStyle: CSSProperties | null = rect
    ? {
        position: 'fixed',
        top: rect.top - SPOTLIGHT_PAD,
        left: rect.left - SPOTLIGHT_PAD,
        width: rect.width + SPOTLIGHT_PAD * 2,
        height: rect.height + SPOTLIGHT_PAD * 2,
        borderRadius: 'var(--radius-md)',
        boxShadow:
          '0 0 0 2px color-mix(in srgb, var(--color-accent) 70%, white), 0 0 24px color-mix(in srgb, var(--color-accent) 35%, transparent)',
        pointerEvents: 'none',
        zIndex: OVERLAY_Z,
      }
    : null

  const sceneStyle: CSSProperties = {
    opacity: sceneVisible ? 1 : 0,
    transition: `opacity ${SCENE_FADE_MS}ms ease`,
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fledge-tutorial-title"
      aria-describedby="fledge-tutorial-body"
    >
      <div className="absolute inset-0" aria-hidden />

      <div style={sceneStyle} className="pointer-events-none absolute inset-0">
        {spotlightStyle ? <div style={spotlightStyle} aria-hidden /> : null}
      </div>

      {/* 左下（Fledge / クレジット付近）に固定。矢印なし・強調のみ */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ zIndex: OVERLAY_Z + 2, ...sceneStyle }}
      >
        <div
          className={[
            'pointer-events-auto absolute flex w-full max-h-[min(50vh,22rem)] flex-col overflow-hidden',
            'rounded-[1.25rem] border border-white/18',
            'bg-[color-mix(in_srgb,var(--color-surface)_55%,transparent)]',
            'shadow-[0_12px_40px_rgba(0,0,0,0.28)]',
            'backdrop-blur-xl backdrop-saturate-150',
            'supports-[not(backdrop-filter:blur(0))]:bg-[var(--color-surface)]',
          ].join(' ')}
          style={{
            left: CARD_LEFT,
            bottom: CARD_BOTTOM,
            width: `min(${CARD_MAX_WIDTH}px, calc(100vw - ${CARD_LEFT * 2}px))`,
          }}
        >
          <div className="shrink-0 px-5 pb-2 pt-4">
            <p className="text-[11px] font-medium tracking-wide text-[var(--color-accent)]">
              {t('onboarding.tutorialProgress', {
                current: displayStepIndex + 1,
                total: INTERACTIVE_TUTORIAL_STEP_COUNT,
              })}
            </p>
            <h2
              id="fledge-tutorial-title"
              className="mt-1.5 text-[1.05rem] font-semibold leading-snug text-[var(--color-text)]"
            >
              {t(`onboarding.tutorial.${step.id}.title`)}
            </h2>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            <p
              id="fledge-tutorial-body"
              className="whitespace-pre-line text-sm leading-relaxed text-[var(--color-text-muted)]"
            >
              {missing ? t('onboarding.tutorialTargetMissing') : t(bodyKey)}
            </p>
            {error ? <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p> : null}
          </div>

          <div
            className={[
              'flex shrink-0 flex-wrap items-center gap-2 px-5 pb-4 pt-2',
              isFirst ? 'justify-end' : 'justify-between',
            ].join(' ')}
          >
            {!isFirst ? (
              <Button
                variant="secondary"
                type="button"
                disabled={completeMutation.isPending || !sceneVisible}
                onClick={prevInteractiveStep}
              >
                {t('onboarding.back')}
              </Button>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {!isLast ? (
                <Button
                  variant="secondary"
                  type="button"
                  disabled={completeMutation.isPending || !sceneVisible}
                  onClick={finish}
                >
                  {t('onboarding.tutorialEnd')}
                </Button>
              ) : null}
              {isLast ? (
                <Button
                  variant="primary"
                  type="button"
                  disabled={completeMutation.isPending || !sceneVisible}
                  onClick={finish}
                >
                  {completeMutation.isPending ? t('common.loading') : t('onboarding.finish')}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  type="button"
                  disabled={!sceneVisible}
                  onClick={nextInteractiveStep}
                >
                  {t('onboarding.next')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    getFledgeUiScaleRoot(),
  )
}
