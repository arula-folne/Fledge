import i18n from '../../i18n'
import { romajiToHiragana, toHiragana } from './romajiKana'
import type { SettingsSection } from '../../stores/appStores'

export type SettingsSearchItemId =
  | 'nav.appGeneral'
  | 'nav.appTheme'
  | 'nav.appLanguage'
  | 'nav.minecraftLaunch'
  | 'nav.minecraftInitial'
  | 'nav.java'
  | 'nav.account'
  | 'nav.resources'
  | 'nav.privacyCredits'
  | 'nav.debug'
  | 'launcherWindowSize'
  | 'uiScale'
  | 'minimizeOnLaunch'
  | 'homeNewsVisible'
  | 'discordRichPresence'
  | 'hardwareAcceleration'
  | 'themeStandard'
  | 'themeSeason'
  | 'language'
  | 'fullscreen'
  | 'gameWindowSize'
  | 'memory'
  | 'defaultJvmArgs'
  | 'mc.lang'
  | 'mc.subtitles'
  | 'mc.autoJump'
  | 'mc.bobView'
  | 'mc.fov'
  | 'mc.maxFps'
  | 'mc.vsync'
  | 'mc.fpsCondition'
  | 'mc.guiScale'
  | 'mc.brightness'
  | 'mc.renderDistance'
  | 'mc.simulationDistance'
  | 'mc.showFps'
  | 'mc.fpsExtended'
  | 'mc.fpsContrast'
  | 'mc.masterVolume'
  | 'mc.music'
  | 'mc.weather'
  | 'mc.record'
  | 'mc.block'
  | 'mc.mouseSensitivity'
  | 'mc.operatorItemsTab'
  | 'mc.keybinds'
  | 'java'
  | 'account'
  | 'appDirectory'
  | 'downloads'
  | 'options'
  | 'tutorial'
  | 'clearCache'
  | 'resetAll'
  | 'factoryReset'
  | 'privacy'
  | 'credits'
  | 'about'
  | 'debug.libraryGrid'
  | 'debug.libraryPlaceholders'
  | 'debug.createSpin'
  | 'debug.launchProgress'
  | 'debug.launchError'

export type SettingsSearchItem = {
  id: SettingsSearchItemId
  section: SettingsSection
  labelKeys: string[]
  /** 日本語読み（ひらがな・ローマ字）。漢字ラベルをローマ字入力で当てるため */
  readings?: string[]
  aliases?: string[]
}

export const SETTINGS_SEARCH_CATALOG: SettingsSearchItem[] = [
  {
    id: 'nav.appGeneral',
    section: 'appGeneral',
    labelKeys: ['settings.section.appGeneral', 'settings.group.app', 'settings.block.windowGeneral'],
    readings: ['kihon', 'きほん', 'settei', 'せってい', 'app', 'アプリ'],
  },
  {
    id: 'nav.appTheme',
    section: 'appTheme',
    labelKeys: [
      'settings.section.appTheme',
      'settings.block.standardTheme',
      'settings.block.seasonTheme',
    ],
    readings: ['tema', 'てま', 'theme'],
  },
  {
    id: 'nav.appLanguage',
    section: 'appLanguage',
    labelKeys: ['settings.section.language', 'settings.block.language'],
    readings: ['gengo', 'げんご', 'hyouji', 'ひょうじ', 'language', 'locale'],
  },
  {
    id: 'nav.minecraftLaunch',
    section: 'minecraftLaunch',
    labelKeys: ['settings.section.minecraftLaunch', 'settings.block.gameWindow', 'settings.block.gamePerformance'],
    readings: ['kidou', 'きどう', 'launch'],
  },
  {
    id: 'nav.minecraftInitial',
    section: 'minecraftInitial',
    labelKeys: ['settings.section.minecraftInitial', 'settings.block.minecraftInitial'],
    readings: ['shoki', 'しょき', 'initial', 'options'],
  },
  {
    id: 'nav.java',
    section: 'java',
    labelKeys: ['settings.section.java'],
    readings: ['java', 'じゃば', 'インストール'],
    aliases: ['jdk', 'jre', 'temurin'],
  },
  {
    id: 'nav.account',
    section: 'account',
    labelKeys: ['settings.section.account'],
    readings: ['akaunto', 'あかうんと', 'account', 'microsoft'],
  },
  {
    id: 'nav.resources',
    section: 'resources',
    labelKeys: ['settings.section.resources'],
    readings: ['risosu', 'りそす', 'resource', 'kanri', 'かんり'],
  },
  {
    id: 'nav.privacyCredits',
    section: 'privacyCredits',
    labelKeys: ['settings.section.privacyCredits', 'settings.block.privacy', 'settings.block.credits'],
    readings: ['puraibashi', 'ぷらいばしー', 'kurejitto', 'くれじっと', 'privacy', 'credits'],
  },
  {
    id: 'nav.debug',
    section: 'debug',
    labelKeys: ['settings.section.debug'],
    readings: ['debaggu', 'でばっぐ', 'debug'],
  },

  {
    id: 'launcherWindowSize',
    section: 'appGeneral',
    labelKeys: ['settings.launcherWindowSize', 'settings.launcherWindowSizeHint'],
    readings: ['uindou', 'うぃんどう', 'saizu', 'さいず', 'window'],
  },
  {
    id: 'uiScale',
    section: 'appGeneral',
    labelKeys: ['settings.uiScale', 'settings.uiScaleHint'],
    readings: ['ui', 'ゆーあい', 'saizu', 'さいず', 'scale'],
  },
  {
    id: 'minimizeOnLaunch',
    section: 'appGeneral',
    labelKeys: ['settings.minimizeOnLaunch', 'settings.minimizeOnLaunchHint'],
    readings: ['saishouka', 'さいしょうか', 'minimize'],
  },
  {
    id: 'homeNewsVisible',
    section: 'appGeneral',
    labelKeys: ['settings.homeNewsVisible', 'settings.homeNewsVisibleHint'],
    readings: ['oshirase', 'おしらせ', 'home', 'news'],
  },
  {
    id: 'discordRichPresence',
    section: 'appGeneral',
    labelKeys: ['settings.discordRichPresence', 'settings.discordRichPresenceHint'],
    readings: ['disukodo', 'でぃすこーど', 'discord', 'rpc'],
    aliases: ['rich presence', 'discord rpc'],
  },
  {
    id: 'hardwareAcceleration',
    section: 'appGeneral',
    labelKeys: ['settings.hardwareAcceleration', 'settings.hardwareAccelerationHint'],
    readings: ['hadouea', 'はーどうぇあ', 'akasere', 'あくせれ', 'gpu'],
    aliases: ['hw accel', 'hardware'],
  },

  {
    id: 'themeStandard',
    section: 'appTheme',
    labelKeys: [
      'settings.block.standardTheme',
      'settings.theme.light',
      'settings.theme.dark',
      'settings.theme.color',
      'settings.theme.oled',
      'settings.theme.system',
      'settings.themeColor',
    ],
    readings: ['sutandado', 'すたんだーど', 'light', 'dark', 'color', 'oled'],
  },
  {
    id: 'themeSeason',
    section: 'appTheme',
    labelKeys: ['settings.block.seasonTheme'],
    readings: ['shizun', 'しーずん', 'ibento', 'いべんと', 'season', 'event'],
  },

  {
    id: 'language',
    section: 'appLanguage',
    labelKeys: ['settings.section.language', 'settings.block.language', 'settings.language.hint'],
    readings: ['gengo', 'げんご', 'language', 'locale'],
  },

  {
    id: 'fullscreen',
    section: 'minecraftLaunch',
    labelKeys: ['settings.fullscreen', 'settings.fullscreenHint'],
    readings: ['furusukurin', 'ふるすくりーん', 'fullscreen'],
  },
  {
    id: 'gameWindowSize',
    section: 'minecraftLaunch',
    labelKeys: ['settings.windowSize', 'settings.windowSizeHint'],
    readings: ['uindou', 'うぃんどう', 'saizu', 'さいず', 'window'],
  },
  {
    id: 'memory',
    section: 'minecraftLaunch',
    labelKeys: ['settings.memory', 'settings.memoryHint'],
    readings: ['memori', 'めもり', 'ram', 'memory'],
  },
  {
    id: 'defaultJvmArgs',
    section: 'minecraftLaunch',
    labelKeys: ['settings.defaultJvmArgs', 'settings.defaultJvmArgsHint'],
    readings: ['jvm', 'じぇいぶいえむ', 'hikisu', 'ひきす', 'args'],
    aliases: ['jvm args', 'java args'],
  },

  {
    id: 'mc.lang',
    section: 'minecraftInitial',
    labelKeys: ['settings.minecraftInitial.lang', 'settings.minecraftInitial.group.game'],
    readings: ['gengo', 'げんご', 'language'],
  },
  {
    id: 'mc.subtitles',
    section: 'minecraftInitial',
    labelKeys: ['settings.minecraftInitial.subtitles'],
    readings: ['jimaku', 'じまく', 'subtitles', 'captions'],
  },
  {
    id: 'mc.autoJump',
    section: 'minecraftInitial',
    labelKeys: ['settings.minecraftInitial.autoJump'],
    readings: ['otojanpu', 'おーとじゃんぷ', 'autojump', 'auto jump'],
  },
  {
    id: 'mc.bobView',
    section: 'minecraftInitial',
    labelKeys: ['settings.minecraftInitial.bobView'],
    readings: ['yure', 'ゆれ', 'bob', 'view bobbing'],
  },
  {
    id: 'mc.fov',
    section: 'minecraftInitial',
    labelKeys: ['settings.minecraftInitial.fov'],
    readings: ['shiya', 'しや', 'fov', 'field of view'],
  },
  {
    id: 'mc.maxFps',
    section: 'minecraftInitial',
    labelKeys: ['settings.minecraftInitial.maxFps', 'settings.minecraftInitial.group.video'],
    readings: ['fps', 'ふれーむ', 'framerate', 'frame rate'],
  },
  {
    id: 'mc.vsync',
    section: 'minecraftInitial',
    labelKeys: ['settings.minecraftInitial.vsync'],
    readings: ['suichoku', 'すいちょく', 'douki', 'どうき', 'vsync'],
  },
  {
    id: 'mc.fpsCondition',
    section: 'minecraftInitial',
    labelKeys: [
      'settings.minecraftInitial.fpsCondition',
      'settings.minecraftInitial.fpsConditionAfk',
      'settings.minecraftInitial.fpsConditionMinimized',
    ],
    readings: ['afk', '放置', 'ほうち', 'saishouka', 'さいしょうか'],
  },
  {
    id: 'mc.guiScale',
    section: 'minecraftInitial',
    labelKeys: ['settings.minecraftInitial.guiScale', 'settings.minecraftInitial.guiScaleAuto'],
    readings: ['gui', 'じーゆーあい', 'ookisa', 'おおきさ', 'scale'],
  },
  {
    id: 'mc.brightness',
    section: 'minecraftInitial',
    labelKeys: ['settings.minecraftInitial.brightness'],
    readings: ['akarusa', 'あかるさ', 'gamma', 'brightness'],
  },
  {
    id: 'mc.renderDistance',
    section: 'minecraftInitial',
    labelKeys: ['settings.minecraftInitial.renderDistance'],
    readings: ['byouga', 'びょうが', 'kyori', 'きょり', 'render distance', 'rd'],
  },
  {
    id: 'mc.simulationDistance',
    section: 'minecraftInitial',
    labelKeys: ['settings.minecraftInitial.simulationDistance'],
    readings: ['enzan', 'えんざん', 'kyori', 'きょり', 'simulation distance', 'sd'],
  },
  {
    id: 'mc.showFps',
    section: 'minecraftInitial',
    labelKeys: ['settings.minecraftInitial.showFps'],
    readings: ['fps', 'hyouji', 'ひょうじ'],
  },
  {
    id: 'mc.fpsExtended',
    section: 'minecraftInitial',
    labelKeys: ['settings.minecraftInitial.fpsExtended'],
    readings: ['kakuchou', 'かくちょう', 'extended'],
  },
  {
    id: 'mc.fpsContrast',
    section: 'minecraftInitial',
    labelKeys: ['settings.minecraftInitial.fpsContrast'],
    readings: ['kontorasuto', 'こんとらすと', 'contrast'],
  },
  {
    id: 'mc.masterVolume',
    section: 'minecraftInitial',
    labelKeys: ['settings.minecraftInitial.masterVolume', 'settings.minecraftInitial.group.audio'],
    readings: ['onryou', 'おんりょう', 'volume', 'master'],
  },
  {
    id: 'mc.music',
    section: 'minecraftInitial',
    labelKeys: ['settings.minecraftInitial.music'],
    readings: ['bgm', 'びーじーえむ', 'ongaku', 'おんがく', 'music'],
  },
  {
    id: 'mc.weather',
    section: 'minecraftInitial',
    labelKeys: ['settings.minecraftInitial.weather'],
    readings: ['tenkou', 'てんこう', 'weather', 'rain'],
  },
  {
    id: 'mc.record',
    section: 'minecraftInitial',
    labelKeys: ['settings.minecraftInitial.record'],
    readings: ['jukebox', 'note', 'レコード'],
  },
  {
    id: 'mc.block',
    section: 'minecraftInitial',
    labelKeys: ['settings.minecraftInitial.block'],
    readings: ['burokku', 'ぶろっく', 'block'],
  },
  {
    id: 'mc.mouseSensitivity',
    section: 'minecraftInitial',
    labelKeys: [
      'settings.minecraftInitial.mouseSensitivity',
      'settings.minecraftInitial.group.controls',
    ],
    readings: ['mausu', 'まうす', 'kando', 'かんど', 'sensitivity'],
  },
  {
    id: 'mc.operatorItemsTab',
    section: 'minecraftInitial',
    labelKeys: ['settings.minecraftInitial.operatorItemsTab'],
    readings: ['kanrisha', 'かんりしゃ', 'operator', 'creative'],
  },
  {
    id: 'mc.keybinds',
    section: 'minecraftInitial',
    labelKeys: [
      'settings.minecraftInitial.keybinds.label',
      'settings.minecraftInitial.keybinds.title',
    ],
    readings: ['sousa', 'そうさ', 'kiibaindo', 'きーばいんど', 'keybind', 'controls'],
  },

  {
    id: 'java',
    section: 'java',
    labelKeys: [
      'settings.section.java',
      'settings.java.install',
      'settings.java.reinstall',
      'settings.java.uninstall',
      'settings.java.verify',
      'settings.java.openFolder',
    ],
    readings: ['java', 'じゃば', 'temurin'],
    aliases: ['jdk', 'jre', 'eclipse temurin'],
  },

  {
    id: 'account',
    section: 'account',
    labelKeys: [
      'settings.section.account',
      'settings.account.current',
      'settings.account.uuid',
      'settings.account.multiHint',
      'auth.addAccount',
      'auth.savedAccounts',
    ],
    readings: ['akaunto', 'あかうんと', 'microsoft', 'login'],
  },

  {
    id: 'appDirectory',
    section: 'resources',
    labelKeys: ['settings.appDirectory', 'settings.appDirectoryHint', 'settings.openAppDirectory'],
    readings: ['data', 'でーた', 'directory', 'folder', 'フォルダ'],
  },
  {
    id: 'downloads',
    section: 'resources',
    labelKeys: [
      'settings.block.downloads',
      'settings.concurrentDownloads',
      'settings.concurrentDownloadsHint',
      'settings.maxWriteConcurrency',
      'settings.maxWriteConcurrencyHint',
    ],
    readings: ['daunrodo', 'だうんろーど', 'download', 'heiretsu', 'へいれつ'],
  },
  {
    id: 'options',
    section: 'resources',
    labelKeys: [
      'settings.optionsTitle',
      'settings.optionsHint',
      'settings.optionsExport',
      'settings.optionsImport',
    ],
    readings: ['import', 'export', 'option', 'flg', 'いんぽーと', 'えくすぽーと'],
    aliases: ['option.flg'],
  },
  {
    id: 'tutorial',
    section: 'resources',
    labelKeys: [
      'settings.block.tutorial',
      'settings.installTutorial',
      'settings.installTutorialHint',
      'settings.startInstallTutorial',
    ],
    readings: ['chutoriaru', 'ちゅーとりある', 'tutorial', '案内'],
  },
  {
    id: 'clearCache',
    section: 'resources',
    labelKeys: ['settings.clearCache', 'settings.clearCacheHint', 'settings.block.maintenance'],
    readings: ['kyasshu', 'きゃっしゅ', 'cache', 'clear'],
  },
  {
    id: 'resetAll',
    section: 'resources',
    labelKeys: ['settings.resetAll', 'settings.resetAllHint'],
    readings: ['risetto', 'りせっと', 'reset'],
  },
  {
    id: 'factoryReset',
    section: 'resources',
    labelKeys: ['settings.factoryReset', 'settings.factoryResetHint'],
    readings: ['kanzen', 'かんぜん', 'factory', 'wipe'],
  },

  {
    id: 'privacy',
    section: 'privacyCredits',
    labelKeys: ['settings.block.privacy', 'settings.privacyNote'],
    readings: ['puraibashi', 'ぷらいばしー', 'privacy'],
  },
  {
    id: 'credits',
    section: 'privacyCredits',
    labelKeys: ['settings.block.credits'],
    readings: ['kurejitto', 'くれじっと', 'credits', 'license'],
  },
  {
    id: 'about',
    section: 'privacyCredits',
    labelKeys: ['settings.block.about', 'settings.aboutNote'],
    readings: ['about', 'バージョン', 'ばーじょん', 'version'],
  },

  {
    id: 'debug.libraryGrid',
    section: 'debug',
    labelKeys: ['settings.debug.libraryGrid', 'settings.debug.block.library'],
    readings: ['library', 'grid', 'debug'],
  },
  {
    id: 'debug.libraryPlaceholders',
    section: 'debug',
    labelKeys: ['settings.debug.libraryPlaceholders'],
    readings: ['placeholder', 'debug'],
  },
  {
    id: 'debug.createSpin',
    section: 'debug',
    labelKeys: ['settings.debug.createSpin'],
    readings: ['spin', 'debug'],
  },
  {
    id: 'debug.launchProgress',
    section: 'debug',
    labelKeys: ['settings.debug.launchProgress', 'settings.debug.block.launch'],
    readings: ['launch', 'progress', 'debug'],
  },
  {
    id: 'debug.launchError',
    section: 'debug',
    labelKeys: ['settings.debug.launchError'],
    readings: ['launch', 'error', 'debug'],
  },
]

function normalizeText(value: string): string {
  return toHiragana(value.normalize('NFKC')).toLowerCase().trim()
}

function queryVariants(query: string): string[] {
  const q = normalizeText(query)
  if (!q) return []
  const variants = new Set<string>([q])
  const fromRomaji = normalizeText(romajiToHiragana(q))
  if (fromRomaji) variants.add(fromRomaji)
  // スペース除去でも部分一致しやすくする
  if (q.includes(' ')) variants.add(q.replace(/\s+/g, ''))
  if (fromRomaji.includes(' ')) variants.add(fromRomaji.replace(/\s+/g, ''))
  return [...variants]
}

function collectHaystacks(item: SettingsSearchItem, locale: string): string[] {
  const locales = new Set<string>([locale, 'en', 'ja'])
  const out: string[] = []
  for (const lng of locales) {
    const t = i18n.getFixedT(lng)
    for (const key of item.labelKeys) {
      const value = String(t(key))
      if (value && value !== key) out.push(value)
    }
  }
  if (item.readings) out.push(...item.readings)
  if (item.aliases) out.push(...item.aliases)
  out.push(item.id)
  return out
}

export function itemMatchesSearch(
  item: SettingsSearchItem,
  query: string,
  locale: string,
): boolean {
  const variants = queryVariants(query)
  if (variants.length === 0) return true
  const haystacks = collectHaystacks(item, locale).map(normalizeText).filter(Boolean)
  return variants.some((v) => haystacks.some((h) => h.includes(v)))
}

export function matchSettingsSearch(
  query: string,
  locale: string,
  options?: { includeDebug?: boolean },
): {
  matchedIds: Set<SettingsSearchItemId>
  matchedSections: Set<SettingsSection>
} {
  const includeDebug = options?.includeDebug ?? false
  const matchedIds = new Set<SettingsSearchItemId>()
  const matchedSections = new Set<SettingsSection>()
  const q = query.trim()
  if (!q) {
    for (const item of SETTINGS_SEARCH_CATALOG) {
      if (item.section === 'debug' && !includeDebug) continue
      matchedIds.add(item.id)
      matchedSections.add(item.section)
    }
    return { matchedIds, matchedSections }
  }

  for (const item of SETTINGS_SEARCH_CATALOG) {
    if (item.section === 'debug' && !includeDebug) continue
    if (!itemMatchesSearch(item, q, locale)) continue
    matchedIds.add(item.id)
    matchedSections.add(item.section)
  }

  // セクション名だけがヒットした場合は、そのセクション内の項目をすべて表示する
  for (const item of SETTINGS_SEARCH_CATALOG) {
    if (item.section === 'debug' && !includeDebug) continue
    if (!item.id.startsWith('nav.')) continue
    if (!matchedIds.has(item.id)) continue
    for (const sibling of SETTINGS_SEARCH_CATALOG) {
      if (sibling.section !== item.section) continue
      if (sibling.section === 'debug' && !includeDebug) continue
      matchedIds.add(sibling.id)
    }
  }

  return { matchedIds, matchedSections }
}

export function isSettingsItemVisible(
  matchedIds: Set<SettingsSearchItemId>,
  id: SettingsSearchItemId,
  query: string,
): boolean {
  if (!query.trim()) return true
  return matchedIds.has(id)
}
