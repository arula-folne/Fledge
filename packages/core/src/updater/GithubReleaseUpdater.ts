import fs from 'node:fs/promises'
import path from 'node:path'
import {
  APP_VERSION,
  UPDATER,
  compareVersions,
  fledgeUserAgent,
  normalizeReleaseVersion,
  type UpdateCheckResult,
} from '@fledge/shared'
import type { PathLayout } from '../app/paths.js'
import type { Updater } from './Updater.js'

type GithubReleaseAsset = {
  name: string
  browser_download_url: string
}

type GithubRelease = {
  tag_name: string
  html_url: string
  assets: GithubReleaseAsset[]
}

type UpdaterCache = {
  fetchedAt: string
  result: UpdateCheckResult
}

type PendingInstaller = {
  downloadUrl: string
  fileName: string
}

function findWindowsInstaller(assets: GithubReleaseAsset[]): GithubReleaseAsset | null {
  const preferred = assets.find((a) => UPDATER.installerNamePattern.test(a.name))
  if (preferred) return preferred
  return (
    assets.find((a) => UPDATER.installerFallbackPattern.test(a.name) && /setup/i.test(a.name)) ??
    null
  )
}

/**
 * キャッシュ結果を実行中バイナリの APP_VERSION に合わせて解釈する。
 * すでに次版以上なら up-to-date。currentVersion 不一致なら再取得させる。
 */
export function reconcileCachedUpdateResult(
  cached: UpdateCheckResult,
  currentVersion: string,
): UpdateCheckResult | null {
  if (cached.nextVersion && compareVersions(currentVersion, cached.nextVersion) >= 0) {
    return {
      status: 'up-to-date',
      currentVersion,
      nextVersion: cached.nextVersion,
      releaseUrl: cached.releaseUrl,
    }
  }

  if (cached.currentVersion && cached.currentVersion !== currentVersion) {
    return null
  }

  if (cached.status === 'available' || cached.status === 'up-to-date') {
    return { ...cached, currentVersion }
  }

  return cached
}

/**
 * GitHub Releases の latest を参照し、新しいインストーラーがあれば更新を案内する。
 */
export class GithubReleaseUpdater implements Updater {
  private refreshTail: Promise<UpdateCheckResult> | null = null
  private pending: PendingInstaller | null = null

  constructor(private readonly layout: PathLayout) {}

  async check(): Promise<UpdateCheckResult> {
    const cached = await this.readCache()
    if (cached && this.isCacheFresh(cached.fetchedAt)) {
      const reconciled = reconcileCachedUpdateResult(cached.result, APP_VERSION)
      if (reconciled) {
        if (reconciled.status !== cached.result.status || reconciled.currentVersion !== cached.result.currentVersion) {
          await this.writeCache(reconciled)
        }
        this.syncPending(reconciled)
        return reconciled
      }
    }

    if (this.refreshTail) return this.refreshTail

    this.refreshTail = this.fetchAndResolve()
      .catch(async () => {
        if (cached) {
          const reconciled = reconcileCachedUpdateResult(cached.result, APP_VERSION)
          if (reconciled) {
            this.syncPending(reconciled)
            return reconciled
          }
        }
        return { status: 'unavailable', messageKey: 'updater.fetchFailed' } satisfies UpdateCheckResult
      })
      .finally(() => {
        this.refreshTail = null
      })

    return this.refreshTail
  }

  async downloadInstaller(): Promise<string> {
    let result = await this.check()
    if (result.status !== 'available' || !result.downloadUrl) {
      result = await this.fetchAndResolve()
    }
    if (result.status !== 'available' || !this.pending) {
      throw new Error(result.messageKey ?? 'updater.noAsset')
    }

    const dir = path.join(this.layout.temp, 'updates')
    await fs.mkdir(dir, { recursive: true })
    const target = path.join(dir, this.pending.fileName)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), UPDATER.fetchTimeoutMs * 4)

    try {
      const res = await fetch(this.pending.downloadUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': fledgeUserAgent('updater-download') },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const bytes = Buffer.from(await res.arrayBuffer())
      await fs.writeFile(target, bytes)
      return target
    } catch {
      throw new Error('updater.downloadFailed')
    } finally {
      clearTimeout(timer)
    }
  }

  async clearCache(): Promise<void> {
    this.pending = null
    try {
      await fs.unlink(this.cachePath())
    } catch {
      /* missing is fine */
    }
  }

  private syncPending(result: UpdateCheckResult): void {
    if (result.status === 'available' && result.downloadUrl) {
      const fileName = path.basename(new URL(result.downloadUrl).pathname)
      this.pending = { downloadUrl: result.downloadUrl, fileName }
    } else {
      this.pending = null
    }
  }

  private cachePath(): string {
    return path.join(this.layout.cache, 'updater-check.json')
  }

  private async readCache(): Promise<UpdaterCache | null> {
    try {
      const raw = await fs.readFile(this.cachePath(), 'utf8')
      const parsed = JSON.parse(raw) as UpdaterCache
      if (!parsed?.fetchedAt || !parsed.result) return null
      return parsed
    } catch {
      return null
    }
  }

  private isCacheFresh(fetchedAt: string): boolean {
    const age = Date.now() - Date.parse(fetchedAt)
    return Number.isFinite(age) && age >= 0 && age < UPDATER.cacheTtlMs
  }

  private async writeCache(result: UpdateCheckResult): Promise<void> {
    await fs.mkdir(this.layout.cache, { recursive: true })
    const payload: UpdaterCache = { fetchedAt: new Date().toISOString(), result }
    await fs.writeFile(this.cachePath(), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  }

  private async fetchAndResolve(): Promise<UpdateCheckResult> {
    const release = await this.fetchLatestRelease()
    const nextVersion = normalizeReleaseVersion(release.tag_name)
    const currentVersion = APP_VERSION

    if (compareVersions(currentVersion, nextVersion) >= 0) {
      const result: UpdateCheckResult = {
        status: 'up-to-date',
        currentVersion,
        nextVersion,
        releaseUrl: release.html_url,
      }
      this.syncPending(result)
      await this.writeCache(result)
      return result
    }

    const asset = findWindowsInstaller(release.assets ?? [])
    if (!asset) {
      const result: UpdateCheckResult = {
        status: 'unavailable',
        messageKey: 'updater.noAsset',
        currentVersion,
        nextVersion,
        releaseUrl: release.html_url,
      }
      this.syncPending(result)
      await this.writeCache(result)
      return result
    }

    const result: UpdateCheckResult = {
      status: 'available',
      currentVersion,
      nextVersion,
      downloadUrl: asset.browser_download_url,
      releaseUrl: release.html_url,
    }
    this.syncPending(result)
    await this.writeCache(result)
    return result
  }

  private async fetchLatestRelease(): Promise<GithubRelease> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), UPDATER.fetchTimeoutMs)

    try {
      const res = await fetch(UPDATER.latestReleaseUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': fledgeUserAgent('updater-check'),
        },
      })
      if (!res.ok) throw new Error(`Release fetch failed: HTTP ${res.status}`)
      return (await res.json()) as GithubRelease
    } finally {
      clearTimeout(timer)
    }
  }
}
