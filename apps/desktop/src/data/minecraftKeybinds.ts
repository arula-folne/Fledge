/** バニラ操作設定（Mod なし）のキー割り当て。options.txt は `key_key.attack:key.mouse.left`。 */

export type McKeybindCategory =
  | 'movement'
  | 'gameplay'
  | 'inventory'
  | 'creative'
  | 'multiplayer'
  | 'misc'
  | 'spectator'

export type McKeybindDef = {
  id: string
  defaultCode: string
  category: McKeybindCategory
}

export const MC_KEYBIND_CATEGORIES: McKeybindCategory[] = [
  'movement',
  'gameplay',
  'inventory',
  'creative',
  'multiplayer',
  'misc',
  'spectator',
]

export const MC_KEYBINDS: McKeybindDef[] = [
  { id: 'key.forward', defaultCode: 'key.keyboard.w', category: 'movement' },
  { id: 'key.left', defaultCode: 'key.keyboard.a', category: 'movement' },
  { id: 'key.back', defaultCode: 'key.keyboard.s', category: 'movement' },
  { id: 'key.right', defaultCode: 'key.keyboard.d', category: 'movement' },
  { id: 'key.jump', defaultCode: 'key.keyboard.space', category: 'movement' },
  { id: 'key.sneak', defaultCode: 'key.keyboard.left.shift', category: 'movement' },
  { id: 'key.sprint', defaultCode: 'key.keyboard.left.control', category: 'movement' },

  { id: 'key.attack', defaultCode: 'key.mouse.left', category: 'gameplay' },
  { id: 'key.use', defaultCode: 'key.mouse.right', category: 'gameplay' },
  { id: 'key.pickItem', defaultCode: 'key.mouse.middle', category: 'gameplay' },
  { id: 'key.drop', defaultCode: 'key.keyboard.q', category: 'gameplay' },
  { id: 'key.swapOffhand', defaultCode: 'key.keyboard.f', category: 'gameplay' },

  { id: 'key.inventory', defaultCode: 'key.keyboard.e', category: 'inventory' },
  { id: 'key.advancements', defaultCode: 'key.keyboard.l', category: 'inventory' },
  { id: 'key.hotbar.1', defaultCode: 'key.keyboard.1', category: 'inventory' },
  { id: 'key.hotbar.2', defaultCode: 'key.keyboard.2', category: 'inventory' },
  { id: 'key.hotbar.3', defaultCode: 'key.keyboard.3', category: 'inventory' },
  { id: 'key.hotbar.4', defaultCode: 'key.keyboard.4', category: 'inventory' },
  { id: 'key.hotbar.5', defaultCode: 'key.keyboard.5', category: 'inventory' },
  { id: 'key.hotbar.6', defaultCode: 'key.keyboard.6', category: 'inventory' },
  { id: 'key.hotbar.7', defaultCode: 'key.keyboard.7', category: 'inventory' },
  { id: 'key.hotbar.8', defaultCode: 'key.keyboard.8', category: 'inventory' },
  { id: 'key.hotbar.9', defaultCode: 'key.keyboard.9', category: 'inventory' },

  { id: 'key.saveToolbarActivator', defaultCode: 'key.keyboard.c', category: 'creative' },
  { id: 'key.loadToolbarActivator', defaultCode: 'key.keyboard.x', category: 'creative' },

  { id: 'key.chat', defaultCode: 'key.keyboard.t', category: 'multiplayer' },
  { id: 'key.command', defaultCode: 'key.keyboard.slash', category: 'multiplayer' },
  { id: 'key.playerlist', defaultCode: 'key.keyboard.tab', category: 'multiplayer' },
  { id: 'key.socialInteractions', defaultCode: 'key.keyboard.p', category: 'multiplayer' },

  { id: 'key.screenshot', defaultCode: 'key.keyboard.f2', category: 'misc' },
  { id: 'key.togglePerspective', defaultCode: 'key.keyboard.f5', category: 'misc' },
  { id: 'key.smoothCamera', defaultCode: 'key.keyboard.unknown', category: 'misc' },
  { id: 'key.fullscreen', defaultCode: 'key.keyboard.f11', category: 'misc' },
  { id: 'key.spectatorOutlines', defaultCode: 'key.keyboard.unknown', category: 'misc' },
  { id: 'key.quickActions', defaultCode: 'key.keyboard.g', category: 'misc' },
  { id: 'key.toggleGui', defaultCode: 'key.keyboard.f1', category: 'misc' },

  { id: 'key.spectatorHotbar', defaultCode: 'key.mouse.middle', category: 'spectator' },
  { id: 'key.toggleSpectatorShaderEffects', defaultCode: 'key.keyboard.f4', category: 'spectator' },
]

export const MC_KEYBIND_BY_ID = new Map(MC_KEYBINDS.map((item) => [item.id, item]))

export const MC_UNBOUND = 'key.keyboard.unknown'
