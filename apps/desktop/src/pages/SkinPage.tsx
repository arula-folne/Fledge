import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { SkinEntry, SkinModel } from '@fledge/shared'
import { fledgeApi } from '../api/fledgeApi'
import { Button } from '../components/ui/Button'
import { SkinPreview } from '../components/skin/SkinPreview'
import { defaultSkinUrl } from '../components/skin/defaultSkinUrls'

export default function SkinPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [mySkinOpen, setMySkinOpen] = useState(false)

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })
  const skinsQuery = useQuery({
    queryKey: ['skins'],
    queryFn: () => fledgeApi.skins.list(),
  })

  const selectedId = settingsQuery.data?.selectedSkinId
  const skinModel = settingsQuery.data?.skinModel ?? 'wide'

  const defaults = (skinsQuery.data ?? []).filter((s) => s.source === 'default')
  const uploads = (skinsQuery.data ?? []).filter((s) => s.source === 'upload')
  const mySkin =
    uploads.find((s) => s.id === selectedId) ?? uploads[uploads.length - 1] ?? null
  const mySkinSelected = Boolean(mySkin && mySkin.id === selectedId)

  const selectedSkin =
    (skinsQuery.data ?? []).find((s) => s.id === selectedId) ?? defaults[0] ?? null

  const selectMutation = useMutation({
    mutationFn: (input: { skinId: string; model?: SkinModel }) => fledgeApi.skins.select(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const uploadMutation = useMutation({
    mutationFn: (input: {
      name: string
      model: SkinModel
      bytes: number[]
      originalName: string
    }) => fledgeApi.skins.upload(input),
    onSuccess: async (skin) => {
      await fledgeApi.skins.select({ skinId: skin.id, model: skin.model })
      await queryClient.invalidateQueries({ queryKey: ['skins'] })
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('skin.title')}</h1>

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* 左: 選択中スキン全身 */}
        <aside className="flex flex-col items-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="mb-1 text-sm text-[var(--color-text-muted)]">{t('skin.current')}</p>
          <p className="mb-2 text-[11px] text-[var(--color-text-muted)]">{t('skin.dragHint')}</p>
          <div className="flex min-h-[380px] flex-1 items-center justify-center">
            {selectedSkin ? (
              <SkinEntryPreview
                skin={selectedSkin}
                pose="full"
                interactive
                width={240}
                height={400}
                model={
                  selectedSkin.source === 'upload' ? skinModel : selectedSkin.model
                }
              />
            ) : (
              <div className="h-[400px] w-[240px] animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-border)]/40" />
            )}
          </div>
          {selectedSkin ? (
            <div className="mt-3 text-center">
              <div className="font-medium">
                {mySkinSelected ? t('skin.mySkin') : selectedSkin.name}
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">
                {selectedSkin.model === 'slim' ? t('skin.model.slim') : t('skin.model.wide')}
              </div>
            </div>
          ) : null}
        </aside>

        {/* 右: 選択グリッド */}
        <section className="min-h-0 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-3 text-sm font-medium text-[var(--color-text-muted)]">
            {t('skin.pick')}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {/* マイスキン枠（Steve とは別） */}
            <button
              type="button"
              onClick={() => setMySkinOpen(true)}
              className={[
                'flex flex-col items-center rounded-[var(--radius-md)] border p-3 text-left transition',
                mySkinSelected
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                  : 'border-dashed border-[var(--color-border)] hover:border-[var(--color-accent)]/60',
              ].join(' ')}
            >
              <div className="mb-2 flex h-[120px] w-full items-center justify-center overflow-hidden rounded-[var(--radius-sm)] bg-gradient-to-b from-[var(--color-border)]/40 to-transparent">
                {mySkin ? (
                  <SkinEntryPreview skin={mySkin} pose="bust" width={100} height={120} />
                ) : (
                  <span className="text-xs text-[var(--color-text-muted)]">{t('skin.mySkinEmpty')}</span>
                )}
              </div>
              <div className="w-full font-medium">{t('skin.mySkin')}</div>
              <div className="w-full text-xs text-[var(--color-text-muted)]">
                {mySkinSelected ? t('skin.selected') : t('skin.mySkinHint')}
              </div>
            </button>

            {defaults.map((skin) => {
              const selected = selectedId === skin.id
              return (
                <button
                  key={skin.id}
                  type="button"
                  onClick={() => selectMutation.mutate({ skinId: skin.id, model: skin.model })}
                  className={[
                    'flex flex-col items-center rounded-[var(--radius-md)] border p-3 text-left transition',
                    selected
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                      : 'border-[var(--color-border)] hover:border-[var(--color-accent)]/50',
                  ].join(' ')}
                >
                  <div className="mb-2 flex h-[120px] w-full items-center justify-center overflow-hidden rounded-[var(--radius-sm)] bg-gradient-to-b from-[var(--color-border)]/40 to-transparent">
                    <SkinEntryPreview skin={skin} pose="bust" width={100} height={120} />
                  </div>
                  <div className="w-full font-medium">{skin.name}</div>
                  <div className="w-full text-xs text-[var(--color-text-muted)]">
                    {selected
                      ? t('skin.selected')
                      : skin.model === 'slim'
                        ? t('skin.model.slim')
                        : t('skin.model.wide')}
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      </div>

      {mySkinOpen ? (
        <MySkinModal
          mySkin={mySkin}
          skinModel={mySkin?.model ?? skinModel}
          selected={mySkinSelected}
          uploading={uploadMutation.isPending}
          onClose={() => setMySkinOpen(false)}
          onUpload={async (file, model) => {
            const buffer = new Uint8Array(await file.arrayBuffer())
            await uploadMutation.mutateAsync({
              name: file.name.replace(/\.[^.]+$/, '') || t('skin.mySkin'),
              model,
              bytes: Array.from(buffer),
              originalName: file.name,
            })
            setMySkinOpen(false)
          }}
          onSelect={(model) => {
            if (!mySkin) return
            selectMutation.mutate({ skinId: mySkin.id, model })
            setMySkinOpen(false)
          }}
          onModelChange={async (model) => {
            if (mySkin) {
              selectMutation.mutate({ skinId: mySkin.id, model })
            } else {
              await fledgeApi.settings.set({ skinModel: model })
              await queryClient.invalidateQueries({ queryKey: ['settings'] })
            }
          }}
        />
      ) : null}
    </div>
  )
}

function SkinEntryPreview({
  skin,
  pose,
  width,
  height,
  model: modelOverride,
  interactive = false,
}: {
  skin: SkinEntry
  pose: 'bust' | 'full'
  width: number
  height: number
  model?: SkinModel
  interactive?: boolean
}) {
  const urlQuery = useQuery({
    queryKey: ['skin-data', skin.id],
    queryFn: () => fledgeApi.skins.getDataUrl(skin.id),
    enabled: skin.source === 'upload',
    staleTime: Infinity,
  })

  const skinUrl =
    skin.source === 'default' ? defaultSkinUrl(skin.id) : (urlQuery.data ?? undefined)

  return (
    <SkinPreview
      skinUrl={skinUrl}
      model={modelOverride ?? skin.model}
      pose={pose}
      interactive={interactive}
      width={width}
      height={height}
    />
  )
}

function MySkinModal({
  mySkin,
  skinModel,
  selected,
  uploading,
  onClose,
  onUpload,
  onSelect,
  onModelChange,
}: {
  mySkin: SkinEntry | null
  skinModel: SkinModel
  selected: boolean
  uploading: boolean
  onClose: () => void
  onUpload: (file: File, model: SkinModel) => Promise<void>
  onSelect: (model: SkinModel) => void
  onModelChange: (model: SkinModel) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [model, setModel] = useState<SkinModel>(skinModel)

  useEffect(() => {
    setModel(skinModel)
  }, [skinModel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="my-skin-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="my-skin-title" className="mb-1 text-lg font-semibold">
          {t('skin.mySkin')}
        </h2>
        <p className="mb-4 text-sm text-[var(--color-text-muted)]">{t('skin.uploadHint')}</p>

        <div className="mb-4 flex justify-center rounded-[var(--radius-md)] bg-gradient-to-b from-[var(--color-border)]/40 to-transparent py-4">
          {mySkin ? (
            <SkinEntryPreview skin={{ ...mySkin, model }} pose="full" width={140} height={220} />
          ) : (
            <div className="flex h-[220px] w-[140px] items-center justify-center text-sm text-[var(--color-text-muted)]">
              {t('skin.mySkinEmpty')}
            </div>
          )}
        </div>

        <div className="mb-4">
          <div className="mb-2 text-sm font-medium">{t('skin.model')}</div>
          <div className="flex gap-2">
            {(['wide', 'slim'] as const).map((m) => (
              <Button
                key={m}
                variant={model === m ? 'primary' : 'secondary'}
                className="flex-1"
                onClick={() => {
                  setModel(m)
                  void onModelChange(m)
                }}
              >
                {m === 'slim' ? t('skin.model.slim') : t('skin.model.wide')}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button variant="primary" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? t('common.loading') : t('skin.upload')}
          </Button>
          {mySkin && !selected ? (
            <Button variant="secondary" onClick={() => onSelect(model)}>
              {t('skin.select')}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,.png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void onUpload(file, model)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
