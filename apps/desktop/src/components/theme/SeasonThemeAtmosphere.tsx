import { useEffect, useRef, useState } from 'react'
import { getSeasonTheme } from '../../styles/themeSeasons'

type Props = {
  seasonId: string | null
  dark: boolean
}

type Layer = {
  key: string
  src: string
  overlayClass: string
  shown: boolean
}

/** シーズンテーマのイラスト背景＋ゆらぎモーション（切替時はクロスフェード） */
export function SeasonThemeAtmosphere({ seasonId, dark }: Props) {
  const season = seasonId ? getSeasonTheme(seasonId) : undefined
  const src = dark
    ? (season?.illustration?.dark ?? season?.illustration?.light)
    : (season?.illustration?.light ?? season?.illustration?.dark)
  const overlayClass = dark
    ? season?.atmosphere.dark.overlayClass
    : season?.atmosphere.light.overlayClass
  const nextKey = seasonId && src && overlayClass ? `${seasonId}:${dark ? 'dark' : 'light'}` : null

  const [active, setActive] = useState<Layer | null>(null)
  const [outgoing, setOutgoing] = useState<Layer | null>(null)
  const activeRef = useRef<Layer | null>(null)

  useEffect(() => {
    let raf1 = 0
    let raf2 = 0
    let clearTimer = 0

    if (!nextKey || !src || !overlayClass) {
      const prev = activeRef.current
      if (prev) {
        activeRef.current = null
        setActive(null)
        setOutgoing({ ...prev, shown: false })
        clearTimer = window.setTimeout(() => setOutgoing(null), 450)
      }
      return () => window.clearTimeout(clearTimer)
    }

    if (activeRef.current?.key === nextKey) return

    const prev = activeRef.current
    if (prev) setOutgoing({ ...prev, shown: true })

    const nextLayer: Layer = { key: nextKey, src, overlayClass, shown: false }
    activeRef.current = nextLayer
    setActive(nextLayer)

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setActive((current) =>
          current?.key === nextKey ? { ...current, shown: true } : current,
        )
        setOutgoing((current) => (current ? { ...current, shown: false } : null))
      })
    })
    clearTimer = window.setTimeout(() => setOutgoing(null), 450)

    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      window.clearTimeout(clearTimer)
    }
  }, [nextKey, src, overlayClass])

  if (!active && !outgoing) return null

  const renderLayer = (layer: Layer) => (
    <div
      key={layer.key}
      className={[
        'season-theme-layer absolute inset-0',
        layer.shown ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      <img
        src={layer.src}
        alt=""
        className="season-illustration h-full w-full object-cover object-center"
        draggable={false}
      />
      <div className={['absolute inset-0', layer.overlayClass].join(' ')} />
    </div>
  )

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {outgoing ? renderLayer(outgoing) : null}
      {active ? renderLayer(active) : null}
    </div>
  )
}
