/**
 * インストール完了直後・更新適用直後など、UI を優先して重い副次処理を抑えるモード。
 * NSIS Finish から `--fledge-post-install` / `--updated` 付きで起動される。
 */
export function isLightStart(): boolean {
  return (
    process.env.FLEDGE_LIGHT_START === '1' ||
    process.argv.includes('--fledge-post-install') ||
    process.argv.includes('--updated')
  )
}

export function isUpdatedStart(): boolean {
  return process.argv.includes('--updated')
}

export function isPostInstallStart(): boolean {
  return process.argv.includes('--fledge-post-install')
}

export function applyLightStartEnv(): void {
  if (isLightStart()) {
    process.env.FLEDGE_LIGHT_START = '1'
  }
}
