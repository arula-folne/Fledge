import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { IconCheck, IconPencil, IconPlus, IconUpload } from '@tabler/icons-react'
import { MAX_UPLOADED_SKINS, type SkinEntry, type SkinModel } from '@fledge/shared'
import { fledgeApi } from '../api/fledgeApi'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { TextField } from '../components/ui/TextField'
import { SkinPreview } from '../components/skin/SkinPreview'
import { SkinCachedThumb, skinThumbQueryKey } from '../components/skin/SkinCachedThumb'
import { defaultSkinThumbUrl, defaultSkinUrl } from '../components/skin/defaultSkinUrls'
import { renderSkinThumbDataUrl } from '../components/skin/skinSnapshot'

export default function SkinPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [registerOpen, setRegisterOpen] = useState(false)
  const [editing, setEditing] = useState<SkinEntry | null>(null)

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
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      await queryClient.invalidateQueries({ queryKey: ['account-face'] })
    },
  })

  const uploadMutation = useMutation({
    mutationFn: (input: {
      name: string
      model: SkinModel
      bytes: number[]
      originalName: string
      thumbDataUrl?: string
    }) => fledgeApi.skins.upload(input),
    onSuccess: async (skin) => {
      await fledgeApi.skins.select({ skinId: skin.id, model: skin.model })
      await queryClient.invalidateQueries({ queryKey: ['skins'] })
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      await queryClient.invalidateQueries({ queryKey: ['skin-thumb', skin.id] })
      await queryClient.invalidateQueries({ queryKey: ['account-face'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; name?: string; model?: SkinModel }) =>
      fledgeApi.skins.update(input),
    onSuccess: async (_skin, input) => {
      await queryClient.invalidateQueries({ queryKey: ['skins'] })
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      await queryClient.invalidateQueries({ queryKey: ['account-face'] })
      if (input.model) {
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
    <div className="flex h-full min-h-0 flex-col gap-2">
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
        <aside className="flex min-h-0 flex-col items-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
          <p className="mb-0.5 text-xs font-medium text-[var(--color-text)]">{t('skin.current')}</p>
          <p className="mb-2 text-[10px] leading-tight text-[var(--color-text-muted)]">
            {t('skin.dragHint')}
          </p>
          <div className="flex min-h-[300px] w-full flex-1 overflow-hidden rounded-[var(--radius-md)] lg:min-h-0">
            {selectedSkin ? (
              <SkinEntryPreview
                skin={selectedSkin}
                pose="full"
                interactive
                width={280}
                height={420}
                className="h-full w-full rounded-[var(--radius-md)]"
                model={selectedSkin.model}
              />
            ) : (
              <div className="h-full min-h-[300px] w-full animate-pulse rounded-[var(--radius-md)] bg-[var(--color-border)]/40" />
            )}
          </div>
          {selectedSkin ? (
            <div className="mt-2 text-center">
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

        <section className="min-h-0 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
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
                  onClick={() => {
                    if (selectMutation.isPending) return
                    selectMutation.mutate({ skinId: skin.id, model: skin.model })
                  }}
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
              {t('skin.limitReached')}
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
                  onClick={() => {
                    if (selectMutation.isPending) return
                    selectMutation.mutate({ skinId: skin.id, model: skin.model })
                  }}
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
        }}
      />

      {editing ? (
        <EditSkinDialog
          skin={editing}
          usedNames={uploads.filter((s) => s.id !== editing.id).map((s) => s.name)}
          saving={updateMutation.isPending || removeMutation.isPending}
          onClose={() => setEditing(null)}
          onSave={async (name, model) => {
            await updateMutation.mutateAsync({ id: editing.id, name, model })
            if (model !== editing.model) {
              const url = await fledgeApi.skins.getDataUrl(editing.id)
              if (url) {
                try {
                  const thumb = await renderSkinThumbDataUrl(url, model)
                  await fledgeApi.skins.saveThumb(editing.id, model, thumb)
                  queryClient.setQueryData(skinThumbQueryKey(editing.id, model), thumb)
                } catch (err) {
                  console.error('Skin thumb render failed:', err)
                }
              }
            }
            if (selectedId === editing.id) {
              await fledgeApi.skins.select({ skinId: editing.id, model })
              await queryClient.invalidateQueries({ queryKey: ['settings'] })
              await queryClient.invalidateQueries({ queryKey: ['account-face'] })
            }
            setEditing(null)
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
            title={t('skin.edit')}
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

function useSkinImageUrl(skin: SkinEntry): string | undefined {
  const urlQuery = useQuery({
    queryKey: ['skin-data', skin.id],
    queryFn: () => fledgeApi.skins.getDataUrl(skin.id),
    enabled: skin.source === 'upload',
    staleTime: 30 * 60_000,
    gcTime: 15 * 60_000,
  })
  return skin.source === 'default' ? defaultSkinUrl(skin.id) : (urlQuery.data ?? undefined)
}

function SkinEntryThumb({ skin }: { skin: SkinEntry }) {
  const skinUrl = useSkinImageUrl(skin)
  const bundled = skin.source === 'default' ? defaultSkinThumbUrl(skin.id) : undefined
  if (bundled) {
    return <img src={bundled} alt="" className="h-full w-full object-contain" draggable={false} />
  }
  return (
    <SkinCachedThumb
      skinId={skin.id}
      model={skin.model}
      skinUrl={skinUrl}
      className="h-full w-full"
    />
  )
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
}: {
  skin: SkinEntry
  pose: 'bust' | 'full'
  width: number
  height: number
  model?: SkinModel
  interactive?: boolean
  className?: string
  zoom?: number
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
                setError(err instanceof Error ? err.message : t('skin.limitReached'))
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
                interactive
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
                  className="flex-1"
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

function EditSkinDialog({
  skin,
  usedNames,
  saving,
  onClose,
  onSave,
  onRemove,
}: {
  skin: SkinEntry
  usedNames: string[]
  saving: boolean
  onClose: () => void
  onSave: (name: string, model: SkinModel) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(skin.name)
  const [model, setModel] = useState<SkinModel>(skin.model)
  const [removeOpen, setRemoveOpen] = useState(false)
  const defaultName = nextDefaultSkinName(usedNames, t('skin.mySkin'))

  useEffect(() => {
    setName(skin.name)
    setModel(skin.model)
  }, [skin])

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
              onClick={() => void onSave(name.trim() || defaultName, model)}
            >
              {saving ? t('common.loading') : t('skin.save')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <div className="flex justify-center rounded-[var(--radius-md)] bg-gradient-to-b from-[var(--color-border)]/40 to-transparent py-2">
          <SkinEntryPreview
            skin={{ ...skin, model }}
            pose="full"
            interactive
            width={128}
            height={200}
            className="rounded-[var(--radius-md)]"
            model={model}
          />
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
                  className="flex-1"
                  onClick={() => setModel(m)}
                >
                  {m === 'slim' ? t('skin.model.slim') : t('skin.model.wide')}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
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

