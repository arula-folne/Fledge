import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { SkinViewer } from 'skinview3d'
import type { SkinModel } from '@fledge/shared'
import {
  applyPreviewLights,
  applyPreviewPose,
  enqueueSkinRender,
  loadSkinView3d,
  renderSkinSnapshotToCanvas,
  toSkinViewModel,
  yieldToUi,
} from './skinSnapshot'
import { resolveCapeTextureSource } from './resolveCapeTexture'

export type SkinPreviewPose = 'bust' | 'full'

type Props = {
  skinUrl: string | null | undefined
  model: SkinModel
  /** 公式マントテクスチャ URL（任意） */
  capeUrl?: string | null
  pose?: SkinPreviewPose
  /** true のときライブ WebGL（ドラッグ回転可）。選択中プレビュー専用 */
  interactive?: boolean
  className?: string
  width?: number
  height?: number
  zoom?: number
}

const STAGE_BG =
  'radial-gradient(ellipse at 50% 38%, color-mix(in srgb, var(--color-accent-soft) 75%, transparent), transparent 58%), linear-gradient(180deg, color-mix(in srgb, var(--color-border) 22%, var(--color-surface)), var(--color-bg))'

const INTERACTIVE_ZOOM = 0.88

function resetInteractiveView(viewer: SkinViewer, showCape = false): void {
  viewer.zoom = INTERACTIVE_ZOOM
  viewer.controls.target.set(0, 0, 0)
  applyPreviewPose(viewer, { showCape })
  viewer.resetCameraPose()
  viewer.controls.update()
}

function SkinStage({
  children,
  className,
  width,
  height,
}: {
  children?: ReactNode
  className?: string
  width?: number
  height?: number
}) {
  return (
    <div
      className={['relative h-full w-full overflow-hidden', className].filter(Boolean).join(' ')}
      style={{
        ...(width && height ? { width, height } : {}),
        background: STAGE_BG,
      }}
    >
      {children}
    </div>
  )
}

function SnapshotPreview({
  skinUrl,
  model,
  className,
  width,
  height,
  zoom = 0.92,
}: Required<Pick<Props, 'skinUrl' | 'model' | 'width' | 'height'>> & {
  className?: string
  zoom?: number
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const requestId = useRef(0)
  const [viewSize, setViewSize] = useState({ width, height })
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const update = () => {
      const nextW = Math.max(1, Math.round(el.clientWidth))
      const nextH = Math.max(1, Math.round(el.clientHeight))
      setViewSize((prev) =>
        Math.abs(prev.width - nextW) < 2 && Math.abs(prev.height - nextH) < 2
          ? prev
          : { width: nextW, height: nextH },
      )
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!skinUrl) {
      setReady(false)
      setFailed(false)
      return
    }

    const id = ++requestId.current
    setReady(false)
    setFailed(false)

    void enqueueSkinRender(async () => {
      if (requestId.current !== id) return
      const dest = canvasRef.current
      if (!dest) return
      try {
        await renderSkinSnapshotToCanvas(dest, skinUrl, model, viewSize.width, viewSize.height, zoom)
        if (requestId.current === id) setReady(true)
      } catch (err) {
        console.error('Skin preview failed:', err)
        if (requestId.current === id) setFailed(true)
      }
    })

    return () => {
      requestId.current += 1
    }
  }, [skinUrl, model, viewSize.width, viewSize.height, zoom])

  return (
    <div
      ref={boxRef}
      className={['relative overflow-hidden', className].filter(Boolean).join(' ')}
      style={{
        width,
        height,
        background: STAGE_BG,
      }}
    >
      {!skinUrl || failed || !ready ? (
        <div className="absolute inset-0 animate-pulse bg-[var(--color-border)]/25" />
      ) : null}
      <canvas
        ref={canvasRef}
        className="block h-full w-full bg-transparent"
        style={{ visibility: ready ? 'visible' : 'hidden' }}
      />
    </div>
  )
}

function InteractivePreview({
  skinUrl,
  model,
  capeUrl,
  className,
  width,
  height,
}: Required<Pick<Props, 'skinUrl' | 'model' | 'width' | 'height'>> & {
  capeUrl?: string | null
  className?: string
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<SkinViewer | null>(null)
  const showCapeRef = useRef(Boolean(capeUrl))
  const capeUrlRef = useRef(capeUrl)
  capeUrlRef.current = capeUrl

  // スキン／モデル変更時だけビューアを作り直す（マント切替では破棄しない）
  useEffect(() => {
    const canvas = canvasRef.current
    const box = boxRef.current
    if (!canvas || !skinUrl) return

    const startW = Math.max(1, box?.clientWidth || width)
    const startH = Math.max(1, box?.clientHeight || height)

    let disposed = false
    let cleanupListeners: (() => void) | null = null

    void (async () => {
      await yieldToUi()
      if (disposed) return
      const { SkinViewer, IdleAnimation } = await loadSkinView3d()
      if (disposed) return

      const viewer = new SkinViewer({
        canvas,
        width: startW,
        height: startH,
        model: toSkinViewModel(model),
        enableControls: true,
        zoom: INTERACTIVE_ZOOM,
        fov: 42,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      })
      if (disposed) {
        viewer.dispose()
        return
      }
      viewerRef.current = viewer
      applyPreviewLights(viewer)

      viewer.controls.enablePan = false
      viewer.controls.enableZoom = false
      viewer.controls.enableRotate = true
      viewer.controls.rotateSpeed = 0.5
      viewer.controls.minDistance = 32
      viewer.controls.maxDistance = 110
      viewer.controls.mouseButtons.MIDDLE = -1 as never

      const onPointerDown = (event: PointerEvent) => {
        if (event.button !== 1) return
        event.preventDefault()
        event.stopPropagation()
        resetInteractiveView(viewer, showCapeRef.current)
      }
      const onAuxClick = (event: MouseEvent) => {
        if (event.button !== 1) return
        event.preventDefault()
      }
      canvas.addEventListener('pointerdown', onPointerDown, true)
      canvas.addEventListener('auxclick', onAuxClick)
      cleanupListeners = () => {
        canvas.removeEventListener('pointerdown', onPointerDown, true)
        canvas.removeEventListener('auxclick', onAuxClick)
      }

      try {
        await viewer.loadSkin(skinUrl, { model: toSkinViewModel(model) })
        if (disposed) return

        const idle = new IdleAnimation()
        idle.speed = 0.8
        viewer.animation = idle

        // 初回マント（後続は別 effect）
        const initialCape = capeUrlRef.current
        if (initialCape) {
          try {
            const source = await resolveCapeTextureSource(initialCape)
            if (disposed || viewerRef.current !== viewer) return
            const loaded = viewer.loadCape(source, { backEquipment: 'cape' })
            if (loaded && typeof (loaded as Promise<void>).then === 'function') {
              await loaded
            }
            if (disposed || viewerRef.current !== viewer) return
            viewer.playerObject.backEquipment = 'cape'
            showCapeRef.current = true
          } catch (err) {
            console.error('Cape preview failed:', err)
            viewer.resetCape()
            showCapeRef.current = false
          }
        } else {
          viewer.resetCape()
          showCapeRef.current = false
        }

        if (disposed) return
        resetInteractiveView(viewer, showCapeRef.current)
      } catch (err) {
        console.error('Interactive skin preview failed:', err)
      }
    })()

    return () => {
      disposed = true
      cleanupListeners?.()
      viewerRef.current?.dispose()
      viewerRef.current = null
    }
  }, [skinUrl, model, width, height])

  // マントだけ差し替え（ビューアは維持）
  useEffect(() => {
    let cancelled = false

    void (async () => {
      for (let i = 0; i < 40 && !viewerRef.current; i++) {
        await yieldToUi()
      }
      const current = viewerRef.current
      if (cancelled || !current) return

      if (!capeUrl) {
        showCapeRef.current = false
        current.resetCape()
        resetInteractiveView(current, false)
        return
      }

      try {
        const source = await resolveCapeTextureSource(capeUrl)
        if (cancelled || viewerRef.current !== current) return
        const result = current.loadCape(source, { backEquipment: 'cape' })
        if (result && typeof (result as Promise<void>).then === 'function') {
          await result
        }
        if (cancelled || viewerRef.current !== current) return
        showCapeRef.current = true
        current.playerObject.backEquipment = 'cape'
        resetInteractiveView(current, true)
      } catch (err) {
        console.error('Cape preview failed:', err)
        if (!cancelled && viewerRef.current === current) {
          showCapeRef.current = false
          current.resetCape()
          resetInteractiveView(current, false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [capeUrl])

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const update = () => {
      const viewer = viewerRef.current
      if (!viewer) return
      const nextW = Math.max(1, Math.round(el.clientWidth))
      const nextH = Math.max(1, Math.round(el.clientHeight))
      if (viewer.width !== nextW || viewer.height !== nextH) {
        viewer.setSize(nextW, nextH)
      }
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [skinUrl, model])

  if (!skinUrl) {
    return <SkinStage className={className} />
  }

  return (
    <div ref={boxRef} className="h-full min-h-0 w-full">
      <SkinStage className={className}>
        <canvas
          ref={canvasRef}
          className="block h-full w-full cursor-grab touch-none active:cursor-grabbing"
        />
      </SkinStage>
    </div>
  )
}

/**
 * ポインタが乗ったときだけライブ WebGL に上げる（入場直後の常時 rAF を避ける）。
 */
export function usePointerActivatedInteractive(resetKey: string): {
  interactive: boolean
  onPointerEnter: () => void
} {
  const [interactive, setInteractive] = useState(false)

  useEffect(() => {
    setInteractive(false)
  }, [resetKey])

  return {
    interactive,
    onPointerEnter: () => setInteractive(true),
  }
}

export function SkinPreview({
  skinUrl,
  model,
  capeUrl,
  interactive = false,
  className,
  width = 120,
  height = 160,
  zoom,
}: Props) {
  if (interactive) {
    return (
      <InteractivePreview
        skinUrl={skinUrl ?? null}
        model={model}
        capeUrl={capeUrl}
        className={className}
        width={width}
        height={height}
      />
    )
  }

  return (
    <SnapshotPreview
      skinUrl={skinUrl ?? null}
      model={model}
      className={className}
      width={width}
      height={height}
      zoom={zoom}
    />
  )
}
