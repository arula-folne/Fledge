import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { InstanceProfile } from '@fledge/shared'
import { fledgeApi } from '../api/fledgeApi'
import { Button } from '../components/ui/Button'
import { InstanceWizard } from '../features/instances/InstanceWizard'
import { InstanceCard } from '../features/instances/InstanceCard'
import { useUiStore } from '../stores/appStores'

function sortInstances(items: InstanceProfile[]): InstanceProfile[] {
  return [...items].sort((a, b) => {
    const at = a.lastPlayedAt ? Date.parse(a.lastPlayedAt) : 0
    const bt = b.lastPlayedAt ? Date.parse(b.lastPlayedAt) : 0
    if (bt !== at) return bt - at
    return a.name.localeCompare(b.name, 'ja')
  })
}

export default function LibraryPage() {
  const { t } = useTranslation()
  const wizardOpen = useUiStore((s) => s.instanceWizardOpen)
  const setWizardOpen = useUiStore((s) => s.setInstanceWizardOpen)

  const instancesQuery = useQuery({
    queryKey: ['instances'],
    queryFn: () => fledgeApi.instances.list(),
  })

  const items = useMemo(() => sortInstances(instancesQuery.data ?? []), [instancesQuery.data])
  const empty = items.length === 0

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-xl font-semibold">{t('library.title')}</h1>

      {empty ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/60 px-6 py-16 text-center">
          <p className="font-medium">{t('library.empty')}</p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">{t('library.emptyHint')}</p>
          <Button className="mt-6" variant="primary" onClick={() => setWizardOpen(true)}>
            {t('library.create')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <InstanceCard key={item.id} instance={item} />
          ))}
        </div>
      )}

      <InstanceWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  )
}
