import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  IconArrowLeft,
  IconCopy,
  IconFolder,
  IconFolderOpen,
  IconPackageExport,
  IconPhoto,
  IconPuzzle,
  IconTrash,
  IconWorld,
} from '@tabler/icons-react'
import { DEFAULT_INSTANCE_ICON_PRESET, type InstanceIconPreset, type InstanceSubfolder } from '@fledge/shared'
import { fledgeApi } from '../api/fledgeApi'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { TextField } from '../components/ui/TextField'
import { MemorySnapSlider } from '../components/ui/MemorySnapSlider'
import { InstanceIcon } from '../features/instances/InstanceIcon'
import { InstanceIconPresetDialog, sameIconPreset } from '../features/instances/instanceIconPresets'
import { InstanceLaunchButton } from '../features/instances/InstanceLaunchButton'
import { formatLastPlayed, formatLoaderLabel } from '../features/instances/instanceMeta'
import { ContentTab } from '../features/content/ContentTab'
import { useUiStore, type LibraryDetailTab } from '../stores/appStores'

type TabId = LibraryDetailTab

type Draft = {
  name: string
  memoryMaxMb: number
  jvmArgs: string
  iconPreset: InstanceIconPreset
}

function FolderButton({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-left text-sm transition duration-200 hover:border-[var(--color-accent)]/35 hover:bg-[var(--color-hover)]/50"
    >
      <span className="text-[var(--color-text-muted)]">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-[var(--radius-sm)] px-3 py-2 text-sm transition duration-150',
        active
          ? 'bg-[var(--color-selection-soft)] font-medium text-[var(--color-selection)]'
          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

export default function LibraryDetailPage() {
  const { instanceId = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const libraryFocus = useUiStore((s) => s.libraryFocus)
  const setLibraryFocus = useUiStore((s) => s.setLibraryFocus)
  const [tab, setTab] = useState<TabId>(() =>
    libraryFocus?.instanceId === instanceId ? libraryFocus.tab : 'overview',
  )
  const [draft, setDraft] = useState<Draft | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [iconOpen, setIconOpen] = useState(false)
  const [iconDraft, setIconDraft] = useState<InstanceIconPreset>(DEFAULT_INSTANCE_ICON_PRESET)

  const instanceQuery = useQuery({
    queryKey: ['instances', instanceId],
    queryFn: () => fledgeApi.instances.get(instanceId),
    enabled: Boolean(instanceId),
  })

  const screenshotsQuery = useQuery({
    queryKey: ['content-media', instanceId, 'screenshots'],
    queryFn: () => fledgeApi.content.listMedia(instanceId, 'screenshots'),
    enabled: Boolean(instanceId) && tab === 'screenshots',
  })

  const logsQuery = useQuery({
    queryKey: ['content-media', instanceId, 'logs'],
    queryFn: () => fledgeApi.content.listMedia(instanceId, 'logs'),
    enabled: Boolean(instanceId) && tab === 'logs',
  })

  const instance = instanceQuery.data ?? null

  useEffect(() => {
    if (libraryFocus?.instanceId === instanceId && libraryFocus.tab !== tab) {
      setTab(libraryFocus.tab)
    }
  }, [libraryFocus?.instanceId, libraryFocus?.tab, instanceId, tab])

  useEffect(() => {
    if (!instanceId) return
    setLibraryFocus({ instanceId, tab })
  }, [instanceId, tab, setLibraryFocus])

  useEffect(() => {
    if (tab !== 'settings') setIconOpen(false)
  }, [tab])

  useEffect(() => {
    return () => {
      const current = useUiStore.getState().libraryFocus
      if (current?.instanceId === instanceId) useUiStore.getState().setLibraryFocus(null)
    }
  }, [instanceId])

  useEffect(() => {
    if (!instance) return
    setDraft({
      name: instance.name,
      memoryMaxMb: instance.memory.maxMb,
      jvmArgs: instance.jvmArgs.join(' '),
      iconPreset: instance.iconPreset ?? DEFAULT_INSTANCE_ICON_PRESET,
    })
  }, [instance?.id, instance?.updatedAt, instance?.name, instance?.memory.maxMb, instance?.jvmArgs])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!instance || !draft) throw new Error('no draft')
      return fledgeApi.instances.update(instance.id, {
        name: draft.name.trim(),
        memory: { ...instance.memory, maxMb: draft.memoryMaxMb },
        jvmArgs: draft.jvmArgs
          .split(/\s+/)
          .map((s) => s.trim())
          .filter(Boolean),
        iconPreset: instance.iconFile ? instance.iconPreset : draft.iconPreset,
      })
    },
    onSuccess: async () => {
      setMessage(t('instances.saved'))
      await queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
    onError: (err) => {
      setMessage(err instanceof Error ? err.message : String(err))
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => fledgeApi.instances.duplicate(id),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['instances'] })
      navigate(`/library/${created.id}`)
    },
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => fledgeApi.instances.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['instances'] })
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      navigate('/library')
    },
  })

  const openSub = (sub: InstanceSubfolder) => {
    if (!instance) return
    void fledgeApi.instances.openSubfolder(instance.id, sub)
  }

  if (instanceQuery.isLoading) {
    return <div className="text-[var(--color-text-muted)]">{t('common.loading')}</div>
  }

  if (!instance || !draft) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-[var(--color-text-muted)]">{t('library.notFound')}</p>
        <Link to="/library" className="text-[var(--color-accent)] hover:underline">
          {t('library.backToList')}
        </Link>
      </div>
    )
  }

  const dirty =
    draft.name.trim() !== instance.name ||
    draft.memoryMaxMb !== instance.memory.maxMb ||
    draft.jvmArgs.trim() !== instance.jvmArgs.join(' ') ||
    (!instance.iconFile &&
      !sameIconPreset(draft.iconPreset, instance.iconPreset ?? DEFAULT_INSTANCE_ICON_PRESET))

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: t('library.tab.overview') },
    { id: 'content', label: t('library.tab.content') },
    { id: 'screenshots', label: t('library.tab.screenshots') },
    { id: 'logs', label: t('library.tab.logs') },
    { id: 'settings', label: t('library.tab.settings') },
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" className="px-2" onClick={() => navigate('/library')}>
          <IconArrowLeft size={18} stroke={1.75} />
          {t('library.backToList')}
        </Button>
      </div>

      <header className="flex flex-wrap items-start gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <InstanceIcon
          instance={instance}
          preset={tab === 'settings' ? draft.iconPreset : undefined}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold">{instance.name}</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {instance.minecraftVersion} · {formatLoaderLabel(instance.loader, t)}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {t('instances.lastPlayed')}: {formatLastPlayed(instance.lastPlayedAt, t)}
          </p>
        </div>
        <InstanceLaunchButton instanceId={instance.id} size="lg" showProgress />
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-[var(--color-border)] pb-2">
        {tabs.map((item) => (
          <TabButton
            key={item.id}
            active={tab === item.id}
            label={item.label}
            onClick={() => setTab(item.id)}
          />
        ))}
      </nav>

      {message && tab === 'settings' ? (
        <p className="text-sm text-[var(--color-text-muted)]">{message}</p>
      ) : null}

      {tab === 'overview' ? (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-[var(--color-text-muted)]">
              {t('library.section.folders')}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <FolderButton
                label={t('instances.openFolder')}
                icon={<IconFolderOpen size={18} stroke={1.75} />}
                onClick={() => void fledgeApi.instances.openFolder(instance.id)}
              />
              <FolderButton
                label={t('instances.openMods')}
                icon={<IconPuzzle size={18} stroke={1.75} />}
                onClick={() => openSub('mods')}
              />
              <FolderButton
                label={t('instances.openResourcepacks')}
                icon={<IconPhoto size={18} stroke={1.75} />}
                onClick={() => openSub('resourcepacks')}
              />
              <FolderButton
                label={t('instances.openShaderpacks')}
                icon={<IconPhoto size={18} stroke={1.75} />}
                onClick={() => openSub('shaderpacks')}
              />
              <FolderButton
                label={t('instances.openSaves')}
                icon={<IconWorld size={18} stroke={1.75} />}
                onClick={() => openSub('saves')}
              />
              <FolderButton
                label={t('instances.openLogs')}
                icon={<IconFolder size={18} stroke={1.75} />}
                onClick={() => openSub('logs')}
              />
              <FolderButton
                label={t('instances.openScreenshots')}
                icon={<IconPhoto size={18} stroke={1.75} />}
                onClick={() => openSub('screenshots')}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-[var(--color-text-muted)]">
              {t('library.section.actions')}
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => setMessage(t('library.exportSoon'))}
              >
                <IconPackageExport size={16} stroke={1.75} />
                {t('instances.export')}
              </Button>
              <Button
                variant="secondary"
                disabled={duplicateMutation.isPending}
                onClick={() => duplicateMutation.mutate(instance.id)}
              >
                <IconCopy size={16} stroke={1.75} />
                {t('instances.duplicate')}
              </Button>
              <Button
                variant="danger"
                disabled={removeMutation.isPending}
                onClick={() => setDeleteOpen(true)}
              >
                <IconTrash size={16} stroke={1.75} />
                {t('instances.delete')}
              </Button>
            </div>
            {message ? <p className="text-sm text-[var(--color-text-muted)]">{message}</p> : null}
          </section>
        </div>
      ) : null}

      {tab === 'content' ? <ContentTab instance={instance} /> : null}

      {tab === 'screenshots' ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => openSub('screenshots')}>
              <IconFolderOpen size={16} stroke={1.75} />
              {t('instances.openScreenshots')}
            </Button>
          </div>
          {(screenshotsQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t('library.screenshotsEmpty')}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {(screenshotsQuery.data ?? []).map((file) => (
                <li
                  key={file.path}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm"
                >
                  <div className="truncate font-medium">{file.name}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">{file.mtime}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'logs' ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => openSub('logs')}>
              <IconFolderOpen size={16} stroke={1.75} />
              {t('instances.openLogs')}
            </Button>
          </div>
          {(logsQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t('library.logsEmpty')}</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)]">
              {(logsQuery.data ?? []).map((file) => (
                <li key={file.path} className="px-4 py-2.5 text-sm">
                  <div className="font-medium">{file.name}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">{file.mtime}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'settings' ? (
        <div className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="flex items-start gap-4">
            <div className="flex shrink-0 flex-col items-center gap-2">
              <span className="text-sm font-medium">{t('instances.icon')}</span>
              <button
                type="button"
                className="rounded-[var(--radius-md)] outline-none ring-[var(--color-accent)] hover:ring-2 focus-visible:ring-2 disabled:cursor-default disabled:hover:ring-0"
                disabled={Boolean(instance.iconFile)}
                title={
                  instance.iconFile ? t('instances.iconCustomNote') : t('instances.iconChangePreset')
                }
                onClick={() => {
                  setIconDraft(draft.iconPreset)
                  setIconOpen(true)
                }}
              >
                <InstanceIcon instance={instance} preset={draft.iconPreset} size="lg" />
              </button>
              {instance.iconFile ? (
                <p className="text-xs text-[var(--color-text-muted)]">{t('instances.iconCustomShort')}</p>
              ) : (
                <span className="text-xs text-[var(--color-text-muted)]">
                  {t('instances.iconChangePreset')}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <TextField
                label={t('instances.name')}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
          </div>
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)]/40 px-3 py-2 text-sm">
            <div className="text-xs text-[var(--color-text-muted)]">{t('instances.version')}</div>
            <div className="mt-0.5">{instance.minecraftVersion}</div>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {t('library.versionReadonly')}
            </p>
          </div>
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)]/40 px-3 py-2 text-sm">
            <div className="text-xs text-[var(--color-text-muted)]">{t('instances.loader')}</div>
            <div className="mt-0.5">{formatLoaderLabel(instance.loader, t)}</div>
          </div>
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)]/40 px-3 py-2 text-sm">
            <div className="text-xs text-[var(--color-text-muted)]">{t('instances.java')}</div>
            <div className="mt-0.5">
              {instance.java.strategy === 'auto'
                ? t('instances.javaAuto')
                : (instance.java.path ?? t('instances.javaAuto'))}
            </div>
          </div>
          <MemorySnapSlider
            label={t('instances.memory')}
            value={draft.memoryMaxMb}
            onChange={(memoryMaxMb) => setDraft({ ...draft, memoryMaxMb })}
          />
          <TextField
            label={t('instances.jvmArgs')}
            value={draft.jvmArgs}
            onChange={(e) => setDraft({ ...draft, jvmArgs: e.target.value })}
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              disabled={!dirty || !draft.name.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {t('instances.save')}
            </Button>
          </div>
        </div>
      ) : null}
      <InstanceIconPresetDialog
        open={iconOpen && !instance.iconFile}
        value={iconDraft}
        onChange={setIconDraft}
        onClose={() => setIconOpen(false)}
        onApply={() => {
          setDraft({ ...draft, iconPreset: iconDraft })
          setIconOpen(false)
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        title={t('instances.delete')}
        body={t('instances.deleteConfirm')}
        confirmLabel={t('instances.delete')}
        pending={removeMutation.isPending}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          removeMutation.mutate(instance.id, {
            onSettled: () => setDeleteOpen(false),
          })
        }}
      />
    </div>
  )
}
