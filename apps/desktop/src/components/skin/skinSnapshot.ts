import { SkinViewer } from 'skinview3d'
import type { SkinModel } from '@fledge/shared'

export const SKIN_THUMB = {
  width: 112,
  height: 134,
  zoom: 0.72,
} as const

let renderChain: Promise<unknown> = Promise.resolve()

export function enqueueSkinRender<T>(task: () => Promise<T>): Promise<T> {
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

export function toSkinViewModel(model: SkinModel): 'slim' | 'default' {
  return model === 'slim' ? 'slim' : 'default'
}

export function applyPreviewPose(viewer: SkinViewer): void {
  viewer.playerObject.rotation.set(0, -Math.PI / 5.5, 0)
  viewer.playerObject.skin.head.rotation.set(0, 0, 0)
  viewer.playerWrapper.rotation.set(0, 0, 0)
  viewer.playerWrapper.position.set(0, 0, 0)
  viewer.playerObject.skin.leftLeg.visible = true
  viewer.playerObject.skin.rightLeg.visible = true
  viewer.adjustCameraDistance()
}

export function applyPreviewLights(viewer: SkinViewer): void {
  viewer.globalLight.intensity = 2.4
  viewer.cameraLight.intensity = 0.5
}

export async function renderSkinSnapshotToCanvas(
  target: HTMLCanvasElement,
  skinUrl: string,
  model: SkinModel,
  cssWidth: number,
  cssHeight: number,
  zoom: number,
): Promise<void> {
  const pixelRatio = 1
  const glCanvas = document.createElement('canvas')
  const viewer = new SkinViewer({
    canvas: glCanvas,
    width: Math.max(1, cssWidth),
    height: Math.max(1, cssHeight),
    model: toSkinViewModel(model),
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
    applyPreviewLights(viewer)
    await viewer.loadSkin(skinUrl, { model: toSkinViewModel(model) })
    applyPreviewPose(viewer)
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
    await delay(20)
  }
}

export async function renderSkinThumbDataUrl(skinUrl: string, model: SkinModel): Promise<string> {
  return enqueueSkinRender(async () => {
    const canvas = document.createElement('canvas')
    await renderSkinSnapshotToCanvas(
      canvas,
      skinUrl,
      model,
      SKIN_THUMB.width,
      SKIN_THUMB.height,
      SKIN_THUMB.zoom,
    )
    return canvas.toDataURL('image/png')
  })
}
