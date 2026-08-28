import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconBox,
  IconBoxMultiple,
  IconCube,
  IconCube3dSphere,
  IconCube3dSphereOff,
  IconCubeOff,
  IconCubePlus,
  IconCubeSend,
  IconCubeSpark,
  IconDice,
  IconHexagonalPrism,
  IconPackages,
  IconPhoto,
  IconPyramid,
  IconStack3,
} from '@tabler/icons-react'
import {
  DEFAULT_INSTANCE_ICON_PRESET,
  INSTANCE_ICON_BACKDROPS,
  INSTANCE_ICON_EXTS,
  INSTANCE_ICON_VARIANTS,
  MAX_INSTANCE_ICON_BYTES,
  type InstanceIconBackdrop,
  type InstanceIconPreset,
  type InstanceIconVariant,
} from '@fledge/shared'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'

export const INSTANCE_ICON_COLOR_SWATCHES = [
  { id: 'snow', value: '#f4f7fa' },
  { id: 'ice', value: '#a8d8ea' },
  { id: 'sky', value: '#6bb0df' },
  { id: 'water', value: '#3b8fd9' },
  { id: 'prismarine', value: '#3fae9a' },
  { id: 'grass', value: '#5d9c3f' },
  { id: 'oak', value: '#c4a574' },
  { id: 'sand', value: '#e0c878' },
  { id: 'gold', value: '#e0b03a' },
  { id: 'redstone', value: '#c45c4a' },
  { id: 'chorus', value: '#9b7ed9' },
  { id: 'deepslate', value: '#4a5564' },
] as const

type CubeIconProps = {
  size?: number
  stroke?: number
  className?: string
  style?: CSSProperties
}

const VARIANT_ICON: Record<InstanceIconVariant, (props: CubeIconProps) => ReactNode> = {
  cube: (props) => <IconCube {...props} />,
  cubeOff: (props) => <IconCubeOff {...props} />,
  cube3dSphere: (props) => <IconCube3dSphere {...props} />,
  cube3dSphereOff: (props) => <IconCube3dSphereOff {...props} />,
  cubePlus: (props) => <IconCubePlus {...props} />,
  cubeSend: (props) => <IconCubeSend {...props} />,
  cubeSpark: (props) => <IconCubeSpark {...props} />,
  box: (props) => <IconBox {...props} />,
  boxMultiple: (props) => <IconBoxMultiple {...props} />,
  packages: (props) => <IconPackages {...props} />,
  dice: (props) => <IconDice {...props} />,
  pyramid: (props) => <IconPyramid {...props} />,
  hexagonalPrism: (props) => <IconHexagonalPrism {...props} />,
  stack3: (props) => <IconStack3 {...props} />,
}

export function cubeIconFor(variant: InstanceIconVariant) {
  return VARIANT_ICON[variant]
}

function BackdropArt({ kind }: { kind: InstanceIconBackdrop }) {
  if (kind === 'plain') {
    return <rect width="64" height="64" fill="#2a3340" />
  }
  if (kind === 'sea') {
    return (
      <>
        <rect width="64" height="64" fill="#1a4a73" />
        <rect width="64" height="20" fill="#7eb7dc" />
        <rect y="18" width="64" height="6" fill="#5a9fc4" />
        <rect y="24" width="64" height="10" fill="#2f7aa8" />
        <rect y="34" width="64" height="12" fill="#246890" />
        <rect y="46" width="64" height="18" fill="#185578" />
        <rect x="40" y="22" width="18" height="6" fill="#e8d48a" />
        <rect x="42" y="18" width="14" height="4" fill="#6aa84f" />
      </>
    )
  }
  if (kind === 'sky') {
    return (
      <>
        <rect width="64" height="64" fill="#7ec8f0" />
        <rect width="64" height="16" fill="#5eb3e8" />
        <rect y="48" width="64" height="10" fill="#7cb85a" />
        <rect y="58" width="64" height="6" fill="#6b4423" />
        <rect x="44" y="8" width="10" height="10" fill="#ffe566" />
        <rect x="6" y="14" width="16" height="6" fill="#ffffff" />
        <rect x="12" y="10" width="10" height="6" fill="#ffffff" />
        <rect x="36" y="22" width="18" height="5" fill="#ffffff" opacity="0.92" />
      </>
    )
  }
  if (kind === 'grass') {
    return (
      <>
        <rect width="64" height="64" fill="#87c4ea" />
        <rect y="38" width="64" height="16" fill="#5a9e3a" />
        <rect y="36" width="64" height="4" fill="#6db04a" />
        <rect y="54" width="64" height="10" fill="#8b5a2b" />
        <rect x="8" y="28" width="4" height="12" fill="#6b4423" />
        <rect x="2" y="18" width="16" height="12" fill="#3d7a28" />
        <rect x="48" y="32" width="3" height="6" fill="#6b4423" />
        <rect x="44" y="26" width="11" height="8" fill="#4f8f2c" />
      </>
    )
  }
  return (
    <>
      <rect width="64" height="64" fill="#12182a" />
      <rect y="50" width="64" height="8" fill="#24331c" />
      <rect y="58" width="64" height="6" fill="#1a2414" />
      <rect x="46" y="8" width="10" height="10" fill="#f5f0d8" />
      <rect x="8" y="10" width="2" height="2" fill="#f2f6ff" />
      <rect x="22" y="6" width="1" height="1" fill="#f2f6ff" />
      <rect x="30" y="16" width="2" height="2" fill="#dce7ff" />
      <rect x="52" y="28" width="1" height="1" fill="#f2f6ff" />
      <rect x="14" y="28" width="1" height="1" fill="#f2f6ff" />
      <rect x="38" y="12" width="1" height="1" fill="#f2f6ff" />
      <rect x="6" y="38" width="2" height="2" fill="#e8eeff" />
    </>
  )
}

type TileProps = {
  preset?: InstanceIconPreset | null
  size?: 'md' | 'lg' | 'sm' | 'xl'
  className?: string
}

const tileClass = {
  sm: 'size-8',
  md: 'size-12',
  lg: 'size-16',
  xl: 'size-20',
} as const

const glyphSize = {
  sm: 16,
  md: 28,
  lg: 36,
  xl: 44,
} as const

export function InstanceIconTile({
  preset = DEFAULT_INSTANCE_ICON_PRESET,
  size = 'md',
  className = '',
}: TileProps) {
  const resolved = preset ?? DEFAULT_INSTANCE_ICON_PRESET
  const Icon = cubeIconFor(resolved.variant)
  const box = [
    tileClass[size],
    'relative flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)]',
    className,
  ].join(' ')

  return (
    <div className={box} aria-hidden>
      <svg viewBox="0 0 64 64" className="absolute inset-0 size-full" preserveAspectRatio="none">
        <BackdropArt kind={resolved.backdrop} />
      </svg>
      {Icon({
        size: glyphSize[size],
        stroke: 1.7,
        className: 'relative z-[1] drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]',
        style: { color: resolved.color },
      })}
    </div>
  )
}

function choiceClass(active: boolean) {
  return [
    'rounded-[var(--radius-md)] outline-none transition',
    active
      ? 'ring-2 ring-[var(--color-selection)] ring-offset-2 ring-offset-[var(--color-surface)]'
      : 'hover:ring-1 hover:ring-[var(--color-border)]',
  ].join(' ')
}

type PickerProps = {
  value: InstanceIconPreset
  onChange: (next: InstanceIconPreset) => void
  disabled?: boolean
  density?: 'compact' | 'comfortable'
}

export function InstanceIconPresetPicker({
  value,
  onChange,
  disabled,
  density = 'compact',
}: PickerProps) {
  const { t } = useTranslation()
  const comfortable = density === 'comfortable'
  const tileSize = comfortable ? 'md' : 'sm'
  const swatchClass = comfortable ? 'size-9' : 'size-7'
  const legendClass = comfortable
    ? 'text-sm font-medium text-[var(--color-text-muted)]'
    : 'text-xs text-[var(--color-text-muted)]'

  return (
    <div
      className={[
        'flex flex-col',
        comfortable ? 'gap-4' : 'gap-3',
        disabled ? 'pointer-events-none opacity-45' : '',
      ].join(' ')}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className={legendClass}>{t('instances.iconPreset.variant')}</legend>
        <div className={comfortable ? 'flex flex-wrap gap-2' : 'flex flex-wrap gap-1.5'}>
          {INSTANCE_ICON_VARIANTS.map((variant) => (
            <button
              key={variant}
              type="button"
              aria-pressed={value.variant === variant}
              aria-label={t(`instances.iconPreset.variant.${variant}`)}
              className={choiceClass(value.variant === variant)}
              onClick={() => onChange({ ...value, variant })}
            >
              <InstanceIconTile preset={{ ...value, variant }} size={tileSize} />
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className={legendClass}>{t('instances.iconPreset.color')}</legend>
        <div className={comfortable ? 'flex flex-wrap gap-2' : 'flex flex-wrap gap-1.5'}>
          {INSTANCE_ICON_COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch.id}
              type="button"
              aria-pressed={value.color.toLowerCase() === swatch.value}
              aria-label={t(`instances.iconPreset.color.${swatch.id}`)}
              className={[
                swatchClass,
                'border border-black/10',
                choiceClass(value.color.toLowerCase() === swatch.value),
              ].join(' ')}
              style={{ background: swatch.value }}
              onClick={() => onChange({ ...value, color: swatch.value })}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className={legendClass}>{t('instances.iconPreset.backdrop')}</legend>
        <div className={comfortable ? 'flex flex-wrap gap-2' : 'flex flex-wrap gap-1.5'}>
          {INSTANCE_ICON_BACKDROPS.map((backdrop) => (
            <button
              key={backdrop}
              type="button"
              aria-pressed={value.backdrop === backdrop}
              aria-label={t(`instances.iconPreset.backdrop.${backdrop}`)}
              className={choiceClass(value.backdrop === backdrop)}
              onClick={() => onChange({ ...value, backdrop })}
            >
              <InstanceIconTile preset={{ ...value, backdrop }} size={tileSize} />
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  )
}

type DialogProps = {
  open: boolean
  value: InstanceIconPreset
  onChange: (next: InstanceIconPreset) => void
  onClose: () => void
  onApply: () => void
}

export function InstanceIconPresetDialog({
  open,
  value,
  onChange,
  onClose,
  onApply,
}: DialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog
      open={open}
      title={t('instances.icon')}
      onClose={onClose}
      size="lg"
      overlayClassName="z-[90]"
      footer={
        <>
          <Button type="button" onClick={onClose}>
            {t('instances.cancel')}
          </Button>
          <Button type="button" variant="primary" onClick={onApply}>
            {t('instances.iconPreset.apply')}
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-6">
        <div className="flex w-52 shrink-0 flex-col items-center">
          <InstanceIconTile preset={value} size="xl" />
        </div>
        <div className="min-w-0 flex-1 border-l border-[var(--color-border)] pl-6">
          <p className="mb-3 text-sm font-medium text-[var(--color-text)]">
            {t('instances.iconSectionPreset')}
          </p>
          <InstanceIconPresetPicker density="comfortable" value={value} onChange={onChange} />
        </div>
      </div>
    </Dialog>
  )
}

export type InstanceIconFilePick = {
  previewUrl: string
  bytes: number[]
  originalName: string
}

type CustomizeProps = {
  open: boolean
  preset: InstanceIconPreset
  image: InstanceIconFilePick | null
  onClose: () => void
  onApply: (next: { preset: InstanceIconPreset; image: InstanceIconFilePick | null }) => void
}

const ICON_ACCEPT = INSTANCE_ICON_EXTS.join(',')

export function InstanceIconCustomizeDialog({
  open,
  preset,
  image,
  onClose,
  onApply,
}: CustomizeProps) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [draftPreset, setDraftPreset] = useState(preset)
  const [draftImage, setDraftImage] = useState<InstanceIconFilePick | null>(image)
  const [error, setError] = useState('')
  const createdUrls = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    setDraftPreset(preset)
    setDraftImage(image)
    setError('')
  }, [open, preset, image])

  const revokeIfOwned = (url: string) => {
    if (!createdUrls.current.has(url)) return
    URL.revokeObjectURL(url)
    createdUrls.current.delete(url)
  }

  const discardOwnedExcept = (keepUrl: string | null) => {
    for (const url of [...createdUrls.current]) {
      if (url === keepUrl) continue
      URL.revokeObjectURL(url)
      createdUrls.current.delete(url)
    }
  }

  const close = () => {
    discardOwnedExcept(image?.previewUrl ?? null)
    onClose()
  }

  const pickFile = async (file: File | undefined) => {
    setError('')
    if (!file) return
    const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`
    if (!(INSTANCE_ICON_EXTS as readonly string[]).includes(ext)) {
      setError(t('instances.iconInvalid'))
      return
    }
    if (file.size > MAX_INSTANCE_ICON_BYTES) {
      setError(t('instances.iconTooLarge'))
      return
    }
    const buf = new Uint8Array(await file.arrayBuffer())
    const previewUrl = URL.createObjectURL(file)
    createdUrls.current.add(previewUrl)
    setDraftImage((prev) => {
      if (prev) revokeIfOwned(prev.previewUrl)
      return { previewUrl, bytes: Array.from(buf), originalName: file.name }
    })
  }

  return (
    <Dialog
      open={open}
      title={t('instances.iconCustomize')}
      onClose={close}
      size="lg"
      scrollable
      overlayClassName="z-[90]"
      footer={
        <>
          <Button type="button" onClick={close}>
            {t('instances.cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              const keep = draftImage?.previewUrl ?? null
              discardOwnedExcept(keep)
              if (keep) createdUrls.current.delete(keep)
              onApply({ preset: draftPreset, image: draftImage })
            }}
          >
            {t('instances.iconPreset.apply')}
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-6">
        <div className="flex shrink-0 flex-col items-center gap-3">
          {draftImage ? (
            <div className="size-20 overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-surface)]">
              <img src={draftImage.previewUrl} alt="" className="size-full object-cover" draggable={false} />
            </div>
          ) : (
            <InstanceIconTile preset={draftPreset} size="xl" />
          )}
          <input
            ref={fileRef}
            type="file"
            accept={ICON_ACCEPT}
            className="hidden"
            onChange={(e) => {
              void pickFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <Button type="button" className="whitespace-nowrap px-3" onClick={() => fileRef.current?.click()}>
            <IconPhoto size={16} stroke={1.75} />
            {t('instances.iconUpload')}
          </Button>
          {draftImage ? (
            <Button
              type="button"
              variant="ghost"
              className="whitespace-nowrap px-3"
              onClick={() => {
                setDraftImage((prev) => {
                  if (prev) revokeIfOwned(prev.previewUrl)
                  return null
                })
              }}
            >
              {t('instances.iconUsePreset')}
            </Button>
          ) : null}
          <p className="max-w-[11rem] text-center text-xs leading-relaxed text-[var(--color-text-muted)]">
            {t('instances.iconHint')}
          </p>
          {error ? <p className="max-w-[11rem] text-center text-sm text-[var(--color-danger)]">{error}</p> : null}
        </div>

        <div className="min-w-0 flex-1 border-l border-[var(--color-border)] pl-6">
          <p className="mb-3 text-sm font-medium text-[var(--color-text)]">
            {t('instances.iconSectionPreset')}
          </p>
          <InstanceIconPresetPicker
            density="comfortable"
            value={draftPreset}
            onChange={(next) => {
              setDraftImage((prev) => {
                if (prev) revokeIfOwned(prev.previewUrl)
                return null
              })
              setDraftPreset(next)
            }}
          />
        </div>
      </div>
    </Dialog>
  )
}

export function isDefaultIconPreset(preset: InstanceIconPreset | null | undefined): boolean {
  if (!preset) return true
  return (
    preset.variant === DEFAULT_INSTANCE_ICON_PRESET.variant &&
    preset.color.toLowerCase() === DEFAULT_INSTANCE_ICON_PRESET.color &&
    preset.backdrop === DEFAULT_INSTANCE_ICON_PRESET.backdrop
  )
}

export function sameIconPreset(a: InstanceIconPreset, b: InstanceIconPreset): boolean {
  return (
    a.variant === b.variant &&
    a.color.toLowerCase() === b.color.toLowerCase() &&
    a.backdrop === b.backdrop
  )
}
