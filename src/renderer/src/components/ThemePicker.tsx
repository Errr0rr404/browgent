import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Palette, X } from 'lucide-react'
import { THEMES, type ThemeId } from '../themes/themes'

interface Props {
  theme: ThemeId
  onChange: (id: ThemeId) => void
}

const CATEGORY_LABEL: Record<string, string> = {
  modern: 'Modern',
  classic: 'Classic',
  vintage: 'Vintage',
  paper: 'Paper',
  surprise: 'Surprise'
}

/**
 * Theme menu cannot use a normal absolute dropdown over the page —
 * Electron WebContentsView paints above HTML in the content hole and clips it.
 * We portal an in-flow flyout into `.chrome-top` so the page view is pushed down
 * and the full theme list is visible.
 */
export function ThemePicker({ theme, onChange }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [chromeHost, setChromeHost] = useState<HTMLElement | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    setChromeHost(document.querySelector('.chrome-top') as HTMLElement | null)
  }, [])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    // capture so we still see events before other handlers
    document.addEventListener('mousedown', onDoc, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Remeasure page bounds after flyout mounts / unmounts
  useLayoutEffect(() => {
    if (!open) return
    // Nudge layout listeners (useChromeMetrics ResizeObserver + delayed publish)
    window.dispatchEvent(new Event('resize'))
  }, [open])

  const current = THEMES.find((t) => t.id === theme)

  const groups = (['modern', 'classic', 'vintage', 'paper', 'surprise'] as const).map(
    (cat) => ({
      cat,
      items: THEMES.filter((t) => t.category === cat)
    })
  )

  const flyout =
    open ? (
      <div className="theme-menu-flyout" ref={menuRef}>
        <div className="theme-menu" role="listbox" id={listId} aria-label="Browser themes">
          <div className="theme-menu-head">
            <div className="theme-menu-head-row">
              <div>
                <strong>Chrome themes</strong>
                <span>Pick a vibe for the browser UI</span>
              </div>
              <button
                type="button"
                className="theme-menu-close"
                aria-label="Close themes"
                onClick={() => setOpen(false)}
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>
          </div>
          <div className="theme-menu-scroll">
            {groups.map(
              (g) =>
                g.items.length > 0 && (
                  <div key={g.cat} className="theme-group">
                    <div className="theme-group-label">{CATEGORY_LABEL[g.cat]}</div>
                    {g.items.map((t) => {
                      const active = t.id === theme
                      return (
                        <button
                          key={t.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={`theme-option${active ? ' on' : ''}`}
                          onClick={() => {
                            onChange(t.id)
                            setOpen(false)
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
                        </button>
                      )
                    })}
                  </div>
                )
            )}
          </div>
        </div>
      </div>
    ) : null

  return (
    <div className="theme-picker" ref={rootRef}>
      <button
        type="button"
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

      {/* Portal into chrome-top so the panel is in-flow and pushes WebContentsView down */}
      {flyout && chromeHost ? createPortal(flyout, chromeHost) : flyout}
    </div>
  )
}
