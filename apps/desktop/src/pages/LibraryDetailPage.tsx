import { Suspense, lazy, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
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
  IconSettings,
  IconTrash,
  IconWorld,
} from '@tabler/icons-react'
import { DEFAULT_INSTANCE_ICON_PRESET, type InstanceIconPreset, type InstanceSubfolder } from '@fledge/shared'
import { fledgeApi } from '../api/fledgeApi'
import { RouteErrorBoundary } from '../components/RouteErrorBoundary'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Dialog } from '../components/ui/Dialog'
import { TextField } from '../components/ui/TextField'
import { MemorySnapSlider } from '../components/ui/MemorySnapSlider'
import { InstanceIcon } from '../features/instances/InstanceIcon'
import {
  InstanceIconCustomizeDialog,
  sameIconPreset,
  type InstanceIconFilePick,
} from '../features/instances/instanceIconPresets'
import { InstanceLaunchButton } from '../features/instances/InstanceLaunchButton'
import { formatLastPlayed, formatLoaderLabel } from '../features/instances/instanceMeta'
import { parseLibraryTab, writeLibraryTab } from '../navigation/libraryDetailSearch'
import { useUiStore, type LibraryDetailTab } from '../stores/appStores'

/** コンテンツ（Modrinth）周りは詳細ページ本体と分離し、読み込み失敗で全体を落とさない */
const ContentTab = lazy(() =>
  import('../features/content/ContentTab').then((m) => ({ default: m.ContentTab })),
)

type TabId = LibraryDetailTab

const DETAIL_TABS: TabId[] = ['content', 'screenshots', 'files', 'logs']

function isDetailTab(tab: string): tab is TabId {
  return (DETAIL_TABS as string[]).includes(tab)
}

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
      className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-left text-sm transition hover:bg-[var(--color-hover)]/50"
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
        'rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
        active
          ? 'bg-[var(--color-selection)] text-[var(--color-on-selection)]'
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
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const libraryFocus = useUiStore((s) => s.libraryFocus)
  const setLibraryFocus = useUiStore((s) => s.setLibraryFocus)
  const editingInstanceId = useUiStore((s) => s.editingInstanceId)
  const setEditingInstanceId = useUiStore((s) => s.setEditingInstanceId)
  const tab = parseLibraryTab(searchParams.get('tab'))
  const [draft, setDraft] = useState<Draft | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [headerIconOpen, setHeaderIconOpen] = useState(false)
  const [headerIconPreset, setHeaderIconPreset] = useState<InstanceIconPreset>(
    DEFAULT_INSTANCE_ICON_PRESET,
  )
  const [headerIconImage, setHeaderIconImage] = useState<InstanceIconFilePick | null>(null)
  const settingsOpen = editingInstanceId === instanceId

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
    if (libraryFocus?.instanceId !== instanceId) return
    if (!isDetailTab(libraryFocus.tab)) return
    const focusedTab = libraryFocus.tab
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (parseLibraryTab(next.get('tab')) === focusedTab) return prev
        writeLibraryTab(next, focusedTab)
        return next
      },
      { replace: true },
    )
  }, [libraryFocus?.instanceId, libraryFocus?.tab, instanceId, setSearchParams])

  useEffect(() => {
    if (!instanceId) return
    setLibraryFocus({ instanceId, tab })
  }, [instanceId, tab, setLibraryFocus])

  useEffect(() => {
    if (!settingsOpen) setIconOpen(false)
  }, [settingsOpen])

  useEffect(() => {
    return () => {
      const current = useUiStore.getState().libraryFocus
      if (current?.instanceId === instanceId) useUiStore.getState().setLibraryFocus(null)
      if (useUiStore.getState().editingInstanceId === instanceId) {
        useUiStore.getState().setEditingInstanceId(null)
      }
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
      setEditingInstanceId(null)
      await queryClient.invalidateQueries({ queryKey: ['instances'] })
      navigate(`/library/${created.id}`)
    },
  })

  const exportMutation = useMutation({
    mutationFn: (id: string) => fledgeApi.content.exportMrpack(id),
    onSuccess: (savedPath) => {
      if (savedPath) setMessage(t('instances.exported'))
    },
    onError: (err) => setMessage(err instanceof Error ? err.message : String(err)),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => fledgeApi.instances.remove(id),
    onSuccess: async () => {
      setEditingInstanceId(null)
      await queryClient.invalidateQueries({ queryKey: ['instances'] })
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      navigate('/')
    },
  })

  const iconMutation = useMutation({
    mutationFn: async (next: { preset: InstanceIconPreset; image: InstanceIconFilePick | null }) => {
      if (!instance) throw new Error('no instance')
      if (next.image) {
        return fledgeApi.instances.update(instance.id, {
          icon: { bytes: next.image.bytes, originalName: next.image.originalName },
          iconPreset: next.preset,
        })
      }
      return fledgeApi.instances.update(instance.id, {
        icon: null,
        iconPreset: next.preset,
      })
    },
    onSuccess: async () => {
      setHeaderIconOpen(false)
      setHeaderIconImage((prev) => {
        if (prev?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(prev.previewUrl)
        return null
      })
      await queryClient.invalidateQueries({ queryKey: ['instances'] })
      if (instance) {
        await queryClient.invalidateQueries({ queryKey: ['instance-icon', instance.id] })
      }
    },
  })

  const openHeaderIconEditor = async () => {
    if (!instance) return
    setHeaderIconPreset(instance.iconPreset ?? DEFAULT_INSTANCE_ICON_PRESET)
    if (instance.iconFile) {
      try {
        const dataUrl = await fledgeApi.instances.getIcon(instance.id)
        if (dataUrl) {
          const res = await fetch(dataUrl)
          const buf = new Uint8Array(await res.arrayBuffer())
          setHeaderIconImage({
            previewUrl: dataUrl,
            bytes: Array.from(buf),
            originalName: instance.iconFile,
          })
        } else {
          setHeaderIconImage(null)
        }
      } catch {
        setHeaderIconImage(null)
      }
    } else {
      setHeaderIconImage(null)
    }
    setHeaderIconOpen(true)
  }

  const openSub = (sub: InstanceSubfolder) => {
    if (!instance) return
    void fledgeApi.instances.openSubfolder(instance.id, sub)
  }

  const closeSettings = () => {
    if (!instance) {
      setEditingInstanceId(null)
      return
    }
    setDraft({
      name: instance.name,
      memoryMaxMb: instance.memory.maxMb,
      jvmArgs: instance.jvmArgs.join(' '),
      iconPreset: instance.iconPreset ?? DEFAULT_INSTANCE_ICON_PRESET,
    })
    setMessage(null)
    setEditingInstanceId(null)
  }

  const changeTab = (next: TabId) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      writeLibraryTab(params, next)
      return params
    })
  }

  if (instanceQuery.isLoading) {
    return <div className="text-[var(--color-text-muted)]">{t('common.loading')}</div>
  }

  if (instanceQuery.isError) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h2 className="text-lg font-semibold">{t('common.loadErrorTitle')}</h2>
        <p className="text-[var(--color-text-muted)]">{t('common.loadErrorBody')}</p>
        <Button type="button" onClick={() => void instanceQuery.refetch()}>
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  if (!instance || !draft) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-[var(--color-text-muted)]">{t('library.notFound')}</p>
        <Link to="/" className="text-[var(--color-accent)] hover:underline">
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
    { id: 'content', label: t('library.tab.content') },
    { id: 'screenshots', label: t('library.tab.screenshots') },
    { id: 'files', label: t('library.tab.files') },
    { id: 'logs', label: t('library.tab.logs') },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex min-h-[4.75rem] shrink-0 flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3">
        <Button
          variant="ghost"
          className="shrink-0 px-1.5 py-1.5"
          title={t('library.backToList')}
          onClick={() => navigate('/')}
        >
          <IconArrowLeft size={16} stroke={1.75} />
        </Button>
        <button
          type="button"
          className="shrink-0 rounded-[var(--radius-md)] outline-none ring-[var(--color-accent)] transition hover:ring-2 focus-visible:ring-2"
          title={t('instances.iconCustomize')}
          aria-label={t('instances.iconCustomize')}
          onClick={() => void openHeaderIconEditor()}
        >
          <InstanceIcon
            instance={instance}
            preset={settingsOpen ? draft.iconPreset : undefined}
            size="md"
          />
        </button>
        <div className="min-w-0 flex-1 self-center">
          <h1 className="truncate text-base font-semibold leading-snug text-[var(--color-text)]">
            {instance.name}
          </h1>
          <p className="mt-0.5 truncate text-xs leading-snug text-[var(--color-text-muted)]">
            {instance.minecraftVersion} · {formatLoaderLabel(instance.loader, t)}
            {' · '}
            {formatLastPlayed(instance.lastPlayedAt, t)}
          </p>
        </div>
        <div className="flex min-h-[2.75rem] shrink-0 items-start gap-1.5">
          <InstanceLaunchButton instanceId={instance.id} showProgress />
          <Button
            variant="ghost"
            className="size-11 shrink-0 rounded-full p-0"
            title={t('library.tab.settings')}
            aria-label={t('library.tab.settings')}
            onClick={() => setEditingInstanceId(instance.id)}
          >
            <IconSettings size={26} stroke={1.6} />
          </Button>
        </div>
      </header>

      <nav className="flex shrink-0 flex-wrap gap-0.5">
        {tabs.map((item) => (
          <TabButton
            key={item.id}
            active={tab === item.id}
            label={item.label}
            onClick={() => changeTab(item.id)}
          />
        ))}
      </nav>

      <div
        className={[
          'min-h-0 flex-1',
          tab === 'content' ? 'overflow-hidden' : 'overflow-auto',
        ].join(' ')}
      >
      {tab === 'content' ? (
        <Suspense
          fallback={<p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>}
        >
          <RouteErrorBoundary
            key={instance.id}
            title={t('content.panelErrorTitle')}
            description={t('content.panelErrorBody')}
            retryLabel={t('common.retry')}
          >
            <div className="h-full min-h-0">
              <ContentTab instance={instance} />
            </div>
          </RouteErrorBoundary>
        </Suspense>
      ) : null}

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

      {tab === 'files' ? (
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
      </div>

      <Dialog
        open={settingsOpen}
        title={t('library.tab.settings')}
        onClose={() => {
          if (headerIconOpen || deleteOpen) return
          closeSettings()
        }}
        size="lg"
        scrollable
        footer={
          <>
            <Button type="button" onClick={closeSettings}>
              {t('instances.cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={!dirty || !draft.name.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {t('instances.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex shrink-0 flex-col items-center gap-2">
              <span className="text-sm font-medium">{t('instances.icon')}</span>
              <button
                type="button"
                className="rounded-[var(--radius-md)] outline-none ring-[var(--color-accent)] hover:ring-2 focus-visible:ring-2"
                title={t('instances.iconCustomize')}
                onClick={() => {
                  void openHeaderIconEditor()
                }}
              >
                <InstanceIcon instance={instance} preset={draft.iconPreset} size="lg" />
              </button>
              <span className="text-xs text-[var(--color-text-muted)]">
                {t('instances.iconChangePreset')}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <TextField
                label={t('instances.name')}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]/40 px-3 py-2 text-sm">
            <div className="text-xs text-[var(--color-text-muted)]">{t('instances.version')}</div>
            <div className="mt-0.5">{instance.minecraftVersion}</div>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {t('library.versionReadonly')}
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]/40 px-3 py-2 text-sm">
            <div className="text-xs text-[var(--color-text-muted)]">{t('instances.loader')}</div>
            <div className="mt-0.5">{formatLoaderLabel(instance.loader, t)}</div>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]/40 px-3 py-2 text-sm">
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
          <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-4">
            <Button
              variant="secondary"
              disabled={exportMutation.isPending}
              onClick={() => exportMutation.mutate(instance.id)}
            >
              <IconPackageExport size={16} stroke={1.75} />
              {exportMutation.isPending ? t('instances.exporting') : t('instances.export')}
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
        </div>
      </Dialog>
      <InstanceIconCustomizeDialog
        open={headerIconOpen}
        preset={headerIconPreset}
        image={headerIconImage}
        onClose={() => {
          setHeaderIconOpen(false)
          setHeaderIconImage((prev) => {
            if (prev?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(prev.previewUrl)
            return null
          })
        }}
        onApply={(next) => {
          setHeaderIconPreset(next.preset)
          setHeaderIconImage(next.image)
          iconMutation.mutate(next)
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
