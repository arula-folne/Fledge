import type { InstanceProfile, Loader, LoaderVersion } from '@fledge/shared'

export function formatLoaderLabel(
  loader: InstanceProfile['loader'],
  t: (key: string) => string,
): string {
  const key = `instances.loader.${loader}`
  const label = t(key)
  return label === key ? loader : label
}

/** 空欄時のインスタンス名（ローダー + ゲームバージョン） */
export function defaultInstanceName(
  loader: Loader,
  minecraftVersion: string,
  t: (key: string) => string,
): string {
  const loaderLabel = formatLoaderLabel(loader, t)
  const version = minecraftVersion.trim()
  const name = version ? `${loaderLabel} ${version}` : loaderLabel
  return name.slice(0, 64)
}

export type LoaderVersionChannel = 'stable' | 'latest' | 'other'

export function resolveLoaderVersionId(
  channel: LoaderVersionChannel,
  versions: LoaderVersion[],
  otherId: string,
): string | undefined {
  if (!versions.length) return undefined
  if (channel === 'other') {
    return versions.some((v) => v.id === otherId) ? otherId : versions[0]?.id
  }
  if (channel === 'latest') {
    return versions.find((v) => v.type === 'latest')?.id ?? versions[0]?.id
  }
  return versions.find((v) => v.recommended)?.id ?? versions.find((v) => v.stable)?.id ?? versions[0]?.id
}

export function formatLastPlayed(
  iso: string | undefined,
  t: (key: string) => string,
): string {
  if (!iso) return t('instances.neverPlayed')
  try {
    return new Intl.DateTimeFormat('ja', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return t('instances.neverPlayed')
  }
}
