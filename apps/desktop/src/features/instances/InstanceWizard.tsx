import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { IconInfoCircle, IconRefresh } from '@tabler/icons-react'
import {
  DEFAULT_INSTANCE_ICON_PRESET,
  type CreateInstanceInput,
  type InstanceIconPreset,
  type Loader,
} from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import {
  ListPickDialog,
  ListPickField,
  type ListPickGroup,
} from '../../components/ui/ListPickDialog'
import { Switch } from '../../components/ui/Switch'
import { TextField } from '../../components/ui/TextField'
import { InstanceIcon } from './InstanceIcon'
import { InstanceIconCustomizeDialog, type InstanceIconFilePick } from './instanceIconPresets'
import {
  defaultInstanceName,
  resolveLoaderVersionId,
  type LoaderVersionChannel,
} from './instanceMeta'

type Props = {
  open: boolean
  onClose: () => void
  onBack?: () => void
  title?: string
}

const LOADERS: Loader[] = ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt']
const CHANNELS: LoaderVersionChannel[] = ['stable', 'latest', 'other']

function formatFetchedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ja-JP')
}

export function InstanceWizard({ open, onClose, onBack, title }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [minecraftVersion, setMinecraftVersion] = useState('')
  const [loader, setLoader] = useState<Loader>('vanilla')
  const [loaderChannel, setLoaderChannel] = useState<LoaderVersionChannel>('stable')
  const [otherLoaderVersion, setOtherLoaderVersion] = useState('')
  const [includeSnapshots, setIncludeSnapshots] = useState(false)
  const [icon, setIcon] = useState<InstanceIconFilePick | null>(null)
  const [iconPreset, setIconPreset] = useState<InstanceIconPreset>(DEFAULT_INSTANCE_ICON_PRESET)
  const [iconOpen, setIconOpen] = useState(false)
  const [versionPickOpen, setVersionPickOpen] = useState(false)
  const [loaderPickOpen, setLoaderPickOpen] = useState(false)
  const [loaderVersionPickOpen, setLoaderVersionPickOpen] = useState(false)
  const [versionInfoOpen, setVersionInfoOpen] = useState(false)

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })

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

  useEffect(() => {
    if (!open) return
    setName('')
    setLoader('vanilla')
    setLoaderChannel('stable')
    setOtherLoaderVersion('')
    setMinecraftVersion('')
    setIncludeSnapshots(false)
    setIconOpen(false)
    setVersionPickOpen(false)
    setLoaderPickOpen(false)
    setLoaderVersionPickOpen(false)
    setVersionInfoOpen(false)
    setIconPreset(DEFAULT_INSTANCE_ICON_PRESET)
    setIcon((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl)
      return null
    })
  }, [open])

  useEffect(() => {
    return () => {
      if (icon) URL.revokeObjectURL(icon.previewUrl)
    }
  }, [icon])

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
    const releases = filteredMcVersions.filter((v) => v.type === 'release')
    const pool = releases.length ? releases : filteredMcVersions
    if (!pool.length) return
    if (minecraftVersion && pool.some((v) => v.id === minecraftVersion)) return
    setMinecraftVersion(pool[0]!.id)
  }, [
    loader,
    allowedMcIds,
    loaderGamesQuery.isError,
    filteredMcVersions,
    minecraftVersion,
  ])

  useEffect(() => {
    setOtherLoaderVersion('')
  }, [loader, minecraftVersion])

  useEffect(() => {
    const versions = loadersQuery.data?.versions ?? []
    if (!versions.length) return
    if (otherLoaderVersion && versions.some((v) => v.id === otherLoaderVersion)) return
    const preferred = resolveLoaderVersionId('stable', versions, '')
    if (preferred) setOtherLoaderVersion(preferred)
  }, [loadersQuery.data, otherLoaderVersion])

  const autoName = defaultInstanceName(loader, minecraftVersion, t)
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
        // Minecraft 公式の種別表記はロケールに関わらず英語固定
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

  const refreshMutation = useMutation({
    mutationFn: async () => {
      await fledgeApi.versions.refresh({ target: 'minecraft' })
      if (loader !== 'vanilla') {
        await fledgeApi.versions.refresh({
          target: loader,
          minecraftVersion: minecraftVersion || undefined,
        })
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['versions-minecraft'] })
      await queryClient.invalidateQueries({ queryKey: ['versions-loaders'] })
      await queryClient.invalidateQueries({ queryKey: ['versions-loader-games'] })
    },
  })

  const createMutation = useMutation({
    mutationFn: (input: CreateInstanceInput) => fledgeApi.instances.create(input),
    onSuccess: async (profile) => {
      await fledgeApi.settings.set({ selectedInstanceId: profile.id })
      await queryClient.invalidateQueries({ queryKey: ['instances'] })
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      onClose()
      void fledgeApi.launch.prepare(profile.id).catch(() => {
        // 状態イベントでエラー表示
      })
    },
  })

  const canCreate =
    Boolean(minecraftVersion) &&
    (!needsLoaderVersion || Boolean(resolvedLoaderVersion)) &&
    !(needsLoaderVersion && loadersQuery.isFetching) &&
    !(needsLoaderVersion && !loadersQuery.isError && loaderVersions.length === 0)

  const offline = versionsQuery.data?.offline || (needsLoaderVersion && loadersQuery.data?.offline)

  const footer = (
    <>
      <Button type="button" onClick={onBack ?? onClose}>
        {onBack ? t('common.back') : t('instances.cancel')}
      </Button>
      <Button
        type="button"
        variant="primary"
        disabled={createMutation.isPending || !canCreate}
        onClick={() =>
          createMutation.mutate({
            name: name.trim() || autoName,
            minecraftVersion,
            loader,
            loaderVersion: needsLoaderVersion ? resolvedLoaderVersion : undefined,
            memoryMaxMb: settingsQuery.data?.defaultMemoryMaxMb ?? 2048,
            jvmArgs: settingsQuery.data?.defaultJvmArgs ?? [],
            icon: icon
              ? { bytes: icon.bytes, originalName: icon.originalName }
              : undefined,
            iconPreset: icon ? undefined : iconPreset,
          })
        }
      >
        {createMutation.isPending ? t('instances.creating') : t('instances.finish')}
      </Button>
    </>
  )

  return (
    <>
      <Dialog
      open={open}
      title={title ?? t('instances.create')}
      onClose={() => {
        if (
          createMutation.isPending ||
          iconOpen ||
          versionPickOpen ||
          loaderPickOpen ||
          loaderVersionPickOpen ||
          versionInfoOpen
        ) return
        onClose()
      }}
      dismissible={!createMutation.isPending}
      footer={footer}
      size="lg"
      scrollable
      fixedHeight
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <div className="flex shrink-0 flex-col items-center gap-2">
            <span className="text-sm font-medium">{t('instances.icon')}</span>
            <button
              type="button"
              className="rounded-[var(--radius-md)] outline-none ring-[var(--color-accent)] hover:ring-2 focus-visible:ring-2"
              onClick={() => setIconOpen(true)}
              aria-label={t('instances.iconCustomize')}
            >
              <InstanceIcon previewSrc={icon?.previewUrl} preset={iconPreset} size="lg" />
            </button>
            <span className="text-xs text-[var(--color-text-muted)]">
              {t('instances.iconChangePreset')}
            </span>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <TextField
              label={t('instances.name')}
              value={name}
              placeholder={autoName}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
            />
            <ListPickField
              label={t('instances.loader')}
              valueLabel={t(`instances.loader.${loader}`)}
              compact
              onClick={() => setLoaderPickOpen(true)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <h3 className="text-sm font-medium text-[var(--color-text)]">{t('instances.version')}</h3>
            <button
              type="button"
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
              aria-label={t('instances.versionInfo.infoAria')}
              onClick={() => setVersionInfoOpen(true)}
            >
              <IconInfoCircle size={16} stroke={1.7} />
            </button>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="px-2"
            disabled={refreshMutation.isPending}
            onClick={() => refreshMutation.mutate()}
          >
            <IconRefresh size={16} stroke={1.75} />
            {t('instances.refreshVersions')}
          </Button>
        </div>

        {offline ? (
          <p className="rounded-[var(--radius-sm)] bg-[var(--color-accent-soft)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
            {t('instances.versionsOffline')}
          </p>
        ) : null}

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
          <>
            <ListPickField
              valueLabel={minecraftVersion || t('instances.pickVersion')}
              disabled={versionsQuery.isLoading}
              compact
              onClick={() => setVersionPickOpen(true)}
            />
          </>
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

        {createMutation.isError ? (
          <p className="text-sm text-[var(--color-danger)]">
            {createMutation.error instanceof Error
              ? createMutation.error.message
              : t('launch.error.generic')}
          </p>
        ) : null}
      </div>
      </Dialog>
      <Dialog
        open={versionInfoOpen}
        title={t('instances.versionInfo.title')}
        size="sm"
        backdrop="soft"
        overlayClassName="z-[95]"
        onClose={() => setVersionInfoOpen(false)}
        footer={
          <Button type="button" variant="primary" onClick={() => setVersionInfoOpen(false)}>
            {t('common.close')}
          </Button>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            {t('instances.versionInfo.hint')}
          </p>
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            {t('instances.versionInfo.refreshHint')}
          </p>
          {offline ? (
            <p className="text-xs text-[var(--color-accent)]">{t('instances.versionsOffline')}</p>
          ) : null}
          {versionsQuery.data?.fetchedAt ? (
            <p className="text-xs text-[var(--color-text)]">
              {t('instances.versionInfo.fetchedAt', {
                date: formatFetchedAt(versionsQuery.data.fetchedAt),
              })}
            </p>
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
      <InstanceIconCustomizeDialog
        open={iconOpen}
        preset={iconPreset}
        image={icon}
        onClose={() => setIconOpen(false)}
        onApply={({ preset: nextPreset, image: nextImage }) => {
          setIcon((prev) => {
            if (prev && prev.previewUrl !== nextImage?.previewUrl) {
              URL.revokeObjectURL(prev.previewUrl)
            }
            return nextImage
          })
          setIconPreset(nextPreset)
          setIconOpen(false)
        }}
      />
    </>
  )
}
