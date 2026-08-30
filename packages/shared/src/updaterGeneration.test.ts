import assert from 'node:assert/strict'
import test from 'node:test'
import { compareVersions } from './compareVersions.js'
import {
  GEN1_FINAL_VERSION,
  isEligibleGeneration1Update,
  isGeneration1App,
} from './updaterGeneration.js'

test('compareVersions orders f after b within patch', () => {
  assert.equal(compareVersions('0.2.4a', '0.2.4b'), -1)
  assert.equal(compareVersions('0.2.4b', '0.2.4f'), -1)
  assert.equal(compareVersions('0.2.4f', '0.2.4b'), 1)
  assert.equal(compareVersions('0.2.4f', '0.2.4f'), 0)
})

test('compareVersions treats 0.2.5b as newer than 0.2.4b (gen1 auto-update path)', () => {
  assert.equal(compareVersions('0.2.4b', '0.2.5b'), -1)
  assert.equal(compareVersions('0.2.4f', '0.2.5b'), -1)
  assert.equal(compareVersions('0.2.5b', GEN1_FINAL_VERSION), 0)
})

test('compareVersions treats 0.3 as newer than gen1 final', () => {
  assert.equal(compareVersions(GEN1_FINAL_VERSION, '0.3.0a'), -1)
  assert.equal(compareVersions('0.2.4b', '0.3.0'), -1)
})

test('generation-1 apps exclude 0.3+ updates', () => {
  assert.equal(isGeneration1App('0.2.4b'), true)
  assert.equal(isGeneration1App(GEN1_FINAL_VERSION), true)
  assert.equal(isGeneration1App('0.3.0a'), false)

  assert.equal(isEligibleGeneration1Update('0.2.5b'), true)
  assert.equal(isEligibleGeneration1Update('0.2.4b'), true)
  assert.equal(isEligibleGeneration1Update('0.3.0a'), false)
  assert.equal(isEligibleGeneration1Update('0.3.0'), false)
  assert.equal(isEligibleGeneration1Update('0.3.0b'), false)
})
