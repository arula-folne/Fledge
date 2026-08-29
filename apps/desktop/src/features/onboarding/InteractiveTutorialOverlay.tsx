import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'
import { useInstallOnboardingStore } from '../../stores/appStores'
import { useUiStore } from '../../stores/appStores'
import {
  INTERACTIVE_TUTORIAL_STEP_COUNT,
  INTERACTIVE_TUTORIAL_STEPS,
  type TutorialPlacement,
  tutorialStepBodyKey,
  tutorialStepRoute,
  tutorialStepTarget,
} from './interactiveTutorialSteps'

const SPOTLIGHT_PAD = 8
const OVERLAY_Z = 100
const VIEWPORT_MARGIN = 12
const CARD_GAP = 12
const CARD_WIDTH = 320

type Props = {
  persistOnComplete: boolean
  onDone: () => void
}

type CardPosition = {
  top: number
  left: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function fitsViewport(pos: CardPosition, width: number, height: number): boolean {
  return (
    pos.top >= VIEWPORT_MARGIN &&
    pos.left >= VIEWPORT_MARGIN &&
    pos.top + height <= window.innerHeight - VIEWPORT_MARGIN &&
    pos.left + width <= window.innerWidth - VIEWPORT_MARGIN
  )
}

function positionForPlacement(
  target: DOMRect,
  placement: TutorialPlacement,
  cardWidth: number,
  cardHeight: number,
): CardPosition {
  switch (placement) {
    case 'top':
      return {
        top: target.top - CARD_GAP - cardHeight,
        left: target.left + target.width / 2 - cardWidth / 2,
      }
    case 'bottom':
      return {
        top: target.bottom + CARD_GAP,
        left: target.left + target.width / 2 - cardWidth / 2,
      }
    case 'left':
      return {
        top: target.top + target.height / 2 - cardHeight / 2,
        left: target.left - CARD_GAP - cardWidth,
      }
    case 'right':
      return {
        top: target.top + target.height / 2 - cardHeight / 2,
        left: target.right + CARD_GAP,
      }
  }
}

function clampToViewport(pos: CardPosition, cardWidth: number, cardHeight: number): CardPosition {
  const vw = window.innerWidth
  const vh = window.innerHeight
  return {
    top: clamp(pos.top, VIEWPORT_MARGIN, vh - cardHeight - VIEWPORT_MARGIN),
    left: clamp(pos.left, VIEWPORT_MARGIN, vw - cardWidth - VIEWPORT_MARGIN),
  }
}

function computeCardPosition(
  target: DOMRect | null,
  preferred: TutorialPlacement,
  cardWidth: number,
  cardHeight: number,
): CardPosition {
  const vw = window.innerWidth
  const vh = window.innerHeight

  if (!target) {
    return {
      top: vh / 2 - cardHeight / 2,
      left: vw / 2 - cardWidth / 2,
    }
  }

  const candidates: TutorialPlacement[] = [preferred, 'top', 'bottom', 'right', 'left']
  const seen = new Set<TutorialPlacement>()

  for (const placement of candidates) {
    if (seen.has(placement)) continue
    seen.add(placement)
    const pos = positionForPlacement(target, placement, cardWidth, cardHeight)
    if (fitsViewport(pos, cardWidth, cardHeight)) {
      return pos
    }
  }

  return clampToViewport(
    {
      top: vh - cardHeight - VIEWPORT_MARGIN,
      left: vw - cardWidth - VIEWPORT_MARGIN,
    },
    cardWidth,
    cardHeight,
  )
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
  const cardRef = useRef<HTMLDivElement>(null)
  const stepIndex = useInstallOnboardingStore((s) => s.interactiveStepIndex)
  const nextInteractiveStep = useInstallOnboardingStore((s) => s.nextInteractiveStep)
  const prevInteractiveStep = useInstallOnboardingStore((s) => s.prevInteractiveStep)
  const stopInteractive = useInstallOnboardingStore((s) => s.stopInteractive)
  const setSettingsSection = useUiStore((s) => s.setSettingsSection)

  const [error, setError] = useState<string | null>(null)
  const [cardPosition, setCardPosition] = useState<CardPosition | null>(null)

  const instancesQuery = useQuery({
    queryKey: ['instances'],
    queryFn: () => fledgeApi.instances.list(),
  })

  const ctx = useMemo(
    () => ({ firstInstanceId: instancesQuery.data?.[0]?.id ?? null }),
    [instancesQuery.data],
  )

  const step = INTERACTIVE_TUTORIAL_STEPS[stepIndex]
  const route = step ? tutorialStepRoute(step, ctx) : '/'
  const targetId = step ? tutorialStepTarget(step, ctx) : ''
  const bodyKey = step ? tutorialStepBodyKey(step, ctx) : ''
  const placement = step?.placement ?? 'bottom'

  const routeKey = `${route}|${step?.settingsSection ?? ''}|${stepIndex}`
  const { rect, missing } = useSpotlightRect(targetId, routeKey)

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return

    const update = () => {
      const cardRect = card.getBoundingClientRect()
      const cardWidth = cardRect.width || CARD_WIDTH
      const cardHeight = cardRect.height
      setCardPosition(computeCardPosition(missing ? null : rect, placement, cardWidth, cardHeight))
    }

    update()

    const observer = new ResizeObserver(update)
    observer.observe(card)
    window.addEventListener('resize', update)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [rect, placement, missing, stepIndex, bodyKey, error, t])

  useEffect(() => {
    if (!step) return
    const qIndex = route.indexOf('?')
    const pathname = qIndex >= 0 ? route.slice(0, qIndex) : route
    const search = qIndex >= 0 ? route.slice(qIndex) : ''
    const next = `${pathname}${search}`
    const current = `${location.pathname}${location.search}`
    if (current !== next) {
      navigate(next)
    }
    if (step.settingsSection) {
      setSettingsSection(step.settingsSection)
    }
  }, [step, route, location.pathname, location.search, navigate, setSettingsSection])

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
      stopInteractive()
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
    stopInteractive()
    onDone()
  }

  if (!step) return null

  const isFirst = stepIndex === 0
  const isLast = stepIndex >= INTERACTIVE_TUTORIAL_STEP_COUNT - 1
  const spotlightStyle: CSSProperties | null = rect
    ? {
        position: 'fixed',
        top: rect.top - SPOTLIGHT_PAD,
        left: rect.left - SPOTLIGHT_PAD,
        width: rect.width + SPOTLIGHT_PAD * 2,
        height: rect.height + SPOTLIGHT_PAD * 2,
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.58)',
        pointerEvents: 'none',
        zIndex: OVERLAY_Z,
      }
    : null

  const cardStyle: CSSProperties = {
    position: 'fixed',
    top: cardPosition?.top ?? VIEWPORT_MARGIN,
    left: cardPosition?.left ?? VIEWPORT_MARGIN,
    width: CARD_WIDTH,
    maxWidth: `min(${CARD_WIDTH}px, calc(100vw - ${VIEWPORT_MARGIN * 2}px))`,
    maxHeight: `calc(100vh - ${VIEWPORT_MARGIN * 2}px)`,
    overflowY: 'auto',
    zIndex: OVERLAY_Z + 1,
    visibility: cardPosition ? 'visible' : 'hidden',
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
      {spotlightStyle ? <div style={spotlightStyle} aria-hidden /> : null}
      {!spotlightStyle && missing ? (
        <div className="absolute inset-0 bg-black/58" aria-hidden />
      ) : null}

      <div
        ref={cardRef}
        className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-lg"
        style={cardStyle}
      >
        <p className="text-xs font-medium text-[var(--color-accent)]">
          {t('onboarding.tutorialProgress', {
            current: stepIndex + 1,
            total: INTERACTIVE_TUTORIAL_STEP_COUNT,
          })}
        </p>
        <h2 id="fledge-tutorial-title" className="mt-1 text-base font-semibold text-[var(--color-text)]">
          {t(`onboarding.tutorial.${step.id}.title`)}
        </h2>
        <p id="fledge-tutorial-body" className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">
          {missing ? t('onboarding.tutorialTargetMissing') : t(bodyKey)}
        </p>
        {error ? <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p> : null}
        <div
          className={[
            'mt-4 flex flex-wrap items-center gap-2',
            isFirst ? 'justify-end' : 'justify-between',
          ].join(' ')}
        >
          {!isFirst ? (
            <Button
              variant="secondary"
              type="button"
              disabled={completeMutation.isPending}
              onClick={prevInteractiveStep}
            >
              {t('onboarding.back')}
            </Button>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {!isLast ? (
              <Button variant="secondary" type="button" disabled={completeMutation.isPending} onClick={finish}>
                {t('onboarding.tutorialEnd')}
              </Button>
            ) : null}
            {isLast ? (
              <Button variant="primary" type="button" disabled={completeMutation.isPending} onClick={finish}>
                {completeMutation.isPending ? t('common.loading') : t('onboarding.finish')}
              </Button>
            ) : (
              <Button variant="primary" type="button" onClick={nextInteractiveStep}>
                {t('onboarding.next')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
