import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EMPTY_MINECRAFT_INITIAL_SETTINGS, type MinecraftInitialSettings } from '@fledge/shared'
import {
  formatOptionsKeybindValue,
  hasCustomMinecraftInitialSettings,
  snapshotMinecraftDebugOverlay,
  snapshotMinecraftInitialOptions,
} from './minecraftInitialOptions.js'

function settings(partial: Partial<MinecraftInitialSettings>): MinecraftInitialSettings {
  return { ...EMPTY_MINECRAFT_INITIAL_SETTINGS, ...partial, keybinds: partial.keybinds ?? {} }
}

describe('snapshotMinecraftInitialOptions', () => {
  it('全項目 null → options 空・onboardAccessibility なし', () => {
    const out = snapshotMinecraftInitialOptions(settings({}), '1.21.1', 'ja')
    assert.deepEqual(out, {})
    assert.equal(hasCustomMinecraftInitialSettings(settings({})), false)
  })

  it('guiScale だけ変更 → guiScale と onboardAccessibility のみ', () => {
    const out = snapshotMinecraftInitialOptions(settings({ guiScale: 2 }), '1.21.1', 'ja')
    assert.equal(out.guiScale, '2')
    assert.equal(out.onboardAccessibility, 'false')
    assert.equal(out.lang, undefined)
    assert.equal(Object.keys(out).length, 2)
  })

  it('fovDegrees だけ変更 → fov 内部値と onboardAccessibility', () => {
    const out = snapshotMinecraftInitialOptions(settings({ fovDegrees: 90 }), '1.21.1')
    // (90 - 70) / 40 = 0.5
    assert.equal(out.fov, '0.5')
    assert.equal(out.onboardAccessibility, 'false')
  })

  it('masterVolume だけ変更 → soundCategory_master と onboardAccessibility', () => {
    const out = snapshotMinecraftInitialOptions(settings({ masterVolume: 0.5 }), '1.21.1')
    assert.equal(out.soundCategory_master, '0.5')
    assert.equal(out.onboardAccessibility, 'false')
  })

  it('複数変更 → 全キーが入り onboardAccessibility:false', () => {
    const out = snapshotMinecraftInitialOptions(
      settings({
        guiScale: 2,
        fovDegrees: 90,
        maxFps: 120,
        renderDistance: 12,
      }),
      '1.21.1',
    )
    assert.equal(out.guiScale, '2')
    assert.equal(out.fov, '0.5')
    assert.equal(out.maxFps, '120')
    assert.equal(out.renderDistance, '12')
    assert.equal(out.onboardAccessibility, 'false')
  })

  it('lang 未指定でもアプリ locale から lang を書かない', () => {
    const out = snapshotMinecraftInitialOptions(settings({ guiScale: 3 }), '1.21.1', 'ja')
    assert.equal(out.lang, undefined)
    assert.equal(out.guiScale, '3')
  })

  it('lang 明示時のみ lang を書く', () => {
    const out = snapshotMinecraftInitialOptions(settings({ lang: 'en_us' }), '1.21.1', 'ja')
    assert.equal(out.lang, 'en_us')
    assert.equal(out.onboardAccessibility, 'false')
  })

  it('マウス side button はレガシー数値 ID で書く（datafix クラッシュ防止）', () => {
    const out = snapshotMinecraftInitialOptions(
      settings({ keybinds: { 'key.sprint': 'key.mouse.4' } }),
      '26.2',
    )
    assert.equal(out['key_key.sprint'], '-97')
  })
})

describe('formatOptionsKeybindValue', () => {
  it('key.mouse.4 → -97', () => {
    assert.equal(formatOptionsKeybindValue('key.mouse.4'), '-97')
  })
  it('keyboard はそのまま', () => {
    assert.equal(formatOptionsKeybindValue('key.keyboard.w'), 'key.keyboard.w')
  })
})

describe('snapshotMinecraftDebugOverlay', () => {
  it('showFps 変更時は debug パッチを返す', () => {
    const out = snapshotMinecraftDebugOverlay(settings({ showFps: true }), '1.21.9')
    assert.equal(out['minecraft:fps'], 'always_on')
  })

  it('古いバージョンでは overlay を書かない', () => {
    const out = snapshotMinecraftDebugOverlay(settings({ showFps: true }), '1.20.1')
    assert.deepEqual(out, {})
  })
})
