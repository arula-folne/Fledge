import { useMemo } from 'react'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function safeUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim())
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href
  } catch {
    /* ignore */
  }
  return null
}

function markdownToHtml(md: string): string {
  let s = escapeHtml(md.replace(/\r\n/g, '\n'))
  s = s.replace(/```[\w-]*\n([\s\S]*?)```/g, (_m, code: string) => `<pre><code>${code}</code></pre>`)
  s = s.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  s = s.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  s = s.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt: string, href: string) => {
    const url = safeUrl(href)
    return url ? `<img src="${url}" alt="${alt}" />` : alt
  })
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, href: string) => {
    const url = safeUrl(href)
    return url
      ? `<a href="${url}" target="_blank" rel="noreferrer noopener">${label}</a>`
      : label
  })
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  s = s.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
  s = s.replace(/^(?:- |\* )(.+)$/gm, '<li>$1</li>')
  s = s.replace(/(?:<li>.*<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`)
  s = s.replace(/^(?!<h\d|<ul|<pre|<blockquote|<img|<p|<\/)(.+)$/gm, '<p>$1</p>')
  s = s.replace(/\n{2,}/g, '')
  return s
}

export function MarkdownBody({ text }: { text: string }) {
  const html = useMemo(() => markdownToHtml(text), [text])
  if (!text.trim()) return null
  return (
    <div
      className="modrinth-md text-sm leading-relaxed text-[var(--color-text)]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
