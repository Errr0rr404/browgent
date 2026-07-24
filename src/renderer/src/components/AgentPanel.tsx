import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent
} from 'react'
import {
  Bot,
  ChevronDown,
  ChevronUp,
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
  Settings2,
  Sparkles,
  Square,
  Zap,
  X
} from 'lucide-react'
import type { AgentSessionState } from '@shared/types'
import { AGENT_RECIPES } from '@shared/recipes'
import { HERO_DEMO_MODE, HERO_DEMO_PROMPT } from '@shared/demo'
import type { AgentMode } from '@shared/policies'
import { useVoiceInput } from '../hooks/useVoiceInput'
import { useRovingTablist } from '../hooks/useRovingTablist'
import { useChromePrefs } from '../stores/chromePrefs'
import { exportTrajectoryFile } from '../lib/download'
import { providerLabel } from '../lib/providers'
import { ActionChip, MessageBubble, TrajectoryRow } from './agent/ChatParts'
import { PolicyPane } from './agent/PolicyPane'

interface Props {
  open: boolean
  state: AgentSessionState | null
  onClose: () => void
  onOpenSettings?: () => void
  /** Optional toast for export / actions */
  onToast?: (kind: 'success' | 'info' | 'error', text: string) => void
}

const RECIPE_PREVIEW = 4

const TEXTAREA_MAX_LENGTH = 20000

type AgentTab = 'chat' | 'trajectory' | 'policy'

export function AgentPanel({
  open,
  state,
  onClose,
  onOpenSettings,
  onToast
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const draftRef = useRef('')
  const [tab, setTab] = useState<AgentTab>('chat')
  const [sendError, setSendError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [recipesExpanded, setRecipesExpanded] = useState(false)
  const [exporting, setExporting] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const prefs = useChromePrefs()
  const density = prefs.agentDensity
  const busy =
    state?.status === 'thinking' ||
    state?.status === 'acting' ||
    state?.status === 'waiting_human' ||
    state?.status === 'paused'
  const canStop =
    state?.status === 'thinking' ||
    state?.status === 'acting' ||
    state?.status === 'paused' ||
    state?.status === 'waiting_human'
  const showSuggestions = (state?.messages?.length ?? 0) <= 1 && !busy
  const provider = state?.provider ?? 'heuristic'
  const model = state?.model
  const status = state?.status ?? 'idle'
  const draftLen = draft.length
  const nearLimit = draftLen > TEXTAREA_MAX_LENGTH * 0.9

  const userTypingRef = useRef(false)
  const panelTabsRef = useRef<HTMLDivElement>(null)
  const confirmDialogRef = useRef<HTMLDivElement>(null)

  const onDraftChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    userTypingRef.current = true
    const v = e.target.value
    draftRef.current = v
    setDraft(v)
    if (sendError) setSendError(null)
  }

  const onVoiceFinal = useCallback((text: string) => {
    const t = text.trim()
    if (!t) return
    if (userTypingRef.current) return
    draftRef.current = t
    setDraft(t)
  }, [])

  const onVoiceInterim = useCallback((text: string) => {
    if (!text) return
    if (userTypingRef.current) return
    draftRef.current = text
    setDraft(text)
  }, [])

  const voice = useVoiceInput({
    onFinal: onVoiceFinal,
    onInterim: onVoiceInterim
  })

  useEffect(() => {
    const el = listRef.current
    if (!el || tab !== 'chat') return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 120) {
      el.scrollTop = el.scrollHeight
    }
  }, [state?.messages, state?.status, tab])

  useEffect(() => {
    if (voice.status === 'idle') userTypingRef.current = false
  }, [voice.status])

  const submitDraft = (value: string): Promise<void> => {
    const isAnswer = Boolean(state?.waitingQuestion) && state?.status === 'waiting_human'
    return isAnswer
      ? window.browgent.answerHuman(value)
      : window.browgent.sendAgentMessage(value, state?.activeTabId ?? undefined)
  }

  const send = (text?: string): void => {
    const submitted = text ?? draftRef.current
    if (!submitted.trim()) return
    if (sending) return
    if (busy && !(state?.status === 'waiting_human' && state.waitingQuestion)) return
    if (voice.status === 'listening') voice.stop()
    setSending(true)
    setSendError(null)
    submitDraft(submitted)
      .then(() => {
        if (draftRef.current === submitted) {
          draftRef.current = ''
          setDraft('')
        }
        userTypingRef.current = false
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Send failed'
        setSendError(
          state?.status === 'waiting_human' && state.waitingQuestion
            ? `Answer rejected — ${msg}. Edit and retry.`
            : `Send rejected — ${msg}. Edit and retry.`
        )
      })
      .finally(() => {
        setSending(false)
      })
  }

  const retry = (): void => {
    if (sendError) setSendError(null)
    const value = draftRef.current
    if (!value.trim()) return
    if (sending) return
    if (busy && !(state?.status === 'waiting_human' && state.waitingQuestion)) return
    if (voice.status === 'listening') voice.stop()
    setSending(true)
    submitDraft(value)
      .then(() => {
        if (draftRef.current === value) {
          draftRef.current = ''
          setDraft('')
        }
        userTypingRef.current = false
      })
      .catch((err: unknown) => {
        const m = err instanceof Error ? err.message : 'Send failed'
        setSendError(
          state?.status === 'waiting_human' && state.waitingQuestion
            ? `Answer rejected — ${m}. Edit and retry.`
            : `Send rejected — ${m}. Edit and retry.`
        )
      })
      .finally(() => {
        setSending(false)
      })
  }

  const toggleMic = (): void => {
    if (voice.status === 'listening') {
      voice.stop()
    } else {
      userTypingRef.current = false
      voice.start()
    }
  }

  const mode = state?.mode ?? 'act'
  const tabs: AgentTab[] = ['chat', 'trajectory', 'policy']
  const tabIdBase = useId()
  const chatPanelId = `${tabIdBase}-chat-panel`
  const trajPanelId = `${tabIdBase}-trajectory-panel`
  const policyPanelId = `${tabIdBase}-policy-panel`
  const confirmTitleId = `${tabIdBase}-confirm-title`
  const confirmDescId = `${tabIdBase}-confirm-desc`

  const r = useRovingTablist<AgentTab>({
    items: tabs,
    activeIndex: tabs.indexOf(tab),
    orientation: 'horizontal',
    containerRef: panelTabsRef,
    onActivate: (t) => setTab(t)
  })

  useEffect(() => {
    if (!open) return
    if (!state?.pendingConfirmation) return
    const root = confirmDialogRef.current
    if (!root) return
    const first = root.querySelector<HTMLElement>('button')
    first?.focus()
  }, [open, state?.pendingConfirmation?.id])

  // Focus composer when agent asks for human input
  useEffect(() => {
    if (!open || !state?.waitingQuestion) return
    const t = window.setTimeout(() => inputRef.current?.focus(), 80)
    return () => window.clearTimeout(t)
  }, [open, state?.waitingQuestion])

  const doExport = useCallback((): void => {
    if (exporting) return
    setExporting(true)
    void exportTrajectoryFile()
      .then(() => onToast?.('success', 'Trajectory exported (eval pack JSON)'))
      .catch((e) => {
        console.error('Export failed', e)
        onToast?.('error', 'Export failed')
      })
      .finally(() => setExporting(false))
  }, [exporting, onToast])

  const runHeroDemo = (): void => {
    if (sending || busy) {
      onToast?.('info', 'Stop the current task before running the demo')
      return
    }
    void window.browgent.setAgentMode(HERO_DEMO_MODE)
    void window.browgent.recordDemoRun?.().catch(() => undefined)
    void window.browgent.recordRecipeRun?.().catch(() => undefined)
    send(HERO_DEMO_PROMPT)
    onToast?.('success', 'Hero demo started — watch the agent on example.com')
  }

  const showModeBar = prefs.agentShowModeBar
  const showControls = canStop || state?.status === 'paused' || busy
  const visibleRecipes = recipesExpanded
    ? AGENT_RECIPES
    : AGENT_RECIPES.slice(0, RECIPE_PREVIEW)

  return (
    <aside
      className={`agent-panel density-${density}`}
      aria-label="Agent panel"
      hidden={!open}
    >
      <header className="agent-header">
        <div className="agent-identity">
          <div
            className={`agent-avatar${busy ? ' live' : ''}${status === 'paused' ? ' paused' : ''}${status === 'error' ? ' error' : ''}`}
            aria-hidden
          >
            <Bot size={16} strokeWidth={1.75} />
            <span className={`agent-status-dot status-${status}`} />
          </div>
          <div>
            <h2>Browsing agent</h2>
            <div className={`agent-status ${status}`}>
              <span className="agent-status-label">{formatStatus(status)}</span>
              {typeof state?.stepCount === 'number' && (
                <span className="agent-step-count">
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
            provider !== 'heuristic'
              ? `${providerLabel(provider)} tool-calling (${model ?? 'model'})`
              : 'Local heuristics — set XAI_API_KEY (Grok) or BROWGENT_PROVIDER for any OpenAI-compatible API'
          }
        >
          {provider !== 'heuristic' ? providerLabel(provider) : 'Heuristic'}
        </span>
        <div className="agent-header-actions">
          {onOpenSettings && (
            <button
              type="button"
              className="icon-btn"
              title="Agent settings"
              aria-label="Open agent settings"
              onClick={onOpenSettings}
            >
              <Settings2 size={15} strokeWidth={1.75} />
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            title="Export trajectory eval JSON"
            aria-label="Export trajectory"
            disabled={exporting}
            onClick={doExport}
          >
            <Download size={15} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Clear"
            aria-label="Clear session"
            onClick={() => void window.browgent.clearAgent()}
          >
            <Eraser size={15} strokeWidth={1.75} />
          </button>
          <button type="button" className="icon-btn" title="Close" aria-label="Close agent panel" onClick={onClose}>
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {(showModeBar || showControls) && (
        <div className="agent-toolbar">
          {showModeBar && (
            <div className="mode-bar" role="group" aria-label="Agent mode">
              <ModeBtn
                active={mode === 'act'}
                icon={<Zap size={12} />}
                label="Act"
                onClick={() => void window.browgent.setAgentMode('act')}
              />
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
          )}
          <div className="control-bar">
            <button
              type="button"
              className="ctrl-btn"
              onClick={() => void window.browgent.takeover()}
              title="Human takeover"
            >
              <Hand size={13} /> Takeover
            </button>
            {state?.status === 'paused' ? (
              <button
                type="button"
                className="ctrl-btn accent"
                onClick={() => void window.browgent.resumeAgent()}
              >
                <Play size={13} /> Resume
              </button>
            ) : (
              <button
                type="button"
                className="ctrl-btn"
                onClick={() => void window.browgent.pauseAgent()}
                disabled={!busy && !canStop}
              >
                <Pause size={13} /> Pause
              </button>
            )}
            {canStop && (
              <button
                type="button"
                className="ctrl-btn danger"
                onClick={() => void window.browgent.stopAgent()}
              >
                <Square size={11} fill="currentColor" /> Stop
              </button>
            )}
          </div>
        </div>
      )}

      <div
        className="panel-tabs"
        role="tablist"
        aria-label="Agent views"
        ref={panelTabsRef}
      >
        {tabs.map((t, i) => {
          const tp = r.tabPropsFor(t, i)
          const id = `${tabIdBase}-${t}-tab`
          const panelId =
            t === 'chat' ? chatPanelId : t === 'trajectory' ? trajPanelId : policyPanelId
          return (
            <button
              key={t}
              type="button"
              id={id}
              role="tab"
              aria-selected={tab === t}
              aria-controls={panelId}
              className={tab === t ? 'on' : ''}
              tabIndex={tp.tabIndex}
              onFocus={tp.onFocus}
              onKeyDown={tp.onKeyDown}
              onClick={() => tp.onClick()}
            >
              {t === 'chat' ? 'Chat' : t === 'trajectory' ? 'Trajectory' : 'Policy'}
            </button>
          )
        })}
      </div>

      {state?.pendingConfirmation && (
        <div
          ref={confirmDialogRef}
          className="confirm-banner confirm-banner-policy"
          role="alertdialog"
          aria-modal="false"
          aria-labelledby={confirmTitleId}
          aria-describedby={confirmDescId}
        >
          <p id={confirmTitleId} className="confirm-title">
            Policy gate
            {state.pendingConfirmation.tool ? (
              <span className="confirm-tool">{state.pendingConfirmation.tool}</span>
            ) : null}
          </p>
          <p id={confirmDescId}>{state.pendingConfirmation.reason}</p>
          <div className="confirm-actions">
            <button
              type="button"
              className="ctrl-btn accent"
              onClick={() => void window.browgent.confirmAction(state.pendingConfirmation!.id)}
            >
              Allow
            </button>
            <button
              type="button"
              className="ctrl-btn danger"
              onClick={() => void window.browgent.rejectAction(state.pendingConfirmation!.id)}
            >
              Deny
            </button>
            <button
              type="button"
              className="ctrl-btn"
              title="Pause agent and take the browser"
              onClick={() => void window.browgent.takeover()}
            >
              <Hand size={13} /> Takeover
            </button>
          </div>
        </div>
      )}

      {state?.waitingQuestion && (
        <div className="confirm-banner info" role="status" aria-live="polite">
          <p className="confirm-title">Agent needs you</p>
          <p>{state.waitingQuestion}</p>
          <div className="confirm-actions">
            <button
              type="button"
              className="ctrl-btn"
              onClick={() => void window.browgent.takeover()}
            >
              <Hand size={13} /> Takeover
            </button>
            <button
              type="button"
              className="ctrl-btn accent"
              onClick={() => inputRef.current?.focus()}
            >
              Type answer
            </button>
          </div>
        </div>
      )}

      <div
        id={chatPanelId}
        role="tabpanel"
        aria-labelledby={`${tabIdBase}-chat-tab`}
        tabIndex={0}
        hidden={tab !== 'chat'}
        className="agent-tabpanel chat-panel"
      >
        <div className="agent-messages" ref={listRef} aria-live="polite">
          {(state?.messages ?? []).map((msg) => (
            <div key={msg.id} className={`msg ${msg.role}`}>
              {(prefs.agentShowTimestamps || msg.role === 'user') && (
                <div className="msg-meta">
                  <span>{msg.role === 'assistant' ? 'agent' : msg.role}</span>
                  {prefs.agentShowTimestamps && (
                    <>
                      <span>·</span>
                      <span>
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </>
                  )}
                </div>
              )}
              {msg.content && (
                <MessageBubble
                  content={msg.content}
                  collapse={prefs.agentCollapseLong && msg.role !== 'user'}
                />
              )}
              {prefs.agentShowActionsInChat && msg.actions && msg.actions.length > 0 && (
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
              <div className="msg-bubble thinking-bubble">
                <Loader2 size={13} className="spin" />{' '}
                {provider !== 'heuristic'
                  ? `${providerLabel(provider)} is planning…`
                  : 'Planning steps…'}
              </div>
            </div>
          )}
        </div>

        {showSuggestions && (
          <div className="agent-suggestions" aria-label="Recipes">
            <div className="agent-suggestions-head">
              <div className="agent-suggestions-label">Recipes</div>
              <button
                type="button"
                className="suggestion-chip suggestion-demo"
                title="60s co-browse demo on example.com (YC recording)"
                disabled={sending || busy}
                onClick={runHeroDemo}
              >
                <Sparkles size={12} /> Run demo
              </button>
            </div>
            <div className="agent-suggestions-row">
              {visibleRecipes.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="suggestion-chip"
                  title={r.blurb}
                  onClick={() => {
                    void window.browgent.setAgentMode(r.mode as AgentMode)
                    void window.browgent.recordRecipeRun?.().catch(() => undefined)
                    send(r.prompt)
                  }}
                >
                  <span className={`recipe-mode-tag mode-${r.mode}`}>{r.mode}</span>
                  {r.title}
                </button>
              ))}
              {AGENT_RECIPES.length > RECIPE_PREVIEW && (
                <button
                  type="button"
                  className="suggestion-chip suggestion-more"
                  onClick={() => setRecipesExpanded((v) => !v)}
                  aria-expanded={recipesExpanded}
                >
                  {recipesExpanded ? (
                    <>
                      <ChevronUp size={12} /> Less
                    </>
                  ) : (
                    <>
                      <ChevronDown size={12} /> +{AGENT_RECIPES.length - RECIPE_PREVIEW} more
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div
        id={trajPanelId}
        role="tabpanel"
        aria-labelledby={`${tabIdBase}-trajectory-tab`}
        tabIndex={0}
        hidden={tab !== 'trajectory'}
        className="agent-tabpanel trajectory-list"
      >
        {(state?.trajectory ?? []).length === 0 && (
          <p className="empty-hint">
            Tool calls and observations appear here. Export produces an eval pack (schema v1) for
            offline grading — no screenshot bytes.
          </p>
        )}
        <div className="trajectory-export-bar">
          <button
            type="button"
            className="ctrl-btn accent"
            disabled={exporting || (state?.trajectory?.length ?? 0) === 0}
            onClick={doExport}
          >
            <Download size={13} /> {exporting ? 'Exporting…' : 'Export eval JSON'}
          </button>
          <span className="empty-hint" style={{ margin: 0 }}>
            {state?.trajectory?.length ?? 0} events · schema v1
          </span>
        </div>
        {[...(state?.trajectory ?? [])].reverse().map((step) => (
          <TrajectoryRow key={step.id} step={step} collapseLong={prefs.agentCollapseLong} />
        ))}
      </div>

      <div
        id={policyPanelId}
        role="tabpanel"
        aria-labelledby={`${tabIdBase}-policy-tab`}
        tabIndex={0}
        hidden={tab !== 'policy'}
        className="agent-tabpanel policy-pane"
      >
        <PolicyPane state={state} onOpenSettings={onOpenSettings} />
      </div>

      <div className="agent-composer">
        <textarea
          ref={inputRef}
          className="agent-input"
          value={draft}
          maxLength={TEXTAREA_MAX_LENGTH}
          onChange={onDraftChange}
          aria-label={
            state?.waitingQuestion ? 'Answer for the agent' : 'Agent instruction'
          }
          aria-invalid={Boolean(sendError)}
          aria-describedby={sendError ? 'agent-send-error' : undefined}
          placeholder={
            !voice.supported
              ? 'Type your instruction…'
              : voice.status === 'listening'
                ? 'Listening…'
                : state?.waitingQuestion
                  ? 'Type or speak your answer…'
                  : mode === 'research'
                    ? 'Research request (read-only)…'
                    : mode === 'watch'
                      ? 'Ask what I see while you browse…'
                      : 'Speak or type a browser instruction…'
          }
          rows={density === 'compact' ? 2 : 3}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        {nearLimit && (
          <div className="composer-char-count" aria-live="polite">
            {draftLen.toLocaleString()} / {TEXTAREA_MAX_LENGTH.toLocaleString()}
          </div>
        )}
        {sendError && (
          <div id="agent-send-error" className="voice-error" role="alert">
            {sendError}
            <button type="button" className="ctrl-btn" onClick={retry} style={{ marginLeft: 8 }}>
              Retry
            </button>
          </div>
        )}
        <div className="composer-row">
          <div className="composer-left">
            <button
              type="button"
              className={`mic-btn${voice.status === 'listening' ? ' listening' : ''}`}
              title={
                !voice.supported
                  ? 'Speech recognition unavailable — type instead'
                  : voice.status === 'listening'
                    ? 'Stop listening'
                    : 'Voice input'
              }
              aria-label={
                !voice.supported
                  ? 'Voice input unavailable'
                  : voice.status === 'listening'
                    ? 'Stop voice input'
                    : 'Start voice input'
              }
              aria-pressed={voice.status === 'listening'}
              disabled={!voice.supported}
              onClick={toggleMic}
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
            {prefs.agentShowComposerHints &&
              !voice.error &&
              voice.status === 'idle' &&
              voice.supported && (
                <span className="composer-hint">Enter to send · Shift+Enter newline</span>
              )}
            {!voice.supported && <span className="composer-hint">Mic unavailable</span>}
          </div>
          <button
            type="button"
            className="send-btn"
            onClick={() => send()}
            disabled={
              sending ||
              !draft.trim() ||
              (busy && !(state?.status === 'waiting_human' && state.waitingQuestion))
            }
          >
            <Send size={13} strokeWidth={2.25} />
            {sending ? '…' : 'Send'}
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
    <button
      type="button"
      className={`mode-btn${active ? ' on' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  )
}

function formatStatus(status: string): string {
  switch (status) {
    case 'waiting_human':
      return 'needs you'
    case 'thinking':
      return 'thinking'
    case 'acting':
      return 'acting'
    case 'paused':
      return 'paused'
    case 'error':
      return 'error'
    default:
      return status
  }
}
