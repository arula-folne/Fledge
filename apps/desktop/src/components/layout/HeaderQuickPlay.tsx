import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fledgeApi } from '../../api/fledgeApi'
import { InstanceIcon } from '../../features/instances/InstanceIcon'
import { InstanceLaunchButton } from '../../features/instances/InstanceLaunchButton'
import { formatLoaderLabel } from '../../features/instances/instanceMeta'

/**
 * ヘッダー左：最後に遊んだ（または選択中の）インスタンスをいつでも起動できるようにする。
 */
export function HeaderQuickPlay() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })
  const instancesQuery = useQuery({
    queryKey: ['instances'],
    queryFn: () => fledgeApi.instances.list(),
  })

  const instances = instancesQuery.data ?? []
  const lastId =
    settingsQuery.data?.lastPlayedInstanceId ?? settingsQuery.data?.selectedInstanceId ?? null
  const instance = instances.find((i) => i.id === lastId) ?? instances[0] ?? null

  if (!instance) {
    return (
      <button
        type="button"
        className="min-w-0 rounded-[var(--radius-sm)] px-2 py-1 text-left text-sm text-[var(--color-text-muted)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
        onClick={() => navigate('/')}
      >
        {t('header.openLibrary')}
      </button>
    )
  }

  const detailPath = `/library/${instance.id}`

  return (
    <div className="flex min-w-0 max-w-sm shrink-0 items-center gap-2">
      <button
        type="button"
        className="flex min-w-0 items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-left transition hover:bg-[var(--color-hover)]"
        onClick={() => navigate(detailPath)}
        title={t('header.quickPlay')}
      >
        <InstanceIcon instance={instance} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-[var(--color-text)]">
            {instance.name}
          </span>
          <span className="block truncate text-[11px] text-[var(--color-text-muted)]">
            {instance.minecraftVersion} · {formatLoaderLabel(instance.loader, t)}
          </span>
        </span>
      </button>
      <InstanceLaunchButton instanceId={instance.id} size="sm" />
    </div>
  )
}
