/** クリックエフェクト用のプリズム欠片パーティクル */

export type CrystalParticle = {
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

export const CRYSTAL_TINTS = [
  'rgba(220, 242, 250, 0.55)',
  'rgba(190, 230, 245, 0.5)',
  'rgba(170, 220, 240, 0.48)',
  'rgba(150, 210, 235, 0.45)',
  'rgba(200, 236, 248, 0.52)',
]

export function makeGlassShape(): number[] {
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

export function drawGlass(ctx: CanvasRenderingContext2D, p: CrystalParticle) {
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

export function drawGlint(ctx: CanvasRenderingContext2D, p: CrystalParticle) {
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

export function spawnClickBurst(particles: CrystalParticle[], x: number, y: number) {
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
      tint: CRYSTAL_TINTS[Math.floor(Math.random() * CRYSTAL_TINTS.length)]!,
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
