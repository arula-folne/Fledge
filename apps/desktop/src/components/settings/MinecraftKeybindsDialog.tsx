import { useEffect, useState } from 'react'
import { IconRefresh } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import {
  MC_KEYBIND_BY_ID,
  MC_KEYBIND_CATEGORIES,
  MC_KEYBINDS,
  MC_UNBOUND,
  type McKeybindCategory,
} from '../../data/minecraftKeybinds'
import { formatMcKeyCode, keyboardEventToMcKey, mouseButtonToMcKey } from '../../data/minecraftKeyCodes'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

type Props = {
  open: boolean
  value: Record<string, string>
  onChange: (next: Record<string, string>) => void
  onClose: () => void
}

export function MinecraftKeybindsDialog({ open, value, onChange, onClose }: Props) {
  const { t } = useTranslation()
  const [listeningId, setListeningId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) setListeningId(null)
  }, [open])

  // Chromium はマウス4/5を履歴の戻る/進むに割り当てる。割当て画面では無効化し、キー入力として使えるようにする。
  useEffect(() => {
    if (!open) return
    const blockBrowserNav = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('mousedown', blockBrowserNav, true)
    window.addEventListener('mouseup', blockBrowserNav, true)
    window.addEventListener('auxclick', blockBrowserNav, true)
    return () => {
      window.removeEventListener('mousedown', blockBrowserNav, true)
      window.removeEventListener('mouseup', blockBrowserNav, true)
      window.removeEventListener('auxclick', blockBrowserNav, true)
    }
  }, [open])

  useEffect(() => {
    if (!listeningId) return

    const finish = (code: string) => {
      const def = MC_KEYBIND_BY_ID.get(listeningId)
      const next = { ...value }
      if (!def || code === def.defaultCode) delete next[listeningId]
      else next[listeningId] = code
      onChange(next)
      setListeningId(null)
    }

    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'Delete') {
        finish(MC_UNBOUND)
        return
      }
      const code = keyboardEventToMcKey(e)
      if (code) finish(code)
    }

    const onMouse = (e: MouseEvent) => {
      const code = mouseButtonToMcKey(e.button)
      // マウス4/5は行外でも割当て対象（戻るナビ抑制と両立）
      if (e.button === 3 || e.button === 4) {
        e.preventDefault()
        e.stopPropagation()
        if (code) finish(code)
        return
      }
      const target = e.target as HTMLElement
      if (!target.closest('[data-keybind-row]')) {
        setListeningId(null)
        return
      }
      if (target.closest('[data-keybind-ignore]')) return
      e.preventDefault()
      e.stopPropagation()
      if (code) finish(code)
    }

    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onMouse, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onMouse, true)
    }
  }, [listeningId, onChange, value])

  const categoryLabel = (category: McKeybindCategory) =>
    t(`settings.minecraftInitial.keybinds.category.${category}`)

  const actionLabel = (id: string) => {
    const suffix = id.startsWith('key.') ? id.slice(4).replaceAll('.', '_') : id
    return t(`settings.minecraftInitial.keybinds.action.${suffix}`)
  }

  return (
    <Dialog
      open={open}
      title={t('settings.minecraftInitial.keybinds.title')}
      subtitle={t('settings.minecraftInitial.keybinds.hint')}
      onClose={() => {
        setListeningId(null)
        onClose()
      }}
      size="lg"
      scrollable
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            disabled={Object.keys(value).length === 0}
            onClick={() => {
              setListeningId(null)
              onChange({})
            }}
          >
            {t('settings.minecraftInitial.keybinds.resetAll')}
          </Button>
          <Button type="button" variant="primary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {MC_KEYBIND_CATEGORIES.map((category) => {
          const items = MC_KEYBINDS.filter((item) => item.category === category)
          return (
            <section key={category} className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-[var(--color-text-muted)]">
                {categoryLabel(category)}
              </h3>
              <div className="space-y-1">
                {items.map((item) => {
                  const current = value[item.id] ?? item.defaultCode
                  const custom = item.id in value
                  const listening = listeningId === item.id
                  return (
                    <div
                      key={item.id}
                      data-keybind-row
                      className="flex items-center gap-2 rounded-[var(--radius-sm)] px-1 py-0.5"
                    >
                      <span className="min-w-0 flex-1 text-sm text-[var(--color-text)]">
                        {actionLabel(item.id)}
                      </span>
                      <button
                        type="button"
                        className={[
                          'min-w-[7.5rem] rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-xs font-medium tabular-nums',
                          listening
                            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                            : custom
                              ? 'border-[var(--color-selection)] bg-[var(--color-selection-soft)] text-[var(--color-selection)]'
                              : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-hover)]',
                        ].join(' ')}
                        onClick={() => setListeningId(listening ? null : item.id)}
                      >
                        {listening
                          ? t('settings.minecraftInitial.keybinds.listening')
                          : formatMcKeyCode(current)}
                      </button>
                      <button
                        type="button"
                        data-keybind-ignore
                        disabled={!custom}
                        aria-label={t('settings.minecraftInitial.reset')}
                        className={[
                          'flex size-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)]',
                          custom
                            ? 'text-[var(--color-text)] hover:bg-[var(--color-hover)]'
                            : 'cursor-default text-[var(--color-text-muted)] opacity-45',
                        ].join(' ')}
                        onClick={() => {
                          const next = { ...value }
                          delete next[item.id]
                          onChange(next)
                          if (listeningId === item.id) setListeningId(null)
                        }}
                      >
                        <IconRefresh size={16} stroke={1.75} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </Dialog>
  )
}
