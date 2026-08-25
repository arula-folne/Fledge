import { getVersionList } from '@xmcl/installer'

type VersionList = Awaited<ReturnType<typeof getVersionList>>

const TTL_MS = 5 * 60_000

let cache: { at: number; data: VersionList } | null = null
let inflight: Promise<VersionList> | null = null

/** Mojang マニフェストの短命キャッシュ（インストール／バージョン一覧で共有） */
export async function getCachedVersionList(): Promise<VersionList> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data
  if (inflight) return inflight
  inflight = getVersionList()
    .then((data) => {
      cache = { at: Date.now(), data }
      return data
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}
