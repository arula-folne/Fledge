import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IdleAnimation, SkinViewer } from 'skinview3d'
import type { SkinModel } from '@fledge/shared'

export type SkinPreviewPose = 'bust' | 'full'

type Props = {
  skinUrl: string | null | undefined
  model: SkinModel
  pose?: SkinPreviewPose
  /** true のときライブ WebGL（ドラッグ回転可）。選択中プレビュー専用 */
  interactive?: boolean
  className?: string
  width?: number
  height?: number
  /** キャラクターの見え方。小さいほど縮小。未指定は 0.92 */
  zoom?: number
}

const STAGE_BG =
  'radial-gradient(ellipse at 50% 38%, color-mix(in srgb, var(--color-accent-soft) 75%, transparent), transparent 58%), linear-gradient(180deg, color-mix(in srgb, var(--color-border) 22%, var(--color-surface)), var(--color-bg))'

let renderChain: Promise<unknown> = Promise.resolve()
function enqueueRender<T>(task: () => Promise<T>): Promise<T> {
  const run = () => task()
  const next = renderChain.then(run, run)
  renderChain = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toModel(model: SkinModel): 'slim' | 'default' {
  return model === 'slim' ? 'slim' : 'default'
}

/** Minecraft Launcher のスキン画面に近い立ち位置 */
function applyLauncherPose(viewer: SkinViewer): void {
  viewer.playerObject.rotation.set(0, -Math.PI / 7, 0)
  viewer.playerObject.skin.head.rotation.set(0, 0, 0)
  viewer.playerWrapper.rotation.set(0, 0, 0)
  viewer.playerWrapper.position.set(0, 0, 0)
  viewer.playerObject.skin.leftLeg.visible = true
  viewer.playerObject.skin.rightLeg.visible = true
  viewer.adjustCameraDistance()
}

function applyLauncherLights(viewer: SkinViewer): void {
  viewer.globalLight.intensity = 2.6
  viewer.cameraLight.intensity = 0.55
}

const INTERACTIVE_ZOOM = 0.88

function resetInteractiveView(viewer: SkinViewer): void {
  viewer.zoom = INTERACTIVE_ZOOM
  viewer.controls.target.set(0, 0, 0)
  applyLauncherPose(viewer)
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

async function renderSkinSnapshotToCanvas(
  target: HTMLCanvasElement,
  skinUrl: string,
  model: SkinModel,
  cssWidth: number,
  cssHeight: number,
  zoom: number,
): Promise<void> {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 3)
  const glCanvas = document.createElement('canvas')
  const viewer = new SkinViewer({
    canvas: glCanvas,
    width: Math.max(1, cssWidth),
    height: Math.max(1, cssHeight),
    model: toModel(model),
    enableControls: false,
    zoom,
    fov: 42,
    pixelRatio,
    renderPaused: true,
    preserveDrawingBuffer: true,
  })

  try {
    viewer.controls.enabled = false
    viewer.background = null
    viewer.renderer.setClearColor(0x000000, 0)
    applyLauncherLights(viewer)
    await viewer.loadSkin(skinUrl, { model: toModel(model) })
    applyLauncherPose(viewer)
    viewer.zoom = zoom
    viewer.render()
    target.width = glCanvas.width
    target.height = glCanvas.height
    const ctx = target.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, target.width, target.height)
    ctx.drawImage(glCanvas, 0, 0)
  } finally {
    viewer.dispose()
    await delay(30)
  }
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

    void enqueueRender(async () => {
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
      className={['relative h-full w-full overflow-hidden', className].filter(Boolean).join(' ')}
      style={{
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
  className,
  width,
  height,
}: Required<Pick<Props, 'skinUrl' | 'model' | 'width' | 'height'>> & {
  className?: string
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<SkinViewer | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const box = boxRef.current
    if (!canvas || !skinUrl) return

    const startW = Math.max(1, box?.clientWidth || width)
    const startH = Math.max(1, box?.clientHeight || height)

    let disposed = false
    const viewer = new SkinViewer({
      canvas,
      width: startW,
      height: startH,
      model: toModel(model),
      enableControls: true,
      zoom: INTERACTIVE_ZOOM,
      fov: 42,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    })
    viewerRef.current = viewer
    applyLauncherLights(viewer)

    viewer.controls.enablePan = false
    viewer.controls.enableZoom = true
    viewer.controls.enableRotate = true
    viewer.controls.rotateSpeed = 0.5
    viewer.controls.minDistance = 32
    viewer.controls.maxDistance = 110
    // ホイールクリックは OrbitControls のズームではなく、向き・ズームのリセットに使う
    viewer.controls.mouseButtons.MIDDLE = -1 as never

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 1) return
      event.preventDefault()
      event.stopPropagation()
      resetInteractiveView(viewer)
    }
    const onAuxClick = (event: MouseEvent) => {
      if (event.button !== 1) return
      event.preventDefault()
    }
    canvas.addEventListener('pointerdown', onPointerDown, true)
    canvas.addEventListener('auxclick', onAuxClick)

    void (async () => {
      try {
        await viewer.loadSkin(skinUrl, { model: toModel(model) })
        if (disposed) return
        const idle = new IdleAnimation()
        idle.speed = 0.8
        // animation 代入は player の回転を 0 に戻すので、そのあとで斜め立ちを適用する
        viewer.animation = idle
        resetInteractiveView(viewer)
      } catch (err) {
        console.error('Interactive skin preview failed:', err)
      }
    })()

    return () => {
      disposed = true
      canvas.removeEventListener('pointerdown', onPointerDown, true)
      canvas.removeEventListener('auxclick', onAuxClick)
      viewer.dispose()
      viewerRef.current = null
    }
  }, [skinUrl, model, width, height])

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

export function SkinPreview({
  skinUrl,
  model,
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
