import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { IconDownload, IconSearch } from '@tabler/icons-react'
import type {
  ContentCategory,
  ContentLoaderFilter,
  ContentProviderId,
  ContentSearchQuery,
  InstanceProfile,
  Loader,
} from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { TextField } from '../../components/ui/TextField'

const CATEGORIES: ContentCategory[] = [
  'mod',
  'resourcepack',
  'shader',
  'datapack',
  'plugin',
]

const LOADERS: ContentLoaderFilter[] = ['fabric', 'forge', 'neoforge', 'quilt']

function loadersFromInstance(loader: Loader): ContentLoaderFilter[] {
  if (loader === 'fabric') return ['fabric']
  if (loader === 'forge') return ['forge']
  if (loader === 'neoforge') return ['neoforge']
  return []
}

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

type Props = {
  open: boolean
  onClose: () => void
  instance: InstanceProfile
  initialCategory: ContentCategory
  onInstalled: () => void
}

export function AddContentModal({
  open,
  onClose,
  instance,
  initialCategory,
  onInstalled,
}: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ContentCategory>(initialCategory)
  const [gameVersion, setGameVersion] = useState(instance.minecraftVersion)
  const [loaders, setLoaders] = useState<ContentLoaderFilter[]>(() =>
    loadersFromInstance(instance.loader),
  )
  const [provider, setProvider] = useState<ContentProviderId>('aggregated')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCategory(initialCategory)
    setGameVersion(instance.minecraftVersion)
    setLoaders(loadersFromInstance(instance.loader))
    setQuery('')
    setDebouncedQuery('')
    setError(null)
    setProvider('aggregated')
  }, [open, initialCategory, instance.id, instance.minecraftVersion, instance.loader])

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), 280)
    return () => window.clearTimeout(id)
  }, [query])

  const providersQuery = useQuery({
    queryKey: ['content-providers'],
    queryFn: () => fledgeApi.content.providers(),
    enabled: open,
  })

  const searchInput: ContentSearchQuery = useMemo(
    () => ({
      query: debouncedQuery,
      category,
      gameVersion: gameVersion.trim() || undefined,
      loaders: category === 'mod' || category === 'plugin' ? loaders : [],
      provider,
      offset: 0,
      limit: 24,
    }),
    [debouncedQuery, category, gameVersion, loaders, provider],
  )

  const searchQuery = useQuery({
    queryKey: ['content-search', searchInput],
    queryFn: () => fledgeApi.content.search(searchInput),
    enabled:
      open &&
      (provider === 'aggregated' ||
        provider === 'modrinth' ||
        providersQuery.data?.find((p) => p.id === provider)?.available !== false),
  })

  const installMutation = useMutation({
    mutationFn: (hit: { id: string; provider: 'modrinth' | 'curseforge' }) =>
      fledgeApi.content.install({
        instanceId: instance.id,
        provider: hit.provider,
        projectId: hit.id,
        category,
        gameVersion: gameVersion.trim() || undefined,
        loaders: category === 'mod' || category === 'plugin' ? loaders : [],
      }),
    onMutate: (hit) => {
      setInstallingId(`${hit.provider}:${hit.id}`)
      setError(null)
    },
    onSuccess: () => {
      setInstallingId(null)
      onInstalled()
    },
    onError: (err) => {
      setInstallingId(null)
      setError(err instanceof Error ? err.message : String(err))
    },
  })

  const toggleLoader = (l: ContentLoaderFilter) => {
    setLoaders((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]))
  }

  const hits = searchQuery.data?.hits ?? []
  const providerMeta = providersQuery.data?.find((p) => p.id === provider)

  return (
    <Dialog
      open={open}
      title={t('content.add')}
      subtitle={`${instance.name} · ${instance.minecraftVersion} · ${instance.loader}`}
      onClose={onClose}
      scrollable
      size="lg"
    >
      <div className="space-y-4">
        <div className="relative">
          <IconSearch
            size={16}
            stroke={1.75}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('content.searchPlaceholder')}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={[
                'rounded-[var(--radius-sm)] px-2.5 py-1 text-xs transition',
                category === c
                  ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                  : 'bg-[var(--color-hover)] text-[var(--color-text-muted)]',
              ].join(' ')}
            >
              {t(`content.category.${c}`)}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label={t('content.filter.gameVersion')}
            value={gameVersion}
            onChange={(e) => setGameVersion(e.target.value)}
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--color-text-muted)]">{t('content.filter.provider')}</span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as ContentProviderId)}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2"
            >
              {(providersQuery.data ?? [{ id: 'aggregated', name: 'Aggregated', available: true }]).map(
                (p) => (
                  <option key={p.id} value={p.id} disabled={!p.available && p.id === 'curseforge'}>
                    {p.id === 'aggregated'
                      ? t('content.provider.aggregated')
                      : p.name}
                    {!p.available ? ` (${t('content.provider.unavailable')})` : ''}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>

        {(category === 'mod' || category === 'plugin') && (
          <div>
            <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">
              {t('content.filter.loader')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {LOADERS.map((l) => {
                const on = loaders.includes(l)
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => toggleLoader(l)}
                    className={[
                      'rounded-[var(--radius-sm)] px-2.5 py-1 text-xs capitalize transition',
                      on
                        ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                        : 'bg-[var(--color-hover)] text-[var(--color-text-muted)]',
                    ].join(' ')}
                  >
                    {l}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {providerMeta && !providerMeta.available ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            {providerMeta.unavailableReasonKey
              ? t(providerMeta.unavailableReasonKey)
              : t('content.provider.unavailable')}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-[var(--radius-sm)] bg-[var(--color-danger)]/15 px-3 py-2 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}

        {searchQuery.isError ? (
          <p className="rounded-[var(--radius-sm)] bg-[var(--color-danger)]/15 px-3 py-2 text-sm text-[var(--color-danger)]">
            {searchQuery.error instanceof Error
              ? searchQuery.error.message
              : String(searchQuery.error)}
          </p>
        ) : null}

        {searchQuery.isFetching ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
        ) : searchQuery.isError ? null : hits.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t('content.noResults')}</p>
        ) : (
          <ul className="space-y-2">
            {hits.map((hit) => (
              <li
                key={`${hit.provider}:${hit.id}`}
                className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]/30 p-3"
              >
                {hit.iconUrl ? (
                  <img
                    src={hit.iconUrl}
                    alt=""
                    className="size-12 shrink-0 rounded-[var(--radius-sm)] object-cover"
                  />
                ) : (
                  <div className="size-12 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-accent-soft)]" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{hit.name}</span>
                    <span className="rounded bg-[var(--color-hover)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
                      {hit.provider === 'modrinth' ? 'Modrinth' : 'CurseForge'}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-text-muted)]">
                    {hit.description}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                    ↓ {formatDownloads(hit.downloads)}
                    {hit.gameVersions[0] ? ` · ${hit.gameVersions.slice(0, 3).join(', ')}` : ''}
                    {hit.loaders.length ? ` · ${hit.loaders.slice(0, 3).join(', ')}` : ''}
                  </p>
                </div>
                <Button
                  variant="primary"
                  className="shrink-0 self-center"
                  disabled={installingId === `${hit.provider}:${hit.id}`}
                  onClick={() =>
                    installMutation.mutate({ id: hit.id, provider: hit.provider })
                  }
                >
                  <IconDownload size={16} stroke={1.75} />
                  {installingId === `${hit.provider}:${hit.id}`
                    ? t('content.installing')
                    : t('content.install')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  )
}
