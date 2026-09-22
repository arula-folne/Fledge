import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { IconCheck, IconPencil, IconPlus, IconUpload } from '@tabler/icons-react'
import { MAX_UPLOADED_SKINS, type CapeEntry, type SkinEntry, type SkinModel, type Settings } from '@fledge/shared'
import { fledgeApi } from '../api/fledgeApi'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { TextField } from '../components/ui/TextField'
import { SkinPreview } from '../components/skin/SkinPreview'
import { CapeThumb } from '../components/skin/CapeThumb'
import { SkinCachedThumb, skinThumbQueryKey } from '../components/skin/SkinCachedThumb'
import { defaultSkinTextureUrl, defaultSkinThumbUrl } from '../components/skin/defaultSkinUrls'
import { renderSkinThumbDataUrl } from '../components/skin/skinSnapshot'
import { isTauriApp, localFileAssetUrl, preferElectronDefaultProtocol } from '../components/skin/skinUrls'
import {
  patchSelectedSkinSettings,
  prefetchAccountFaceFromLocalSkin,
  resolveSkinModel,
} from '../features/skin/optimisticSkinSelection'

export default function SkinPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [registerOpen, setRegisterOpen] = useState(false)
  const [editing, setEditing] = useState<SkinEntry | null>(null)
  const [editingCapeOnly, setEditingCapeOnly] = useState<SkinEntry | null>(null)
  const skinListRef = useRef<HTMLElement>(null)

  const scrollToSkinList = () => {
    requestAnimationFrame(() => {
      skinListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })
  const skinsQuery = useQuery({
    queryKey: ['skins'],
    queryFn: () => fledgeApi.skins.list(),
  })

  const selectedId = settingsQuery.data?.selectedSkinId
  const defaults = (skinsQuery.data ?? []).filter((s) => s.source === 'default')
  const uploads = (skinsQuery.data ?? []).filter((s) => s.source === 'upload')
  const canAdd = uploads.length < MAX_UPLOADED_SKINS
  const selectedSkin =
    (skinsQuery.data ?? []).find((s) => s.id === selectedId) ?? defaults[0] ?? null

  const selectMutation = useMutation({
    mutationFn: (input: { skinId: string; model?: SkinModel }) => fledgeApi.skins.select(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['settings'] })
      const previous = queryClient.getQueryData<Settings>(['settings'])
      const skins = skinsQuery.data ?? []
      const model = resolveSkinModel(skins, input.skinId, input.model)
      patchSelectedSkinSettings(queryClient, input.skinId, model)
      void prefetchAccountFaceFromLocalSkin(queryClient, input.skinId, skins)
      return { previous }
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['settings'], ctx.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] })
      void queryClient.invalidateQueries({ queryKey: ['account-face'] })
    },
  })

  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: () => fledgeApi.auth.session(),
  })
  const loggedIn = Boolean(sessionQuery.data?.account)

  const capesQuery = useQuery({
    queryKey: ['capes'],
    enabled: loggedIn,
    queryFn: () => fledgeApi.capes.list(),
  })

  const capes = capesQuery.data ?? []
  const skinCapeIds = settingsQuery.data?.skinCapeIds ?? {}
  const preferredCapeId =
    selectedId && Object.prototype.hasOwnProperty.call(skinCapeIds, selectedId)
      ? skinCapeIds[selectedId]
      : undefined
  const previewCapeId =
    preferredCapeId !== undefined
      ? preferredCapeId
      : (capes.find((c) => c.active)?.id ?? null)
  const previewCapeUrl = previewCapeId
    ? (capes.find((c) => c.id === previewCapeId)?.url ?? null)
    : null

  const persistSkinCape = useMutation({
    mutationFn: async (input: { skinId: string; capeId: string | null }) => {
      const prev = queryClient.getQueryData<Settings>(['settings'])
      const nextMap = { ...(prev?.skinCapeIds ?? {}), [input.skinId]: input.capeId }
      if (prev) {
        queryClient.setQueryData(['settings'], { ...prev, skinCapeIds: nextMap })
      }
      const capesCache = queryClient.getQueryData<CapeEntry[]>(['capes'])
      if (capesCache) {
        queryClient.setQueryData(
          ['capes'],
          capesCache.map((c) => ({
            ...c,
            active: input.capeId !== null && c.id === input.capeId,
          })),
        )
      }
      const next = await fledgeApi.settings.set({ skinCapeIds: nextMap })
      queryClient.setQueryData(['settings'], next)
      // Mojang 反映は待たない（選択 UI をブロックしない）
      if (next.selectedSkinId === input.skinId && loggedIn) {
        void fledgeApi.capes
          .select(input.capeId)
          .then((list) => queryClient.setQueryData(['capes'], list))
          .catch(() => {})
      }
      return next
    },
  })

  const applySkinSelection = (skinId: string, model?: SkinModel) => {
    selectMutation.mutate({ skinId, model })
    if (!loggedIn) return
    const map = queryClient.getQueryData<Settings>(['settings'])?.skinCapeIds ?? {}
    if (!Object.prototype.hasOwnProperty.call(map, skinId)) return
    void fledgeApi.capes
      .select(map[skinId] ?? null)
      .then((list) => queryClient.setQueryData(['capes'], list))
      .catch(() => {})
  }

  const uploadMutation = useMutation({
    mutationFn: (input: {
      name: string
      model: SkinModel
      bytes: number[]
      originalName: string
      thumbDataUrl?: string
    }) => fledgeApi.skins.upload(input),
    onSuccess: async (skin) => {
      const skins = [...(skinsQuery.data ?? []), skin]
      patchSelectedSkinSettings(queryClient, skin.id, skin.model)
      void prefetchAccountFaceFromLocalSkin(queryClient, skin.id, skins)
      void fledgeApi.skins.select({ skinId: skin.id, model: skin.model })
      await queryClient.invalidateQueries({ queryKey: ['skins'] })
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      await queryClient.invalidateQueries({ queryKey: ['skin-thumb', skin.id] })
      await queryClient.invalidateQueries({ queryKey: ['account-face'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (input: {
      id: string
      name?: string
      model?: SkinModel
      bytes?: number[]
      originalName?: string
    }) => fledgeApi.skins.update(input),
    onSuccess: async (_skin, input) => {
      await queryClient.invalidateQueries({ queryKey: ['skins'] })
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      await queryClient.invalidateQueries({ queryKey: ['account-face'] })
      if (input.bytes || input.model) {
        await queryClient.removeQueries({ queryKey: ['skin-data', input.id] })
        await queryClient.removeQueries({ queryKey: ['skin-thumb', input.id] })
      }
    },
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => fledgeApi.skins.remove(id),
    onSuccess: async (_void, id) => {
      await queryClient.invalidateQueries({ queryKey: ['skins'] })
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      await queryClient.invalidateQueries({ queryKey: ['account-face'] })
      await queryClient.removeQueries({ queryKey: ['skin-data', id] })
      await queryClient.removeQueries({ queryKey: ['skin-thumb', id] })
    },
  })

  return (
    <div className="flex h-full min-h-0 flex-col gap-2" data-fledge-tutorial="tutorial-skin">
      <h1 className="text-lg font-semibold">{t('skin.title')}</h1>
      <p className="text-xs text-[var(--color-text-muted)]">{t('skin.playHint')}</p>
      {selectMutation.isError ? (
        <p className="text-xs text-[var(--color-danger)]">
          {selectMutation.error instanceof Error
            ? selectMutation.error.message
            : t('skin.loginToApply')}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <aside className="relative z-10 flex min-h-0 flex-col items-center overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
          <p className="mb-0.5 shrink-0 text-xs font-medium text-[var(--color-text)]">{t('skin.current')}</p>
          <p className="mb-2 shrink-0 text-[10px] leading-tight text-[var(--color-text-muted)]">
            {t('skin.dragHint')}
          </p>
          <div className="relative isolate flex min-h-[220px] w-full flex-1 overflow-hidden rounded-[var(--radius-md)] lg:min-h-0 lg:max-h-[min(420px,55vh)]">
            {selectedSkin ? (
              <SkinEntryPreview
                skin={selectedSkin}
                pose="full"
                interactive
                width={280}
                height={420}
                className="h-full w-full rounded-[var(--radius-md)]"
                model={selectedSkin.model}
                capeUrl={previewCapeUrl}
              />
            ) : (
              <div className="h-full min-h-[220px] w-full animate-pulse rounded-[var(--radius-md)] bg-[var(--color-border)]/40" />
            )}
          </div>

          {selectedSkin ? (
            <div className="mt-2 w-full shrink-0 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-sm font-medium">{selectedSkin.name}</span>
                <span className="rounded-[var(--radius-sm)] bg-[var(--color-selection)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-on-selection)]">
                  {t('skin.using')}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                {selectedSkin.model === 'slim' ? t('skin.model.slim') : t('skin.model.wide')}
              </div>
            </div>
          ) : null}
        </aside>

        <section
          ref={skinListRef}
          className="min-h-0 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
        >
          <h2 className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">
            {t('skin.pick')}
          </h2>

          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold tracking-wide text-[var(--color-text-muted)]">
              {t('skin.mySkin')}
            </p>
            <p className="text-[10px] text-[var(--color-text-muted)]">
              {t('skin.count', { count: uploads.length, max: MAX_UPLOADED_SKINS })}
            </p>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {uploads.map((skin) => {
              const selected = selectedId === skin.id
              return (
                <SkinCard
                  key={skin.id}
                  selected={selected}
                  title={skin.name}
                  subtitle={
                    selected
                      ? t('skin.using')
                      : skin.model === 'slim'
                        ? t('skin.model.slim')
                        : t('skin.model.wide')
                  }
                  onClick={() => applySkinSelection(skin.id, skin.model)}
                  onEdit={() => setEditing(skin)}
                >
                  <SkinEntryThumb skin={skin} />
                </SkinCard>
              )
            })}
            {canAdd ? (
              <SkinCard
                selected={false}
                title={t('skin.add')}
                subtitle={t('skin.mySkinEmptyHint')}
                onClick={() => setRegisterOpen(true)}
                dashed
              >
                <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-[var(--color-text-muted)]">
                  <IconPlus size={22} stroke={1.6} />
                  <span className="text-[11px]">{t('skin.add')}</span>
                </div>
              </SkinCard>
            ) : null}
          </div>
          {!canAdd ? (
            <p className="-mt-2 mb-3 text-[11px] text-[var(--color-text-muted)]">
              {t('skin.limitReached', { max: MAX_UPLOADED_SKINS })}
            </p>
          ) : null}

          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-[var(--color-text-muted)]">
            {t('skin.sectionDefaults')}
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {defaults.map((skin) => {
              const selected = selectedId === skin.id
              return (
                <SkinCard
                  key={skin.id}
                  selected={selected}
                  title={skin.name}
                  subtitle={
                    selected
                      ? t('skin.using')
                      : skin.model === 'slim'
                        ? t('skin.model.slim')
                        : t('skin.model.wide')
                  }
                  onClick={() => applySkinSelection(skin.id, skin.model)}
                  onEdit={() => setEditingCapeOnly(skin)}
                >
                  <SkinEntryThumb skin={skin} />
                </SkinCard>
              )
            })}
          </div>
        </section>
      </div>

      <RegisterSkinDialog
        open={registerOpen}
        usedNames={uploads.map((s) => s.name)}
        saving={uploadMutation.isPending}
        onClose={() => setRegisterOpen(false)}
        onSave={async (file, name, model) => {
          const buffer = new Uint8Array(await file.arrayBuffer())
          const blobUrl = URL.createObjectURL(file)
          let thumbDataUrl: string | undefined
          try {
            thumbDataUrl = await renderSkinThumbDataUrl(blobUrl, model)
          } catch (err) {
            console.error('Skin thumb render failed:', err)
          } finally {
            URL.revokeObjectURL(blobUrl)
          }
          await uploadMutation.mutateAsync({
            name,
            model,
            bytes: Array.from(buffer),
            originalName: file.name,
            thumbDataUrl,
          })
          setRegisterOpen(false)
          scrollToSkinList()
        }}
      />

      {editingCapeOnly ? (
        <EditCapeDialog
          skin={editingCapeOnly}
          capes={capes}
          capeId={
            Object.prototype.hasOwnProperty.call(skinCapeIds, editingCapeOnly.id)
              ? skinCapeIds[editingCapeOnly.id]
              : null
          }
          loggedIn={loggedIn}
          loading={capesQuery.isLoading}
          onClose={() => setEditingCapeOnly(null)}
          onSelectCape={(capeId) => {
            persistSkinCape.mutate(
              { skinId: editingCapeOnly.id, capeId },
              {
                onError: () => {
                  /* shown via mutation if needed */
                },
              },
            )
          }}
        />      ) : null}

      {editing ? (
        <EditSkinDialog
          skin={editing}
          usedNames={uploads.filter((s) => s.id !== editing.id).map((s) => s.name)}
          saving={updateMutation.isPending || removeMutation.isPending}
          capes={capes}
          capeId={
            Object.prototype.hasOwnProperty.call(skinCapeIds, editing.id)
              ? skinCapeIds[editing.id]
              : null
          }
          loggedIn={loggedIn}
          capesLoading={capesQuery.isLoading}
          onSelectCape={(capeId) =>
            persistSkinCape.mutate({ skinId: editing.id, capeId })
          }
          onClose={() => setEditing(null)}
          onSave={async (name, model, file) => {
            let bytes: number[] | undefined
            let originalName: string | undefined
            let previewForThumb: string | undefined
            if (file) {
              const buffer = new Uint8Array(await file.arrayBuffer())
              bytes = Array.from(buffer)
              originalName = file.name
              previewForThumb = URL.createObjectURL(file)
            }
            try {
              await updateMutation.mutateAsync({
                id: editing.id,
                name,
                model,
                bytes,
                originalName,
              })
              const thumbSource =
                previewForThumb ?? (await fledgeApi.skins.getDataUrl(editing.id)) ?? undefined
              if (thumbSource && (file || model !== editing.model)) {
                try {
                  const thumb = await renderSkinThumbDataUrl(thumbSource, model)
                  await fledgeApi.skins.saveThumb(editing.id, model, thumb)
                  queryClient.setQueryData(skinThumbQueryKey(editing.id, model), thumb)
                } catch (err) {
                  console.error('Skin thumb render failed:', err)
                }
              }
              if (selectedId === editing.id) {
                applySkinSelection(editing.id, model)
                if (file) {
                  void prefetchAccountFaceFromLocalSkin(
                    queryClient,
                    editing.id,
                    (skinsQuery.data ?? []).map((s) =>
                      s.id === editing.id ? { ...s, model } : s,
                    ),
                  )
                }
              }
              setEditing(null)
              scrollToSkinList()
            } finally {
              if (previewForThumb) URL.revokeObjectURL(previewForThumb)
            }
          }}
          onRemove={async () => {
            await removeMutation.mutateAsync(editing.id)
            setEditing(null)
          }}
        />
      ) : null}
    </div>
  )
}

function SkinCard({
  selected,
  title,
  subtitle,
  onClick,
  onEdit,
  dashed,
  children,
}: {
  selected: boolean
  title: string
  subtitle: string
  onClick: () => void
  onEdit?: () => void
  dashed?: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div
      className={[
        'relative flex aspect-[2.5/3] w-full min-w-0 flex-col overflow-hidden rounded-[var(--radius-md)] border transition',
        selected
          ? 'border-[var(--color-selection)] ring-2 ring-[var(--color-selection)]/35'
          : dashed
            ? 'border-dashed border-[var(--color-border)] hover:border-[var(--color-accent)]/60'
            : 'border-[var(--color-border)] hover:border-[var(--color-accent)]/50',
      ].join(' ')}
    >
      <button type="button" onClick={onClick} className="flex min-h-0 flex-1 flex-col text-left">
        <div
          className="min-h-0 w-full flex-1 overflow-hidden"
          style={{
            background:
              'radial-gradient(ellipse at 50% 38%, color-mix(in srgb, var(--color-accent-soft) 75%, transparent), transparent 58%), linear-gradient(180deg, color-mix(in srgb, var(--color-border) 22%, var(--color-surface)), var(--color-bg))',
          }}
        >
          {children}
        </div>
      </button>
      {selected ? (
        <span className="pointer-events-none absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-[var(--radius-sm)] bg-[var(--color-selection)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--color-on-selection)]">
          <IconCheck size={11} stroke={2.2} />
          {t('skin.using')}
        </span>
      ) : null}
      <div className="flex shrink-0 items-center gap-1 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1">
        <button type="button" onClick={onClick} className="min-w-0 flex-1 text-left">
          <div className="truncate text-xs font-medium">{title}</div>
          <div className="truncate text-[10px] text-[var(--color-text-muted)]">{subtitle}</div>
        </button>
        {onEdit ? (
          <button
            type="button"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
            aria-label={t('skin.edit')}
            onClick={onEdit}
          >
            <IconPencil size={18} stroke={1.8} />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function nextDefaultSkinName(usedNames: string[], prefix: string): string {
  const used = new Set<number>()
  const re = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`)
  for (const name of usedNames) {
    const match = re.exec(name)
    if (match) used.add(Number(match[1]))
  }
  let n = 1
  while (used.has(n)) n += 1
  return `${prefix}${n}`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function useSkinImageUrl(skin: SkinEntry, enabled = true): string | undefined {
  const tauri = isTauriApp()
  const electronDefault = preferElectronDefaultProtocol(skin)
  const bundledTexture =
    skin.source === 'default' ? defaultSkinTextureUrl(skin.id) : undefined

  // data URL を優先（skinview3d の読み込みが確実）。WarmupHost が裏で先に埋める。
  // 既定スキンは Vite 同梱テクスチャを最優先（製品版で resources/skins が無くても表示できる）。
  const dataQuery = useQuery({
    queryKey: ['skin-data', skin.id],
    queryFn: () => fledgeApi.skins.getDataUrl(skin.id),
    enabled: enabled && !electronDefault && !bundledTexture,
    staleTime: 30 * 60_000,
    gcTime: 15 * 60_000,
  })

  const pathQuery = useQuery({
    queryKey: ['skin-path', skin.id],
    queryFn: () => fledgeApi.skins.resolvePath(skin.id),
    enabled: enabled && tauri && !dataQuery.data && !electronDefault && !bundledTexture,
    staleTime: 30 * 60_000,
    gcTime: 15 * 60_000,
  })
  const assetUrl = localFileAssetUrl(pathQuery.data)

  return bundledTexture ?? dataQuery.data ?? assetUrl ?? electronDefault ?? undefined
}

function SkinEntryThumb({ skin }: { skin: SkinEntry }) {
  const bundled = skin.source === 'default' ? defaultSkinThumbUrl(skin.id) : undefined
  if (bundled) {
    return (
      <img
        src={bundled}
        alt=""
        className="h-full w-full object-contain"
        draggable={false}
        decoding="async"
      />
    )
  }
  return <SkinCachedThumb skinId={skin.id} model={skin.model} className="h-full w-full" />
}

function SkinEntryPreview({
  skin,
  pose,
  width,
  height,
  model: modelOverride,
  interactive = false,
  className,
  zoom,
  capeUrl,
}: {
  skin: SkinEntry
  pose: 'bust' | 'full'
  width: number
  height: number
  model?: SkinModel
  interactive?: boolean
  className?: string
  zoom?: number
  capeUrl?: string | null
}) {
  const skinUrl = useSkinImageUrl(skin)

  return (
    <SkinPreview
      skinUrl={skinUrl}
      model={modelOverride ?? skin.model}
      pose={pose}
      interactive={interactive}
      width={width}
      height={height}
      className={className}
      zoom={zoom}
      capeUrl={capeUrl}
    />
  )
}

function RegisterSkinDialog({
  open,
  usedNames,
  saving,
  onClose,
  onSave,
}: {
  open: boolean
  usedNames: string[]
  saving: boolean
  onClose: () => void
  onSave: (file: File, name: string, model: SkinModel) => Promise<void>
}) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [model, setModel] = useState<SkinModel>('wide')
  const [error, setError] = useState<string | null>(null)
  const defaultName = nextDefaultSkinName(usedNames, t('skin.mySkin'))

  useEffect(() => {
    if (!open) {
      setFile(null)
      setName('')
      setModel('wide')
      setError(null)
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const applyFile = (next: File) => {
    setFile(next)
    setError(null)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(next)
    })
  }

  const canSave = Boolean(file) && !saving

  return (
    <Dialog
      open={open}
      title={t('skin.register')}
      subtitle={t('skin.registerHint')}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!canSave}
            onClick={() => {
              if (!file) return
              void onSave(file, name.trim() || defaultName, model).catch((err: unknown) => {
                setError(err instanceof Error ? err.message : t('skin.limitReached', { max: MAX_UPLOADED_SKINS }))
              })
            }}
          >
            {saving ? t('common.loading') : t('skin.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex justify-center rounded-[var(--radius-md)] bg-gradient-to-b from-[var(--color-border)]/40 to-transparent py-2">
            {previewUrl ? (
              <SkinPreview
                skinUrl={previewUrl}
                model={model}
                pose="full"
                interactive={false}
                width={128}
                height={200}
                className="rounded-[var(--radius-md)]"
              />
            ) : (
              <button
                type="button"
                className="flex h-[200px] w-[128px] flex-col items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] text-xs text-[var(--color-text-muted)] transition hover:border-[var(--color-accent)]/60"
                onClick={() => fileRef.current?.click()}
              >
                <IconUpload size={22} stroke={1.6} />
                {t('skin.pickFile')}
              </button>
            )}
          </div>
          {previewUrl ? (
            <button
              type="button"
              className="text-xs text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-text)] hover:underline"
              onClick={() => fileRef.current?.click()}
            >
              {t('skin.changeFile')}
            </button>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <TextField
            label={t('skin.name')}
            value={name}
            maxLength={32}
            placeholder={defaultName}
            onChange={(e) => setName(e.target.value)}
          />

          <div>
            <div className="mb-1.5 text-sm text-[var(--color-text-muted)]">{t('skin.model')}</div>
            <div className="flex gap-2">
              {(['wide', 'slim'] as const).map((m) => (
                <Button
                  key={m}
                  variant={model === m ? 'primary' : 'secondary'}
                  className="flex-1 !rounded-[var(--radius-sm)]"
                  onClick={() => setModel(m)}
                >
                  {m === 'slim' ? t('skin.model.slim') : t('skin.model.wide')}
                </Button>
              ))}
            </div>
          </div>

          <p className="text-xs text-[var(--color-text-muted)]">{t('skin.uploadHint')}</p>
          {error ? <p className="text-xs text-[var(--color-danger)]">{error}</p> : null}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,.png"
        className="hidden"
        onChange={(e) => {
          const next = e.target.files?.[0]
          if (next) applyFile(next)
          e.target.value = ''
        }}
      />
    </Dialog>
  )
}

function capeAliasKey(alias: string): string {
  return alias
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function capeDisplayName(
  cape: CapeEntry,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (!cape.alias) return t('skin.cape.unnamed')
  const key = capeAliasKey(cape.alias)
  return t(`skin.cape.alias.${key}`, { defaultValue: cape.alias })
}

function CapePickerList({
  capes,
  selectedCapeId,
  disabled,
  onSelect,
}: {
  capes: CapeEntry[]
  selectedCapeId: string | null
  disabled?: boolean
  onSelect: (capeId: string | null) => void
}) {
  const { t } = useTranslation()
  // クリック直後にハイライト（親の persist 完了を待たない）
  const [highlightId, setHighlightId] = useState(selectedCapeId)

  useEffect(() => {
    setHighlightId(selectedCapeId)
  }, [selectedCapeId])

  const pick = (capeId: string | null) => {
    if (disabled) return
    setHighlightId(capeId)
    onSelect(capeId)
  }

  return (
    <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
      <button
        type="button"
        disabled={disabled}
        className={[
          'rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-sm',
          highlightId === null
            ? 'bg-[var(--color-selection-soft)] font-medium text-[var(--color-selection)]'
            : 'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
        ].join(' ')}
        onClick={() => pick(null)}
      >
        {t('skin.cape.none')}
      </button>
      {capes.map((cape) => (
        <button
          key={cape.id}
          type="button"
          disabled={disabled}
          className={[
            'flex items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-sm',
            highlightId === cape.id
              ? 'bg-[var(--color-selection-soft)] font-medium text-[var(--color-selection)]'
              : 'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
          ].join(' ')}
          onClick={() => pick(cape.id)}
        >
          <CapeThumb url={cape.url} size={22} />
          <span className="min-w-0 flex-1 truncate">{capeDisplayName(cape, t)}</span>
        </button>
      ))}
    </div>
  )
}

function EditCapeDialog({
  skin,
  capes,
  capeId,
  loggedIn,
  loading,
  onClose,
  onSelectCape,
}: {
  skin: SkinEntry
  capes: CapeEntry[]
  capeId: string | null
  loggedIn: boolean
  loading: boolean
  onClose: () => void
  onSelectCape: (capeId: string | null) => void
}) {
  const { t } = useTranslation()
  const skinUrl = useSkinImageUrl(skin)
  // クリック直後にプレビューへ反映（persist 完了を待たない）
  const [localCapeId, setLocalCapeId] = useState(capeId)

  useEffect(() => {
    setLocalCapeId(capeId)
  }, [capeId, skin.id])

  const previewCapeUrl = localCapeId
    ? (capes.find((c) => c.id === localCapeId)?.url ?? null)
    : null

  return (
    <Dialog
      open
      title={t('skin.editCapeTitle')}
      onClose={onClose}
      size="md"
      footer={
        <div className="flex w-full justify-end">
          <Button variant="primary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(180px,auto)_1fr]">
        <div className="flex flex-col items-center gap-1.5">
          <div className="h-[280px] w-[180px] shrink-0 overflow-hidden rounded-[var(--radius-md)]">
            {skinUrl ? (
              <SkinPreview
                skinUrl={skinUrl}
                model={skin.model}
                capeUrl={previewCapeUrl}
                interactive
                pose="full"
                width={180}
                height={280}
                className="rounded-[var(--radius-md)]"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-bg)]/40 text-xs text-[var(--color-text-muted)]">
                {t('common.loading')}
              </div>
            )}
          </div>
          <p className="text-center text-xs text-[var(--color-text-muted)]">{skin.name}</p>
          <p className="text-center text-[10px] leading-tight text-[var(--color-text-muted)]">
            {t('skin.dragHint')}
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="text-sm font-medium text-[var(--color-text)]">{t('skin.cape')}</div>
          <p className="text-[11px] text-[var(--color-text-muted)]">{t('skin.cape.perSkinHint')}</p>
          {!loggedIn ? (
            <p className="text-xs text-[var(--color-text-muted)]">{t('skin.cape.loginRequired')}</p>
          ) : loading ? (
            <p className="text-xs text-[var(--color-text-muted)]">{t('common.loading')}</p>
          ) : capes.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">{t('skin.cape.empty')}</p>
          ) : (
            <CapePickerList
              capes={capes}
              selectedCapeId={localCapeId}
              onSelect={(next) => {
                setLocalCapeId(next)
                onSelectCape(next)
              }}
            />          )}
        </div>
      </div>
    </Dialog>
  )
}

function EditSkinDialog({
  skin,
  usedNames,
  saving,
  capes,
  capeId,
  loggedIn,
  capesLoading,
  onSelectCape,
  onClose,
  onSave,
  onRemove,
}: {
  skin: SkinEntry
  usedNames: string[]
  saving: boolean
  capes: CapeEntry[]
  capeId: string | null
  loggedIn: boolean
  capesLoading: boolean
  onSelectCape: (capeId: string | null) => void
  onClose: () => void
  onSave: (name: string, model: SkinModel, file?: File) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(skin.name)
  const [model, setModel] = useState<SkinModel>(skin.model)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [localCapeId, setLocalCapeId] = useState(capeId)
  const fileRef = useRef<HTMLInputElement>(null)
  const existingUrl = useSkinImageUrl(skin)
  const defaultName = nextDefaultSkinName(usedNames, t('skin.mySkin'))
  const previewUrl = pendingPreviewUrl ?? existingUrl
  const previewCapeUrl = localCapeId
    ? (capes.find((c) => c.id === localCapeId)?.url ?? null)
    : null

  useEffect(() => {
    setName(skin.name)
    setModel(skin.model)
    setPendingFile(null)
    setError(null)
    setLocalCapeId(capeId)
  }, [skin, capeId])

  useEffect(() => {
    if (!pendingFile) {
      setPendingPreviewUrl(undefined)
      return
    }
    const url = URL.createObjectURL(pendingFile)
    setPendingPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pendingFile])

  const applyFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.png') && file.type !== 'image/png') {
      setError(t('skin.uploadHint'))
      return
    }
    setError(null)
    setPendingFile(file)
  }

  const canSave = !saving

  return (
    <>
      <Dialog
        open
        title={t('skin.editTitle')}
        onClose={onClose}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <Button variant="danger" disabled={saving} onClick={() => setRemoveOpen(true)}>
              {t('skin.remove')}
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose} disabled={saving}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                disabled={!canSave}
                onClick={() =>
                  void onSave(name.trim() || defaultName, model, pendingFile ?? undefined).catch(
                    (err: unknown) => {
                      setError(err instanceof Error ? err.message : t('skin.uploadHint'))
                    },
                  )
                }
              >
                {saving ? t('common.loading') : t('skin.save')}
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(180px,auto)_1fr]">
          <div className="flex flex-col items-center gap-2">
            <div className="h-[280px] w-[180px] shrink-0 overflow-hidden rounded-[var(--radius-md)]">
              {previewUrl ? (
                <SkinPreview
                  skinUrl={previewUrl}
                  model={model}
                  capeUrl={previewCapeUrl}
                  interactive
                  pose="full"
                  width={180}
                  height={280}
                  className="rounded-[var(--radius-md)]"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-bg)]/40 text-xs text-[var(--color-text-muted)]">
                  {t('common.loading')}
                </div>
              )}
            </div>
            <Button
              variant="secondary"
              className="w-full !rounded-[var(--radius-sm)]"
              disabled={saving}
              onClick={() => fileRef.current?.click()}
            >
              <IconUpload size={16} stroke={1.6} className="mr-1.5" aria-hidden />
              {t('skin.changeFile')}
            </Button>
            <p className="text-center text-[10px] leading-tight text-[var(--color-text-muted)]">
              {t('skin.dragHint')}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <TextField
              label={t('skin.name')}
              value={name}
              maxLength={32}
              placeholder={defaultName}
              onChange={(e) => setName(e.target.value)}
            />
            <div>
              <div className="mb-2 text-sm text-[var(--color-text-muted)]">{t('skin.model')}</div>
              <div className="flex gap-2">
                {(['wide', 'slim'] as const).map((m) => (
                  <Button
                    key={m}
                    variant={model === m ? 'primary' : 'secondary'}
                    className="flex-1 !rounded-[var(--radius-sm)]"
                    onClick={() => setModel(m)}
                  >
                    {m === 'slim' ? t('skin.model.slim') : t('skin.model.wide')}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-sm text-[var(--color-text-muted)]">{t('skin.cape')}</div>
              <p className="mb-2 text-[11px] text-[var(--color-text-muted)]">{t('skin.cape.perSkinHint')}</p>
              {!loggedIn ? (
                <p className="text-xs text-[var(--color-text-muted)]">{t('skin.cape.loginRequired')}</p>
              ) : capesLoading ? (
                <p className="text-xs text-[var(--color-text-muted)]">{t('common.loading')}</p>
              ) : capes.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)]">{t('skin.cape.empty')}</p>
              ) : (
                <CapePickerList
                  capes={capes}
                  selectedCapeId={localCapeId}
                  onSelect={(next) => {
                    setLocalCapeId(next)
                    onSelectCape(next)
                  }}
                />
              )}
            </div>
            {error ? <p className="text-xs text-[var(--color-danger)]">{error}</p> : null}
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,.png"
          className="hidden"
          onChange={(e) => {
            const next = e.target.files?.[0]
            if (next) applyFile(next)
            e.target.value = ''
          }}
        />
      </Dialog>
      <ConfirmDialog
        open={removeOpen}
        title={t('skin.remove')}
        body={t('skin.removeConfirm')}
        confirmLabel={t('skin.remove')}
        pending={saving}
        onCancel={() => setRemoveOpen(false)}
        onConfirm={() => void onRemove()}
      />
    </>
  )
}
