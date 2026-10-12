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

/**
 * プレビュー描画のピクセル比。
 * テクスチャ読込は変わらず、フレームバッファだけ上げて輪郭を滑らかにする。
 * 1x ディスプレイでも最低 2x、高DPI は最大 3x。
 */
export function previewPixelRatio(): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  return Math.min(Math.max(dpr, 2), 3)
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

const PREVIEW_SUN_NAME = 'fledgePreviewSun'

/** 影modの昼のような太陽光。カメラ基準で位置固定し、回転しても背面が常時影にならない */
export function applyPreviewLights(viewer: SkinViewer): void {
  // 昼空の柔らかい塗りつぶし（暖色はごく弱く）
  viewer.globalLight.intensity = 1.55
  viewer.globalLight.color.set(0xf7f5f2)
  // カメラ側の弱い補助
  viewer.cameraLight.intensity = 0.4
  viewer.cameraLight.color.set(0xfaf9f7)

  type SceneLight = typeof viewer.cameraLight
  // 旧実装でシーン直下に置いた太陽光があれば外す
  const orphan = viewer.scene.getObjectByName(PREVIEW_SUN_NAME)
  if (orphan && orphan.parent === viewer.scene) {
    viewer.scene.remove(orphan)
  }

  let sun = viewer.camera.getObjectByName(PREVIEW_SUN_NAME) as SceneLight | null
  if (!sun) {
    const LightCtor = viewer.cameraLight.constructor as new (
      color?: number,
      intensity?: number,
    ) => SceneLight
    sun = new LightCtor(0xf8f6f1, 1.9)
    sun.name = PREVIEW_SUN_NAME
    // 減衰なしで遠方の太陽のように当てる
    sun.distance = 0
    sun.decay = 0
    // カメラに追従 → 視点まわりで位置固定、背面を見てもキー光が当たる
    viewer.camera.add(sun)
  }
  sun.intensity = 1.9
  sun.color.set(0xf8f6f1)
  // カメラ空間: -X=画面左 / +Y=上 / -Z=被写体方向
  // → 画面左上から差し、正面のスキンから見ると右斜め上
  sun.position.set(-14, 18, -6)
}

export async function renderSkinSnapshotToCanvas(
  target: HTMLCanvasElement,
  skinUrl: string,
  model: SkinModel,
  cssWidth: number,
  cssHeight: number,
  zoom: number,
  options?: { highQuality?: boolean },
): Promise<void> {
  await yieldToUi()
  const { SkinViewer } = await loadSkinView3d()
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const pixelRatio = options?.highQuality ? previewPixelRatio() : Math.min(2, dpr)
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
    // 高解像度→表示サイズへ落とすとき輪郭だけ滑らかに（テクセルは Nearest のまま）
    ctx.imageSmoothingEnabled = Boolean(options?.highQuality)
    ctx.imageSmoothingQuality = options?.highQuality ? 'high' : 'low'
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
      // 一覧もプレビューと同じ太陽光・高解像度で生成
      { highQuality: true },
    )
    return canvas.toDataURL('image/png')
  })
}
