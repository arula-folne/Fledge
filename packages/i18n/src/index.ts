import ja from './locales/ja.json'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'
import zhTW from './locales/zh-TW.json'
import ko from './locales/ko.json'
import de from './locales/de.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import id from './locales/id.json'
import it from './locales/it.json'
import nl from './locales/nl.json'
import pl from './locales/pl.json'
import ptBR from './locales/pt-BR.json'
import ru from './locales/ru.json'
import th from './locales/th.json'
import tr from './locales/tr.json'
import uk from './locales/uk.json'
import vi from './locales/vi.json'

export const defaultLocale = 'ja' as const

export type MessageKey = keyof typeof ja

/** 設定画面に出す言語。表示名は各言語の自称。 */
export const appLocales = [
  { id: 'ja', labelKey: 'settings.language.ja' },
  { id: 'en', labelKey: 'settings.language.en' },
  { id: 'zh-CN', labelKey: 'settings.language.zhCN' },
  { id: 'zh-TW', labelKey: 'settings.language.zhTW' },
  { id: 'ko', labelKey: 'settings.language.ko' },
  { id: 'de', labelKey: 'settings.language.de' },
  { id: 'es', labelKey: 'settings.language.es' },
  { id: 'fr', labelKey: 'settings.language.fr' },
  { id: 'id', labelKey: 'settings.language.id' },
  { id: 'it', labelKey: 'settings.language.it' },
  { id: 'nl', labelKey: 'settings.language.nl' },
  { id: 'pl', labelKey: 'settings.language.pl' },
  { id: 'pt-BR', labelKey: 'settings.language.ptBR' },
  { id: 'ru', labelKey: 'settings.language.ru' },
  { id: 'th', labelKey: 'settings.language.th' },
  { id: 'tr', labelKey: 'settings.language.tr' },
  { id: 'uk', labelKey: 'settings.language.uk' },
  { id: 'vi', labelKey: 'settings.language.vi' },
] as const

export type AppLocaleId = (typeof appLocales)[number]['id']

function translation(locale: Record<MessageKey, string>) {
  return { translation: locale satisfies Record<MessageKey, string> }
}

export const resources = {
  ja: translation(ja),
  en: translation(en),
  'zh-CN': translation(zhCN),
  'zh-TW': translation(zhTW),
  ko: translation(ko),
  de: translation(de),
  es: translation(es),
  fr: translation(fr),
  id: translation(id),
  it: translation(it),
  nl: translation(nl),
  pl: translation(pl),
  'pt-BR': translation(ptBR),
  ru: translation(ru),
  th: translation(th),
  tr: translation(tr),
  uk: translation(uk),
  vi: translation(vi),
} as const

export { ja, en, zhCN, zhTW, ko, de, es, fr, id, it, nl, pl, ptBR, ru, th, tr, uk, vi }
export { modrinthCategoryLabel, resolveModrinthLocale } from './modrinth/tagLocales'
