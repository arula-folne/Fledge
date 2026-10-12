import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { resources, defaultLocale } from '@fledge/i18n'

function applyDocumentLang(lng: string) {
  const lang = (lng || defaultLocale).trim() || defaultLocale
  document.documentElement.lang = lang
}

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: defaultLocale,
    fallbackLng: defaultLocale,
    // zh-CN / pt-BR などを locale 分割せず、登録キーそのまま解決する
    load: 'currentOnly',
    supportedLngs: [...Object.keys(resources), 'cimode'],
    nonExplicitSupportedLngs: false,
    interpolation: { escapeValue: false },
  })
  .then(() => {
    applyDocumentLang(i18n.language)
  })

i18n.on('languageChanged', applyDocumentLang)

export default i18n
