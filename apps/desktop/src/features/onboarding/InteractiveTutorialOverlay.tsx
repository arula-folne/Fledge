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

const SPOTLIGHT_PAD = 10
const OVERLAY_Z = 100
const CARD_MAX_WIDTH = 440

type Props = {
  persistOnComplete: boolean
  onDone: () => void
}

type ArrowGeometry = {
  path: string
  tipX: number
  tipY: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
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

/** 中央カード外周からターゲット中心へ向かう曲線矢印 */
function computeArrow(card: DOMRect, target: DOMRect): ArrowGeometry | null {
  const tx = target.left + target.width / 2
  const ty = target.top + target.height / 2
  const cx = card.left + card.width / 2
  const cy = card.top + card.height / 2

  const dx = tx - cx
  const dy = ty - cy
  const toTarget = Math.hypot(dx, dy)
  if (toTarget < 48) return null

  const ux = dx / toTarget
  const uy = dy / toTarget

  // カード矩形の縁上の出発点
  const hw = card.width / 2
  const hh = card.height / 2
  const scale = Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh) || 1
  const startX = cx + dx / scale
  const startY = cy + dy / scale

  // スポットライト手前で止める
  const tipDist = Math.min(toTarget - 28, toTarget * 0.82)
  const tipX = cx + ux * tipDist
  const tipY = cy + uy * tipDist

  const mx = (startX + tipX) / 2
  const my = (startY + tipY) / 2
  const nx = -uy
  const ny = ux
  const bulge = clamp(toTarget * 0.12, 24, 72)
  const c1x = mx + nx * bulge
  const c1y = my + ny * bulge

  return {
    path: `M ${startX} ${startY} Q ${c1x} ${c1y} ${tipX} ${tipY}`,
    tipX,
    tipY,
  }
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
  const [cardRect, setCardRect] = useState<DOMRect | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const ctx = useMemo(() => ({} as const), [])
  const step = INTERACTIVE_TUTORIAL_STEPS[stepIndex]
  const route = step ? tutorialStepRoute(step, ctx) : '/'
  const targetId = step ? tutorialStepTarget(step, ctx) : ''
  const bodyKey = step ? tutorialStepBodyKey(step, ctx) : ''

  const routeKey = `${route}|${step?.settingsSection ?? ''}|${stepIndex}`
  const { rect, missing } = useSpotlightRect(targetId, routeKey)

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return

    const update = () => setCardRect(card.getBoundingClientRect())
    update()
    const observer = new ResizeObserver(update)
    observer.observe(card)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [stepIndex, bodyKey, error, previewUrl, t])

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

  // 該当 UI を切り抜いたプレビュー（スクショ相当）をダイアログ内に表示
  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    setPreviewUrl(null)
    if (!rect || missing) {
      setPreviewLoading(false)
      return
    }

    setPreviewLoading(true)
    const timer = window.setTimeout(async () => {
      const el = document.querySelector(`[data-fledge-tutorial="${targetId}"]`)
      if (!(el instanceof HTMLElement)) {
        if (!cancelled) setPreviewLoading(false)
        return
      }

      try {
        const { domToPng } = await import('modern-screenshot')
        const raw = await domToPng(el, {
          scale: Math.min(2, window.devicePixelRatio || 1),
          backgroundColor: getComputedStyle(document.body).backgroundColor || '#1a1a1c',
          style: {
            // 切り出し時に影やオーバーレイが乗らないよう
            transform: 'none',
          },
        })

        // スポットライト枠＋矢印ラベル風の注釈を乗せる
        const img = new Image()
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('preview decode failed'))
          img.src = raw
        })
        if (cancelled) return

        const pad = 28
        const canvas = document.createElement('canvas')
        canvas.width = img.width + pad * 2
        canvas.height = img.height + pad * 2
        const ctx2 = canvas.getContext('2d')
        if (!ctx2) {
          if (!cancelled) {
            setPreviewUrl(raw)
            setPreviewLoading(false)
          }
          return
        }

        ctx2.fillStyle = 'rgba(8, 10, 14, 0.92)'
        ctx2.fillRect(0, 0, canvas.width, canvas.height)

        // 外側の薄いリング
        ctx2.save()
        ctx2.shadowColor = 'rgba(91, 164, 217, 0.55)'
        ctx2.shadowBlur = 18
        ctx2.fillStyle = '#fff'
        roundRect(ctx2, pad - 4, pad - 4, img.width + 8, img.height + 8, 14)
        ctx2.fill()
        ctx2.restore()

        ctx2.drawImage(img, pad, pad)

        // コーナーの注釈ドット
        ctx2.fillStyle = 'rgb(91, 164, 217)'
        ctx2.beginPath()
        ctx2.arc(pad + 10, pad + 10, 5, 0, Math.PI * 2)
        ctx2.fill()

        objectUrl = canvas.toDataURL('image/png')
        if (!cancelled) {
          setPreviewUrl(objectUrl)
          setPreviewLoading(false)
        }
      } catch {
        if (!cancelled) {
          setPreviewUrl(null)
          setPreviewLoading(false)
        }
      }
    }, 180)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [rect, missing, targetId, routeKey])

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
        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.62)',
        outline: '2px solid color-mix(in srgb, var(--color-accent) 75%, white)',
        outlineOffset: 2,
        pointerEvents: 'none',
        zIndex: OVERLAY_Z,
      }
    : null

  const arrow =
    cardRect && rect && !missing ? computeArrow(cardRect, rect) : null

  return createPortal(
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fledge-tutorial-title"
      aria-describedby="fledge-tutorial-body"
    >
      {/* 背面操作を止める透明レイヤ（スポットライトは別描画） */}
      <div className="absolute inset-0" aria-hidden />
      {spotlightStyle ? <div style={spotlightStyle} aria-hidden /> : null}
      {!spotlightStyle ? <div className="absolute inset-0 bg-black/62" aria-hidden /> : null}

      {arrow ? (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ zIndex: OVERLAY_Z + 1 }}
          aria-hidden
        >
          <defs>
            <marker
              id="fledge-tutorial-arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="5"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-accent)" />
            </marker>
          </defs>
          <path
            d={arrow.path}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="3"
            strokeLinecap="round"
            markerEnd="url(#fledge-tutorial-arrowhead)"
            opacity="0.95"
          />
          <circle
            cx={arrow.tipX}
            cy={arrow.tipY}
            r="5"
            fill="var(--color-accent)"
            opacity="0.9"
          />
        </svg>
      ) : null}

      {/* 常に画面中央の説明ダイアログ */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center p-4"
        style={{ zIndex: OVERLAY_Z + 2 }}
      >
        <div
          ref={cardRef}
          className="pointer-events-auto flex w-full max-h-[min(86vh,40rem)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
          style={{
            maxWidth: `min(${CARD_MAX_WIDTH}px, calc(100vw - 2rem))`,
            animation: 'fledge-dialog-in 200ms ease-out',
          }}
        >
          <div className="shrink-0 border-b border-[var(--color-border)] px-5 py-3.5">
            <p className="text-xs font-medium text-[var(--color-accent)]">
              {t('onboarding.tutorialProgress', {
                current: stepIndex + 1,
                total: INTERACTIVE_TUTORIAL_STEP_COUNT,
              })}
            </p>
            <h2
              id="fledge-tutorial-title"
              className="mt-1 text-base font-semibold text-[var(--color-text)]"
            >
              {t(`onboarding.tutorial.${step.id}.title`)}
            </h2>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {(previewUrl || previewLoading) && !missing ? (
              <div className="mb-4 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]">
                {previewLoading && !previewUrl ? (
                  <div className="flex h-36 items-center justify-center text-xs text-[var(--color-text-muted)]">
                    {t('onboarding.tutorialPreviewLoading')}
                  </div>
                ) : previewUrl ? (
                  <img
                    src={previewUrl}
                    alt=""
                    className="mx-auto max-h-48 w-full object-contain"
                    draggable={false}
                  />
                ) : null}
                <p className="border-t border-[var(--color-border)] px-3 py-1.5 text-[11px] text-[var(--color-text-muted)]">
                  {t('onboarding.tutorialPreviewCaption')}
                </p>
              </div>
            ) : null}

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
              'flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--color-border)] px-5 py-3',
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
                <Button
                  variant="secondary"
                  type="button"
                  disabled={completeMutation.isPending}
                  onClick={finish}
                >
                  {t('onboarding.tutorialEnd')}
                </Button>
              ) : null}
              {isLast ? (
                <Button
                  variant="primary"
                  type="button"
                  disabled={completeMutation.isPending}
                  onClick={finish}
                >
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
      </div>
    </div>,
    getFledgeUiScaleRoot(),
  )
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}
