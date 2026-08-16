import fs from 'node:fs/promises'
import path from 'node:path'
import type { MinecraftInitialSettings } from '@fledge/shared'

/** options.txt の key → このバージョン以上で書く（それ未満はスキップ） */
const KEY_MIN_VERSION: Record<string, { major: number; minor: number; patch: number }> = {
  autoJump: { major: 1, minor: 10, patch: 0 },
  simulationDistance: { major: 1, minor: 18, patch: 0 },
  inactivityFpsLimit: { major: 1, minor: 21, patch: 2 },
}

type ParsedVersion =
  | { kind: 'release'; major: number; minor: number; patch: number }
  | { kind: 'snapshot'; year: number; week: number }
  | { kind: 'unknown' }

function parseMinecraftVersion(version: string): ParsedVersion {
  const release = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(version.trim())
  if (release) {
    return {
      kind: 'release',
      major: Number(release[1]),
      minor: Number(release[2]),
      patch: Number(release[3] ?? 0),
    }
  }
  const snap = /^(\d{2})w(\d{2})a?/.exec(version.trim())
  if (snap) {
    return { kind: 'snapshot', year: Number(snap[1]), week: Number(snap[2]) }
  }
  return { kind: 'unknown' }
}

function versionAtLeast(
  version: string,
  min: { major: number; minor: number; patch: number },
): boolean {
  const parsed = parseMinecraftVersion(version)
  if (parsed.kind === 'release') {
    if (parsed.major !== min.major) return parsed.major > min.major
    if (parsed.minor !== min.minor) return parsed.minor > min.minor
    return parsed.patch >= min.patch
  }
  if (parsed.kind === 'snapshot') {
    // 1.18 ≈ 21w37+, 1.21.2 ≈ 24w33a
    if (min.major === 1 && min.minor === 21 && min.patch >= 2) {
      return parsed.year > 24 || (parsed.year === 24 && parsed.week >= 33)
    }
    if (min.major === 1 && min.minor >= 18) {
      return parsed.year > 21 || (parsed.year === 21 && parsed.week >= 37)
    }
    if (min.major === 1 && min.minor >= 10) return parsed.year >= 16
  }
  return false
}

function formatFloat(n: number): string {
  const rounded = Math.round(n * 10000) / 10000
  return String(rounded)
}

/**
 * Fledge の初期設定のうち、Minecraft デフォルトから変更された項目だけを options.txt 行にする。
 */
export function snapshotMinecraftInitialOptions(
  settings: MinecraftInitialSettings,
  minecraftVersion: string,
): Record<string, string> {
  const out: Record<string, string> = {}
  const put = (key: string, value: string) => {
    const min = KEY_MIN_VERSION[key]
    if (min && !versionAtLeast(minecraftVersion, min)) return
    out[key] = value
  }

  if (settings.lang) put('lang', settings.lang)
  if (settings.showSubtitles !== null) put('showSubtitles', String(settings.showSubtitles))
  if (settings.autoJump !== null) put('autoJump', String(settings.autoJump))
  if (settings.fovDegrees !== null) {
    put('fov', formatFloat((settings.fovDegrees - 70) / 40))
  }
  if (settings.masterVolume !== null) put('soundCategory_master', formatFloat(settings.masterVolume))
  if (settings.musicVolume !== null) put('soundCategory_music', formatFloat(settings.musicVolume))
  if (settings.maxFps !== null) put('maxFps', String(settings.maxFps))
  if (settings.enableVsync !== null) put('enableVsync', String(settings.enableVsync))
  if (settings.inactivityFpsLimit !== null) put('inactivityFpsLimit', settings.inactivityFpsLimit)
  if (settings.guiScale !== null) put('guiScale', String(settings.guiScale))
  if (settings.gamma !== null) put('gamma', formatFloat(settings.gamma))
  if (settings.renderDistance !== null) put('renderDistance', String(settings.renderDistance))
  if (settings.simulationDistance !== null) {
    put('simulationDistance', String(settings.simulationDistance))
  }
  if (settings.mouseSensitivity !== null) {
    put('mouseSensitivity', formatFloat(settings.mouseSensitivity))
  }
  return out
}

function parseOptionsTxt(text: string): { lines: string[]; map: Map<string, string> } {
  const lines = text.split(/\r?\n/)
  const map = new Map<string, string>()
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    map.set(line.slice(0, idx), line.slice(idx + 1))
  }
  return { lines, map }
}

/**
 * 既存 options.txt があればキーを上書きマージ。無ければ変更分だけ書いて Minecraft が残りを埋める。
 */
export async function mergeMinecraftOptionsFile(
  instanceDir: string,
  patch: Record<string, string>,
): Promise<void> {
  const keys = Object.keys(patch)
  if (keys.length === 0) return

  const file = path.join(instanceDir, 'options.txt')
  let existing = ''
  try {
    existing = await fs.readFile(file, 'utf8')
  } catch {
    existing = ''
  }

  if (!existing.trim()) {
    const body = keys.map((key) => `${key}:${patch[key]}`).join('\n')
    await fs.writeFile(file, `${body}\n`, 'utf8')
    return
  }

  const { lines, map } = parseOptionsTxt(existing)
  const used = new Set<string>()
  const nextLines: string[] = []

  for (const line of lines) {
    const idx = line.indexOf(':')
    if (idx > 0 && !line.startsWith('#')) {
      const key = line.slice(0, idx)
      if (key in patch) {
        nextLines.push(`${key}:${patch[key]}`)
        used.add(key)
        continue
      }
    }
    nextLines.push(line)
  }

  for (const key of keys) {
    if (used.has(key)) continue
    if (map.has(key)) continue
    nextLines.push(`${key}:${patch[key]}`)
  }

  const body = nextLines.filter((l, i, arr) => !(l === '' && i === arr.length - 1)).join('\n')
  await fs.writeFile(file, body.endsWith('\n') ? body : `${body}\n`, 'utf8')
}
