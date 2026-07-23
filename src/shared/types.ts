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
  DRIVER_SET_MODE: 'driver:setMode'
} as const
