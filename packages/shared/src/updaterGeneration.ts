import { normalizeReleaseVersion } from './compareVersions.js'

/** 第1世代（0.2.x）の最終版。Java の final 修飾子と同様、ここで歯止めする */
export const GEN1_FINAL_VERSION = '0.2.5b' as const

/** 第2世代の開始ライン（0.3.x 系） */
export const GEN2_MIN_MINOR = 3 as const

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
