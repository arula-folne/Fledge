import type { InstanceProfile } from '@fledge/shared'

export function formatLoaderLabel(
  loader: InstanceProfile['loader'],
  t: (key: string) => string,
): string {
  const key = `instances.loader.${loader}`
  const label = t(key)
  return label === key ? loader : label
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
