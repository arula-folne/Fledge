import { useEffect, useRef, type ReactNode } from 'react'
import { IconChevronDown } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { Dialog } from './Dialog'

export type ListPickItem = {
  value: string
  label: string
  suffix?: string
  suffixTone?: 'release' | 'snapshot'
}

export type ListPickGroup = {
  label?: string
  items: ListPickItem[]
}

type DialogProps = {
  open: boolean
  title: string
  groups: ListPickGroup[]
  value: string
  onSelect: (value: string) => void
  onClose: () => void
  header?: ReactNode
  empty?: string
}

const suffixToneClass: Record<NonNullable<ListPickItem['suffixTone']>, string> = {
  release: 'text-[var(--color-version-release)]',
  snapshot: 'text-[var(--color-version-snapshot)]',
}

export function ListPickDialog({
  open,
  title,
  groups,
  value,
  onSelect,
  onClose,
  header,
  empty,
}: DialogProps) {
  const { t } = useTranslation()
  const listRef = useRef<HTMLDivElement>(null)
  const hasItems = groups.some((group) => group.items.length > 0)

  useEffect(() => {
    if (!open) return
    const selected = listRef.current?.querySelector('[data-list-pick-selected="true"]')
    selected?.scrollIntoView({ block: 'nearest' })
  }, [open, value])

  return (
    <Dialog
      open={open}
      title={title}
      size="xs"
      compact
      backdrop="lighter"
      overlayClassName="z-[95]"
      onClose={onClose}
      footer={
        <Button type="button" className="px-2.5 py-1 text-xs" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        {header}
        <div
          ref={listRef}
          className="h-[min(15rem,42vh)] overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)]/40"
        >
          {hasItems ? (
            groups.map((group, index) =>
              group.items.length ? (
                <div key={group.label ?? `group-${index}`}>
                  {group.label ? (
                    <p className="sticky top-0 z-[1] bg-[var(--color-surface)] px-3 py-2 text-sm font-bold tracking-wide text-[var(--color-text-muted)]">
                      {group.label}
                    </p>
                  ) : null}
                  <ul>
                    {group.items.map((item) => {
                      const selected = item.value === value
                      return (
                        <li key={item.value}>
                          <button
                            type="button"
                            data-list-pick-selected={selected ? 'true' : undefined}
                            className={[
                              'flex w-full items-center justify-between gap-2 px-2.5 py-1 text-left text-xs',
                              selected
                                ? 'bg-[var(--color-selection-soft)] font-medium text-[var(--color-selection)]'
                                : 'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
                            ].join(' ')}
                            onClick={() => {
                              onSelect(item.value)
                              onClose()
                            }}
                          >
                            <span className="min-w-0 truncate">{item.label}</span>
                            {item.suffix ? (
                              <span
                                className={[
                                  'shrink-0 text-[10px] font-medium',
                                  item.suffixTone
                                    ? suffixToneClass[item.suffixTone]
                                    : selected
                                      ? 'text-[var(--color-selection)]/70'
                                      : 'text-[var(--color-text-muted)]',
                                ].join(' ')}
                              >
                                {item.suffix}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null,
            )
          ) : (
            <p className="px-2.5 py-4 text-center text-xs text-[var(--color-text-muted)]">
              {empty ?? t('common.loading')}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  )
}

type FieldProps = {
  label?: string
  valueLabel: string
  disabled?: boolean
  onClick: () => void
  compact?: boolean
}

export function ListPickField({ label, valueLabel, disabled, onClick, compact = false }: FieldProps) {
  return (
    <div className={['flex flex-col gap-1', compact ? 'text-xs' : 'text-sm'].join(' ')}>
      {label ? <span className="text-[var(--color-text-muted)]">{label}</span> : null}
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={[
          'flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] text-left outline-none hover:border-[var(--color-accent)] focus-visible:border-[var(--color-accent)] disabled:opacity-50',
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm',
        ].join(' ')}
      >
        <span className="min-w-0 truncate text-[var(--color-text)]">{valueLabel}</span>
        <IconChevronDown
          size={compact ? 14 : 16}
          stroke={1.75}
          className="shrink-0 text-[var(--color-text-muted)]"
        />
      </button>
    </div>
  )
}
