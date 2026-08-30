import fs from 'node:fs/promises'
import path from 'node:path'
import {
  APP_VERSION,
  UPDATER,
  compareVersions,
  fledgeUserAgent,
  isEligibleGeneration1Update,
  isGeneration1App,
  normalizeReleaseVersion,
  type UpdateChannel,
  type UpdateCheckResult,
} from '@fledge/shared'
import type { PathLayout } from '../app/paths.js'
import type { Updater } from './Updater.js'

/** 開発時 FLEDGE_DEV_APP_VERSION で古い版を装い、更新ボタン確認できる */
function effectiveAppVersion(): string {
  const override = process.env.FLEDGE_DEV_APP_VERSION?.trim()
  return override || APP_VERSION
}

type GithubReleaseAsset = {
  name: string
  browser_download_url: string
  size?: number
}

type GithubRelease = {
  tag_name: string
  html_url: string
  body?: string | null
  assets: GithubReleaseAsset[]
  draft?: boolean
  prerelease?: boolean
}

type ChannelCache = {
  fetchedAt: string
  result: UpdateCheckResult
}

type PendingInstaller = {
  downloadUrl: string
  fileName: string
  expectedSize?: number
}

function findWindowsInstaller(assets: GithubReleaseAsset[]): GithubReleaseAsset | null {
  const preferred = assets.find((a) => UPDATER.installerNamePattern.test(a.name))
  if (preferred) return preferred
  return (
    assets.find((a) => UPDATER.installerFallbackPattern.test(a.name) && /setup/i.test(a.name)) ??
    null
  )
}

function normalizeNotes(body: string | null | undefined): string | undefined {
  if (typeof body !== 'string') return undefined
  const trimmed = body.replace(/\r\n/g, '\n').trim()
  return trimmed.length > 0 ? trimmed : undefined
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
      releaseNotes: cached.releaseNotes,
      prerelease: cached.prerelease,
      channel: cached.channel,
    }
  }

  if (cached.currentVersion && cached.currentVersion !== currentVersion) {
    return null
  }

  if (
    isGeneration1App(currentVersion) &&
    cached.nextVersion &&
    !isEligibleGeneration1Update(cached.nextVersion)
  ) {
    return null
  }

  if (cached.status === 'available' || cached.status === 'up-to-date') {
    return { ...cached, currentVersion }
  }

  return cached
}

/**
 * GitHub Releases を参照し、新しいインストーラーがあれば更新を案内する。
 * - stable: /releases/latest（プレリリース除外）
 * - prerelease: /releases 一覧の最新（プレリリース含む）
 */
export class GithubReleaseUpdater implements Updater {
  private refreshTail = new Map<UpdateChannel, Promise<UpdateCheckResult>>()
  private pending = new Map<UpdateChannel, PendingInstaller>()

  constructor(private readonly layout: PathLayout) {}

  async check(channel: UpdateChannel = 'stable'): Promise<UpdateCheckResult> {
    const cached = await this.readCache(channel)
    if (cached && this.isCacheFresh(cached.fetchedAt, cached.result)) {
      const reconciled = reconcileCachedUpdateResult(cached.result, effectiveAppVersion())
      if (reconciled) {
        if (
          reconciled.status !== cached.result.status ||
          reconciled.currentVersion !== cached.result.currentVersion
        ) {
          await this.writeCache(channel, reconciled)
        }
        this.syncPending(channel, reconciled)
        return reconciled
      }
    }

    const inflight = this.refreshTail.get(channel)
    if (inflight) return inflight

    const refresh = this.fetchAndResolve(channel)
      .catch(async () => {
        if (cached) {
          const reconciled = reconcileCachedUpdateResult(cached.result, effectiveAppVersion())
          if (reconciled) {
            this.syncPending(channel, reconciled)
            return reconciled
          }
        }
        return {
          status: 'unavailable',
          messageKey: 'updater.fetchFailed',
          channel,
        } satisfies UpdateCheckResult
      })
      .finally(() => {
        this.refreshTail.delete(channel)
      })

    this.refreshTail.set(channel, refresh)
    return refresh
  }

  async downloadInstaller(channel: UpdateChannel = 'stable'): Promise<string> {
    let result = await this.check(channel)
    if (result.status !== 'available' || !result.downloadUrl) {
      result = await this.fetchAndResolve(channel)
    }
    const pending = this.pending.get(channel)
    if (result.status !== 'available' || !pending) {
      throw new Error(result.messageKey ?? 'updater.noAsset')
    }

    const dir = path.join(this.layout.temp, 'updates')
    await fs.mkdir(dir, { recursive: true })
    const target = path.join(dir, pending.fileName)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), UPDATER.fetchTimeoutMs * 4)

    try {
      const res = await fetch(pending.downloadUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': fledgeUserAgent('updater-download') },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const bytes = Buffer.from(await res.arrayBuffer())
      if (pending.expectedSize != null && bytes.byteLength !== pending.expectedSize) {
        throw new Error(
          `Installer size mismatch: expected ${pending.expectedSize}, got ${bytes.byteLength}`,
        )
      }
      await fs.writeFile(target, bytes)
      return target
    } catch {
      throw new Error('updater.downloadFailed')
    } finally {
      clearTimeout(timer)
    }
  }

  async clearCache(): Promise<void> {
    this.pending.clear()
    for (const channel of ['stable', 'prerelease'] as const) {
      try {
        await fs.unlink(this.cachePath(channel))
      } catch {
        /* missing is fine */
      }
    }
  }

  async fetchReleaseNotes(version: string): Promise<string | undefined> {
    const tag = version.startsWith('v') ? version : `v${version}`
    const url = `https://api.github.com/repos/${UPDATER.owner}/${UPDATER.repo}/releases/tags/${encodeURIComponent(tag)}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), UPDATER.fetchTimeoutMs)

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': fledgeUserAgent('updater-notes'),
        },
      })
      if (!res.ok) return undefined
      const release = (await res.json()) as GithubRelease
      return normalizeNotes(release.body)
    } catch {
      return undefined
    } finally {
      clearTimeout(timer)
    }
  }

  private syncPending(channel: UpdateChannel, result: UpdateCheckResult): void {
    if (result.status === 'available' && result.downloadUrl) {
      const fileName = path.basename(new URL(result.downloadUrl).pathname)
      this.pending.set(channel, {
        downloadUrl: result.downloadUrl,
        fileName,
        expectedSize: result.downloadSize,
      })
    } else {
      this.pending.delete(channel)
    }
  }

  private cachePath(channel: UpdateChannel): string {
    return path.join(this.layout.cache, `updater-check-${channel}.json`)
  }

  private async readCache(channel: UpdateChannel): Promise<ChannelCache | null> {
    try {
      const raw = await fs.readFile(this.cachePath(channel), 'utf8')
      const parsed = JSON.parse(raw) as ChannelCache
      if (!parsed?.fetchedAt || !parsed.result) return null
      return parsed
    } catch {
      return null
    }
  }

  private isCacheFresh(fetchedAt: string, result?: UpdateCheckResult): boolean {
    const age = Date.now() - Date.parse(fetchedAt)
    if (!Number.isFinite(age) || age < 0) return false
    const ttl =
      result?.status === 'up-to-date' ? UPDATER.upToDateCacheTtlMs : UPDATER.cacheTtlMs
    return age < ttl
  }

  private async writeCache(channel: UpdateChannel, result: UpdateCheckResult): Promise<void> {
    await fs.mkdir(this.layout.cache, { recursive: true })
    const payload: ChannelCache = { fetchedAt: new Date().toISOString(), result }
    await fs.writeFile(this.cachePath(channel), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  }

  private async fetchAndResolve(channel: UpdateChannel): Promise<UpdateCheckResult> {
    const release = await this.fetchRelease(channel)
    const nextVersion = normalizeReleaseVersion(release.tag_name)
    const currentVersion = effectiveAppVersion()
    const releaseNotes = normalizeNotes(release.body)
    const isPrerelease = Boolean(release.prerelease)

    if (compareVersions(currentVersion, nextVersion) >= 0) {
      const result: UpdateCheckResult = {
        status: 'up-to-date',
        currentVersion,
        nextVersion,
        releaseUrl: release.html_url,
        releaseNotes,
        prerelease: isPrerelease,
        channel,
      }
      this.syncPending(channel, result)
      await this.writeCache(channel, result)
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
        releaseNotes,
        prerelease: isPrerelease,
        channel,
      }
      this.syncPending(channel, result)
      await this.writeCache(channel, result)
      return result
    }

    const result: UpdateCheckResult = {
      status: 'available',
      currentVersion,
      nextVersion,
      downloadUrl: asset.browser_download_url,
      downloadSize: asset.size,
      releaseUrl: release.html_url,
      releaseNotes,
      prerelease: isPrerelease,
      channel,
    }
    this.syncPending(channel, result)
    await this.writeCache(channel, result)
    return result
  }

  private async fetchRelease(channel: UpdateChannel): Promise<GithubRelease> {
    const currentVersion = effectiveAppVersion()
    const gen1 = isGeneration1App(currentVersion)

    if (!gen1 && channel === 'stable') {
      return this.fetchLatestStableRelease()
    }

    return this.fetchNewestFromList(channel, gen1)
  }

  private async fetchLatestStableRelease(): Promise<GithubRelease> {
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
      const payload = (await res.json()) as GithubRelease
      if (payload.draft) throw new Error('Latest GitHub release is a draft')
      return payload
    } finally {
      clearTimeout(timer)
    }
  }

  private async fetchNewestFromList(
    channel: UpdateChannel,
    gen1: boolean,
  ): Promise<GithubRelease> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), UPDATER.fetchTimeoutMs)
    const perPage = gen1 ? UPDATER.gen1ReleaseListPerPage : 20

    try {
      const listUrl = `https://api.github.com/repos/${UPDATER.owner}/${UPDATER.repo}/releases?per_page=${perPage}`
      const res = await fetch(listUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': fledgeUserAgent('updater-check'),
        },
      })
      if (!res.ok) throw new Error(`Release fetch failed: HTTP ${res.status}`)

      const payload = (await res.json()) as GithubRelease[]
      let releases = payload.filter((release) => !release.draft)
      if (channel === 'stable') {
        releases = releases.filter((release) => !release.prerelease)
      }
      if (gen1) {
        releases = releases.filter((release) =>
          isEligibleGeneration1Update(normalizeReleaseVersion(release.tag_name)),
        )
      }

      releases.sort((a, b) =>
        compareVersions(
          normalizeReleaseVersion(b.tag_name),
          normalizeReleaseVersion(a.tag_name),
        ),
      )

      const latest = releases[0]
      if (!latest) {
        throw new Error(
          gen1
            ? 'No eligible generation-1 GitHub release found (0.3+ is excluded)'
            : 'No eligible GitHub release found',
        )
      }
      return latest
    } finally {
      clearTimeout(timer)
    }
  }
}
