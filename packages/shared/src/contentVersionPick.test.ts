import assert from 'node:assert/strict'
import test from 'node:test'
import { pickPreferredContentVersion } from './contentVersionPick.js'

test('pickPreferredContentVersion prefers release over newer beta', () => {
  const picked = pickPreferredContentVersion([
    { id: 'beta-new', versionType: 'beta' },
    { id: 'rel-old', versionType: 'release' },
    { id: 'alpha', versionType: 'alpha' },
  ])
  assert.equal(picked?.id, 'rel-old')
})

test('pickPreferredContentVersion falls back to beta when no release', () => {
  const picked = pickPreferredContentVersion([
    { id: 'alpha-new', versionType: 'alpha' },
    { id: 'beta-old', versionType: 'beta' },
  ])
  assert.equal(picked?.id, 'beta-old')
})
