import assert from 'node:assert/strict'
import test from 'node:test'
import { compareVersions } from './compareVersions.js'
import {
  GEN1_FINAL_VERSION,
  GEN2_FINAL_VERSION,
  isEligibleGeneration1Update,
  isEligibleGeneration2Update,
  isGeneration1App,
  isGeneration2App,
} from './updaterGeneration.js'

test('compareVersions orders f after b within patch', () => {
  assert.equal(compareVersions('0.2.4a', '0.2.4b'), -1)
  assert.equal(compareVersions('0.2.4b', '0.2.4f'), -1)
  assert.equal(compareVersions('0.2.4f', '0.2.4b'), 1)
  assert.equal(compareVersions('0.2.4f', '0.2.4f'), 0)
})

test('compareVersions treats 0.3 as newer than 0.2.4f', () => {
  assert.equal(compareVersions('0.2.4f', '0.3.0a'), -1)
  assert.equal(compareVersions('0.2.4b', '0.3.0'), -1)
})

test('compareVersions treats 0.5 as newer than 0.4.6', () => {
  assert.equal(compareVersions('0.4.6', '0.5.0a'), -1)
  assert.equal(compareVersions('0.4.5b', '0.5.0'), -1)
})

test('generation-1 apps exclude 0.3+ updates', () => {
  assert.equal(isGeneration1App('0.2.4b'), true)
  assert.equal(isGeneration1App(GEN1_FINAL_VERSION), true)
  assert.equal(isGeneration1App('0.3.0a'), false)

  assert.equal(isEligibleGeneration1Update('0.2.4f'), true)
  assert.equal(isEligibleGeneration1Update('0.2.4b'), true)
  assert.equal(isEligibleGeneration1Update('0.3.0a'), false)
  assert.equal(isEligibleGeneration1Update('0.3.0'), false)
  assert.equal(isEligibleGeneration1Update('0.3.0b'), false)
})

test('generation-2 apps exclude 0.5+ updates', () => {
  assert.equal(isGeneration2App('0.3.5b'), true)
  assert.equal(isGeneration2App('0.4.5b'), true)
  assert.equal(isGeneration2App(GEN2_FINAL_VERSION), true)
  assert.equal(isGeneration2App('0.2.4f'), false)
  assert.equal(isGeneration2App('0.5.0a'), false)

  assert.equal(isEligibleGeneration2Update('0.4.6'), true)
  assert.equal(isEligibleGeneration2Update('0.4.5b'), true)
  assert.equal(isEligibleGeneration2Update('0.3.0b'), true)
  assert.equal(isEligibleGeneration2Update('0.5.0a'), false)
  assert.equal(isEligibleGeneration2Update('0.5.0'), false)
  assert.equal(isEligibleGeneration2Update('0.5.0b'), false)
})
