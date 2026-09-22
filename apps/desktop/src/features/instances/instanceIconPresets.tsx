import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconBox,
  IconBoxMultiple,
  IconCircle,
  IconCone,
  IconCrystalBall,
  IconCube,
  IconCube3dSphere,
  IconCube3dSphereOff,
  IconCubeOff,
  IconCubePlus,
  IconCubeSend,
  IconCubeSpark,
  IconCylinder,
  IconDiamond,
  IconDice,
  IconFlame,
  IconHexagon,
  IconHexagonalPrism,
  IconMoonStars,
  IconMountain,
  IconPackages,
  IconPhoto,
  IconPick,
  IconPyramid,
  IconShield,
  IconSparkles,
  IconStack3,
  IconStar,
  IconSword,
  IconTriangle,
  IconWorld,
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
  diamond: (props) => <IconDiamond {...props} />,
  circle: (props) => <IconCircle {...props} />,
  hexagon: (props) => <IconHexagon {...props} />,
  triangle: (props) => <IconTriangle {...props} />,
  star: (props) => <IconStar {...props} />,
  flame: (props) => <IconFlame {...props} />,
  mountain: (props) => <IconMountain {...props} />,
  world: (props) => <IconWorld {...props} />,
  sparkles: (props) => <IconSparkles {...props} />,
  shield: (props) => <IconShield {...props} />,
  cylinder: (props) => <IconCylinder {...props} />,
  cone: (props) => <IconCone {...props} />,
  moonStars: (props) => <IconMoonStars {...props} />,
  sword: (props) => <IconSword {...props} />,
  pick: (props) => <IconPick {...props} />,
  crystalBall: (props) => <IconCrystalBall {...props} />,
}

export function cubeIconFor(variant: InstanceIconVariant) {
  return VARIANT_ICON[variant] ?? VARIANT_ICON.cube
}

function BackdropArt({ kind }: { kind: InstanceIconBackdrop }) {
  switch (kind) {
    case 'plain':
      return <rect width="64" height="64" fill="#2a3340" />
    case 'solidInk':
      return <rect width="64" height="64" fill="#0d0f14" />
    case 'solidSnow':
      return <rect width="64" height="64" fill="#e8eef5" />
    case 'solidCrimson':
      return <rect width="64" height="64" fill="#7a1f2a" />
    case 'solidEmerald':
      return <rect width="64" height="64" fill="#145c38" />
    case 'solidAmethyst':
      return <rect width="64" height="64" fill="#4a2a6e" />
    case 'solidAmber':
      return <rect width="64" height="64" fill="#8a5a12" />
    case 'solidAzure':
      return <rect width="64" height="64" fill="#1a4a7a" />
    case 'solidRose':
      return <rect width="64" height="64" fill="#8a3a5a" />
    case 'solidTeal':
      return <rect width="64" height="64" fill="#165a5a" />
    case 'sea':
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
    case 'sky':
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
    case 'grass':
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
    case 'night':
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
    case 'sunset':
      return (
        <>
          <rect width="64" height="64" fill="#f0a060" />
          <rect width="64" height="14" fill="#6b3a8a" />
          <rect y="12" width="64" height="10" fill="#c45c8a" />
          <rect y="22" width="64" height="12" fill="#e87850" />
          <rect y="34" width="64" height="12" fill="#f0a040" />
          <rect y="46" width="64" height="10" fill="#d47830" />
          <rect y="56" width="64" height="8" fill="#3a2a28" />
          <rect x="40" y="28" width="12" height="12" fill="#ffe8a0" />
        </>
      )
    case 'snowfield':
      return (
        <>
          <rect width="64" height="64" fill="#c8d8ec" />
          <rect width="64" height="18" fill="#9eb8d8" />
          <rect y="40" width="64" height="24" fill="#eef4fa" />
          <rect y="38" width="64" height="4" fill="#dce6f2" />
          <rect x="8" y="28" width="4" height="12" fill="#6b7a88" />
          <rect x="2" y="20" width="16" height="10" fill="#f7fbff" />
          <rect x="44" y="8" width="10" height="10" fill="#fff6c8" opacity="0.85" />
          <rect x="20" y="48" width="3" height="3" fill="#ffffff" />
          <rect x="36" y="52" width="2" height="2" fill="#ffffff" />
          <rect x="50" y="46" width="2" height="2" fill="#ffffff" />
        </>
      )
    case 'cherry':
      return (
        <>
          <rect width="64" height="64" fill="#f2c8d8" />
          <rect width="64" height="20" fill="#e8a8c0" />
          <rect y="48" width="64" height="16" fill="#7cb86a" />
          <rect y="46" width="64" height="4" fill="#8ec878" />
          <rect x="10" y="22" width="4" height="26" fill="#6b4423" />
          <rect x="2" y="12" width="20" height="14" fill="#f6a0b8" />
          <rect x="38" y="18" width="4" height="20" fill="#6b4423" />
          <rect x="30" y="8" width="22" height="16" fill="#ffb0c8" />
          <rect x="48" y="28" width="10" height="8" fill="#ffc8d8" />
        </>
      )
    case 'mesa':
      return (
        <>
          <rect width="64" height="64" fill="#e8b878" />
          <rect width="64" height="10" fill="#c87848" />
          <rect y="10" width="64" height="8" fill="#d89058" />
          <rect y="18" width="64" height="8" fill="#e0a068" />
          <rect y="26" width="64" height="8" fill="#c07040" />
          <rect y="34" width="64" height="10" fill="#a85830" />
          <rect y="44" width="64" height="10" fill="#8a4828" />
          <rect y="54" width="64" height="10" fill="#6e3a20" />
          <rect x="8" y="20" width="20" height="6" fill="#f0c898" />
        </>
      )
    case 'nether':
      return (
        <>
          <rect width="64" height="64" fill="#2a0e12" />
          <rect y="40" width="64" height="24" fill="#4a1418" />
          <rect y="38" width="64" height="4" fill="#6a2020" />
          <rect x="0" y="48" width="18" height="16" fill="#c45a18" />
          <rect x="46" y="44" width="18" height="20" fill="#e07020" />
          <rect x="20" y="52" width="12" height="12" fill="#ff9030" />
          <rect x="8" y="10" width="6" height="6" fill="#3a8a7a" />
          <rect x="48" y="14" width="4" height="4" fill="#2a7060" />
          <rect x="28" y="6" width="3" height="3" fill="#50a090" />
        </>
      )
    case 'end':
      return (
        <>
          <rect width="64" height="64" fill="#1a0a28" />
          <rect y="44" width="64" height="20" fill="#2a1840" />
          <rect x="26" y="8" width="12" height="12" fill="#d8c8f0" />
          <rect x="28" y="10" width="8" height="8" fill="#f0e8ff" />
          <rect x="6" y="12" width="2" height="2" fill="#c8a0ff" />
          <rect x="50" y="18" width="2" height="2" fill="#e0c8ff" />
          <rect x="16" y="28" width="1" height="1" fill="#ffffff" />
          <rect x="40" y="24" width="1" height="1" fill="#ffffff" />
          <rect x="54" y="36" width="2" height="2" fill="#b080ff" />
          <rect x="10" y="40" width="1" height="1" fill="#ffffff" />
          <rect x="30" y="36" width="4" height="8" fill="#5a3080" />
        </>
      )
    case 'cave':
      return (
        <>
          <rect width="64" height="64" fill="#1c1e24" />
          <rect y="0" width="64" height="12" fill="#2a2e38" />
          <rect y="52" width="64" height="12" fill="#242830" />
          <rect x="8" y="20" width="6" height="6" fill="#3a8fd0" />
          <rect x="48" y="28" width="5" height="5" fill="#c45c4a" />
          <rect x="28" y="36" width="4" height="4" fill="#e0b03a" />
          <rect x="16" y="44" width="3" height="3" fill="#5d9c3f" />
          <rect x="40" y="14" width="8" height="4" fill="#3a3e48" />
          <rect x="4" y="32" width="10" height="4" fill="#323640" />
        </>
      )
    case 'aurora':
      return (
        <>
          <rect width="64" height="64" fill="#0c1428" />
          <rect y="8" width="64" height="8" fill="#1a4060" opacity="0.9" />
          <rect y="14" width="64" height="8" fill="#2a8068" opacity="0.85" />
          <rect y="20" width="64" height="8" fill="#48c090" opacity="0.75" />
          <rect y="26" width="64" height="6" fill="#70e0c0" opacity="0.55" />
          <rect y="30" width="64" height="6" fill="#a080e0" opacity="0.45" />
          <rect y="50" width="64" height="14" fill="#12182a" />
          <rect x="10" y="40" width="2" height="2" fill="#f2f6ff" />
          <rect x="44" y="38" width="1" height="1" fill="#f2f6ff" />
          <rect x="28" y="44" width="2" height="2" fill="#dce7ff" />
        </>
      )
    case 'crystal':
      return (
        <>
          <rect width="64" height="64" fill="#1a1230" />
          <rect x="22" y="8" width="20" height="48" fill="#6a40c0" />
          <rect x="26" y="12" width="12" height="40" fill="#9870f0" />
          <rect x="30" y="16" width="6" height="28" fill="#d0b8ff" />
          <rect x="8" y="24" width="12" height="28" fill="#40a0c8" opacity="0.85" />
          <rect x="44" y="20" width="12" height="32" fill="#c060d0" opacity="0.8" />
          <rect x="12" y="28" width="4" height="16" fill="#a0e0ff" />
          <rect x="48" y="26" width="4" height="18" fill="#f0a0ff" />
        </>
      )
    case 'lava':
      return (
        <>
          <rect width="64" height="64" fill="#2a1810" />
          <rect y="28" width="64" height="36" fill="#c04010" />
          <rect y="28" width="64" height="8" fill="#e07020" />
          <rect y="36" width="64" height="10" fill="#ff9020" />
          <rect y="46" width="64" height="10" fill="#ffb030" />
          <rect y="56" width="64" height="8" fill="#ff6010" />
          <rect x="10" y="0" width="8" height="32" fill="#e05010" />
          <rect x="12" y="4" width="4" height="28" fill="#ff8018" />
          <rect x="40" y="8" width="10" height="24" fill="#d03808" />
        </>
      )
    case 'deepDark':
      return (
        <>
          <rect width="64" height="64" fill="#0a1214" />
          <rect y="0" width="64" height="10" fill="#102028" />
          <rect y="54" width="64" height="10" fill="#0e1c20" />
          <rect x="8" y="18" width="16" height="4" fill="#1a6870" />
          <rect x="40" y="28" width="12" height="4" fill="#148890" />
          <rect x="20" y="38" width="20" height="4" fill="#0e6068" />
          <rect x="28" y="22" width="4" height="4" fill="#30d0d8" />
          <rect x="12" y="44" width="3" height="3" fill="#20b0b8" />
          <rect x="48" y="16" width="2" height="2" fill="#40e0e8" />
        </>
      )
    case 'rainbow':
      return (
        <>
          <rect width="64" height="64" fill="#1a1a28" />
          <rect y="8" width="64" height="7" fill="#e05050" />
          <rect y="15" width="64" height="7" fill="#e09040" />
          <rect y="22" width="64" height="7" fill="#e0d040" />
          <rect y="29" width="64" height="7" fill="#50c060" />
          <rect y="36" width="64" height="7" fill="#4090e0" />
          <rect y="43" width="64" height="7" fill="#6050d0" />
          <rect y="50" width="64" height="7" fill="#a050c0" />
        </>
      )
    case 'goldVein':
      return (
        <>
          <rect width="64" height="64" fill="#2a2418" />
          <rect x="0" y="10" width="64" height="6" fill="#3a3220" />
          <rect x="0" y="40" width="64" height="6" fill="#322818" />
          <rect x="8" y="8" width="14" height="8" fill="#e0b03a" />
          <rect x="36" y="22" width="18" height="6" fill="#f0c850" />
          <rect x="16" y="36" width="10" height="10" fill="#d4a028" />
          <rect x="44" y="44" width="12" height="8" fill="#e8b840" />
          <rect x="4" y="48" width="8" height="4" fill="#c09020" />
        </>
      )
    case 'void':
      return (
        <>
          <rect width="64" height="64" fill="#050508" />
          <rect x="0" y="0" width="64" height="4" fill="#2a1040" />
          <rect x="0" y="60" width="64" height="4" fill="#2a1040" />
          <rect x="0" y="0" width="4" height="64" fill="#2a1040" />
          <rect x="60" y="0" width="4" height="64" fill="#2a1040" />
          <rect x="28" y="28" width="8" height="8" fill="#4a2080" opacity="0.7" />
          <rect x="16" y="16" width="2" height="2" fill="#8050c0" />
          <rect x="46" y="40" width="2" height="2" fill="#a070e0" />
        </>
      )
    case 'oceanDeep':
      return (
        <>
          <rect width="64" height="64" fill="#061828" />
          <rect width="64" height="16" fill="#0a2848" />
          <rect y="16" width="64" height="16" fill="#0c3860" />
          <rect y="32" width="64" height="16" fill="#0a4870" />
          <rect y="48" width="64" height="16" fill="#083858" />
          <rect x="12" y="20" width="8" height="3" fill="#3ab0d0" opacity="0.5" />
          <rect x="40" y="36" width="12" height="3" fill="#50c8e0" opacity="0.4" />
          <rect x="24" y="50" width="6" height="2" fill="#70e0f0" opacity="0.35" />
        </>
      )
    case 'swamp':
      return (
        <>
          <rect width="64" height="64" fill="#2a3820" />
          <rect width="64" height="18" fill="#3a4830" />
          <rect y="40" width="64" height="24" fill="#1a4028" />
          <rect y="38" width="64" height="6" fill="#2a5838" />
          <rect x="10" y="16" width="4" height="24" fill="#3a2818" />
          <rect x="4" y="8" width="16" height="12" fill="#4a6830" />
          <rect x="42" y="20" width="3" height="18" fill="#3a2818" />
          <rect x="36" y="12" width="14" height="10" fill="#3a5828" />
          <rect x="20" y="44" width="8" height="4" fill="#50a040" opacity="0.6" />
        </>
      )
  }
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
      fixedHeight
      overlayClassName="z-[90]"
      contentClassName="!flex min-h-0 !overflow-hidden"
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
      <div className="flex min-h-0 flex-1 items-stretch gap-6">
        <div className="flex w-52 shrink-0 flex-col items-center self-start pt-14">
          <InstanceIconTile preset={value} size="xl" />
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto border-l border-[var(--color-border)] pl-6 pr-1">
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
      fixedHeight
      overlayClassName="z-[90]"
      contentClassName="!flex min-h-0 !overflow-hidden"
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
      <div className="flex min-h-0 flex-1 items-stretch gap-6">
        <div className="flex w-44 shrink-0 flex-col items-center gap-3 self-start pt-14">
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

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto border-l border-[var(--color-border)] pl-6 pr-1">
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
