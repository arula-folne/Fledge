import { useEffect, useRef } from 'react'

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vr: number
  size: number
  life: number
  maxLife: number
  kind: 'glass' | 'glint'
  tint: string
  alpha: number
  shape: number[]
}

const TINTS = [
  'rgba(220, 242, 250, 0.55)',
  'rgba(190, 230, 245, 0.5)',
  'rgba(170, 220, 240, 0.48)',
  'rgba(150, 210, 235, 0.45)',
  'rgba(200, 236, 248, 0.52)',
]

function makeGlassShape(): number[] {
  const points: number[] = []
  const n = 3 + Math.floor(Math.random() * 2)
  const stretch = 0.55 + Math.random() * 0.9
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.45
    const r = (0.45 + Math.random() * 0.55) * (i % 2 === 0 ? stretch : 1)
    points.push(Math.cos(a) * r, Math.sin(a) * r * (1.1 + Math.random() * 0.6))
  }
  return points
}

function spawnBurst(particles: Particle[], x: number, y: number) {
  const glassCount = 5 + Math.floor(Math.random() * 3)
  const glintCount = 2 + Math.floor(Math.random() * 2)

  for (let i = 0; i < glassCount; i++) {
    const angle = (Math.PI * 2 * i) / glassCount + (Math.random() - 0.5) * 0.35
    const speed = 1.6 + Math.random() * 2.6
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: angle + Math.PI / 2,
      vr: (Math.random() - 0.5) * 0.12,
      size: 6 + Math.random() * 9,
      life: 0,
      maxLife: 440 + Math.random() * 240,
      kind: 'glass',
      tint: TINTS[Math.floor(Math.random() * TINTS.length)]!,
      alpha: 1,
      shape: makeGlassShape(),
    })
  }

  for (let i = 0; i < glintCount; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 1.2 + Math.random() * 2
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: angle,
      vr: (Math.random() - 0.5) * 0.06,
      size: 3 + Math.random() * 4,
      life: 0,
      maxLife: 280 + Math.random() * 160,
      kind: 'glint',
      tint: 'rgba(255,255,255,0.7)',
      alpha: 1,
      shape: [],
    })
  }
}

function drawGlass(ctx: CanvasRenderingContext2D, p: Particle) {
  const s = p.size
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(p.rot)
  ctx.globalAlpha = p.alpha * 0.78
  ctx.beginPath()
  for (let i = 0; i < p.shape.length; i += 2) {
    const px = p.shape[i]! * s
    const py = p.shape[i + 1]! * s
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fillStyle = p.tint
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.lineWidth = 0.7
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(p.shape[0]! * s * 0.35, p.shape[1]! * s * 0.35)
  ctx.lineTo(p.shape[2]! * s * 0.55, p.shape[3]! * s * 0.55)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)'
  ctx.lineWidth = 0.6
  ctx.stroke()
  ctx.restore()
}

function drawGlint(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(p.rot)
  ctx.globalAlpha = p.alpha * 0.4
  ctx.strokeStyle = 'rgba(230, 248, 255, 0.85)'
  ctx.lineWidth = 0.8
  ctx.lineCap = 'round'
  const len = p.size
  ctx.beginPath()
  ctx.moveTo(-len, 0)
  ctx.lineTo(len, 0)
  ctx.stroke()
  ctx.restore()
}

/** folne web と同じクリスタル状のクリックエフェクト（粒子があるときだけ描画） */
export function CrystalClickEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
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
      spawnBurst(particlesRef.current, e.clientX, e.clientY)
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
