import ja from './locales/ja.json'

export const defaultLocale = 'ja' as const

export const resources = {
  ja: { translation: ja },
} as const

export type MessageKey = keyof typeof ja

export { ja }
