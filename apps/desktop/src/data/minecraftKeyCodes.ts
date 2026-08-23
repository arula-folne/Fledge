/** KeyboardEvent.code / マウスボタン → Minecraft options.txt のキー識別子 */

const CODE_TO_MC: Record<string, string> = {
  Space: 'key.keyboard.space',
  Tab: 'key.keyboard.tab',
  Enter: 'key.keyboard.enter',
  Escape: 'key.keyboard.escape',
  Backspace: 'key.keyboard.backspace',
  Delete: 'key.keyboard.delete',
  Insert: 'key.keyboard.insert',
  Home: 'key.keyboard.home',
  End: 'key.keyboard.end',
  PageUp: 'key.keyboard.page.up',
  PageDown: 'key.keyboard.page.down',
  CapsLock: 'key.keyboard.caps.lock',
  NumLock: 'key.keyboard.num.lock',
  ScrollLock: 'key.keyboard.scroll.lock',
  Pause: 'key.keyboard.pause',
  PrintScreen: 'key.keyboard.print.screen',
  ContextMenu: 'key.keyboard.menu',
  ArrowUp: 'key.keyboard.up',
  ArrowDown: 'key.keyboard.down',
  ArrowLeft: 'key.keyboard.left',
  ArrowRight: 'key.keyboard.right',
  ShiftLeft: 'key.keyboard.left.shift',
  ShiftRight: 'key.keyboard.right.shift',
  ControlLeft: 'key.keyboard.left.control',
  ControlRight: 'key.keyboard.right.control',
  AltLeft: 'key.keyboard.left.alt',
  AltRight: 'key.keyboard.right.alt',
  MetaLeft: 'key.keyboard.left.win',
  MetaRight: 'key.keyboard.right.win',
  Minus: 'key.keyboard.minus',
  Equal: 'key.keyboard.equal',
  BracketLeft: 'key.keyboard.left.bracket',
  BracketRight: 'key.keyboard.right.bracket',
  Backslash: 'key.keyboard.backslash',
  Semicolon: 'key.keyboard.semicolon',
  Quote: 'key.keyboard.apostrophe',
  Backquote: 'key.keyboard.grave.accent',
  Comma: 'key.keyboard.comma',
  Period: 'key.keyboard.period',
  Slash: 'key.keyboard.slash',
  Numpad0: 'key.keyboard.keypad.0',
  Numpad1: 'key.keyboard.keypad.1',
  Numpad2: 'key.keyboard.keypad.2',
  Numpad3: 'key.keyboard.keypad.3',
  Numpad4: 'key.keyboard.keypad.4',
  Numpad5: 'key.keyboard.keypad.5',
  Numpad6: 'key.keyboard.keypad.6',
  Numpad7: 'key.keyboard.keypad.7',
  Numpad8: 'key.keyboard.keypad.8',
  Numpad9: 'key.keyboard.keypad.9',
  NumpadAdd: 'key.keyboard.keypad.add',
  NumpadSubtract: 'key.keyboard.keypad.subtract',
  NumpadMultiply: 'key.keyboard.keypad.multiply',
  NumpadDivide: 'key.keyboard.keypad.divide',
  NumpadDecimal: 'key.keyboard.keypad.decimal',
  NumpadEnter: 'key.keyboard.keypad.enter',
  NumpadEqual: 'key.keyboard.keypad.equal',
}

for (let i = 0; i < 26; i += 1) {
  const letter = String.fromCharCode(97 + i)
  CODE_TO_MC[`Key${letter.toUpperCase()}`] = `key.keyboard.${letter}`
}
for (let i = 0; i <= 9; i += 1) {
  CODE_TO_MC[`Digit${i}`] = `key.keyboard.${i}`
}
for (let i = 1; i <= 25; i += 1) {
  CODE_TO_MC[`F${i}`] = `key.keyboard.f${i}`
}

const MOUSE_TO_MC = ['key.mouse.left', 'key.mouse.middle', 'key.mouse.right', 'key.mouse.4', 'key.mouse.5']

export function keyboardEventToMcKey(e: KeyboardEvent): string | null {
  return CODE_TO_MC[e.code] ?? null
}

export function mouseButtonToMcKey(button: number): string | null {
  return MOUSE_TO_MC[button] ?? null
}

const MC_KEY_LABELS: Record<string, string> = {
  'key.keyboard.unknown': 'なし',
  'key.mouse.left': '左クリック',
  'key.mouse.right': '右クリック',
  'key.mouse.middle': '中クリック',
  'key.mouse.4': 'マウス4',
  'key.mouse.5': 'マウス5',
  'key.keyboard.space': 'スペース',
  'key.keyboard.tab': 'Tab',
  'key.keyboard.enter': 'Enter',
  'key.keyboard.escape': 'Esc',
  'key.keyboard.backspace': 'Backspace',
  'key.keyboard.delete': 'Delete',
  'key.keyboard.left.shift': 'Left Shift',
  'key.keyboard.right.shift': 'Right Shift',
  'key.keyboard.left.control': 'Left Ctrl',
  'key.keyboard.right.control': 'Right Ctrl',
  'key.keyboard.left.alt': 'Left Alt',
  'key.keyboard.right.alt': 'Right Alt',
  'key.keyboard.left.win': 'Left Win',
  'key.keyboard.right.win': 'Right Win',
  'key.keyboard.up': '↑',
  'key.keyboard.down': '↓',
  'key.keyboard.left': '←',
  'key.keyboard.right': '→',
  'key.keyboard.apostrophe': "'",
  'key.keyboard.backslash': '\\',
  'key.keyboard.grave.accent': '`',
  'key.keyboard.left.bracket': '[',
  'key.keyboard.right.bracket': ']',
  'key.keyboard.semicolon': ';',
  'key.keyboard.comma': ',',
  'key.keyboard.period': '.',
  'key.keyboard.slash': '/',
  'key.keyboard.minus': '-',
  'key.keyboard.equal': '=',
  'key.keyboard.caps.lock': 'Caps Lock',
  'key.keyboard.page.up': 'Page Up',
  'key.keyboard.page.down': 'Page Down',
}

export function formatMcKeyCode(code: string): string {
  if (MC_KEY_LABELS[code]) return MC_KEY_LABELS[code]
  if (code.startsWith('key.keyboard.keypad.')) {
    return `テンキー ${code.slice('key.keyboard.keypad.'.length).toUpperCase()}`
  }
  if (code.startsWith('key.keyboard.')) {
    const rest = code.slice('key.keyboard.'.length)
    if (/^f\d+$/i.test(rest) || /^\d$/.test(rest) || /^[a-z]$/i.test(rest)) return rest.toUpperCase()
    return rest
  }
  return code
}
