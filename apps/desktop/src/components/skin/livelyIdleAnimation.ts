import { PlayerAnimation, type PlayerObject } from 'skinview3d'
import type { Object3D } from 'three'

type IdleClip = 'breathe' | 'look' | 'wave' | 'walk' | 'shift'

/** 旧・アイテム持ち／訪問演出の残りメッシュを腕・シーンから除去 */
function stripLegacyHandProps(player: PlayerObject) {
  for (const arm of [player.skin.rightArm, player.skin.leftArm]) {
    const doomed: Object3D[] = []
    for (const child of arm.children) {
      if (child.name === 'fledgeHandItem' || child.userData?.fledgeHandItem) {
        doomed.push(child)
      }
    }
    for (const obj of doomed) {
      arm.remove(obj)
      obj.traverse((node) => {
        const mesh = node as { isMesh?: boolean; geometry?: { dispose: () => void }; material?: unknown }
        if (!mesh.isMesh) return
        mesh.geometry?.dispose()
        const mat = mesh.material as { dispose?: () => void } | Array<{ dispose?: () => void }> | undefined
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.())
        else mat?.dispose?.()
      })
    }
  }
}

const CLIP_POOL: IdleClip[] = ['breathe', 'look', 'wave', 'walk', 'shift']

function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t))
}

function pickRandomClip(previous: IdleClip | null): IdleClip {
  const choices = previous ? CLIP_POOL.filter((c) => c !== previous) : CLIP_POOL
  const pool = choices.length > 0 ? choices : CLIP_POOL
  return pool[Math.floor(Math.random() * pool.length)] ?? 'breathe'
}

/**
 * 基礎的な待機モーション（呼吸・見回し・手振り・その場歩き・体重移動）。
 * クリップは直前と違うものをランダム再生。
 */
export class LivelyIdleAnimation extends PlayerAnimation {
  private clip: IdleClip = 'breathe'
  private clipStart = 0
  private clipDuration = 3.2
  private started = false
  blinkTick: ((deltaSeconds: number) => void) | null = null

  constructor() {
    super()
    this.speed = 0.9
  }

  private beginClip(at: number, clip: IdleClip) {
    this.clip = clip
    this.clipStart = at
    this.clipDuration =
      clip === 'wave'
        ? 2.4
        : clip === 'walk'
          ? 3.2
          : clip === 'look'
            ? 3.6
            : clip === 'shift'
              ? 2.8
              : 3.4 + Math.random() * 1.2
  }

  private advanceClip(progress: number) {
    if (progress - this.clipStart < this.clipDuration) return
    this.beginClip(progress, pickRandomClip(this.clip))
  }

  protected animate(player: PlayerObject, delta = 0): void {
    const realDt = delta > 0 && this.speed > 0 ? delta / this.speed : 0
    if (this.blinkTick && realDt > 0) this.blinkTick(realDt)

    // HMR 等で腕に残ったアイテムメッシュを毎フレーム除去
    stripLegacyHandProps(player)

    const progress = this.progress
    if (!this.started) {
      this.started = true
      this.beginClip(progress, pickRandomClip(null))
    } else {
      this.advanceClip(progress)
    }

    const clip = this.clip
    const local = progress - this.clipStart
    const u = clamp01(local / Math.max(0.001, this.clipDuration))
    const breath = Math.sin(progress * 2.1)

    player.skin.resetJoints()
    player.position.set(0, 0, 0)
    player.rotation.x = 0
    player.rotation.z = 0

    const armZ = Math.PI * 0.02
    player.skin.leftArm.rotation.z = Math.cos(progress * 1.5) * 0.025 + armZ
    player.skin.rightArm.rotation.z = Math.cos(progress * 1.5 + Math.PI) * 0.025 - armZ
    player.skin.body.rotation.x = breath * 0.012
    player.skin.head.rotation.x = breath * 0.018
    player.cape.rotation.x = Math.PI * 0.06 + Math.sin(progress * 1.4) * 0.012

    if (clip === 'look') {
      const look = Math.sin(u * Math.PI * 2) * easeInOut(Math.sin(u * Math.PI))
      player.skin.head.rotation.y = look * 0.5
      player.skin.head.rotation.x = Math.sin(u * Math.PI) * 0.1 + breath * 0.018
      player.skin.body.rotation.y = look * 0.06
      return
    }

    if (clip === 'wave') {
      const w = easeInOut(u < 0.18 ? u / 0.18 : u > 0.82 ? 1 - (u - 0.82) / 0.18 : 1)
      const flap = Math.sin(local * 9) * 0.5 * w
      player.skin.rightArm.rotation.x = -w * 2.4
      player.skin.rightArm.rotation.z = -armZ + flap
      player.skin.head.rotation.y = w * 0.2
      player.skin.leftArm.rotation.x = 0.08 * w
      return
    }

    if (clip === 'walk') {
      const gate = easeInOut(u < 0.12 ? u / 0.12 : u > 0.88 ? 1 - (u - 0.88) / 0.12 : 1)
      const step = Math.sin(local * 5.2) * gate
      player.skin.leftLeg.rotation.x = step * 0.55
      player.skin.rightLeg.rotation.x = -step * 0.55
      player.skin.leftArm.rotation.x = -step * 0.4
      player.skin.rightArm.rotation.x = step * 0.4
      player.skin.body.rotation.y = step * 0.06
      player.skin.head.rotation.y = step * 0.04
      player.position.y = Math.abs(step) * 0.12
      return
    }

    if (clip === 'shift') {
      const s = Math.sin(u * Math.PI) * easeInOut(Math.sin(u * Math.PI))
      player.skin.leftLeg.rotation.x = s * 0.14
      player.skin.rightLeg.rotation.x = -s * 0.1
      player.skin.body.rotation.z = s * 0.05
      player.skin.head.rotation.z = s * 0.03
      player.position.x = s * 0.28
    }
  }
}
