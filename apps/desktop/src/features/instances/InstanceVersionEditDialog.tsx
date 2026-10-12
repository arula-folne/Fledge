import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { InstanceProfile, Loader } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import {
  ListPickDialog,
  ListPickField,
  type ListPickGroup,
} from '../../components/ui/ListPickDialog'
import { Switch } from '../../components/ui/Switch'
import {
  resolveLoaderVersionId,
  type LoaderVersionChannel,
} from './instanceMeta'

type Props = {
  open: boolean
  instance: InstanceProfile
  pending?: boolean
  onClose: () => void
  onApply: (next: {
    minecraftVersion: string
    loader: Loader
    loaderVersion?: string
  }) => void
}

const LOADERS: Loader[] = ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt']
const CHANNELS: LoaderVersionChannel[] = ['stable', 'latest', 'other']

export function InstanceVersionEditDialog({
  open,
  instance,
  pending = false,
  onClose,
  onApply,
}: Props) {
  const { t } = useTranslation()
  const [minecraftVersion, setMinecraftVersion] = useState(instance.minecraftVersion)
  const [loader, setLoader] = useState<Loader>(instance.loader)
  const [loaderChannel, setLoaderChannel] = useState<LoaderVersionChannel>('stable')
  const [otherLoaderVersion, setOtherLoaderVersion] = useState(instance.loaderVersion ?? '')
  const [includeSnapshots, setIncludeSnapshots] = useState(false)
  const [versionPickOpen, setVersionPickOpen] = useState(false)
  const [loaderPickOpen, setLoaderPickOpen] = useState(false)
  const [loaderVersionPickOpen, setLoaderVersionPickOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setMinecraftVersion(instance.minecraftVersion)
    setLoader(instance.loader)
    setLoaderChannel('stable')
    setOtherLoaderVersion(instance.loaderVersion ?? '')
    setIncludeSnapshots(false)
    setVersionPickOpen(false)
    setLoaderPickOpen(false)
    setLoaderVersionPickOpen(false)
  }, [open, instance.id, instance.minecraftVersion, instance.loader, instance.loaderVersion])

  const versionsQuery = useQuery({
    queryKey: ['versions-minecraft'],
    queryFn: () => fledgeApi.versions.listMinecraft({ includeSnapshots: true }),
    enabled: open,
    placeholderData: keepPreviousData,
  })

  const loaderGamesQuery = useQuery({
    queryKey: ['versions-loader-games', loader],
    queryFn: () => fledgeApi.versions.listLoaderGames({ loader }),
    enabled: open && loader !== 'vanilla',
  })

  const loadersQuery = useQuery({
    queryKey: ['versions-loaders', loader, minecraftVersion],
    queryFn: () =>
      fledgeApi.versions.listLoaders({
        loader,
        minecraftVersion,
      }),
    enabled: open && Boolean(minecraftVersion) && loader !== 'vanilla',
  })

  const allowedMcIds = useMemo(() => {
    if (loader === 'vanilla') return null
    const data = loaderGamesQuery.data
    if (!data || data.loader !== loader) return undefined
    return new Set(data.versions)
  }, [loader, loaderGamesQuery.data])

  const filteredMcVersions = useMemo(() => {
    const versions = versionsQuery.data?.versions ?? []
    if (loader === 'vanilla') return versions
    if (allowedMcIds) return versions.filter((v) => allowedMcIds.has(v.id))
    if (loaderGamesQuery.isError) return versions
    return []
  }, [versionsQuery.data, loader, allowedMcIds, loaderGamesQuery.isError])

  useEffect(() => {
    if (loader !== 'vanilla' && allowedMcIds === undefined && !loaderGamesQuery.isError) return
    if (!filteredMcVersions.length) return
    if (minecraftVersion && filteredMcVersions.some((v) => v.id === minecraftVersion)) return
    const releases = filteredMcVersions.filter((v) => v.type === 'release')
    const pool = releases.length ? releases : filteredMcVersions
    if (pool[0]) setMinecraftVersion(pool[0].id)
  }, [
    loader,
    allowedMcIds,
    loaderGamesQuery.isError,
    filteredMcVersions,
    minecraftVersion,
  ])

  useEffect(() => {
    const versions = loadersQuery.data?.versions ?? []
    if (!versions.length) return
    if (otherLoaderVersion && versions.some((v) => v.id === otherLoaderVersion)) return
    const preferred =
      (instance.loader === loader &&
        instance.minecraftVersion === minecraftVersion &&
        instance.loaderVersion &&
        versions.some((v) => v.id === instance.loaderVersion) &&
        instance.loaderVersion) ||
      resolveLoaderVersionId('stable', versions, '')
    if (preferred) setOtherLoaderVersion(preferred)
  }, [
    loadersQuery.data,
    otherLoaderVersion,
    instance.loader,
    instance.loaderVersion,
    instance.minecraftVersion,
    loader,
    minecraftVersion,
  ])

  const needsLoaderVersion = loader !== 'vanilla'
  const loaderVersions = loadersQuery.data?.versions ?? []
  const resolvedLoaderVersion = needsLoaderVersion
    ? resolveLoaderVersionId(loaderChannel, loaderVersions, otherLoaderVersion)
    : undefined

  const releaseOptions = useMemo(
    () =>
      filteredMcVersions
        .filter((v) => v.type === 'release')
        .map((v) => ({ value: v.id, label: v.id })),
    [filteredMcVersions],
  )

  const versionPickGroups = useMemo<ListPickGroup[]>(() => {
    const items = filteredMcVersions
      .filter((v) => includeSnapshots || v.type === 'release')
      .map((v) => {
        const suffix =
          v.type === 'release'
            ? 'Release'
            : v.type === 'snapshot'
              ? 'Snapshot'
              : v.type === 'old_beta'
                ? 'Beta'
                : v.type === 'old_alpha'
                  ? 'Alpha'
                  : undefined
        const suffixTone =
          v.type === 'release'
            ? ('release' as const)
            : v.type === 'snapshot'
              ? ('snapshot' as const)
              : v.type === 'old_beta'
                ? ('beta' as const)
                : v.type === 'old_alpha'
                  ? ('alpha' as const)
                  : undefined
        return { value: v.id, label: v.id, suffix, suffixTone }
      })
    return items.length ? [{ items }] : []
  }, [filteredMcVersions, includeSnapshots])

  const otherVersionOptions = useMemo(
    () =>
      loaderVersions.map((v) => ({
        value: v.id,
        label: v.recommended
          ? `${v.version} (${t('instances.loaderRecommended')})`
          : v.stable
            ? `${v.version} (${t('instances.loaderStable')})`
            : v.version,
      })),
    [loaderVersions, t],
  )

  const unchanged =
    minecraftVersion === instance.minecraftVersion &&
    loader === instance.loader &&
    (loader === 'vanilla'
      ? true
      : (resolvedLoaderVersion ?? '') === (instance.loaderVersion ?? ''))

  const canApply =
    Boolean(minecraftVersion) &&
    !unchanged &&
    (!needsLoaderVersion || Boolean(resolvedLoaderVersion)) &&
    !(needsLoaderVersion && loadersQuery.isFetching) &&
    !(needsLoaderVersion && !loadersQuery.isError && loaderVersions.length === 0)

  const nestedOpen = versionPickOpen || loaderPickOpen || loaderVersionPickOpen

  return (
    <>
      <Dialog
        open={open}
        title={t('instances.versionChange.title')}
        size="md"
        scrollable
        overlayClassName="z-[85]"
        dismissible={!pending && !nestedOpen}
        onClose={() => {
          if (pending || nestedOpen) return
          onClose()
        }}
        footer={
          <>
            <Button type="button" disabled={pending} onClick={onClose}>
              {t('instances.cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={!canApply || pending}
              onClick={() =>
                onApply({
                  minecraftVersion,
                  loader,
                  loaderVersion: needsLoaderVersion ? resolvedLoaderVersion : undefined,
                })
              }
            >
              {pending ? t('instances.versionChange.applying') : t('instances.versionChange.apply')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            {t('instances.versionChange.hint')}
          </p>

          <ListPickField
            label={t('instances.loader')}
            valueLabel={t(`instances.loader.${loader}`)}
            compact
            disabled={pending}
            onClick={() => setLoaderPickOpen(true)}
          />

          {versionsQuery.isLoading ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t('instances.versionsLoading')}</p>
          ) : versionsQuery.isError ? (
            <div className="space-y-2">
              <p className="text-sm text-[var(--color-danger)]">{t('instances.versionsError')}</p>
              <Button type="button" onClick={() => void versionsQuery.refetch()}>
                {t('common.retry')}
              </Button>
            </div>
          ) : (
            <ListPickField
              label={t('instances.version')}
              valueLabel={minecraftVersion || t('instances.pickVersion')}
              disabled={pending || versionsQuery.isLoading}
              compact
              onClick={() => setVersionPickOpen(true)}
            />
          )}

          {needsLoaderVersion ? (
            <div className="flex flex-col gap-3">
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium">{t('instances.loaderChannel')}</legend>
                <div className="flex flex-wrap gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] p-1">
                  {CHANNELS.map((channel) => {
                    const on = loaderChannel === channel
                    return (
                      <button
                        key={channel}
                        type="button"
                        disabled={pending}
                        className={[
                          'flex-1 rounded-[var(--radius-sm)] px-3 py-1.5 text-sm transition',
                          on
                            ? 'bg-[var(--color-selection-soft)] font-medium text-[var(--color-selection)]'
                            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
                        ].join(' ')}
                        onClick={() => setLoaderChannel(channel)}
                      >
                        {t(`instances.loaderChannel.${channel}`)}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              {loadersQuery.isFetching ? (
                <p className="text-sm text-[var(--color-text-muted)]">
                  {t('instances.loaderVersionsLoading')}
                </p>
              ) : loadersQuery.isError ? (
                <div className="space-y-2">
                  <p className="text-sm text-[var(--color-danger)]">
                    {t('instances.loaderVersionsError')}
                  </p>
                  <Button type="button" onClick={() => void loadersQuery.refetch()}>
                    {t('common.retry')}
                  </Button>
                </div>
              ) : loaderVersions.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">
                  {t('instances.loaderVersionsEmpty')}
                </p>
              ) : loaderChannel === 'other' ? (
                <ListPickField
                  label={t('instances.loaderVersion')}
                  valueLabel={
                    otherVersionOptions.find((o) => o.value === otherLoaderVersion)?.label ??
                    otherLoaderVersion
                  }
                  compact
                  disabled={pending}
                  onClick={() => setLoaderVersionPickOpen(true)}
                />
              ) : (
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t(`instances.loaderChannelHint.${loaderChannel}`, {
                    version: resolvedLoaderVersion ?? '—',
                  })}
                </p>
              )}
            </div>
          ) : null}
        </div>
      </Dialog>

      <ListPickDialog
        open={loaderPickOpen}
        title={t('instances.loader')}
        value={loader}
        groups={[
          {
            items: LOADERS.map((id) => ({
              value: id,
              label: t(`instances.loader.${id}`),
            })),
          },
        ]}
        onSelect={(next) => {
          setLoader(next as Loader)
          setLoaderChannel('stable')
        }}
        onClose={() => setLoaderPickOpen(false)}
      />
      <ListPickDialog
        open={versionPickOpen}
        title={t('instances.version')}
        value={minecraftVersion}
        groups={versionPickGroups}
        empty={t('instances.versionsEmpty')}
        size="sm"
        onSelect={setMinecraftVersion}
        onClose={() => setVersionPickOpen(false)}
        header={
          <label className="flex items-center justify-between gap-2 text-xs text-[var(--color-text)]">
            <span>{t('instances.includeSnapshots')}</span>
            <Switch
              checked={includeSnapshots}
              aria-label={t('instances.includeSnapshots')}
              onChange={(next) => {
                setIncludeSnapshots(next)
                if (
                  !next &&
                  (versionsQuery.data?.versions ?? []).some(
                    (v) => v.type === 'snapshot' && v.id === minecraftVersion,
                  )
                ) {
                  const firstRelease = releaseOptions[0]?.value
                  if (firstRelease) setMinecraftVersion(firstRelease)
                }
              }}
            />
          </label>
        }
      />
      <ListPickDialog
        open={loaderVersionPickOpen}
        title={t('instances.loaderVersion')}
        value={otherLoaderVersion}
        groups={[{ items: otherVersionOptions }]}
        empty={t('instances.loaderVersionsEmpty')}
        onSelect={setOtherLoaderVersion}
        onClose={() => setLoaderVersionPickOpen(false)}
      />
    </>
  )
}
