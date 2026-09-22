import { useEffect, useId, useMemo, useRef, useState } from 'react'

type SelectOption = { value: string; label: string }
type SelectGroup = { label: string; options: SelectOption[] }

type SelectChangeEvent = { currentTarget: { value: string } }

export function Select({
  label,
  labelClassName = '',
  options,
  groups,
  className = '',
  value,
  defaultValue,
  disabled,
  onChange,
  id: idProp,
}: {
  label?: string
  labelClassName?: string
  /** フラットな選択肢（`groups` 未指定時） */
  options?: SelectOption[]
  /** セクション付き選択肢（指定時はこちらを優先） */
  groups?: SelectGroup[]
  className?: string
  value?: string
  defaultValue?: string
  disabled?: boolean
  onChange?: (e: SelectChangeEvent) => void
  id?: string
}) {
  const autoId = useId()
  const id = idProp ?? autoId
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const flatOptions = useMemo(() => {
    if (groups?.length) return groups.flatMap((g) => g.options)
    return options ?? []
  }, [groups, options])

  const [uncontrolled, setUncontrolled] = useState(
    defaultValue ?? flatOptions[0]?.value ?? '',
  )
  const current = value ?? uncontrolled
  const currentLabel = flatOptions.find((o) => o.value === current)?.label ?? current

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const commit = (next: string) => {
    if (value === undefined) setUncontrolled(next)
    onChange?.({ currentTarget: { value: next } })
    setOpen(false)
  }

  const renderOption = (o: SelectOption) => {
    const selected = o.value === current
    return (
      <li key={o.value} role="presentation">
        <button
          type="button"
          role="option"
          aria-selected={selected}
          className={[
            'flex w-full px-3 py-1.5 text-left text-sm',
            selected
              ? 'bg-[var(--color-selection-soft)] font-medium text-[var(--color-selection)]'
              : 'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
          ].join(' ')}
          onClick={() => commit(o.value)}
        >
          {o.label}
        </button>
      </li>
    )
  }

  return (
    <div
      ref={rootRef}
      className={['relative flex flex-col gap-1 text-sm text-[var(--color-text)]', className].join(
        ' ',
      )}
    >
      {label ? (
        <span
          className={labelClassName || 'font-medium text-[var(--color-text)]'}
          id={`${id}-label`}
        >
          {label}
        </span>
      ) : null}
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={label ? `${id}-label` : undefined}
        className={[
          'flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-1.5 text-left text-[var(--color-text)] outline-none',
          'focus:border-[var(--color-accent)] disabled:opacity-50',
        ].join(' ')}
        onClick={() => {
          if (!disabled) setOpen((v) => !v)
        }}
      >
        <span className="min-w-0 truncate">{currentLabel}</span>
        <span className="shrink-0 text-[var(--color-text-muted)]" aria-hidden>
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-labelledby={label ? `${id}-label` : undefined}
          className="absolute top-[calc(100%+0.25rem)] right-0 left-0 z-50 max-h-64 overflow-y-auto overflow-x-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-sm"
        >
          {groups?.length
            ? groups.map((group, groupIndex) => (
                <li key={group.label} role="presentation">
                  <div
                    className={[
                      'px-3 pb-1 text-[11px] font-semibold text-[var(--color-text-muted)]',
                      groupIndex === 0 ? 'pt-1.5' : 'pt-2.5 border-t border-[var(--color-border)] mt-1',
                    ].join(' ')}
                    role="presentation"
                  >
                    {group.label}
                  </div>
                  <ul role="group" aria-label={group.label}>
                    {group.options.map(renderOption)}
                  </ul>
                </li>
              ))
            : (options ?? []).map(renderOption)}
        </ul>
      ) : null}
    </div>
  )
}
