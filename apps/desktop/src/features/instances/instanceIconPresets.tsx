import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconCube,
  IconCube3dSphere,
  IconCube3dSphereOff,
  IconCubeOff,
  IconCubePlus,
  IconCubeSend,
  IconCubeSpark,
} from '@tabler/icons-react'
import {
  DEFAULT_INSTANCE_ICON_PRESET,
  INSTANCE_ICON_BACKDROPS,
  INSTANCE_ICON_VARIANTS,
  type InstanceIconBackdrop,
  type InstanceIconPreset,
  type InstanceIconVariant,
} from '@fledge/shared'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { HoverTooltip } from '../../components/ui/HoverTooltip'

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
  size?: 'md' | 'lg' | 'sm'
  className?: string
}

const tileClass = {
  sm: 'size-8',
  md: 'size-12',
  lg: 'size-16',
} as const

const glyphSize = {
  sm: 16,
  md: 28,
  lg: 36,
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
    'rounded-[var(--radius-sm)] outline-none transition',
    active
      ? 'ring-2 ring-[var(--color-selection)] ring-offset-2 ring-offset-[var(--color-surface)]'
      : 'hover:ring-1 hover:ring-[var(--color-border)]',
  ].join(' ')
}

type PickerProps = {
  value: InstanceIconPreset
  onChange: (next: InstanceIconPreset) => void
  disabled?: boolean
}

export function InstanceIconPresetPicker({ value, onChange, disabled }: PickerProps) {
  const { t } = useTranslation()

  return (
    <div className={['flex flex-col gap-3', disabled ? 'pointer-events-none opacity-45' : ''].join(' ')}>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs text-[var(--color-text-muted)]">
          {t('instances.iconPreset.variant')}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {INSTANCE_ICON_VARIANTS.map((variant) => (
            <HoverTooltip key={variant} content={t(`instances.iconPreset.variant.${variant}`)}>
              <button
                type="button"
                aria-pressed={value.variant === variant}
                aria-label={t(`instances.iconPreset.variant.${variant}`)}
                className={choiceClass(value.variant === variant)}
                onClick={() => onChange({ ...value, variant })}
              >
                <InstanceIconTile preset={{ ...value, variant }} size="sm" />
              </button>
            </HoverTooltip>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs text-[var(--color-text-muted)]">
          {t('instances.iconPreset.color')}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {INSTANCE_ICON_COLOR_SWATCHES.map((swatch) => (
            <HoverTooltip key={swatch.id} content={t(`instances.iconPreset.color.${swatch.id}`)}>
              <button
                type="button"
                aria-pressed={value.color.toLowerCase() === swatch.value}
                aria-label={t(`instances.iconPreset.color.${swatch.id}`)}
                className={['size-7 border border-black/10', choiceClass(value.color.toLowerCase() === swatch.value)].join(' ')}
                style={{ background: swatch.value }}
                onClick={() => onChange({ ...value, color: swatch.value })}
              />
            </HoverTooltip>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs text-[var(--color-text-muted)]">
          {t('instances.iconPreset.backdrop')}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {INSTANCE_ICON_BACKDROPS.map((backdrop) => (
            <HoverTooltip key={backdrop} content={t(`instances.iconPreset.backdrop.${backdrop}`)}>
              <button
                type="button"
                aria-pressed={value.backdrop === backdrop}
                aria-label={t(`instances.iconPreset.backdrop.${backdrop}`)}
                className={choiceClass(value.backdrop === backdrop)}
                onClick={() => onChange({ ...value, backdrop })}
              >
                <InstanceIconTile preset={{ ...value, backdrop }} size="sm" />
              </button>
            </HoverTooltip>
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
      size="md"
      overlayClassName="z-[60]"
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
      <div className="flex flex-col gap-4">
        <div className="flex justify-center">
          <InstanceIconTile preset={value} size="lg" />
        </div>
        <InstanceIconPresetPicker value={value} onChange={onChange} />
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
