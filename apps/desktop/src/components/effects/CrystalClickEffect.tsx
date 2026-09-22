import { useEffect, useRef } from 'react'
import {
  type CrystalParticle,
  drawGlass,
  drawGlint,
  spawnClickBurst,
} from './crystalParticles'

/** folne web と同じクリスタル状のクリックエフェクト（粒子があるときだけ描画） */
export function CrystalClickEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<CrystalParticle[]>([])
  const rafRef = useRef<number>(0)
  const runningRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const syncSize = () => {
      // アイドル時はバッファを解放して VRAM/ヒープを抑える
      if (particlesRef.current.length === 0) {
        if (canvas.width !== 1 || canvas.height !== 1) {
          canvas.width = 1
          canvas.height = 1
          canvas.style.width = '0'
          canvas.style.height = '0'
        }
        return
      }
      // DPR=1 でフルスクリーンバッファを小さく保つ
      const w = window.innerWidth
      const h = window.innerHeight
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        canvas.style.width = `${w}px`
        canvas.style.height = `${h}px`
        ctx.setTransform(1, 0, 0, 1, 0, 0)
      }
    }

    let last = performance.now()

    const stop = () => {
      runningRef.current = false
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
      syncSize()
    }

    const tick = (now: number) => {
      const list = particlesRef.current
      if (list.length === 0) {
        stop()
        return
      }

      const dt = Math.min(32, now - last)
      last = now
      syncSize()
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]!
        p.life += dt
        const t = p.life / p.maxLife
        if (t >= 1) {
          list.splice(i, 1)
          continue
        }

        p.vx *= 0.96
        p.vy *= 0.96
        p.x += p.vx * (dt / 16)
        p.y += p.vy * (dt / 16)
        p.rot += p.vr * (dt / 16)
        p.alpha = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9

        if (p.kind === 'glass') drawGlass(ctx, p)
        else drawGlint(ctx, p)
      }

      if (list.length === 0) {
        stop()
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    const start = () => {
      if (runningRef.current) return
      runningRef.current = true
      last = performance.now()
      syncSize()
      rafRef.current = requestAnimationFrame(tick)
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      spawnClickBurst(particlesRef.current, e.clientX, e.clientY)
      start()
    }

    const onResize = () => {
      if (particlesRef.current.length > 0) syncSize()
    }

    syncSize()
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', onResize)
      stop()
    }
  }, [])

  return <canvas ref={canvasRef} className="crystal-click-canvas" aria-hidden="true" />
}
