import type { SkinViewer } from 'skinview3d'
import type { Texture } from 'three'

type EyeRect = { x: number; y: number; w: number; h: number }

/** 64x64 基準のよくある目位置（内側レイヤー＋外側レイヤー） */
const EYE_CANDIDATES_64: EyeRect[] = [
  { x: 10, y: 12, w: 2, h: 1 },
  { x: 13, y: 12, w: 2, h: 1 },
  { x: 10, y: 12, w: 2, h: 2 },
  { x: 13, y: 12, w: 2, h: 2 },
  // outer / hat layer
  { x: 42, y: 12, w: 2, h: 1 },
  { x: 45, y: 12, w: 2, h: 1 },
]

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function sampleAvg(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
): { r: number; g: number; b: number; a: number; lum: number; count: number } {
  let r = 0
  let g = 0
  let b = 0
  let a = 0
  let count = 0
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * width + x) * 4
      const alpha = data[i + 3] ?? 0
      if (alpha < 16) continue
      r += data[i] ?? 0
      g += data[i + 1] ?? 0
      b += data[i + 2] ?? 0
      a += alpha
      count += 1
    }
  }
  if (count === 0) return { r: 0, g: 0, b: 0, a: 0, lum: 0, count: 0 }
  r /= count
  g /= count
  b /= count
  a /= count
  return { r, g, b, a, lum: luminance(r, g, b), count }
}

function scaleRect(rect: EyeRect, scale: number): EyeRect {
  return {
    x: Math.round(rect.x * scale),
    y: Math.round(rect.y * scale),
    w: Math.max(1, Math.round(rect.w * scale)),
    h: Math.max(1, Math.round(rect.h * scale)),
  }
}

/**
 * 標準的な目UV付近に「周囲より暗い画素」があれば瞬き用とみなす。
 * 取れなければ null（瞬きなし）。
 */
export function tryAttachSkinBlink(viewer: SkinViewer): {
  tick: (deltaSeconds: number) => void
  dispose: () => void
} | null {
  const canvas = viewer.skinCanvas
  const width = canvas.width
  const height = canvas.height
  if (width < 64 || height < 32) return null

  const scale = width / 64
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  let image: ImageData
  try {
    image = ctx.getImageData(0, 0, width, height)
  } catch {
    return null
  }

  const data = image.data
  const eyes: EyeRect[] = []
  for (const cand of EYE_CANDIDATES_64) {
    const rect = scaleRect(cand, scale)
    if (rect.x + rect.w > width || rect.y + rect.h > height) continue
    const eye = sampleAvg(data, width, rect.x, rect.y, rect.w, rect.h)
    if (eye.count === 0) continue
    // 額・頬あたりとのコントラスト
    const forehead = sampleAvg(
      data,
      width,
      Math.max(0, rect.x - Math.round(scale)),
      Math.max(0, rect.y - Math.round(2 * scale)),
      rect.w + Math.round(2 * scale),
      Math.max(1, Math.round(scale)),
    )
    const cheek = sampleAvg(
      data,
      width,
      rect.x,
      Math.min(height - 1, rect.y + rect.h + Math.round(scale)),
      rect.w,
      Math.max(1, Math.round(scale)),
    )
    const refLum = Math.max(forehead.lum, cheek.lum, 1)
    const contrast = (refLum - eye.lum) / refLum
    // 目らしい暗さ（サングラス全面などは誤爆しやすいので閾値控えめ）
    if (contrast >= 0.18 && eye.lum < 200) {
      eyes.push(rect)
    }
  }

  // 左右どちらか最低1つ。外側だけ・内側だけのスキンも許容
  if (eyes.length === 0) return null

  const original = new Uint8ClampedArray(data)
  const lidSamples = eyes.map((rect) => {
    const above = sampleAvg(
      data,
      width,
      rect.x,
      Math.max(0, rect.y - Math.max(1, Math.round(scale))),
      rect.w,
      Math.max(1, Math.round(scale)),
    )
    if (above.count > 0) return above
    return sampleAvg(data, width, rect.x, rect.y, rect.w, rect.h)
  })

  const texture = viewer.playerObject.skin.map as Texture | null
  let closed = false
  let cooldown = 1.5 + Math.random() * 2.5
  let blinkLeft = 0
  let disposed = false

  const pushTexture = () => {
    if (!texture) {
      // map が後から付く場合もある
      const map = viewer.playerObject.skin.map
      if (map) map.needsUpdate = true
      return
    }
    texture.needsUpdate = true
  }

  const applyClosed = () => {
    const next = ctx.createImageData(width, height)
    next.data.set(original)
    eyes.forEach((rect, idx) => {
      const lid = lidSamples[idx]
      if (!lid) return
      for (let y = rect.y; y < rect.y + rect.h; y++) {
        for (let x = rect.x; x < rect.x + rect.w; x++) {
          const i = (y * width + x) * 4
          if ((original[i + 3] ?? 0) < 16) continue
          next.data[i] = Math.round(lid.r)
          next.data[i + 1] = Math.round(lid.g)
          next.data[i + 2] = Math.round(lid.b)
          next.data[i + 3] = Math.round(Math.max(lid.a, original[i + 3] ?? 255))
        }
      }
    })
    ctx.putImageData(next, 0, 0)
    pushTexture()
    closed = true
  }

  const applyOpen = () => {
    const next = ctx.createImageData(width, height)
    next.data.set(original)
    ctx.putImageData(next, 0, 0)
    pushTexture()
    closed = false
  }

  return {
    tick(deltaSeconds: number) {
      if (disposed) return
      const dt = Math.min(0.05, Math.max(0, deltaSeconds))
      if (blinkLeft > 0) {
        blinkLeft -= dt
        if (blinkLeft <= 0 && closed) applyOpen()
        return
      }
      cooldown -= dt
      if (cooldown > 0) return
      applyClosed()
      blinkLeft = 0.09 + Math.random() * 0.05
      // たまに二連瞬き
      cooldown = Math.random() < 0.22 ? 0.16 : 2.2 + Math.random() * 4.5
    },
    dispose() {
      disposed = true
      if (closed) applyOpen()
    },
  }
}
