import type { DownloadContext } from '../download/DownloadQueue.js'

type TrackerEvent = {
  phase: string
  payload?: {
    progress?: { progress?: number; total?: number }
    count?: number
  }
}

const PHASE_KEYS: Record<string, string> = {
  'version.json': 'launch.install.versionJson',
  'version.jar': 'launch.install.clientJar',
  libraries: 'launch.install.libraries',
  'assets.assets': 'launch.install.assets',
  'assets.assetIndex': 'launch.install.assetIndex',
  'assets.logConfig': 'launch.install.logConfig',
  'forge.installer': 'launch.install.forgeInstaller',
  postprocess: 'launch.install.processors',
}

/** xmcl installer の tracker を DownloadQueue の進捗表示へつなぐ */
export function createXmclInstallTracker(ctx: DownloadContext, fallbackKey: string) {
  let latest: TrackerEvent | null = null

  const flush = () => {
    const payload = latest?.payload
    const progress = payload?.progress
    const messageKey = (latest?.phase && PHASE_KEYS[latest.phase]) || fallbackKey
    const hasBytes = Boolean(progress && (progress.total ?? 0) > 0)
    const current = hasBytes ? (progress?.progress ?? 0) : 0
    const total = hasBytes
      ? (progress?.total ?? 1)
      : typeof payload?.count === 'number' && payload.count > 0
        ? payload.count
        : 1
    ctx.report({
      current,
      total,
      unit: hasBytes ? 'bytes' : 'count',
      messageKey,
    })
  }

  const timer = setInterval(flush, 250)
  return {
    tracker: (event: TrackerEvent) => {
      latest = event
      flush()
    },
    stop: () => {
      clearInterval(timer)
    },
  }
}

export async function withInstallTracker<T>(
  ctx: DownloadContext,
  fallbackKey: string,
  run: (tracker: (event: TrackerEvent) => void, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const watched = createXmclInstallTracker(ctx, fallbackKey)
  try {
    return await run(watched.tracker, ctx.signal)
  } finally {
    watched.stop()
  }
}
