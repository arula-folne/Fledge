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
 * 初期設定がすべて「Minecraftデフォルト」か（何も書き込まない＝ゲーム本来の初回動作）。
 */
export function hasCustomMinecraftInitialSettings(settings: MinecraftInitialSettings): boolean {
  if (settings.lang) return true
  if (settings.showSubtitles !== null) return true
  if (settings.autoJump !== null) return true
  if (settings.bobView !== null) return true
  if (settings.operatorItemsTab !== null) return true
  if (settings.fovDegrees !== null) return true
  if (settings.masterVolume !== null) return true
  if (settings.musicVolume !== null) return true
  if (settings.weatherVolume !== null) return true
  if (settings.recordVolume !== null) return true
  if (settings.blockVolume !== null) return true
  if (settings.maxFps !== null) return true
  if (settings.enableVsync !== null) return true
  if (settings.inactivityFpsLimit !== null) return true
  if (settings.guiScale !== null) return true
  if (settings.gamma !== null) return true
  if (settings.renderDistance !== null) return true
  if (settings.simulationDistance !== null) return true
  if (settings.mouseSensitivity !== null) return true
  if (settings.showFps !== null) return true
  if (settings.fpsExtended !== null) return true
  if (settings.fpsTextContrast !== null) return true
  for (const [id, code] of Object.entries(settings.keybinds ?? {})) {
    if (id.startsWith('key.') && code) return true
  }
  return false
}

/**
 * Fledge の初期設定のうち、ユーザーが明示した項目だけを options.txt 行にする。
 * すべて null（変更なし）のときは空オブジェクト（ファイルを作らない／触らない）。
 * 1件でも変更があるときだけ onboardAccessibility:false を付ける。
 * lang はユーザーが明示したときだけ書く（アプリ locale からは推定しない）。
 *
 * 適用タイミング（作成時に書かない・初回起動前・applied の意味）は不変条件。
 * 変更する場合は必ずユーザー確認（.cursor/rules/minecraft-initial-settings-launch.mdc）。
 */
export function snapshotMinecraftInitialOptions(
  settings: MinecraftInitialSettings,
  minecraftVersion: string,
  _appLocale?: string | null,
): Record<string, string> {
  if (!hasCustomMinecraftInitialSettings(settings)) return {}

  const out: Record<string, string> = {}
  const put = (key: string, value: string) => {
    const min = KEY_MIN_VERSION[key]
    if (min && !versionAtLeast(minecraftVersion, min)) return
    out[key] = value
  }

  if (settings.lang && settings.lang.trim()) put('lang', settings.lang.trim())
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

  // 変更ありのときだけ初回アクセシビリティ画面を抑止する
  out.onboardAccessibility = 'false'

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

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function hasOwnKey(patch: Record<string, string>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(patch, key)
}

function parseOptionsMap(text: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of stripBom(text).split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    map.set(line.slice(0, idx).trim(), line.slice(idx + 1))
  }
  return map
}

/** パッチの全キーが options.txt に期待値で残っているか（数値は 0 / 0.0 を同等扱い） */
export async function verifyMinecraftOptionsFile(
  instanceDir: string,
  patch: Record<string, string>,
): Promise<boolean> {
  const keys = Object.keys(patch)
  if (keys.length === 0) return true
  try {
    const text = await fs.readFile(path.join(instanceDir, 'options.txt'), 'utf8')
    const map = parseOptionsMap(text)
    return keys.every((key) => optionValuesEqual(patch[key]!, map.get(key)))
  } catch {
    return false
  }
}

function optionValuesEqual(expected: string, actual: string | undefined): boolean {
  if (actual === undefined) return false
  if (actual === expected) return true
  const en = Number(expected)
  const an = Number(actual)
  if (Number.isFinite(en) && Number.isFinite(an)) {
    return Math.abs(en - an) < 1e-6
  }
  if (/^(true|false)$/i.test(expected) && /^(true|false)$/i.test(actual)) {
    return expected.toLowerCase() === actual.toLowerCase()
  }
  return false
}

/** パッチの全キーが debug.json に期待値で残っているか */
export async function verifyMinecraftDebugOverlayFile(
  instanceDir: string,
  patch: Record<string, string>,
): Promise<boolean> {
  const keys = Object.keys(patch)
  if (keys.length === 0) return true
  try {
    const text = await fs.readFile(path.join(instanceDir, 'debug.json'), 'utf8')
    const existing = JSON.parse(text) as unknown
    if (!isPlainObject(existing)) return false
    const entries = isPlainObject(existing.entries) ? existing.entries : existing
    return keys.every((key) => entries[key] === patch[key])
  } catch {
    return false
  }
}

async function writeTextAtomic(file: string, body: string): Promise<void> {
  const dir = path.dirname(file)
  await fs.mkdir(dir, { recursive: true })
  const payload = body.endsWith('\n') ? body : `${body}\n`
  // 製品版 Windows では rename 原子書き込みが失敗しやすいので、直接書き込みを優先する
  await fs.writeFile(file, payload, 'utf8')
  try {
    const handle = await fs.open(file, 'r+')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  } catch {
    /* sync 失敗でもファイル自体は書けていれば続行 */
  }
}

/**
 * 既存 options.txt があれば Fledge のキーで強制上書きマージ。
 * Modpack 同梱の options.txt より Fledge 初期設定を優先する。
 * 同一キーの重複行は落とし、パッチキーはファイル内に1回だけ残す。
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
    existing = stripBom(await fs.readFile(file, 'utf8'))
  } catch {
    existing = ''
  }

  if (!existing.trim()) {
    const body = keys.map((key) => `${key}:${patch[key]}`).join('\n')
    await writeTextAtomic(file, body)
    return
  }

  const lines = existing.split(/\r?\n/)
  const used = new Set<string>()
  const nextLines: string[] = []

  for (const line of lines) {
    if (!line || line.startsWith('#')) {
      nextLines.push(line)
      continue
    }
    const idx = line.indexOf(':')
    if (idx <= 0) {
      nextLines.push(line)
      continue
    }
    const key = line.slice(0, idx).trim()
    if (hasOwnKey(patch, key)) {
      // 重複キーは捨て、Fledge 値を1回だけ書く
      if (used.has(key)) continue
      nextLines.push(`${key}:${patch[key]}`)
      used.add(key)
      continue
    }
    nextLines.push(line)
  }

  for (const key of keys) {
    if (used.has(key)) continue
    nextLines.push(`${key}:${patch[key]}`)
  }

  const body = nextLines.filter((l, i, arr) => !(l === '' && i === arr.length - 1)).join('\n')
  await writeTextAtomic(file, body)
}

/** spawn 前 verify 後の Windows 書き込み反映待ち（製品版向け） */
const INITIAL_SETTINGS_SPAWN_SETTLE_MS = 200

/**
 * 凍結済みパッチをインスタンスへ強制反映（Modpack 同梱より優先）。
 * 空パッチなら何もしない（ゲーム本来の初回動作）。
 */
export async function applyMinecraftInitialPatchToInstance(
  instanceDir: string,
  options: Record<string, string>,
  overlay: Record<string, string> = {},
): Promise<{ options: Record<string, string>; overlay: Record<string, string> }> {
  if (Object.keys(options).length === 0 && Object.keys(overlay).length === 0) {
    return { options, overlay }
  }

  if (Object.keys(options).length > 0) {
    await mergeMinecraftOptionsFile(instanceDir, options)
    if (!(await verifyMinecraftOptionsFile(instanceDir, options))) {
      await mergeMinecraftOptionsFile(instanceDir, options)
    }
    if (!(await verifyMinecraftOptionsFile(instanceDir, options))) {
      throw new Error(`Failed to persist Minecraft options.txt at ${path.join(instanceDir, 'options.txt')}`)
    }
    // 製品版 Windows では書き込み反映が僅かに遅れることがある
    await new Promise((resolve) => setTimeout(resolve, INITIAL_SETTINGS_SPAWN_SETTLE_MS))
    if (!(await verifyMinecraftOptionsFile(instanceDir, options))) {
      await mergeMinecraftOptionsFile(instanceDir, options)
    }
    if (!(await verifyMinecraftOptionsFile(instanceDir, options))) {
      throw new Error(`Failed to persist Minecraft options.txt at ${path.join(instanceDir, 'options.txt')}`)
    }
  }

  if (Object.keys(overlay).length > 0) {
    await mergeMinecraftDebugOverlayFile(instanceDir, overlay)
    if (!(await verifyMinecraftDebugOverlayFile(instanceDir, overlay))) {
      await mergeMinecraftDebugOverlayFile(instanceDir, overlay)
    }
  }

  return { options, overlay }
}

/**
 * 初期設定コミットの現行世代。
 * 上げると applied 済みでも世代不足のインスタンスは一度だけ再適用される。
 */
export const MINECRAFT_INITIAL_SETTINGS_APPLY_GENERATION = 9

export function isMinecraftInitialPatchEmpty(
  options: Record<string, string> | undefined | null,
  overlay: Record<string, string> | undefined | null = {},
): boolean {
  return Object.keys(options ?? {}).length === 0 && Object.keys(overlay ?? {}).length === 0
}

/**
 * シード済みインスタンスへ、作成時凍結パッチを初回起動前に載せる。
 * - コミット済み（applied）: 何もしない
 * - パッチ空（変更なし）: ディスクへ触れず、applied にもしない
 * - パッチあり: 強制マージし、起動成功後のコミット待ち（起動前だけでは applied にしない）
 */
export async function ensureMinecraftInitialSettingsApplied(
  instanceDir: string,
  pendingOptions: Record<string, string>,
  pendingOverlay: Record<string, string>,
  alreadyCommitted: boolean,
): Promise<{
  neededCommit: boolean
  options: Record<string, string>
  overlay: Record<string, string>
}> {
  if (alreadyCommitted) {
    return { neededCommit: false, options: {}, overlay: {} }
  }

  // 変更なし: options.txt / debug.json / applied フラグのいずれにも触れない
  if (isMinecraftInitialPatchEmpty(pendingOptions, pendingOverlay)) {
    return { neededCommit: false, options: {}, overlay: {} }
  }

  await applyMinecraftInitialPatchToInstance(instanceDir, pendingOptions, pendingOverlay)
  return {
    neededCommit: true,
    options: pendingOptions,
    overlay: pendingOverlay,
  }
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

  await writeTextAtomic(file, `${JSON.stringify(next, null, 2)}\n`)
}
