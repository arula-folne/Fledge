import type { InputHTMLAttributes } from 'react'

export function TextField(
  props: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string },
) {
  const { label, hint, className = '', id, ...rest } = props
  return (
    <label className="flex flex-col gap-1 text-sm text-[var(--color-text)]">
      {label ? <span className="font-medium">{label}</span> : null}
      {hint ? <span className="text-xs text-[var(--color-text-muted)]">{hint}</span> : null}
      <input
        id={id}
        className={[
          'rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-[var(--color-text)] outline-none',
          'placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] disabled:opacity-50',
          className,
        ].join(' ')}
        {...rest}
      />
    </label>
  )
}
