import { InstanceProfileSchema, type InstanceProfile } from '@fledge/shared'

export type ParsedInstanceProfile = {
  profile: InstanceProfile
  /** 旧 profile.json を補完した場合 true（ディスクへ書き戻す） */
  migrated: boolean
}

/** 旧版 profile.json の欠落フィールドを補完する（SettingsStore と同様の方針） */
export function migrateInstanceProfileRaw(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid profile object')
  }
  const record = { ...(raw as Record<string, unknown>) }

  if (!Array.isArray(record.jvmArgs)) {
    record.jvmArgs = []
  }

  if (!record.java || typeof record.java !== 'object' || Array.isArray(record.java)) {
    record.java = { strategy: 'auto' }
  } else {
    const java = record.java as Record<string, unknown>
    if (java.strategy !== 'auto' && java.strategy !== 'path') {
      java.strategy = 'auto'
    }
  }

  if (!record.memory || typeof record.memory !== 'object' || Array.isArray(record.memory)) {
    record.memory = { maxMb: 2048 }
  } else {
    const memory = record.memory as Record<string, unknown>
    if (typeof memory.maxMb !== 'number' || !Number.isFinite(memory.maxMb) || memory.maxMb <= 0) {
      memory.maxMb = 2048
    }
  }

  return record
}

export function parseInstanceProfile(raw: unknown): ParsedInstanceProfile {
  const direct = InstanceProfileSchema.safeParse(raw)
  if (direct.success) {
    return { profile: direct.data, migrated: false }
  }

  const migratedRaw = migrateInstanceProfileRaw(raw)
  const migrated = InstanceProfileSchema.safeParse(migratedRaw)
  if (!migrated.success) {
    throw migrated.error
  }
  return { profile: migrated.data, migrated: true }
}
