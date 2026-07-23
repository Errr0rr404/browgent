import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Palette, X } from 'lucide-react'
import { THEMES, type ThemeId } from '../themes/themes'

interface Props {
  theme: ThemeId
  onChange: (id: ThemeId) => void
  onOpenGallery?: () => void
  /**
   * When true (settings / new tab), guest WebContentsView is not covering the
   * content hole — render a normal absolute popup under the Theme button.
   * When false, portal an in-flow flyout into `.chrome-top` so Electron cannot
   * paint the native page over the menu.
   */
  overlaySafe?: boolean
}

const CATEGORY_LABEL: Record<string, string> = {
  signature: 'Signature',
  dev: 'Dev',
  calm: 'Calm',
  loud: 'Loud'
}

const CATEGORY_ORDER = ['signature', 'dev', 'calm', 'loud'] as const

/**
 * Theme menu: compact popup under the trigger.
 * On real guest pages WebContentsView paints above HTML, so we fall back to an
 * in-flow chrome-top flyout that pushes the page bounds down.
 */
export function ThemePicker({
  theme,
  onChange,
  onOpenGallery,
  overlaySafe = true
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [chromeHost, setChromeHost] = useState<HTMLElement | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listboxRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const labelId = useId()

  const useChromeFlyout = open && !overlaySafe

  const groups = useMemo(
    () =>
      CATEGORY_ORDER.map((cat) => ({
        cat,
        items: THEMES.filter((t) => t.category === cat)
      })),
    []
  )

  const flatOptions = useMemo(() => groups.flatMap((g) => g.items), [groups])

  useEffect(() => {
    setChromeHost(document.querySelector('.chrome-top') as HTMLElement | null)
  }, [])

  const closeSilently = useCallback(() => {
    setOpen(false)
  }, [])

  const closeAndRestore = useCallback(() => {
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      closeSilently()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeAndRestore()
      }
    }
    document.addEventListener('mousedown', onDoc, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, closeSilently, closeAndRestore])

  useLayoutEffect(() => {
    if (!open) return
    const listbox = listboxRef.current
    if (!listbox) return
    listbox.focus()
    // Chrome metrics need a layout pass when the flyout expands top chrome
    window.dispatchEvent(new Event('resize'))
  }, [open, useChromeFlyout])

  useEffect(() => {
    if (!open) return
    const root = menuRef.current
    if (!root) return
    const opt = root.querySelector<HTMLElement>(`[role="option"][aria-selected="true"]`)
    opt?.scrollIntoView({ block: 'nearest' })
  }, [open, theme])

  const onListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const n = flatOptions.length
    if (n === 0) return
    const current = flatOptions.findIndex((t) => t.id === theme)
    const base = current >= 0 ? current : 0

    if (e.key === 'Home' || (e.key === 'ArrowLeft' && e.altKey)) {
      e.preventDefault()
      onChange(flatOptions[0].id)
      return
    }
    if (e.key === 'End' || (e.key === 'ArrowRight' && e.altKey)) {
      e.preventDefault()
      onChange(flatOptions[n - 1].id)
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const t = flatOptions[base]
      if (t) {
        onChange(t.id)
        closeAndRestore()
      }
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault()
      onChange(flatOptions[(base + 1) % n].id)
      return
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault()
      onChange(flatOptions[(base - 1 + n) % n].id)
    }
  }

  const current = THEMES.find((t) => t.id === theme)
  const activeId = `${listId}-opt-${theme}`

  const menu = open ? (
    <div
      className={`theme-menu-flyout${useChromeFlyout ? ' theme-menu-flyout--chrome' : ' theme-menu-flyout--popup'}`}
      ref={menuRef}
    >
      <div className="theme-menu" role="dialog" aria-labelledby={labelId}>
        <div className="theme-menu-head">
          <div className="theme-menu-head-row">
            <div>
              <strong id={labelId}>Chrome themes</strong>
              <span>Pick a vibe for the browser UI</span>
            </div>
            <button
              type="button"
              className="theme-menu-close"
              aria-label="Close themes"
              onClick={closeAndRestore}
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        </div>
        <div
          ref={listboxRef}
          className="theme-menu-scroll"
          role="listbox"
          id={listId}
          aria-labelledby={labelId}
          aria-activedescendant={activeId}
          tabIndex={0}
          onKeyDown={onListKeyDown}
        >
          {groups.map(
            (g) =>
              g.items.length > 0 && (
                <div key={g.cat} className="theme-group">
                  <div className="theme-group-label">{CATEGORY_LABEL[g.cat]}</div>
                  {g.items.map((t) => {
                    const active = t.id === theme
                    return (
                      <div
                        key={t.id}
                        id={`${listId}-opt-${t.id}`}
                        role="option"
                        aria-selected={active}
                        className={`theme-option${active ? ' on' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          onChange(t.id)
                          closeAndRestore()
                        }}
                      >
                        <span className="theme-option-swatches" aria-hidden>
                          {t.swatches.map((c) => (
                            <span key={c} style={{ background: c }} />
                          ))}
                        </span>
                        <span className="theme-option-text">
                          <span className="theme-option-name">{t.name}</span>
                          <span className="theme-option-tag">{t.tagline}</span>
                        </span>
                        {active && <Check size={14} className="theme-option-check" />}
                      </div>
                    )
                  })}
                </div>
              )
          )}
        </div>
        {onOpenGallery && (
          <button
            type="button"
            className="theme-gallery-link"
            onClick={() => {
              closeAndRestore()
              onOpenGallery()
            }}
          >
            Open theme gallery →
          </button>
        )}
      </div>
    </div>
  ) : null

  return (
    <div className="theme-picker" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`theme-picker-btn${open ? ' open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        title={`Theme: ${current?.name ?? theme}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Palette size={14} strokeWidth={1.75} />
        <span className="theme-picker-label">Theme</span>
        <span className="theme-swatch-row" aria-hidden>
          {(current?.swatches ?? ['#333', '#666', '#999']).map((c) => (
            <span key={c} className="theme-swatch-dot" style={{ background: c }} />
          ))}
        </span>
      </button>

      {menu &&
        (useChromeFlyout && chromeHost
          ? createPortal(menu, chromeHost)
          : menu)}
    </div>
  )
}
