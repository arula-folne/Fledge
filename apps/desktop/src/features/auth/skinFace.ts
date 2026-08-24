/**
 * Minecraft スキン PNG から顔（頭＋帽子レイヤー）を切り出して data URL にする。
 * プロフィールアバターの即時表示用（mc-heads CDN の遅延を避ける）。
 */
export async function cropSkinFaceDataUrl(skinDataUrl: string, pixelSize = 64): Promise<string> {
  const size = Math.max(8, Math.round(pixelSize))
  const img = await loadImage(skinDataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.imageSmoothingEnabled = false
  // head base (8,8) 8x8
  ctx.drawImage(img, 8, 8, 8, 8, 0, 0, size, size)
  // head overlay (40,8) 8x8
  ctx.drawImage(img, 40, 8, 8, 8, 0, 0, size, size)
  return canvas.toDataURL('image/png')
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load skin image'))
    img.src = src
  })
}
