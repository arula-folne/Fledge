const TITLE_TAG_RE = /^【([^】]+)】\s*(.*)$/

export function parseNewsTitle(title: string): { category: string | null; label: string } {
  const match = title.match(TITLE_TAG_RE)
  if (!match) return { category: null, label: title }
  return { category: match[1] ?? null, label: match[2] || title }
}

export function newsCategoryClass(category: string): string {
  switch (category) {
    case '重要':
      return 'border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
    case 'バージョンアップ':
      return 'border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]'
    case '修正':
      return 'border-[var(--color-version-snapshot)]/30 bg-[var(--color-version-snapshot)]/10 text-[var(--color-version-snapshot)]'
    default:
      return 'border-[var(--color-border)] bg-[var(--color-accent-soft)] text-[var(--color-text-muted)]'
  }
}

/** 一覧用: Markdown を除いた先頭の概要文 */
export function newsPreview(body: string): string {
  const plain = body
    .replace(/\r\n/g, '\n')
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()

  const block = plain.split(/\n\n+/).find((part) => part.trim()) ?? plain
  return block.split('\n').find((line) => line.trim())?.trim() ?? block.trim()
}
