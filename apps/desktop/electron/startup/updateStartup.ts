import { APP_VERSION, type Settings, type UpdateNotice } from '@fledge/shared'
import type { LauncherApp } from '@fledge/core'
import { isPostInstallStart, isUpdatedStart } from '../startup/lightStart'

function versionsDiffer(a: string | undefined, b: string): boolean {
  return Boolean(a && a !== b)
}

/**
 * 更新直後起動向けに settings を整える。
 * - 更新案内用の pending を用意（argv や lastAppVersion 欠落でもダイアログを出せる）
 * - 既存ユーザーにインストールチュートリアルを出さない
 */
export async function preparePostUpdateSettings(appCtx: LauncherApp): Promise<Settings> {
  const settings = await appCtx.settings.get()
  const updatedArg = isUpdatedStart()
  const postInstall = isPostInstallStart()
  const pending = settings.updateAckPending
  const last = settings.lastAppVersion
  const versionBumped = versionsDiffer(last, APP_VERSION)
  const pendingForCurrent =
    pending != null && (pending.toVersion === APP_VERSION || !pending.toVersion)

  // 新規インストール直後は更新案内にしない
  if (postInstall && !updatedArg) {
    if (settings.lastAppVersion !== APP_VERSION) {
      return appCtx.settings.set({ lastAppVersion: APP_VERSION })
    }
    return settings
  }

  const looksLikeUpdate = updatedArg || pendingForCurrent || versionBumped
  if (!looksLikeUpdate) {
    // 通常起動: 版が一致するよう記録（案内待ちが残っていないときだけ）
    if (!pending && settings.lastAppVersion !== APP_VERSION) {
      return appCtx.settings.set({ lastAppVersion: APP_VERSION })
    }
    return settings
  }

  const patch: Partial<Settings> = {}

  // 既存ユーザー向け: 更新後に初回チュートリアルを出さない
  if (settings.installOnboardingCompleted !== true) {
    patch.installOnboardingCompleted = true
    patch.termsAcceptedInApp = true
  }

  if (!pendingForCurrent) {
    patch.updateAckPending = {
      fromVersion: pending?.fromVersion ?? last ?? '',
      toVersion: APP_VERSION,
      releaseNotes: pending?.releaseNotes,
    }
  } else if (pending && pending.toVersion !== APP_VERSION) {
    patch.updateAckPending = {
      fromVersion: pending.fromVersion || last || '',
      toVersion: APP_VERSION,
      releaseNotes: pending.releaseNotes,
    }
  }

  if (Object.keys(patch).length === 0) return settings
  return appCtx.settings.set(patch)
}

export async function resolveUpdateNotice(appCtx: LauncherApp): Promise<UpdateNotice | null> {
  const settings = await appCtx.settings.get()
  const pending = settings.updateAckPending
  const last = settings.lastAppVersion
  const updatedArg = isUpdatedStart()
  const versionBumped = versionsDiffer(last, APP_VERSION)
  const pendingForCurrent = pending != null && pending.toVersion === APP_VERSION

  if (!pendingForCurrent && !updatedArg && !versionBumped) {
    return null
  }

  // 新規インストール扱い（post-install のみ）は出さない
  if (isPostInstallStart() && !updatedArg && !pendingForCurrent) {
    return null
  }

  const fromVersion = (pending?.fromVersion || last || '').trim()
  let releaseNotes = pending?.releaseNotes
  if (!releaseNotes?.trim()) {
    releaseNotes = await appCtx.updater.fetchReleaseNotes(APP_VERSION)
  }

  return {
    fromVersion,
    toVersion: APP_VERSION,
    releaseNotes,
  }
}
