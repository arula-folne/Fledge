import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

type Props = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success'
  }
>

const styles: Record<NonNullable<Props['variant']>, string> = {
  primary:
    'rounded-full bg-[var(--color-accent)] text-[var(--color-on-accent)] brightness-110 hover:brightness-125 disabled:opacity-50',
  secondary:
    'rounded-[var(--radius-sm)] bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] hover:bg-[var(--color-hover)] disabled:opacity-50',
  danger:
    'rounded-full bg-[var(--color-danger)] text-white brightness-110 hover:brightness-125 disabled:opacity-50',
  ghost:
    'rounded-[var(--radius-sm)] bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] disabled:opacity-50',
  success:
    'rounded-full bg-[var(--color-success)] text-white brightness-110 hover:brightness-125 disabled:opacity-50',
}

export function Button({ variant = 'secondary', className = '', children, ...rest }: Props) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium transition active:scale-[0.99]',
        styles[variant],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
}
