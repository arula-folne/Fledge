import { useEffect, useRef, useState } from 'react'
import { SkinViewer } from 'skinview3d'
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
}

/** WebGL を1つずつ使うための直列キュー（スナップショット用） */
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

/** 斜め上を見上げるポーズ */
function applyLookingUpPose(viewer: SkinViewer, pose: SkinPreviewPose): void {
  const isFull = pose === 'full'
  // 胴体は左斜め前
  viewer.playerObject.rotation.y = -Math.PI / 5.5
  viewer.playerWrapper.position.y = isFull ? -2 : -14

  // 頭を大きく上・やや左へ（見上げ）
  viewer.playerObject.skin.head.rotation.x = -0.55
  viewer.playerObject.skin.head.rotation.y = -0.22

  if (!isFull) {
    viewer.playerObject.skin.leftLeg.visible = false
    viewer.playerObject.skin.rightLeg.visible = false
  } else {
    viewer.playerObject.skin.leftLeg.visible = true
    viewer.playerObject.skin.rightLeg.visible = true
  }

  viewer.adjustCameraDistance()
  // カメラはやや低め・右前 → 見上げ構図が強調される
  const cam = viewer.camera.position
  cam.set(isFull ? 14 : 16, isFull ? 6 : 10, isFull ? 52 : 42)
  viewer.controls.target.set(0, isFull ? 14 : 10, 0)
  viewer.camera.lookAt(viewer.controls.target)
}

async function renderSkinSnapshot(
  skinUrl: string,
  model: SkinModel,
  width: number,
  height: number,
  pose: SkinPreviewPose,
): Promise<string> {
  const canvas = document.createElement('canvas')
  const isFull = pose === 'full'
  const viewer = new SkinViewer({
    canvas,
    width,
    height,
    model: model === 'slim' ? 'slim' : 'default',
    enableControls: false,
    zoom: isFull ? 0.68 : 0.78,
    fov: isFull ? 48 : 40,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
    renderPaused: true,
  })

  try {
    viewer.controls.enabled = false
    await viewer.loadSkin(skinUrl, { model: model === 'slim' ? 'slim' : 'default' })
    applyLookingUpPose(viewer, pose)
    viewer.render()
    return canvas.toDataURL('image/png')
  } finally {
    viewer.dispose()
    await delay(30)
  }
}

function SnapshotPreview({
  skinUrl,
  model,
  pose,
  className,
  width,
  height,
}: Required<Pick<Props, 'skinUrl' | 'model' | 'pose' | 'width' | 'height'>> & {
  className?: string
}) {
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const requestId = useRef(0)

  useEffect(() => {
    if (!skinUrl) {
      setSnapshot(null)
      setFailed(false)
      return
    }

    const id = ++requestId.current
    setSnapshot(null)
    setFailed(false)

    void enqueueRender(async () => {
      if (requestId.current !== id) return
      try {
        const dataUrl = await renderSkinSnapshot(skinUrl, model, width, height, pose)
        if (requestId.current === id) setSnapshot(dataUrl)
      } catch (err) {
        console.error('Skin preview failed:', err)
        if (requestId.current === id) setFailed(true)
      }
    })

    return () => {
      requestId.current += 1
    }
  }, [skinUrl, model, width, height, pose])

  if (!skinUrl || failed) {
    return (
      <div
        className={['flex items-center justify-center bg-[var(--color-border)]/30', className]
          .filter(Boolean)
          .join(' ')}
        style={{ width, height }}
      />
    )
  }

  if (!snapshot) {
    return (
      <div
        className={['animate-pulse bg-[var(--color-border)]/40', className].filter(Boolean).join(' ')}
        style={{ width, height }}
      />
    )
  }

  return (
    <img
      src={snapshot}
      alt=""
      width={width}
      height={height}
      className={['block object-contain', className].filter(Boolean).join(' ')}
      draggable={false}
    />
  )
}

/** ドラッグで回転できるライブ全身プレビュー */
function InteractivePreview({
  skinUrl,
  model,
  pose,
  className,
  width,
  height,
}: Required<Pick<Props, 'skinUrl' | 'model' | 'pose' | 'width' | 'height'>> & {
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<SkinViewer | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !skinUrl) return

    let disposed = false
    const isFull = pose === 'full'
    const viewer = new SkinViewer({
      canvas,
      width,
      height,
      model: model === 'slim' ? 'slim' : 'default',
      enableControls: true,
      zoom: isFull ? 0.62 : 0.78,
      fov: isFull ? 50 : 40,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    })
    viewerRef.current = viewer

    viewer.controls.enablePan = false
    viewer.controls.enableZoom = true
    viewer.controls.enableRotate = true
    viewer.controls.minDistance = 28
    viewer.controls.maxDistance = 120

    void (async () => {
      try {
        await viewer.loadSkin(skinUrl, { model: model === 'slim' ? 'slim' : 'default' })
        if (disposed) return
        applyLookingUpPose(viewer, pose)
        // ドラッグ後も頭の見上げを維持するため、アニメで頭角を毎フレーム固定しない代わりに
        // 初期ポーズを設定。回転は playerObject 全体ではなく controls でカメラを回す。
      } catch (err) {
        console.error('Interactive skin preview failed:', err)
      }
    })()

    return () => {
      disposed = true
      viewer.dispose()
      viewerRef.current = null
    }
  }, [skinUrl, model, width, height, pose])

  if (!skinUrl) {
    return (
      <div
        className={['flex items-center justify-center bg-[var(--color-border)]/30', className]
          .filter(Boolean)
          .join(' ')}
        style={{ width, height }}
      />
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className={['block cursor-grab touch-none active:cursor-grabbing', className]
        .filter(Boolean)
        .join(' ')}
      style={{ width, height }}
    />
  )
}

/** スキンの 3D プレビュー */
export function SkinPreview({
  skinUrl,
  model,
  pose = 'bust',
  interactive = false,
  className,
  width = 120,
  height = 140,
}: Props) {
  if (interactive) {
    return (
      <InteractivePreview
        skinUrl={skinUrl ?? null}
        model={model}
        pose={pose}
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
      pose={pose}
      className={className}
      width={width}
      height={height}
    />
  )
}

/** @deprecated SkinPreview を使用 */
export const SkinBustPreview = SkinPreview
