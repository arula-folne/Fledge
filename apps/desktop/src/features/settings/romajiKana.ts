/** カタカナ → ひらがな */
export function toHiragana(input: string): string {
  return input.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  )
}

/** 長いもの優先でマッチさせる（長さ降順で定義） */
const ROMAJI_TO_HIRAGANA: Array<readonly [string, string]> = [
  ['xtsu', 'っ'],
  ['kya', 'きゃ'],
  ['kyu', 'きゅ'],
  ['kyo', 'きょ'],
  ['gya', 'ぎゃ'],
  ['gyu', 'ぎゅ'],
  ['gyo', 'ぎょ'],
  ['sha', 'しゃ'],
  ['shu', 'しゅ'],
  ['sho', 'しょ'],
  ['sya', 'しゃ'],
  ['syu', 'しゅ'],
  ['syo', 'しょ'],
  ['jya', 'じゃ'],
  ['jyu', 'じゅ'],
  ['jyo', 'じょ'],
  ['cha', 'ちゃ'],
  ['chu', 'ちゅ'],
  ['cho', 'ちょ'],
  ['tya', 'ちゃ'],
  ['tyu', 'ちゅ'],
  ['tyo', 'ちょ'],
  ['nya', 'にゃ'],
  ['nyu', 'にゅ'],
  ['nyo', 'にょ'],
  ['hya', 'ひゃ'],
  ['hyu', 'ひゅ'],
  ['hyo', 'ひょ'],
  ['bya', 'びゃ'],
  ['byu', 'びゅ'],
  ['byo', 'びょ'],
  ['pya', 'ぴゃ'],
  ['pyu', 'ぴゅ'],
  ['pyo', 'ぴょ'],
  ['mya', 'みゃ'],
  ['myu', 'みゅ'],
  ['myo', 'みょ'],
  ['rya', 'りゃ'],
  ['ryu', 'りゅ'],
  ['ryo', 'りょ'],
  ['shi', 'し'],
  ['chi', 'ち'],
  ['tsu', 'つ'],
  ['ja', 'じゃ'],
  ['ju', 'じゅ'],
  ['jo', 'じょ'],
  ['fu', 'ふ'],
  ['ka', 'か'],
  ['ki', 'き'],
  ['ku', 'く'],
  ['ke', 'け'],
  ['ko', 'こ'],
  ['ga', 'が'],
  ['gi', 'ぎ'],
  ['gu', 'ぐ'],
  ['ge', 'げ'],
  ['go', 'ご'],
  ['sa', 'さ'],
  ['si', 'し'],
  ['su', 'す'],
  ['se', 'せ'],
  ['so', 'そ'],
  ['za', 'ざ'],
  ['zi', 'じ'],
  ['ji', 'じ'],
  ['zu', 'ず'],
  ['ze', 'ぜ'],
  ['zo', 'ぞ'],
  ['ta', 'た'],
  ['ti', 'ち'],
  ['tu', 'つ'],
  ['te', 'て'],
  ['to', 'と'],
  ['da', 'だ'],
  ['di', 'ぢ'],
  ['du', 'づ'],
  ['de', 'で'],
  ['do', 'ど'],
  ['na', 'な'],
  ['ni', 'に'],
  ['nu', 'ぬ'],
  ['ne', 'ね'],
  ['no', 'の'],
  ['ha', 'は'],
  ['hi', 'ひ'],
  ['hu', 'ふ'],
  ['he', 'へ'],
  ['ho', 'ほ'],
  ['ba', 'ば'],
  ['bi', 'び'],
  ['bu', 'ぶ'],
  ['be', 'べ'],
  ['bo', 'ぼ'],
  ['pa', 'ぱ'],
  ['pi', 'ぴ'],
  ['pu', 'ぷ'],
  ['pe', 'ぺ'],
  ['po', 'ぽ'],
  ['ma', 'ま'],
  ['mi', 'み'],
  ['mu', 'む'],
  ['me', 'め'],
  ['mo', 'も'],
  ['ya', 'や'],
  ['yu', 'ゆ'],
  ['yo', 'よ'],
  ['ra', 'ら'],
  ['ri', 'り'],
  ['ru', 'る'],
  ['re', 'れ'],
  ['ro', 'ろ'],
  ['wa', 'わ'],
  ['wo', 'を'],
  ['nn', 'ん'],
  ['a', 'あ'],
  ['i', 'い'],
  ['u', 'う'],
  ['e', 'え'],
  ['o', 'お'],
  ['-', 'ー'],
]

const GEMINATE_CONSONANT = /[bcdfghjklmpqrstvwxyz]/

/** ローマ字（ヘボン / 訓令寄りの簡易）→ ひらがな。変換できない文字はそのまま残す。 */
export function romajiToHiragana(input: string): string {
  const src = input.normalize('NFKC').toLowerCase()
  let i = 0
  let out = ''
  while (i < src.length) {
    const ch = src.charAt(i)
    const next = src.charAt(i + 1)
    // 促音: kk / tt / pp など（n は撥音なので除外）
    if (
      next &&
      ch === next &&
      ch !== 'n' &&
      GEMINATE_CONSONANT.test(ch)
    ) {
      out += 'っ'
      i += 1
      continue
    }
    // 撥音 n（母音・y・n 以外の前）
    if (ch === 'n' && next && !/[aeiouny]/.test(next)) {
      out += 'ん'
      i += 1
      continue
    }
    let matched = false
    for (const [roma, hira] of ROMAJI_TO_HIRAGANA) {
      if (src.startsWith(roma, i)) {
        out += hira
        i += roma.length
        matched = true
        break
      }
    }
    if (!matched) {
      // 末尾の n
      if (ch === 'n') out += 'ん'
      else out += ch
      i += 1
    }
  }
  return toHiragana(out)
}
