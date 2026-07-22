import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bot,
  Check,
  Circle,
  Download,
  Eraser,
  Eye,
  Hand,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Play,
  Search,
  Send,
  Square,
  Zap,
  X
} from 'lucide-react'
import type { AgentAction, AgentSessionState, TrajectoryStep } from '@shared/types'
import { useVoiceInput } from '../hooks/useVoiceInput'

interface Props {
  open: boolean
  state: AgentSessionState | null
  onClose: () => void
}

const SUGGESTIONS = [
  'go to facebook and sign up',
  'go to github.com',
  'search playwright docs',
  'summarize this page',
  'click the first result'
]

export function AgentPanel({ open, state, onClose }: Props): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [tab, setTab] = useState<'chat' | 'trajectory' | 'policy'>('chat')
  const listRef = useRef<HTMLDivElement>(null)
  const busy =
    state?.status === 'thinking' ||
    state?.status === 'acting' ||
    state?.status === 'waiting_human'
  const showSuggestions = (state?.messages?.length ?? 0) <= 1 && !busy
  const provider = state?.provider ?? 'heuristic'
  const model = state?.model

  const onVoiceFinal = useCallback((text: string) => {
    setDraft(text)
  }, [])

  const onVoiceInterim = useCallback((text: string) => {
    // Live partial transcript so Send can use it immediately
    if (text) setDraft(text)
  }, [])

  const voice = useVoiceInput({
    onFinal: onVoiceFinal,
    onInterim: onVoiceInterim
  })

  useEffect(() => {
    const el = listRef.current
    if (!el || tab !== 'chat') return
    // Keep stick-to-bottom unless user scrolled up substantially
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 120) {
      el.scrollTop = el.scrollHeight
    }
  }, [state?.messages, state?.status, tab])

  const send = (text?: string): void => {
    const value = (text ?? draft).trim()
    if (!value) return
    // Allow replies to ask_human; block new goals while thinking/acting/confirm
    if (busy && !(state?.status === 'waiting_human' && state.waitingQuestion)) return
    if (voice.status === 'listening') voice.stop()
    setDraft('')
    if (state?.status === 'waiting_human' && state.waitingQuestion) {
      void window.browgent.answerHuman(value)
    } else {
      void window.browgent.sendAgentMessage(value, state?.activeTabId ?? undefined)
    }
  }

  const exportJson = async (): Promise<void> => {
    try {
      const json = await window.browgent.exportTrajectory()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `browgent-trajectory-${Date.now()}.json`
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Delay revoke so the browser can start the download
      window.setTimeout(() => URL.revokeObjectURL(url), 1500)
    } catch (e) {
      console.error('Export failed', e)
    }
  }

  const mode = state?.mode ?? 'act'

  return (
    <aside className={`agent-panel${open ? '' : ' closed'}`} aria-label="Agent panel" hidden={!open}>
      <header className="agent-header">
        <div className="agent-identity">
          <div className={`agent-avatar${busy ? ' live' : ''}`} aria-hidden>
            <Bot size={16} strokeWidth={1.75} />
          </div>
          <div>
            <h2>Browsing agent</h2>
            <div className={`agent-status ${state?.status ?? 'idle'}`}>
              {state?.status ?? 'idle'}
              {typeof state?.stepCount === 'number' && (
                <span>
                  {' '}
                  · {state.stepCount}/{state.maxSteps}
                </span>
              )}
            </div>
          </div>
        </div>
        <span
          className={`provider-badge ${provider}`}
          title={
            provider === 'grok'
              ? `xAI Grok tool-calling (${model ?? 'grok'})`
              : 'Local heuristics — set XAI_API_KEY in .env for Grok'
          }
        >
          {provider === 'grok' ? `Grok` : 'Heuristic'}
        </span>
        <div className="agent-header-actions">
          <button type="button" className="icon-btn" title="Export trajectory" onClick={() => void exportJson()}>
            <Download size={15} strokeWidth={1.75} />
          </button>
          <button type="button" className="icon-btn" title="Clear" onClick={() => void window.browgent.clearAgent()}>
            <Eraser size={15} strokeWidth={1.75} />
          </button>
          <button type="button" className="icon-btn" title="Close" onClick={onClose}>
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <div className="mode-bar">
        <ModeBtn active={mode === 'act'} icon={<Zap size={12} />} label="Act" onClick={() => void window.browgent.setAgentMode('act')} />
        <ModeBtn
          active={mode === 'research'}
          icon={<Search size={12} />}
          label="Research"
          onClick={() => void window.browgent.setAgentMode('research')}
        />
        <ModeBtn
          active={mode === 'watch'}
          icon={<Eye size={12} />}
          label="Watch"
          onClick={() => void window.browgent.setAgentMode('watch')}
        />
      </div>

      <div className="control-bar">
        <button type="button" className="ctrl-btn" onClick={() => void window.browgent.takeover()} title="Human takeover">
          <Hand size={13} /> Takeover
        </button>
        {state?.status === 'paused' ? (
          <button type="button" className="ctrl-btn accent" onClick={() => void window.browgent.resumeAgent()}>
            <Play size={13} /> Resume
          </button>
        ) : (
          <button type="button" className="ctrl-btn" onClick={() => void window.browgent.pauseAgent()}>
            <Pause size={13} /> Pause
          </button>
        )}
        {busy && (
          <button type="button" className="ctrl-btn danger" onClick={() => void window.browgent.stopAgent()}>
            <Square size={11} fill="currentColor" /> Stop
          </button>
        )}
      </div>

      <div className="panel-tabs">
        <button type="button" className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>
          Chat
        </button>
        <button type="button" className={tab === 'trajectory' ? 'on' : ''} onClick={() => setTab('trajectory')}>
          Trajectory
        </button>
        <button type="button" className={tab === 'policy' ? 'on' : ''} onClick={() => setTab('policy')}>
          Policy
        </button>
      </div>

      {state?.pendingConfirmation && (
        <div className="confirm-banner">
          <p>{state.pendingConfirmation.reason}</p>
          <div className="confirm-actions">
            <button
              type="button"
              className="send-btn"
              onClick={() => void window.browgent.confirmAction(state.pendingConfirmation!.id)}
            >
              Allow
            </button>
            <button
              type="button"
              className="stop-btn"
              onClick={() => void window.browgent.rejectAction(state.pendingConfirmation!.id)}
            >
              Deny
            </button>
          </div>
        </div>
      )}

      {state?.waitingQuestion && (
        <div className="confirm-banner">
          <p>
            <strong>Agent needs you:</strong> {state.waitingQuestion}
          </p>
        </div>
      )}

      {tab === 'chat' && (
        <>
          <div className="agent-messages" ref={listRef} role="log" aria-live="polite">
            {(state?.messages ?? []).map((msg) => (
              <div key={msg.id} className={`msg ${msg.role}`}>
                <div className="msg-meta">
                  <span>{msg.role === 'assistant' ? 'agent' : msg.role}</span>
                  <span>·</span>
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
                {msg.content && (
                  <div className="msg-bubble">{formatMessage(msg.content)}</div>
                )}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="msg-actions">
                    {msg.actions.map((action, i) => (
                      <ActionChip key={`${msg.id}-${i}`} action={action} />
                    ))}
                  </div>
                )}
                {msg.role === 'assistant' &&
                  !msg.content &&
                  busy &&
                  msg.actions?.some((a) => a.status === 'running' || a.status === 'pending') && (
                    <div className="msg-bubble thinking-bubble">
                      <Loader2 size={13} className="spin" /> Working…
                    </div>
                  )}
              </div>
            ))}
            {busy && state?.status === 'thinking' && (
              <div className="msg assistant">
                <div className="msg-meta">
                  <span>agent</span>
                </div>
                <div className="msg-bubble thinking-bubble">
                  <Loader2 size={13} className="spin" />{' '}
                  {provider === 'grok' ? 'Grok is planning…' : 'Planning steps…'}
                </div>
              </div>
            )}
          </div>

          {showSuggestions && (
            <div className="agent-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="suggestion-chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'trajectory' && (
        <div className="trajectory-list">
          {(state?.trajectory ?? []).length === 0 && (
            <p className="empty-hint">Tool calls and observations appear here — export anytime.</p>
          )}
          {[...(state?.trajectory ?? [])].reverse().map((step) => (
            <TrajectoryRow key={step.id} step={step} />
          ))}
        </div>
      )}

      {tab === 'policy' && <PolicyPane state={state} />}

      <div className="agent-composer">
        <textarea
          className="agent-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            voice.status === 'listening'
              ? 'Listening… speak a browser instruction'
              : state?.waitingQuestion
                ? 'Type or speak your answer…'
                : mode === 'research'
                  ? 'Research request (read-only tools)…'
                  : mode === 'watch'
                    ? 'Ask me what I see while you browse…'
                    : 'Speak or type — e.g. “go to facebook and sign up”…'
          }
          rows={3}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <div className="composer-row">
          <div className="composer-left">
            <button
              type="button"
              className={`mic-btn${voice.status === 'listening' ? ' listening' : ''}`}
              title={
                voice.status === 'listening'
                  ? 'Stop listening'
                  : 'Voice input — system speech recognition (fastest local path)'
              }
              aria-label={voice.status === 'listening' ? 'Stop voice input' : 'Start voice input'}
              aria-pressed={voice.status === 'listening'}
              onClick={() => voice.toggle()}
            >
              {voice.status === 'listening' ? (
                <MicOff size={15} strokeWidth={2} />
              ) : (
                <Mic size={15} strokeWidth={1.75} />
              )}
            </button>
            {voice.status === 'listening' && voice.interim && (
              <span className="voice-interim" title={voice.interim}>
                {voice.interim}
              </span>
            )}
            {voice.error && <span className="voice-error">{voice.error}</span>}
            {!voice.error && voice.status === 'idle' && (
              <span className="composer-hint">Mic · Enter send · ⌘J · system STT</span>
            )}
          </div>
          <button
            type="button"
            className="send-btn"
            onClick={() => send()}
            disabled={
              !draft.trim() ||
              (busy && !(state?.status === 'waiting_human' && state.waitingQuestion))
            }
          >
            <Send size={13} strokeWidth={2.25} />
            Send
          </button>
        </div>
      </div>
    </aside>
  )
}

function ModeBtn({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button type="button" className={`mode-btn${active ? ' on' : ''}`} onClick={onClick}>
      {icon}
      {label}
    </button>
  )
}

function ActionChip({ action }: { action: AgentAction }): React.JSX.Element {
  return (
    <div className={`action-chip ${action.status}`}>
      <ActionIcon status={action.status} />
      <span>
        {action.label}
        {action.detail ? ` · ${action.detail}` : ''}
      </span>
    </div>
  )
}

function ActionIcon({ status }: { status: AgentAction['status'] }): React.JSX.Element {
  if (status === 'running' || status === 'waiting') return <Loader2 size={12} className="spin" />
  if (status === 'done') return <Check size={12} />
  if (status === 'error' || status === 'blocked') return <X size={12} />
  return <Circle size={10} />
}

function TrajectoryRow({ step }: { step: TrajectoryStep }): React.JSX.Element {
  return (
    <div className={`traj-row ${step.kind}${step.ok === false ? ' bad' : ''}`}>
      <div className="traj-meta">
        <span className="traj-kind">{step.tool || step.kind}</span>
        <span>
          {new Date(step.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>
      <div className="traj-title">{step.title}</div>
      {step.detail && <div className="traj-detail">{step.detail}</div>}
    </div>
  )
}

function PolicyPane({ state }: { state: AgentSessionState | null }): React.JSX.Element {
  const p = state?.policy
  const [allowDraft, setAllowDraft] = useState((p?.allowHosts ?? []).join(', '))
  const [blockDraft, setBlockDraft] = useState((p?.blockHosts ?? []).join(', '))

  // Sync drafts when policy is replaced (e.g. clear session)
  useEffect(() => {
    setAllowDraft((p?.allowHosts ?? []).join(', '))
    setBlockDraft((p?.blockHosts ?? []).join(', '))
  }, [p?.allowHosts, p?.blockHosts])

  const parseHosts = (raw: string): string[] =>
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase().replace(/^www\./, ''))
      .filter(Boolean)

  return (
    <div className="policy-pane">
      <p className="empty-hint">
        Browser-native safety (differentiator vs pure cloud agents). Changes apply immediately to
        the next tool step.
      </p>
      <label className="policy-row">
        <span>Max steps</span>
        <input
          type="number"
          min={5}
          max={100}
          value={p?.maxSteps ?? 40}
          onChange={(e) => {
            const n = Math.min(100, Math.max(5, Number(e.target.value) || 40))
            void window.browgent.setAgentPolicy({ maxSteps: n })
          }}
        />
      </label>
      <label className="policy-row check">
        <input
          type="checkbox"
          checked={p?.confirmSensitiveClicks ?? true}
          onChange={(e) =>
            void window.browgent.setAgentPolicy({ confirmSensitiveClicks: e.target.checked })
          }
        />
        <span>Confirm sensitive clicks (pay, submit, delete…)</span>
      </label>
      <label className="policy-row check">
        <input
          type="checkbox"
          checked={p?.confirmCrossHost ?? false}
          onChange={(e) =>
            void window.browgent.setAgentPolicy({ confirmCrossHost: e.target.checked })
          }
        />
        <span>Confirm navigation to a new host</span>
      </label>
      <label className="policy-row check">
        <input
          type="checkbox"
          checked={p?.pauseOnAskHuman ?? true}
          onChange={(e) =>
            void window.browgent.setAgentPolicy({ pauseOnAskHuman: e.target.checked })
          }
        />
        <span>Pause when agent asks for human help</span>
      </label>
      <label className="policy-row">
        <span>Allow hosts (comma, empty = all)</span>
        <input
          type="text"
          placeholder="github.com, google.com"
          value={allowDraft}
          onChange={(e) => setAllowDraft(e.target.value)}
          onBlur={() => {
            void window.browgent.setAgentPolicy({ allowHosts: parseHosts(allowDraft) })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void window.browgent.setAgentPolicy({ allowHosts: parseHosts(allowDraft) })
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
      </label>
      <label className="policy-row">
        <span>Block hosts (comma)</span>
        <input
          type="text"
          placeholder="ads.example.com, tracker.io"
          value={blockDraft}
          onChange={(e) => setBlockDraft(e.target.value)}
          onBlur={() => {
            void window.browgent.setAgentPolicy({ blockHosts: parseHosts(blockDraft) })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void window.browgent.setAgentPolicy({ blockHosts: parseHosts(blockDraft) })
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
      </label>
      <div className="policy-note">
        <strong>Brain:</strong>{' '}
        {state?.provider === 'grok'
          ? `Grok (${state.model ?? 'grok-4.5'}) via XAI_API_KEY`
          : 'Heuristic fallback — copy .env.example → .env and set XAI_API_KEY'}
        <br />
        MCP tools: navigate, click, type, observe, extract… — same session as this desktop.
      </div>
    </div>
  )
}

/** Lightweight **bold** + keep whitespace */
function formatMessage(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return <span key={i}>{part}</span>
  })
}

