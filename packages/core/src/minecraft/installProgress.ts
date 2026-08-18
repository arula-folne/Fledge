import type { DownloadContext } from '../download/DownloadQueue.js'

type TrackerEvent = {
  phase: string
  payload?: {
    progress?: { progress?: number; total?: number; url?: string }
    count?: number
    id?: string
    version?: string
    path?: string
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

function fileNameFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '')
    return name || undefined
  } catch {
    const name = url.split(/[\\/]/).pop()
    return name || undefined
  }
}

/** xmcl installer の tracker を DownloadQueue の進捗表示へつなぐ */
export function createXmclInstallTracker(ctx: DownloadContext, fallbackKey: string) {
  let latest: TrackerEvent | null = null

  const flush = () => {
    const payload = latest?.payload
    const progress = payload?.progress
    const file =
      fileNameFromUrl(progress?.url) ??
      (typeof payload?.path === 'string' ? payload.path.split(/[\\/]/).pop() : undefined)
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
      meta: {
        ...(file ? { file } : {}),
        ...(typeof payload?.id === 'string' ? { version: payload.id } : {}),
        ...(typeof payload?.version === 'string' ? { version: payload.version } : {}),
      },
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
