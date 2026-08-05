import type { SelectHTMLAttributes } from 'react'

export function Select(
  props: SelectHTMLAttributes<HTMLSelectElement> & {
    label?: string
    options: { value: string; label: string }[]
  },
) {
  const { label, options, className = '', ...rest } = props
  return (
    <label className="flex flex-col gap-1 text-sm text-[var(--color-text)]">
      {label ? <span className="text-[var(--color-text-muted)]">{label}</span> : null}
      <select
        className={[
          'rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-[var(--color-text)] outline-none',
          'focus:border-[var(--color-accent)] disabled:opacity-50',
          className,
        ].join(' ')}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
