import { normalizeReleaseVersion } from './compareVersions.js'

/** 第1世代（0.2.x）の最終版。Java の final 修飾子と同様、ここで歯止めする */
export const GEN1_FINAL_VERSION = '0.2.4f' as const

/** 第2世代（0.3.x / 0.4.x）の最終版。0.5 系へは自動更新しない */
export const GEN2_FINAL_VERSION = '0.4.6' as const

/** 第2世代の開始ライン（0.3.x 系） */
export const GEN2_MIN_MINOR = 3 as const

/** 第3世代の開始ライン（0.5.x 系・技術スタック刷新） */
export const GEN3_MIN_MINOR = 5 as const

function generationMinor(version: string): number {
  const normalized = normalizeReleaseVersion(version)
  const match = /^0\.(\d+)/.exec(normalized)
  return match?.[1] ? Number.parseInt(match[1], 10) : 0
}

/** 実行中バイナリが第1世代（0.2.x）か */
export function isGeneration1App(version: string): boolean {
  return generationMinor(version) < GEN2_MIN_MINOR
}

/** 第1世代向けに案内してよい GitHub Release の版（0.3.x 以上は除外） */
export function isEligibleGeneration1Update(targetVersion: string): boolean {
  return generationMinor(targetVersion) < GEN2_MIN_MINOR
}

/** 実行中バイナリが第2世代（0.3.x / 0.4.x）か */
export function isGeneration2App(version: string): boolean {
  const minor = generationMinor(version)
  return minor >= GEN2_MIN_MINOR && minor < GEN3_MIN_MINOR
}

/** 第2世代向けに案内してよい GitHub Release の版（0.5.x 以上は除外） */
export function isEligibleGeneration2Update(targetVersion: string): boolean {
  return generationMinor(targetVersion) < GEN3_MIN_MINOR
}
