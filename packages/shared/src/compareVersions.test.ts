import assert from 'node:assert/strict'
import test from 'node:test'
import { compareVersions } from './compareVersions.js'

test('compareVersions orders standard prerelease suffixes', () => {
  assert.equal(compareVersions('0.1.4a', '0.1.4b'), -1)
  assert.equal(compareVersions('0.1.4b', '0.1.4c'), -1)
  assert.equal(compareVersions('0.1.4c', '0.1.4'), -1)
})

test('compareVersions orders c before ut', () => {
  assert.equal(compareVersions('0.3.2c', '0.3.2ut'), -1)
  assert.equal(compareVersions('0.3.2b', '0.3.2c'), -1)
})

test('compareVersions orders update-test suffixes ut before up', () => {
  assert.equal(compareVersions('0.3.0ut', '0.3.0up'), -1)
  assert.equal(compareVersions('0.3.0up', '0.3.0ut'), 1)
  assert.equal(compareVersions('0.3.0b', '0.3.0ut'), -1)
})

test('compareVersions orders f after up as update-stop final', () => {
  assert.equal(compareVersions('0.3.0up', '0.3.0f'), -1)
  assert.equal(compareVersions('0.3.0f', '0.3.0'), -1)
})

test('compareVersions treats unknown suffix as older than a', () => {
  assert.equal(compareVersions('0.2.4x', '0.2.4a'), -1)
})
