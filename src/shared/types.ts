import type { AgentMode, AgentPolicy } from './policies'
import type { ToolCall, ToolName, ToolResult } from './tools'
import { resolveNavigableTarget } from './sites'

export type TabId = string

export interface TabState {
  id: TabId
  title: string
  url: string
  favicon?: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  isActive: boolean
  /** Which agent (if any) currently owns this tab */
  owner?: 'human' | 'agent' | null
  /** Page zoom factor (1 = 100%) */
  zoomFactor?: number
}

/** Persistent browsing history entry (not per-tab back/forward). */
export interface HistoryEntry {
  id: string
  url: string
  title: string
  favicon?: string
  visitCount: number
  lastVisit: number
}

export type DownloadState =
  | 'progressing'
  | 'completed'
  | 'cancelled'
  | 'interrupted'

export interface DownloadItemState {
  id: string
  url: string
  filename: string
  savePath: string
  mimeType?: string
  totalBytes: number
  receivedBytes: number
  state: DownloadState
  startedAt: number
  endedAt?: number
  canResume?: boolean
}

export interface FindInPageResult {
  tabId: TabId | null
  requestId: number
  activeMatchOrdinal: number
  matches: number
  finalUpdate: boolean
}

export interface FindInPageOptions {
  forward?: boolean
  findNext?: boolean
  matchCase?: boolean
}

export interface BrowserChromeMetrics {
  top: number
  right: number
  bottom: number
  left: number
}

export type AgentRole = 'user' | 'assistant' | 'system' | 'tool'

export interface AgentMessage {
  id: string
  role: AgentRole
  content: string
  timestamp: number
  actions?: AgentAction[]
  toolCall?: ToolCall
  toolResult?: ToolResult
}

export type AgentActionType = ToolName | 'handoff' | 'policy_block' | 'confirm'

export interface AgentAction {
  type: AgentActionType
  label: string
  detail?: string
  status: 'pending' | 'running' | 'done' | 'error' | 'blocked' | 'waiting'
}

export type AgentSessionStatus =
  | 'idle'
  | 'thinking'
  | 'acting'
  | 'waiting_human'
  | 'paused'
  | 'error'

export interface TrajectoryStep {
  id: string
  ts: number
  kind: 'user' | 'assistant' | 'tool' | 'observation' | 'policy' | 'system'
  title: string
  detail?: string
  tool?: ToolName
  ok?: boolean
  data?: unknown
}

export interface PendingConfirmation {
  id: string
  reason: string
  tool: ToolName
  args: Record<string, unknown>
}

/** LLM brain id — Grok is default when configured; others are OpenAI-compatible presets */
export type AgentProvider =
  | 'grok'
  | 'openai'
  | 'openrouter'
  | 'groq'
  | 'deepseek'
  | 'ollama'
  | 'custom'
  | 'heuristic'

export interface AgentSessionState {
  status: AgentSessionStatus
  mode: AgentMode
  messages: AgentMessage[]
  activeTabId: TabId | null
  trajectory: TrajectoryStep[]
  pendingConfirmation: PendingConfirmation | null
  waitingQuestion: string | null
  stepCount: number
  maxSteps: number
  policy: AgentPolicy
  /** Brain: configured OpenAI-compatible LLM, or local heuristics */
  provider: AgentProvider
  model: string | null
}

export interface NavigatePayload {
  tabId?: TabId
  input: string
}

export interface ObserveElement {
  ref: string
  role: string
  name: string
  tag: string
  href?: string
  placeholder?: string
  value?: string
  bbox?: { x: number; y: number; w: number; h: number }
}

export interface ObserveSnapshot {
  url: string
  title: string
  elements: ObserveElement[]
  textPreview: string
  /** Tab this snapshot was taken on (for multi-tab ref validation) */
  tabId?: string
}

/** Normalize user omnibox / agent input into a navigable URL (aliases, domains, search). */
export function normalizeUrl(input: string): string {
  return resolveNavigableTarget(input)
}

export const IPC = {
  TAB_CREATE: 'tab:create',
  TAB_CLOSE: 'tab:close',
  TAB_ACTIVATE: 'tab:activate',
  TAB_NAVIGATE: 'tab:navigate',
  TAB_BACK: 'tab:back',
  TAB_FORWARD: 'tab:forward',
  TAB_RELOAD: 'tab:reload',
  TAB_STOP: 'tab:stop',
  TABS_STATE: 'tabs:state',
  TABS_GET: 'tabs:get',

  CHROME_METRICS: 'chrome:metrics',
  /** Hide guest WebContentsView so chrome can paint New Tab / Settings in the content hole */
  GUEST_VISIBLE: 'chrome:guestVisible',
  APP_VERSION: 'app:version',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_FULLSCREEN_GET: 'window:fullscreenGet',
  WINDOW_FULLSCREEN_CHANGED: 'window:fullscreenChanged',

  AGENT_SEND: 'agent:send',
  AGENT_GET: 'agent:get',
  AGENT_STATE: 'agent:state',
  AGENT_STOP: 'agent:stop',
  AGENT_CLEAR: 'agent:clear',
  AGENT_PAUSE: 'agent:pause',
  AGENT_RESUME: 'agent:resume',
  AGENT_TAKEOVER: 'agent:takeover',
  AGENT_SET_MODE: 'agent:setMode',
  AGENT_SET_POLICY: 'agent:setPolicy',
  AGENT_CONFIRM: 'agent:confirm',
  AGENT_REJECT: 'agent:reject',
  AGENT_ANSWER: 'agent:answer',
  AGENT_EXPORT: 'agent:export',

  MCP_STATUS: 'mcp:status',

  /** Dual-mode driver + Playwright CDP endpoint */
  DRIVER_STATUS: 'driver:status',
  DRIVER_SET_MODE: 'driver:setMode',

  /** Floating agent companion (native overlay above guest pages) */
  PET_CONFIGURE: 'pet:configure',
  PET_STATE: 'pet:state',
  PET_DRAG_START: 'pet:dragStart',
  PET_DRAG_BY: 'pet:dragBy',
  PET_DRAG_END: 'pet:dragEnd',
  PET_CLICK: 'pet:click',
  PET_HIDE: 'pet:hide',
  PET_MOVED: 'pet:moved',

  /** Find in page */
  FIND_START: 'find:start',
  FIND_STOP: 'find:stop',
  FIND_RESULT: 'find:result',

  /** Page zoom */
  ZOOM_GET: 'zoom:get',
  ZOOM_SET: 'zoom:set',
  ZOOM_IN: 'zoom:in',
  ZOOM_OUT: 'zoom:out',
  ZOOM_RESET: 'zoom:reset',

  /** Print active guest page */
  TAB_PRINT: 'tab:print',

  /** Browsing history */
  HISTORY_GET: 'history:get',
  HISTORY_SEARCH: 'history:search',
  HISTORY_DELETE: 'history:delete',
  HISTORY_CLEAR: 'history:clear',

  /** Downloads */
  DOWNLOADS_GET: 'downloads:get',
  DOWNLOADS_STATE: 'downloads:state',
  DOWNLOADS_OPEN: 'downloads:open',
  DOWNLOADS_SHOW: 'downloads:show',
  DOWNLOADS_CANCEL: 'downloads:cancel',
  DOWNLOADS_CLEAR: 'downloads:clear',
  DOWNLOADS_OPEN_FOLDER: 'downloads:openFolder',

  /** Privacy-safe local metrics (no page content) */
  METRICS_GET: 'metrics:get',
  METRICS_SET_TELEMETRY: 'metrics:setTelemetry',
  METRICS_EXPORT_TRACTION: 'metrics:exportTraction',
  METRICS_RECORD_DEMO: 'metrics:recordDemo',
  METRICS_RECORD_RECIPE: 'metrics:recordRecipe',

  /** Detect / import from installed browsers */
  IMPORT_DETECT: 'import:detect',
  IMPORT_RUN: 'import:run',

  /** Password vault (metadata only over IPC) */
  VAULT_LIST: 'vault:list',
  VAULT_REMOVE: 'vault:remove',
  VAULT_CLEAR: 'vault:clear',

  /** User Hub profile */
  PROFILE_GET: 'profile:get',
  PROFILE_SET: 'profile:set'
} as const
