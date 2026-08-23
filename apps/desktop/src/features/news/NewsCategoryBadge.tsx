import { newsCategoryClass } from './newsFormat'

export function NewsCategoryBadge({
  category,
  className = '',
}: {
  category: string
  className?: string
}) {
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none',
        newsCategoryClass(category),
        className,
      ].join(' ')}
    >
      {category}
    </span>
  )
}
