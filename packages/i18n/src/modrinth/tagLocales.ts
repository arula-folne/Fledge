import tagCategories from './tag-categories.json'

/** Crowdin 由来の Modrinth UI カテゴリ名（tag.category.*） */
const CATEGORIES = tagCategories as Record<string, Record<string, string>>

export const MODRINTH_LOCALE_CODES = Object.keys(CATEGORIES)

const LANG_DEFAULT: Record<string, string> = {
  cs: 'cs-CZ',
  da: 'da-DK',
  de: 'de-DE',
  en: 'en-US',
  es: 'es-ES',
  fi: 'fi-FI',
  fil: 'fil-PH',
  fr: 'fr-FR',
  he: 'he-IL',
  hu: 'hu-HU',
  id: 'id-ID',
  it: 'it-IT',
  ja: 'ja-JP',
  ko: 'ko-KR',
  ms: 'ms-MY',
  nl: 'nl-NL',
  no: 'no-NO',
  pl: 'pl-PL',
  pt: 'pt-BR',
  ro: 'ro-RO',
  ru: 'ru-RU',
  sr: 'sr-CS',
  sv: 'sv-SE',
  th: 'th-TH',
  tr: 'tr-TR',
  uk: 'uk-UA',
  vi: 'vi-VN',
  zh: 'zh-CN',
}

function normalizeLocale(locale: string): string {
  return locale.trim().replace(/_/g, '-')
}

/** Fledge の locale（`ja` / `ja-JP` など）を Modrinth のロケールコードへ。未対応なら `en-US`。 */
export function resolveModrinthLocale(fledgeLocale: string): string {
  const raw = normalizeLocale(fledgeLocale)
  if (!raw) return 'en-US'
  const exact = MODRINTH_LOCALE_CODES.find((code) => code.toLowerCase() === raw.toLowerCase())
  if (exact) return exact

  const lang = raw.split('-')[0]?.toLowerCase() ?? ''
  const mapped = LANG_DEFAULT[lang]
  if (mapped && CATEGORIES[mapped]) return mapped

  const prefix = MODRINTH_LOCALE_CODES.find((code) => code.toLowerCase().startsWith(`${lang}-`))
  return prefix ?? 'en-US'
}

export function isModrinthLocaleSupported(fledgeLocale: string): boolean {
  const raw = normalizeLocale(fledgeLocale)
  if (!raw) return false
  if (MODRINTH_LOCALE_CODES.some((code) => code.toLowerCase() === raw.toLowerCase())) return true
  const lang = raw.split('-')[0]?.toLowerCase() ?? ''
  const mapped = LANG_DEFAULT[lang]
  return Boolean(mapped && CATEGORIES[mapped] && Object.keys(CATEGORIES[mapped]).length > 0)
}

/** 指定言語のカテゴリ表示名。その言語に無いキーは en-US、それも無ければ undefined。 */
export function modrinthCategoryLabel(fledgeLocale: string, tag: string): string | undefined {
  const loc = resolveModrinthLocale(fledgeLocale)
  return CATEGORIES[loc]?.[tag] || CATEGORIES['en-US']?.[tag]
}
