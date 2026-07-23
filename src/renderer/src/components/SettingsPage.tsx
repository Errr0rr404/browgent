import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent
} from 'react'
import {
  Brain,
  Check,
  Eye,
  Keyboard,
  Palette,
  Search,
  Shield,
  X,
  Zap
} from 'lucide-react'
import type { AgentSessionState } from '@shared/types'
import { DEFAULT_POLICY, type AgentMode, type AgentPolicy } from '@shared/policies'
import type { CdpEndpointStatus } from '@shared/driver'
import { THEMES, type ThemeId } from '../themes/themes'
import {
  SEARCH_ENGINES,
  useChromePrefs,
  type AgentConsoleDensity,
  type SearchEngine
} from '../stores/chromePrefs'
import { parseHosts } from '../lib/hosts'
import { platformModKey } from '../lib/platform'
import { providerLabel } from '../lib/providers'
import type { SettingsSection } from '../lib/settings'
import { ToggleRow } from './ui/ToggleRow'
import '../styles/chrome-pages.css'

export type { SettingsSection }

interface Props {
  theme: ThemeId
  onThemeChange: (id: ThemeId) => void
  section?: SettingsSection
  onSectionChange?: (s: SettingsSection) => void
  agent: AgentSessionState | null
  onClose?: () => void
  onExportTrajectory?: () => void
}

interface NavItem {
  id: SettingsSection
  label: string
  icon: React.ReactNode
}

const NAV: NavItem[] = [
  { id: 'appearance', label: 'Appearance', icon: <Palette size={15} strokeWidth={1.6} /> },
  { id: 'agent', label: 'Agent & policy', icon: <Zap size={15} strokeWidth={1.6} /> },
  { id: 'brain', label: 'Brain', icon: <Brain size={15} strokeWidth={1.6} /> },
  { id: 'privacy', label: 'Privacy & data', icon: <Shield size={15} strokeWidth={1.6} /> },
  { id: 'search', label: 'Search & new tab', icon: <Search size={15} strokeWidth={1.6} /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard size={15} strokeWidth={1.6} /> }
]

function buildShortcuts(mod: string): Array<{ label: string; keys: string[] }> {
  const shift = mod === '⌘' ? '⇧' : 'Shift'
  return [
    { label: 'New tab', keys: [mod, 'T'] },
    { label: 'Close tab', keys: [mod, 'W'] },
    { label: 'Focus address bar', keys: [mod, 'L'] },
    { label: 'Toggle agent panel', keys: [mod, 'J'] },
    { label: 'Toggle sidebar', keys: [mod, shift, 'S'] },
    { label: 'Open settings', keys: [mod, ','] },
    { label: 'Pin page to favorites', keys: [mod, 'D'] },
    { label: 'Reload page', keys: [mod, 'R'] },
    { label: 'Switch to tab 1–9', keys: [mod, '1–9'] },
    { label: 'Back / forward', keys: [mod, '[ ]'] },
    { label: 'Stop agent / blur omnibox', keys: ['Esc'] }
  ]
}

export function SettingsPage({
  theme,
  onThemeChange,
  section: sectionProp,
  onSectionChange,
  agent,
  onClose,
  onExportTrajectory
}: Props): React.JSX.Element {
  const [localSection, setLocalSection] = useState<SettingsSection>(
    sectionProp ?? 'appearance'
  )
  const section = sectionProp ?? localSection

  const setSection = useCallback(
    (s: SettingsSection) => {
      if (onSectionChange) onSectionChange(s)
      else setLocalSection(s)
    },
    [onSectionChange]
  )

  useEffect(() => {
    if (sectionProp) setLocalSection(sectionProp)
  }, [sectionProp])

  const policy: AgentPolicy = agent?.policy ?? DEFAULT_POLICY
  const mode: AgentMode = agent?.mode ?? 'act'

  const [allowDraft, setAllowDraft] = useState((policy.allowHosts ?? []).join(', '))
  const [blockDraft, setBlockDraft] = useState((policy.blockHosts ?? []).join(', '))
  const [maxStepsDraft, setMaxStepsDraft] = useState(String(policy.maxSteps))
  const [committedMaxSteps, setCommittedMaxSteps] = useState(policy.maxSteps)
  const [driverStatus, setDriverStatus] = useState<CdpEndpointStatus | null>(null)

  const prefs = useChromePrefs()
  const shortcuts = useMemo(() => buildShortcuts(platformModKey()), [])

  useEffect(() => {
    setAllowDraft((policy.allowHosts ?? []).join(', '))
    setBlockDraft((policy.blockHosts ?? []).join(', '))
  }, [policy.allowHosts, policy.blockHosts])

  useEffect(() => {
    if (policy.maxSteps !== committedMaxSteps) {
      setCommittedMaxSteps(policy.maxSteps)
      setMaxStepsDraft(String(policy.maxSteps))
    }
  }, [policy.maxSteps, committedMaxSteps])

  useEffect(() => {
    if (!window.browgent?.getDriverStatus) return
    void window.browgent.getDriverStatus().then(setDriverStatus).catch(() => {
      /* ignore */
    })
  }, [])

  const commitMaxSteps = (): void => {
    let n = Number(maxStepsDraft)
    if (!Number.isFinite(n)) n = committedMaxSteps
    n = Math.min(100, Math.max(5, Math.round(n)))
    setCommittedMaxSteps(n)
    setMaxStepsDraft(String(n))
    if (n !== policy.maxSteps && window.browgent?.setAgentPolicy) {
      void window.browgent.setAgentPolicy({ maxSteps: n })
    }
  }

  const onMaxStepsKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitMaxSteps()
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setMaxStepsDraft(String(committedMaxSteps))
      e.currentTarget.blur()
    }
  }

  const setMode = (m: AgentMode): void => {
    if (window.browgent?.setAgentMode) void window.browgent.setAgentMode(m)
  }

  const setPolicy = (partial: Partial<AgentPolicy>): void => {
    if (window.browgent?.setAgentPolicy) void window.browgent.setAgentPolicy(partial)
  }

  const brainStatus = useMemo(() => {
    const provider = agent?.provider ?? 'heuristic'
    const model = agent?.model
    if (provider !== 'heuristic') {
      return `${providerLabel(provider)}${model ? ` (${model})` : ''} — OpenAI-compatible tools. Keys load from .env (not stored in the UI).`
    }
    return 'Heuristic fallback — set XAI_API_KEY (Grok default) or BROWGENT_PROVIDER + API key in .env. Keys are never stored in the browser UI.'
  }, [agent?.provider, agent?.model])

  const cdpPort =
    driverStatus?.port != null ? String(driverStatus.port) : driverStatus?.enabled ? '…' : 'off'
  const cdpNote =
    driverStatus?.note ||
    'CDP is localhost-only. Set BROWGENT_CDP_PORT to enable Playwright attach.'

  return (
    <div className="settings-page" data-screen-label="Settings">
      <div className="settings-ambient" aria-hidden />
      <div className="settings-wrap">
        <header className="settings-header">
          <div className="settings-header-text">
            <h1>Settings</h1>
            <div className="settings-url">browgent://settings</div>
          </div>
          {onClose && (
            <button
              type="button"
              className="settings-close"
              aria-label="Close settings"
              title="Close (Esc)"
              onClick={onClose}
            >
              <X size={16} strokeWidth={2} />
            </button>
          )}
        </header>

        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            {NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`settings-nav-btn${section === n.id ? ' active' : ''}`}
                onClick={() => setSection(n.id)}
              >
                {n.icon}
                {n.label}
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {section === 'appearance' && (
              <section className="settings-section">
                <h2>Theme</h2>
                <p className="settings-lead">
                  One lineup, eight moods. Applies to every surface of the chrome instantly.
                </p>
                <div className="settings-theme-grid">
                  {THEMES.map((t) => {
                    const active = t.id === theme
                    const [bg, acc, alt] = t.swatches
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`settings-theme-card${active ? ' active' : ''}`}
                        onClick={() => onThemeChange(t.id)}
                        aria-pressed={active}
                      >
                        <span
                          className="settings-theme-preview"
                          aria-hidden
                          style={{ background: bg }}
                        >
                          <span
                            className="settings-theme-preview-chrome"
                            style={{
                              background: `color-mix(in srgb, ${bg} 70%, ${alt})`,
                              borderColor: `color-mix(in srgb, ${alt} 40%, transparent)`
                            }}
                          >
                            <span style={{ background: acc }} />
                            <span
                              style={{
                                background: `color-mix(in srgb, ${alt} 35%, transparent)`
                              }}
                            />
                            <span style={{ background: alt }} />
                          </span>
                          <span className="settings-theme-preview-body">
                            <span
                              className="settings-theme-preview-side"
                              style={{
                                background: `color-mix(in srgb, ${bg} 85%, ${alt})`,
                                borderColor: `color-mix(in srgb, ${alt} 30%, transparent)`
                              }}
                            >
                              <i style={{ background: `color-mix(in srgb, ${alt} 55%, white)` }} />
                              <i style={{ background: `color-mix(in srgb, ${alt} 40%, white)` }} />
                              <i style={{ background: acc }} />
                            </span>
                            <span className="settings-theme-preview-main">
                              <i style={{ background: `color-mix(in srgb, ${alt} 50%, white)` }} />
                              <i style={{ background: `color-mix(in srgb, ${alt} 35%, white)` }} />
                              <i style={{ background: `color-mix(in srgb, ${alt} 28%, white)` }} />
                              <b style={{ background: acc }} />
                            </span>
                          </span>
                        </span>
                        <span className="settings-theme-meta">
                          <span className="settings-theme-meta-text">
                            <span className="settings-theme-name">{t.name}</span>
                            <span className="settings-theme-tag">{t.tagline}</span>
                          </span>
                          {active && (
                            <Check size={15} strokeWidth={2.25} className="settings-theme-check" />
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {section === 'agent' && (
              <section className="settings-section settings-section-stack">
                <div>
                  <h2>Agent &amp; policy</h2>
                  <p className="settings-lead">
                    Browser-native safety. Changes apply to the next tool step.
                  </p>
                  <div className="settings-mode-grid">
                    <ModeButton
                      active={mode === 'act'}
                      icon={<Zap size={12} strokeWidth={1.75} />}
                      label="Act"
                      onClick={() => setMode('act')}
                    />
                    <ModeButton
                      active={mode === 'research'}
                      icon={<Search size={12} strokeWidth={1.75} />}
                      label="Research"
                      onClick={() => setMode('research')}
                    />
                    <ModeButton
                      active={mode === 'watch'}
                      icon={<Eye size={12} strokeWidth={1.75} />}
                      label="Watch"
                      onClick={() => setMode('watch')}
                    />
                  </div>
                </div>

                <div className="settings-card settings-card-pad">
                  <ToggleRow
                    label="Confirm sensitive clicks"
                    sub="Pay, submit, delete — ask before acting"
                    on={policy.confirmSensitiveClicks}
                    onToggle={() =>
                      setPolicy({ confirmSensitiveClicks: !policy.confirmSensitiveClicks })
                    }
                  />
                  <ToggleRow
                    label="Confirm navigation to a new host"
                    sub="Cross-host moves need a yes"
                    on={policy.confirmCrossHost}
                    onToggle={() => setPolicy({ confirmCrossHost: !policy.confirmCrossHost })}
                  />
                  <ToggleRow
                    label="Pause when agent asks for help"
                    sub="Hands the tab back to you"
                    on={policy.pauseOnAskHuman}
                    onToggle={() => setPolicy({ pauseOnAskHuman: !policy.pauseOnAskHuman })}
                  />
                  <div className="settings-toggle-row settings-toggle-row-last">
                    <span className="settings-toggle-label">Max steps per goal</span>
                    <input
                      className="settings-num"
                      type="number"
                      min={5}
                      max={100}
                      value={maxStepsDraft}
                      onChange={(e) => setMaxStepsDraft(e.target.value)}
                      onBlur={commitMaxSteps}
                      onKeyDown={onMaxStepsKey}
                      aria-label="Max steps"
                    />
                  </div>
                </div>

                <div className="settings-card settings-card-fields">
                  <label className="settings-field">
                    Allow hosts (comma, empty = all)
                    <input
                      type="text"
                      placeholder="github.com, google.com"
                      value={allowDraft}
                      onChange={(e) => setAllowDraft(e.target.value)}
                      onBlur={() => setPolicy({ allowHosts: parseHosts(allowDraft) })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          setPolicy({ allowHosts: parseHosts(allowDraft) })
                          e.currentTarget.blur()
                        }
                      }}
                    />
                  </label>
                  <label className="settings-field">
                    Block hosts (comma)
                    <input
                      type="text"
                      placeholder="ads.example.com, tracker.io"
                      value={blockDraft}
                      onChange={(e) => setBlockDraft(e.target.value)}
                      onBlur={() => setPolicy({ blockHosts: parseHosts(blockDraft) })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          setPolicy({ blockHosts: parseHosts(blockDraft) })
                          e.currentTarget.blur()
                        }
                      }}
                    />
                  </label>
                </div>

                <div>
                  <h3 className="settings-subhead">Console display</h3>
                  <p className="settings-lead settings-lead-tight">
                    Keep the agent panel readable. Heavy tool dumps live on Trajectory.
                  </p>
                </div>
                <div className="settings-card settings-card-fields">
                  <label className="settings-field">
                    Density
                    <select
                      value={prefs.agentDensity}
                      onChange={(e) =>
                        prefs.setAgentDensity(e.target.value as AgentConsoleDensity)
                      }
                    >
                      <option value="compact">Compact (default)</option>
                      <option value="comfortable">Comfortable</option>
                    </select>
                  </label>
                </div>
                <div className="settings-card settings-card-pad">
                  <ToggleRow
                    label="Collapse long messages"
                    sub="Show more / less for page previews and dumps"
                    on={prefs.agentCollapseLong}
                    onToggle={() => prefs.setAgentCollapseLong(!prefs.agentCollapseLong)}
                  />
                  <ToggleRow
                    label="Show tool actions in chat"
                    sub="WAIT / SCROLL chips under assistant turns"
                    on={prefs.agentShowActionsInChat}
                    onToggle={() =>
                      prefs.setAgentShowActionsInChat(!prefs.agentShowActionsInChat)
                    }
                  />
                  <ToggleRow
                    label="Show message timestamps"
                    sub="Clock next to each chat line"
                    on={prefs.agentShowTimestamps}
                    onToggle={() => prefs.setAgentShowTimestamps(!prefs.agentShowTimestamps)}
                  />
                  <ToggleRow
                    label="Show Act / Research / Watch bar"
                    sub="Mode switcher at the top of the panel"
                    on={prefs.agentShowModeBar}
                    onToggle={() => prefs.setAgentShowModeBar(!prefs.agentShowModeBar)}
                  />
                  <ToggleRow
                    label="Composer keyboard hints"
                    sub="“Enter to send” under the input"
                    on={prefs.agentShowComposerHints}
                    onToggle={() =>
                      prefs.setAgentShowComposerHints(!prefs.agentShowComposerHints)
                    }
                  />
                </div>
              </section>
            )}

            {section === 'brain' && (
              <section className="settings-section settings-section-stack">
                <div>
                  <h2>Brain</h2>
                  <p className="settings-lead">
                    Any OpenAI-compatible endpoint. Without a key, the heuristic planner still drives
                    the browser.
                  </p>
                </div>
                <div className="settings-card settings-card-fields">
                  <div className="settings-readonly">
                    <span className="settings-readonly-label">Provider</span>
                    <span className="settings-readonly-value mono">
                      {providerLabel(agent?.provider ?? 'heuristic')}
                    </span>
                  </div>
                  <div className="settings-readonly">
                    <span className="settings-readonly-label">Model</span>
                    <span className="settings-readonly-value mono">
                      {agent?.model ?? '—'}
                    </span>
                  </div>
                </div>
                <div className="settings-note">
                  <strong>Status:</strong> {brainStatus}
                </div>
                <p className="settings-help">
                  Configure via environment variables in <code>.env</code> (
                  <code>XAI_API_KEY</code>, <code>BROWGENT_PROVIDER</code>,{' '}
                  <code>BROWGENT_MODEL</code>, <code>BROWGENT_BASE_URL</code>). API keys are never
                  stored in localStorage or this UI.
                </p>
              </section>
            )}

            {section === 'privacy' && (
              <section className="settings-section settings-section-stack">
                <div>
                  <h2>Privacy &amp; data</h2>
                  <p className="settings-lead">
                    Local-first identity — cookies and SSO stay on disk in{' '}
                    <code className="settings-code">persist:browgent-pages</code>.
                  </p>
                </div>
                <div className="settings-card settings-card-pad">
                  <div className="settings-toggle-row settings-toggle-row-last">
                    <span className="settings-toggle-text">
                      <span className="settings-toggle-label">
                        CDP port{' '}
                        <span className="settings-muted">(localhost only)</span>
                      </span>
                      <span className="settings-toggle-sub">{cdpNote}</span>
                    </span>
                    <input
                      className="settings-num mono"
                      value={cdpPort}
                      readOnly
                      aria-label="CDP port"
                    />
                  </div>
                </div>
                <div className="settings-actions">
                  {onExportTrajectory && (
                    <button
                      type="button"
                      className="settings-btn"
                      onClick={onExportTrajectory}
                    >
                      Export trajectory JSON
                    </button>
                  )}
                </div>
              </section>
            )}

            {section === 'search' && (
              <section className="settings-section settings-section-stack">
                <div>
                  <h2>Search &amp; new tab</h2>
                  <p className="settings-lead">
                    What the omnibox does, and what greets you on a fresh tab.
                  </p>
                </div>
                <div className="settings-card settings-card-fields">
                  <label className="settings-field">
                    Search engine
                    <select
                      value={prefs.searchEngine}
                      onChange={(e) =>
                        prefs.setSearchEngine(e.target.value as SearchEngine)
                      }
                    >
                      {SEARCH_ENGINES.map((eng) => (
                        <option key={eng} value={eng}>
                          {eng}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="settings-field">
                    Greeting name (optional)
                    <input
                      type="text"
                      placeholder="How the new tab greets you"
                      value={prefs.greetingName}
                      onChange={(e) => prefs.setGreetingName(e.target.value)}
                    />
                  </label>
                </div>
                <div className="settings-card settings-card-pad">
                  <ToggleRow
                    label="Clock & greeting"
                    sub="Time and a hello on every new tab"
                    on={prefs.ntClock}
                    onToggle={() => prefs.setNtClock(!prefs.ntClock)}
                  />
                  <ToggleRow
                    label="Favorites grid"
                    sub="Pinned sites under the search box"
                    on={prefs.ntFavs}
                    onToggle={() => prefs.setNtFavs(!prefs.ntFavs)}
                  />
                  <ToggleRow
                    label="Agent suggestions"
                    sub="Prompt chips that route to the agent"
                    on={prefs.ntChips}
                    onToggle={() => prefs.setNtChips(!prefs.ntChips)}
                  />
                </div>
              </section>
            )}

            {section === 'shortcuts' && (
              <section className="settings-section">
                <h2>Keyboard shortcuts</h2>
                <p className="settings-lead">
                  Muscle memory, preserved from the browsers you know.
                </p>
                <div className="settings-card settings-card-pad settings-shortcuts">
                  {shortcuts.map((sc) => (
                    <div key={sc.label} className="settings-shortcut-row">
                      <span className="settings-shortcut-label">{sc.label}</span>
                      <span className="settings-shortcut-keys">
                        {sc.keys.map((k) => (
                          <kbd key={`${sc.label}-${k}`}>{k}</kbd>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ModeButton({
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
      className={`settings-mode-btn${active ? ' active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {icon}
      {label}
    </button>
  )
}
