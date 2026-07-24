import { useEffect, useRef, useState } from 'react'
import { Bot, Cable, Shield, X, Zap } from 'lucide-react'
import type { McpStatus } from '@shared/mcp'
import type { CdpEndpointStatus } from '@shared/driver'
import { getRecipe, type AgentRecipe } from '@shared/recipes'
import { HERO_DEMO_MODE, HERO_DEMO_PROMPT } from '@shared/demo'

interface Props {
  open: boolean
  onDismiss: () => void
  onOpenAgent: () => void
  onPickRecipe: (prompt: string, mode: 'act' | 'research' | 'watch') => void
}

export function FirstRunModal({
  open,
  onDismiss,
  onOpenAgent,
  onPickRecipe
}: Props): React.JSX.Element | null {
  const [mcp, setMcp] = useState<McpStatus | null>(null)
  const [cdp, setCdp] = useState<CdpEndpointStatus | null>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    void window.browgent?.getMcpStatus?.().then(setMcp).catch(() => undefined)
    void window.browgent?.getDriverStatus?.().then(setCdp).catch(() => undefined)
  }, [open])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => primaryRef.current?.focus(), 60)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss()
        return
      }
      // Focus trap: keep Tab / Shift+Tab cycling inside the modal card.
      if (e.key === 'Tab') {
        const card = cardRef.current
        if (!card) return
        const focusables = Array.from(
          card.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter(
          (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement as HTMLElement | null
        if (e.shiftKey) {
          if (active === first || !card.contains(active)) {
            e.preventDefault()
            last.focus()
          }
        } else if (active === last || !card.contains(active)) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onDismiss])

  if (!open) return null

  // Lead the first-run chips with the human-in-the-loop takeover story, then
  // two low-friction wins. Referenced by id so a recipe rename fails loudly.
  const starters = ['takeover-handoff', 'research-summary', 'form-smoke']
    .map((id) => getRecipe(id))
    .filter((r): r is AgentRecipe => Boolean(r))

  return (
    <div
      className="firstrun-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="firstrun-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onDismiss()
      }}
    >
      <div className="firstrun-card" ref={cardRef}>
        <header className="firstrun-header">
          <div>
            <p className="firstrun-kicker">Local co-browse runtime</p>
            <h2 id="firstrun-title">Welcome to Browgent</h2>
            <p className="firstrun-lead">
              Humans and agents share real Chromium tabs — with policy, takeover, MCP, and
              Playwright. Not another chat sidebar. Works offline with the built-in heuristic
              planner; add <code className="settings-code">XAI_API_KEY</code> (or any
              OpenAI-compatible key) in <code className="settings-code">.env</code> for a stronger
              brain.
            </p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close welcome" onClick={onDismiss}>
            <X size={16} />
          </button>
        </header>

        <ul className="firstrun-points">
          <li>
            <Zap size={14} aria-hidden />
            <span>
              <strong>Act / Research / Watch</strong> — full control, read-mostly, or human-only
            </span>
          </li>
          <li>
            <Shield size={14} aria-hidden />
            <span>
              <strong>Policy + takeover</strong> — confirm sensitive clicks; you keep the wheel
            </span>
          </li>
          <li>
            <Cable size={14} aria-hidden />
            <span>
              <strong>MCP / Playwright</strong> — same session for Claude Code &amp; scripts
            </span>
          </li>
        </ul>

        <div className="firstrun-status" aria-label="Runtime status">
          <span className={`firstrun-status-pill${mcp?.enabled ? ' on' : ''}`}>
            <span className={`agent-status-dot ${mcp?.enabled ? 'status-acting' : 'status-idle'}`} />
            MCP {mcp?.enabled ? `· :${mcp.port}` : '· off'}
          </span>
          <span className={`firstrun-status-pill${cdp?.enabled ? ' on' : ''}`}>
            <span className={`agent-status-dot ${cdp?.enabled ? 'status-acting' : 'status-idle'}`} />
            CDP {cdp?.enabled ? `· :${cdp.port}` : '· off'}
          </span>
        </div>

        <div className="firstrun-recipes">
          <h3>Try a recipe</h3>
          <div className="firstrun-recipe-grid">
            {starters.map((r) => (
              <button
                key={r.id}
                type="button"
                className="firstrun-recipe"
                onClick={() => {
                  onPickRecipe(r.prompt, r.mode)
                  onDismiss()
                }}
              >
                <Bot size={14} aria-hidden />
                <span className="firstrun-recipe-title">
                  <span className={`recipe-mode-tag mode-${r.mode}`}>{r.mode}</span>
                  {r.title}
                </span>
                <span className="firstrun-recipe-blurb">{r.blurb}</span>
              </button>
            ))}
          </div>
        </div>

        <footer className="firstrun-footer">
          <button type="button" className="ctrl-btn" onClick={onDismiss}>
            Skip
          </button>
          <button
            type="button"
            className="ctrl-btn"
            onClick={() => {
              onPickRecipe(HERO_DEMO_PROMPT, HERO_DEMO_MODE)
              void window.browgent?.recordDemoRun?.().catch(() => undefined)
              onDismiss()
            }}
          >
            Run demo
          </button>
          <button
            ref={primaryRef}
            type="button"
            className="ctrl-btn accent"
            onClick={() => {
              onOpenAgent()
              onDismiss()
            }}
          >
            Open agent
          </button>
        </footer>
      </div>
    </div>
  )
}
