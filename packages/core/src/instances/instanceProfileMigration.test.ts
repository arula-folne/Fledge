import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseInstanceProfile } from './instanceProfileMigration.js'

describe('parseInstanceProfile', () => {
  it('jvmArgs 欠落の旧 profile を補完して読み込める', () => {
    const { profile, migrated } = parseInstanceProfile({
      id: 'test-abc12345',
      name: 'Legacy',
      createdAt: '2026-01-01T00:00:00.000Z',
      minecraftVersion: '1.21.1',
      loader: 'vanilla',
      java: { strategy: 'auto' },
      memory: { maxMb: 2048 },
    })
    assert.equal(migrated, true)
    assert.deepEqual(profile.jvmArgs, [])
  })

  it('完全な profile は migrated=false', () => {
    const input = {
      id: 'test-abc12345',
      name: 'Current',
      createdAt: '2026-01-01T00:00:00.000Z',
      minecraftVersion: '1.21.1',
      loader: 'fabric',
      java: { strategy: 'auto' },
      memory: { maxMb: 4096 },
      jvmArgs: ['-Xverify:none'],
    }
    const { profile, migrated } = parseInstanceProfile(input)
    assert.equal(migrated, false)
    assert.equal(profile.name, 'Current')
  })
})
