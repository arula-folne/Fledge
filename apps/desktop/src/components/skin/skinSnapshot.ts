import type { SkinModel } from '@fledge/shared'
import { SKIN_THUMB, SKIN_THUMB_VERSION } from '@fledge/shared'
import type { SkinViewer } from 'skinview3d'

export { SKIN_THUMB, SKIN_THUMB_VERSION }

type SkinView3dModule = typeof import('skinview3d')

let skinView3dPromise: Promise<SkinView3dModule> | null = null

/** skinview3d は重いので、実際に描画するまで動的 import する */
export function loadSkinView3d(): Promise<SkinView3dModule> {
  if (!skinView3dPromise) {
    skinView3dPromise = import('skinview3d')
  }
  return skinView3dPromise
}

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

/** 次フレームまで待ってから重い GL 仕事を始める（ナビ直後の入力を優先） */
export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

export function toSkinViewModel(model: SkinModel): 'slim' | 'default' {
  return model === 'slim' ? 'slim' : 'default'
}

export function applyPreviewPose(viewer: SkinViewer, _opts?: { showCape?: boolean }): void {
  // 正面寄りの定位置（マント有無で横向きにしない。ドラッグで背面を見られる）
  const yaw = -Math.PI / 5.5
  viewer.playerObject.rotation.set(0, yaw, 0)
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
  await yieldToUi()
  const { SkinViewer } = await loadSkinView3d()
  const pixelRatio = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
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
