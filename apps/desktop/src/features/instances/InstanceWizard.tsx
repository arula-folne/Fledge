import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { IconRefresh } from '@tabler/icons-react'
import type { CreateInstanceInput, Loader } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Select } from '../../components/ui/Select'
import { TextField } from '../../components/ui/TextField'

type Props = {
  open: boolean
  onClose: () => void
  title?: string
}

export function InstanceWizard({ open, onClose, title }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('My Instance')
  const [minecraftVersion, setMinecraftVersion] = useState('')
  const [loader, setLoader] = useState<Loader>('vanilla')
  const [loaderVersion, setLoaderVersion] = useState('')
  const [memoryMaxMb, setMemoryMaxMb] = useState(4096)
  const [includeSnapshots, setIncludeSnapshots] = useState(true)

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })

  const versionsQuery = useQuery({
    queryKey: ['versions-minecraft', includeSnapshots],
    queryFn: () => fledgeApi.versions.listMinecraft({ includeSnapshots }),
    enabled: open,
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
    setStep(0)
    setName('My Instance')
    setLoader('vanilla')
    setLoaderVersion('')
    setMinecraftVersion('')
    setMemoryMaxMb(settingsQuery.data?.defaultMemoryMaxMb ?? 4096)
  }, [open, settingsQuery.data?.defaultMemoryMaxMb])

  useEffect(() => {
    const releases = (versionsQuery.data?.versions ?? []).filter((v) => v.type === 'release')
    const first = releases[0]?.id ?? versionsQuery.data?.versions?.[0]?.id
    if (first && !minecraftVersion) setMinecraftVersion(first)
  }, [versionsQuery.data, minecraftVersion])

  useEffect(() => {
    setLoaderVersion('')
  }, [loader, minecraftVersion])

  useEffect(() => {
    const versions = loadersQuery.data?.versions ?? []
    if (!versions.length) return
    if (loaderVersion && versions.some((v) => v.id === loaderVersion)) return
    const preferred =
      versions.find((v) => v.recommended) ?? versions.find((v) => v.stable) ?? versions[0]
    if (preferred) setLoaderVersion(preferred.id)
  }, [loadersQuery.data, loaderVersion])

  const releaseOptions = useMemo(
    () =>
      (versionsQuery.data?.versions ?? [])
        .filter((v) => v.type === 'release')
        .map((v) => ({ value: v.id, label: v.id })),
    [versionsQuery.data],
  )
  const snapshotOptions = useMemo(
    () =>
      (versionsQuery.data?.versions ?? [])
        .filter((v) => v.type === 'snapshot')
        .map((v) => ({ value: v.id, label: v.id })),
    [versionsQuery.data],
  )

  const loaderVersionOptions = useMemo(
    () =>
      (loadersQuery.data?.versions ?? []).map((v) => ({
        value: v.id,
        label: v.recommended
          ? `${v.version} (${t('instances.loaderRecommended')})`
          : v.stable
            ? `${v.version} (${t('instances.loaderStable')})`
            : v.version,
      })),
    [loadersQuery.data, t],
  )

  const refreshMutation = useMutation({
    mutationFn: async () => {
      await fledgeApi.versions.refresh({ target: 'minecraft' })
      if (loader !== 'vanilla' && minecraftVersion) {
        await fledgeApi.versions.refresh({
          target: loader,
          minecraftVersion,
        })
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['versions-minecraft'] })
      await queryClient.invalidateQueries({ queryKey: ['versions-loaders'] })
    },
  })

  const createMutation = useMutation({
    mutationFn: (input: CreateInstanceInput) => fledgeApi.instances.create(input),
    onSuccess: async (profile) => {
      await fledgeApi.settings.set({ selectedInstanceId: profile.id })
      await queryClient.invalidateQueries({ queryKey: ['instances'] })
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      onClose()
      navigate('/library')
      // ライブラリカード上の進捗へ Java / クライアント準備を流す（起動はしない）
      void fledgeApi.launch.prepare(profile.id).catch(() => {
        // 状態イベントでエラー表示
      })
    },
  })

  const needsLoaderVersion = loader !== 'vanilla'
  const canProceedStep1 =
    Boolean(minecraftVersion) &&
    (!needsLoaderVersion || Boolean(loaderVersion)) &&
    !(needsLoaderVersion && loadersQuery.isFetching) &&
    !(needsLoaderVersion && !loadersQuery.isError && (loadersQuery.data?.versions.length ?? 0) === 0)

  const offline =
    versionsQuery.data?.offline ||
    (needsLoaderVersion && loadersQuery.data?.offline)

  const footer = (
    <>
      {step > 0 ? (
        <Button type="button" onClick={() => setStep((s) => s - 1)}>
          {t('instances.back')}
        </Button>
      ) : (
        <Button type="button" onClick={onClose}>
          {t('instances.cancel')}
        </Button>
      )}
      {step < 2 ? (
        <Button
          type="button"
          variant="primary"
          disabled={step === 1 && !canProceedStep1}
          onClick={() => setStep((s) => s + 1)}
        >
          {t('instances.next')}
        </Button>
      ) : (
        <Button
          type="button"
          variant="primary"
          disabled={
            createMutation.isPending ||
            !name.trim() ||
            !minecraftVersion ||
            (needsLoaderVersion && !loaderVersion)
          }
          onClick={() =>
            createMutation.mutate({
              name: name.trim(),
              minecraftVersion,
              loader,
              loaderVersion: needsLoaderVersion ? loaderVersion : undefined,
              memoryMaxMb,
              jvmArgs: settingsQuery.data?.defaultJvmArgs ?? [],
            })
          }
        >
          {createMutation.isPending ? t('instances.creating') : t('instances.finish')}
        </Button>
      )}
    </>
  )

  return (
    <Dialog open={open} title={title ?? t('instances.create')} onClose={onClose} footer={footer} size="lg">
      {step === 0 ? (
        <TextField label={t('instances.name')} value={name} onChange={(e) => setName(e.target.value)} />
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-[var(--color-text)]">{t('instances.version')}</h3>
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
              <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                <input
                  type="checkbox"
                  checked={includeSnapshots}
                  onChange={(e) => {
                    setMinecraftVersion('')
                    setIncludeSnapshots(e.target.checked)
                  }}
                />
                {t('instances.includeSnapshots')}
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--color-text-muted)]">{t('instances.version')}</span>
                <select
                  value={minecraftVersion}
                  onChange={(e) => setMinecraftVersion(e.target.value)}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
                >
                  {releaseOptions.length ? (
                    <optgroup label={t('instances.versionGroup.release')}>
                      {releaseOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {includeSnapshots && snapshotOptions.length ? (
                    <optgroup label={t('instances.versionGroup.snapshot')}>
                      {snapshotOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
            </>
          )}

          <Select
            label={t('instances.loader')}
            value={loader}
            onChange={(e) => setLoader(e.target.value as Loader)}
            options={[
              { value: 'vanilla', label: t('instances.loader.vanilla') },
              { value: 'fabric', label: t('instances.loader.fabric') },
              { value: 'forge', label: t('instances.loader.forge') },
              { value: 'neoforge', label: t('instances.loader.neoforge') },
            ]}
          />

          {needsLoaderVersion ? (
            loadersQuery.isFetching ? (
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
            ) : loaderVersionOptions.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                {t('instances.loaderVersionsEmpty')}
              </p>
            ) : (
              <Select
                label={t('instances.loaderVersion')}
                value={loaderVersion}
                onChange={(e) => setLoaderVersion(e.target.value)}
                options={loaderVersionOptions}
              />
            )
          ) : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--color-text-muted)]">{t('instances.memory')}</span>
            <input
              type="range"
              min={1024}
              max={16384}
              step={512}
              value={memoryMaxMb}
              onChange={(e) => setMemoryMaxMb(Number(e.target.value))}
            />
            <div className="flex items-center justify-between">
              <span>{memoryMaxMb} MB</span>
              <Button type="button" variant="ghost" onClick={() => setMemoryMaxMb(4096)}>
                {t('instances.recommendedMemory')}
              </Button>
            </div>
          </label>
        </div>
      ) : null}

      {createMutation.isError ? (
        <p className="mt-3 text-sm text-[var(--color-danger)]">{t('launch.error.generic')}</p>
      ) : null}
    </Dialog>
  )
}
