import fs from 'node:fs/promises'
import path from 'node:path'
import type { MinecraftInitialSettings } from '@fledge/shared'

type SemVer = { major: number; minor: number; patch: number }

/** options.txt の key → このバージョン以上で書く（それ未満はスキップ） */
const KEY_MIN_VERSION: Record<string, SemVer> = {
  autoJump: { major: 1, minor: 10, patch: 0 },
  simulationDistance: { major: 1, minor: 18, patch: 0 },
  inactivityFpsLimit: { major: 1, minor: 21, patch: 2 },
  operatorItemsTab: { major: 1, minor: 19, patch: 3 },
  'key_key.swapOffhand': { major: 1, minor: 16, patch: 0 },
  'key_key.socialInteractions': { major: 1, minor: 16, patch: 4 },
  'key_key.saveToolbarActivator': { major: 1, minor: 12, patch: 0 },
  'key_key.loadToolbarActivator': { major: 1, minor: 12, patch: 0 },
  'key_key.quickActions': { major: 1, minor: 21, patch: 6 },
  'key_key.toggleGui': { major: 1, minor: 21, patch: 11 },
  'key_key.spectatorHotbar': { major: 1, minor: 21, patch: 9 },
  'key_key.friends': { major: 26, minor: 2, patch: 0 },
}

/** 1.21.9 (25w31a) からデバッグオーバーレイの個別表示を保存できる */
const DEBUG_OVERLAY_MIN: SemVer = { major: 1, minor: 21, patch: 9 }

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

/** スナップショットが該当リリース以上とみなせる週（新しい条件から判定） */
const SNAPSHOT_FLOORS: Array<{ min: SemVer; year: number; week: number }> = [
  { min: { major: 26, minor: 2, patch: 0 }, year: 26, week: 7 },
  { min: { major: 26, minor: 1, patch: 0 }, year: 26, week: 1 },
  { min: { major: 1, minor: 21, patch: 11 }, year: 25, week: 41 },
  { min: { major: 1, minor: 21, patch: 9 }, year: 25, week: 31 },
  { min: { major: 1, minor: 21, patch: 6 }, year: 25, week: 20 },
  { min: { major: 1, minor: 21, patch: 2 }, year: 24, week: 33 },
  { min: { major: 1, minor: 19, patch: 3 }, year: 22, week: 45 },
  { min: { major: 1, minor: 18, patch: 0 }, year: 21, week: 37 },
  { min: { major: 1, minor: 16, patch: 0 }, year: 20, week: 6 },
  { min: { major: 1, minor: 12, patch: 0 }, year: 17, week: 6 },
  { min: { major: 1, minor: 10, patch: 0 }, year: 16, week: 1 },
]

function semverGte(a: SemVer, b: SemVer): boolean {
  if (a.major !== b.major) return a.major > b.major
  if (a.minor !== b.minor) return a.minor > b.minor
  return a.patch >= b.patch
}

function versionAtLeast(version: string, min: SemVer): boolean {
  const parsed = parseMinecraftVersion(version)
  if (parsed.kind === 'release') {
    return semverGte(parsed, min)
  }
  if (parsed.kind === 'snapshot') {
    let best: (typeof SNAPSHOT_FLOORS)[number] | null = null
    for (const floor of SNAPSHOT_FLOORS) {
      if (!semverGte(min, floor.min)) continue
      if (!best || semverGte(floor.min, best.min)) best = floor
    }
    if (!best) return false
    return parsed.year > best.year || (parsed.year === best.year && parsed.week >= best.week)
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
  if (settings.bobView !== null) put('bobView', String(settings.bobView))
  if (settings.operatorItemsTab !== null) put('operatorItemsTab', String(settings.operatorItemsTab))
  if (settings.fovDegrees !== null) {
    put('fov', formatFloat((settings.fovDegrees - 70) / 40))
  }
  if (settings.masterVolume !== null) put('soundCategory_master', formatFloat(settings.masterVolume))
  if (settings.musicVolume !== null) put('soundCategory_music', formatFloat(settings.musicVolume))
  if (settings.weatherVolume !== null) {
    put('soundCategory_weather', formatFloat(settings.weatherVolume))
  }
  if (settings.recordVolume !== null) put('soundCategory_record', formatFloat(settings.recordVolume))
  if (settings.blockVolume !== null) put('soundCategory_block', formatFloat(settings.blockVolume))
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

  for (const [id, code] of Object.entries(settings.keybinds ?? {})) {
    if (!id.startsWith('key.') || !code) continue
    put(`key_${id}`, code)
  }

  return out
}

/**
 * 1.21.9+ のデバッグオーバーレイ（FPS 常時表示など）。
 * 文字コントラストはバニラにキーが無いためここでは扱わない。
 */
export function snapshotMinecraftDebugOverlay(
  settings: MinecraftInitialSettings,
  minecraftVersion: string,
): Record<string, string> {
  if (!versionAtLeast(minecraftVersion, DEBUG_OVERLAY_MIN)) return {}
  const out: Record<string, string> = {}
  if (settings.showFps !== null) {
    out['minecraft:fps'] = settings.showFps ? 'always_on' : 'never'
  }
  if (settings.fpsExtended !== null) {
    const vis = settings.fpsExtended ? 'always_on' : 'never'
    out['minecraft:memory'] = vis
    out['minecraft:gpu_utilization'] = vis
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 1.21.9+ の debug.json をマージ。形式が entries ラップでもフラットでも対応する。
 */
export async function mergeMinecraftDebugOverlayFile(
  instanceDir: string,
  patch: Record<string, string>,
): Promise<void> {
  const keys = Object.keys(patch)
  if (keys.length === 0) return

  const file = path.join(instanceDir, 'debug.json')
  let existing: unknown = {}
  try {
    const text = await fs.readFile(file, 'utf8')
    existing = JSON.parse(text) as unknown
  } catch {
    existing = {}
  }

  const base = isPlainObject(existing) ? existing : {}
  let next: Record<string, unknown>
  if (isPlainObject(base.entries)) {
    next = { ...base, entries: { ...base.entries, ...patch } }
  } else {
    next = { ...base, ...patch }
  }

  await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
}
