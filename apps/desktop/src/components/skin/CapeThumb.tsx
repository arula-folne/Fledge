import { useEffect, useRef, useState } from 'react'
import { normalizeCapeTextureUrl } from './normalizeCapeUrl'
import { resolveCapeTextureSource } from './resolveCapeTexture'

type Props = {
  url?: string | null
  className?: string
  size?: number
}

function paintCapeFront(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  size: number,
): boolean {
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  const scale = Math.max(img.width / 64, 1)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = Math.round(size * dpr)
  const h = Math.round(size * 1.6 * dpr)
  canvas.width = w
  canvas.height = h
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, w, h)
  try {
    ctx.drawImage(img, 1 * scale, 1 * scale, 10 * scale, 16 * scale, 0, 0, w, h)
    return true
  } catch {
    return false
  }
}

/**
 * マント PNG の前面（クラシック座標 1,1 / 10×16、HD は倍率）をサムネ表示。
 * まず直読み、失敗時は Rust 経由の data URL。
 */
export function CapeThumb({ url, className, size = 28 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ok, setOk] = useState(false)
  const src = url ? normalizeCapeTextureUrl(url) : ''

  useEffect(() => {
    setOk(false)
    const canvas = canvasRef.current
    if (!canvas || !src) return

    let cancelled = false

    const tryPaint = (imageSrc: string) =>
      new Promise<boolean>((resolve) => {
        const img = new Image()
        img.onload = () => {
          if (cancelled) {
            resolve(false)
            return
          }
          resolve(paintCapeFront(canvas, img, size))
        }
        img.onerror = () => resolve(false)
        img.src = imageSrc
      })

    void (async () => {
      if (await tryPaint(src)) {
        if (!cancelled) setOk(true)
        return
      }
      try {
        const dataUrl = await resolveCapeTextureSource(src)
        if (cancelled) return
        if (await tryPaint(dataUrl)) {
          if (!cancelled) setOk(true)
        }
      } catch {
        if (!cancelled) setOk(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [src, size])

  if (!src) {
    return (
      <span
        className={[
          'inline-flex shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[10px] text-[var(--color-text-muted)]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ width: size, height: size * 1.6 }}
        aria-hidden
      >
        —
      </span>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className={[
        'shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)]',
        ok ? '' : 'opacity-40',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ width: size, height: size * 1.6, imageRendering: 'pixelated' }}
      aria-hidden
    />
  )
}
