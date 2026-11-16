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
  | 'focusOnGameExit'
  | 'homeNewsVisible'
  | 'discordRichPresence'
  | 'hardwareAcceleration'
  | 'themeStandard'
  | 'themeSeason'
  | 'themeCustom'
  | 'language'
  | 'fullscreen'
  | 'gameWindowSize'
  | 'memory'
  | 'defaultJvmArgs'
  | 'mc.lang'
  | 'mc.subtitles'
  | 'mc.autoJump'
  | 'mc.bobView'
  | 'mc.tutorialHints'
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
    labelKeys: ['settings.section.minecraftLaunch', 'settings.block.behavior'],
    readings: ['kidou', 'きどう', 'launch'],
  },
  {
    id: 'nav.minecraftInitial',
    section: 'minecraftInitial',
    labelKeys: [
      'settings.section.minecraftInitial',
      'settings.block.minecraftInitial',
      'settings.minecraftInitial.hint',
    ],
    readings: ['shoki', 'しょき', 'initial', 'options', 'options.txt'],
    aliases: ['初期設定', 'マイクラ設定', 'ゲーム設定'],
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
    section: 'minecraftLaunch',
    labelKeys: ['settings.minimizeOnLaunch', 'settings.block.behavior', 'settings.section.minecraftLaunch'],
    readings: ['saishouka', 'さいしょうか', 'minimize', 'kidou', 'きどう', 'fledge'],
  },
  {
    id: 'focusOnGameExit',
    section: 'minecraftLaunch',
    labelKeys: ['settings.focusOnGameExit', 'settings.block.behavior', 'settings.section.minecraftLaunch'],
    readings: ['saizenmen', 'さいぜんめん', 'focus', 'front', 'exit', '終了', 'fledge'],
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
    id: 'themeCustom',
    section: 'appTheme',
    labelKeys: [
      'settings.block.customTheme',
      'settings.customThemeHint',
      'settings.customTheme.add',
      'settings.customTheme.full',
      'settings.themeColor',
    ],
    readings: ['kasutamu', 'かすたむ', 'haikei', 'はいけい', 'custom', 'background'],
    aliases: ['オリジナル', 'ユーザー背景', 'wallpaper'],
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
    readings: ['yure', 'ゆれ', 'bob', 'view bobbing', 'viewbobbing'],
    aliases: ['揺れ', '画面揺れ', '画面の揺れ', 'ぼびんぐ', 'ビューボビング', 'view bob'],
  },
  {
    id: 'mc.tutorialHints',
    section: 'minecraftInitial',
    labelKeys: [
      'settings.minecraftInitial.tutorialHints',
      'settings.minecraftInitial.tutorialHintsHint',
    ],
    readings: ['chutoriaru', 'ちゅーとりある', 'tutorial', 'hint', 'hints'],
    aliases: ['チュートリアル', 'ヒント', '案内', 'tutorial hints'],
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

/** 空白・記号・「の」を除いた比較用（「画面揺れ」↔「画面の揺れ」） */
function compactText(value: string): string {
  return normalizeText(value)
    .replace(/[\s\u3000_\-・。、．，'"`「」『』（）()[\]{}【】<>＜＞/\\|:;!?？！+*=~〜]/g, '')
    .replace(/の/g, '')
}

function queryVariants(query: string): string[] {
  const q = normalizeText(query)
  if (!q) return []
  const variants = new Set<string>([q])
  const fromRomaji = normalizeText(romajiToHiragana(q))
  if (fromRomaji) variants.add(fromRomaji)
  const compact = compactText(q)
  if (compact) variants.add(compact)
  const compactRomaji = compactText(fromRomaji)
  if (compactRomaji) variants.add(compactRomaji)
  if (q.includes(' ')) variants.add(q.replace(/\s+/g, ''))
  if (fromRomaji.includes(' ')) variants.add(fromRomaji.replace(/\s+/g, ''))
  return [...variants].filter(Boolean)
}

function haystackForms(value: string): string[] {
  const n = normalizeText(value)
  if (!n) return []
  const forms = new Set<string>([n])
  const c = compactText(value)
  if (c) forms.add(c)
  return [...forms]
}

const CATALOG_BY_ID = new Map(
  SETTINGS_SEARCH_CATALOG.map((item) => [item.id, item] as const),
)

const LABEL_KEY_TO_ITEM = new Map<string, SettingsSearchItemId>()
for (const item of SETTINGS_SEARCH_CATALOG) {
  for (const key of item.labelKeys) {
    if (!LABEL_KEY_TO_ITEM.has(key)) LABEL_KEY_TO_ITEM.set(key, item.id)
  }
}

/** i18n キー → 検索項目。画面文言を網羅して部分一致できるようにする */
function resolveSettingsKeyToItemId(key: string): SettingsSearchItemId | null {
  const direct = LABEL_KEY_TO_ITEM.get(key)
  if (direct) return direct

  if (key.startsWith('settings.minecraftInitial.keybinds')) return 'mc.keybinds'
  if (key.startsWith('settings.minecraftInitial.group.')) return 'nav.minecraftInitial'
  if (key === 'settings.minecraftInitial.hint') return 'nav.minecraftInitial'
  if (key === 'settings.minecraftInitial.reset' || key === 'settings.minecraftInitial.resetAll') {
    return 'nav.minecraftInitial'
  }

  const mc = /^settings\.minecraftInitial\.([A-Za-z0-9]+)/.exec(key)
  if (mc) {
    const id = `mc.${mc[1]}` as SettingsSearchItemId
    if (CATALOG_BY_ID.has(id)) return id
    // fpsContrastBackground など派生キー
    if (key.startsWith('settings.minecraftInitial.fpsContrast')) return 'mc.fpsContrast'
    if (key.startsWith('settings.minecraftInitial.fpsCondition')) return 'mc.fpsCondition'
    if (key.startsWith('settings.minecraftInitial.guiScale')) return 'mc.guiScale'
    if (key.startsWith('settings.minecraftInitial.lang')) return 'mc.lang'
    if (key.startsWith('settings.minecraftInitial.tutorialHints')) return 'mc.tutorialHints'
    return 'nav.minecraftInitial'
  }

  if (key.startsWith('settings.java') || key.startsWith('settings.section.java')) return 'java'
  if (key.startsWith('settings.account') || key.startsWith('auth.')) return 'account'
  if (key.startsWith('settings.debug.')) {
    if (key.includes('libraryGrid')) return 'debug.libraryGrid'
    if (key.includes('libraryPlaceholder')) return 'debug.libraryPlaceholders'
    if (key.includes('createSpin')) return 'debug.createSpin'
    if (key.includes('launchProgress')) return 'debug.launchProgress'
    if (key.includes('launchError')) return 'debug.launchError'
    return 'nav.debug'
  }
  if (key.startsWith('settings.options') || key.includes('option.flg')) return 'options'
  if (key.includes('factoryReset')) return 'factoryReset'
  if (key.includes('clearCache')) return 'clearCache'
  if (key.includes('resetAll')) return 'resetAll'
  if (key.includes('installTutorial') || key.includes('block.tutorial')) return 'tutorial'
  if (key.includes('concurrentDownloads') || key.includes('maxWriteConcurrency')) return 'downloads'
  if (key.includes('appDirectory')) return 'appDirectory'
  if (key.includes('discordRichPresence')) return 'discordRichPresence'
  if (key.includes('hardwareAcceleration')) return 'hardwareAcceleration'
  if (key.includes('homeNewsVisible')) return 'homeNewsVisible'
  if (key.includes('minimizeOnLaunch')) return 'minimizeOnLaunch'
  if (key.includes('focusOnGameExit')) return 'focusOnGameExit'
  if (key.includes('uiScale')) return 'uiScale'
  if (key.includes('launcherWindowSize')) return 'launcherWindowSize'
  if (key.includes('fullscreen')) return 'fullscreen'
  if (key.includes('windowSize')) return 'gameWindowSize'
  if (key.includes('memory')) return 'memory'
  if (key.includes('defaultJvmArgs') || key.includes('jvm')) return 'defaultJvmArgs'
  if (key.includes('seasonTheme') || key.includes('season.')) return 'themeSeason'
  if (key.includes('customTheme') || key.includes('custom.')) return 'themeCustom'
  if (key.includes('standardTheme') || key.includes('themeFamily') || key.includes('theme.')) {
    return 'themeStandard'
  }
  if (key.includes('language') || key.includes('locale')) return 'language'
  if (key.includes('privacy')) return 'privacy'
  if (key.includes('credits')) return 'credits'
  if (key.includes('about')) return 'about'

  if (key.startsWith('settings.section.') || key.startsWith('settings.block.') || key.startsWith('settings.group.')) {
    for (const item of SETTINGS_SEARCH_CATALOG) {
      if (!item.id.startsWith('nav.')) continue
      if (item.labelKeys.includes(key)) return item.id
    }
  }

  return null
}

function flattenResourceDict(
  node: unknown,
  prefix: string,
  out: Array<{ key: string; value: string }>,
): void {
  if (typeof node === 'string') {
    if (prefix) out.push({ key: prefix, value: node })
    return
  }
  if (!node || typeof node !== 'object' || Array.isArray(node)) return
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${k}` : k
    flattenResourceDict(v, next, out)
  }
}

/** 設定画面で使う翻訳キーを項目へ紐づけた追加文言 */
function collectBundleExtras(locale: string): Map<SettingsSearchItemId, string[]> {
  const extras = new Map<SettingsSearchItemId, string[]>()
  const locales = new Set<string>([locale, 'en', 'ja'])
  for (const lng of locales) {
    const bundle = i18n.getResourceBundle(lng, 'translation') as unknown
    if (!bundle || typeof bundle !== 'object') continue
    const flat: Array<{ key: string; value: string }> = []
    // settings / auth 配下だけ対象
    const root = bundle as Record<string, unknown>
    if (root.settings) flattenResourceDict(root.settings, 'settings', flat)
    if (root.auth) flattenResourceDict(root.auth, 'auth', flat)

    for (const { key, value } of flat) {
      if (!value.trim()) continue
      const itemId = resolveSettingsKeyToItemId(key)
      if (!itemId) continue
      const list = extras.get(itemId) ?? []
      list.push(value)
      extras.set(itemId, list)
    }
  }
  return extras
}

let cachedExtrasLocale: string | null = null
let cachedExtras: Map<SettingsSearchItemId, string[]> | null = null

function bundleExtrasFor(locale: string): Map<SettingsSearchItemId, string[]> {
  if (cachedExtras && cachedExtrasLocale === locale) return cachedExtras
  cachedExtrasLocale = locale
  cachedExtras = collectBundleExtras(locale)
  return cachedExtras
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
  out.push(item.id, item.section)
  const extras = bundleExtrasFor(locale).get(item.id)
  if (extras) out.push(...extras)
  return out
}

function haystackMatchesQuery(haystacks: string[], variants: string[]): boolean {
  const forms = haystacks.flatMap(haystackForms)
  return variants.some((v) => forms.some((h) => h.includes(v)))
}

export function itemMatchesSearch(
  item: SettingsSearchItem,
  query: string,
  locale: string,
): boolean {
  const variants = queryVariants(query)
  if (variants.length === 0) return true
  return haystackMatchesQuery(collectHaystacks(item, locale), variants)
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
