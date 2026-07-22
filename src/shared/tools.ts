/**
 * Canonical agent tool surface — parity with Stagehand / browser-use / agent-browser,
 * plus Browgent-specific tools (tab control, policies, human handoff).
 */

export type ToolName =
  | 'navigate'
  | 'back'
  | 'forward'
  | 'reload'
  | 'click'
  | 'type'
  | 'press_key'
  | 'scroll'
  | 'hover'
  | 'select_option'
  | 'wait'
  | 'screenshot'
  | 'observe'
  | 'extract_text'
  | 'extract_links'
  | 'get_url'
  | 'switch_tab'
  | 'new_tab'
  | 'close_tab'
  | 'list_tabs'
  | 'ask_human'
  | 'done'
  | 'think'

export interface ToolDef {
  name: ToolName
  description: string
  params: Record<string, string>
  /** If true, policy may require human confirmation */
  sensitive?: boolean
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'navigate',
    description: 'Navigate the active (or given) tab to a URL or search query',
    params: { url: 'string', tabId: 'string?' }
  },
  { name: 'back', description: 'Go back in history', params: { tabId: 'string?' } },
  { name: 'forward', description: 'Go forward in history', params: { tabId: 'string?' } },
  { name: 'reload', description: 'Reload page', params: { tabId: 'string?' } },
  {
    name: 'click',
    description: 'Click element by ref from last observe (e.g. e3) or CSS selector',
    params: { ref: 'string?', selector: 'string?', tabId: 'string?' }
  },
  {
    name: 'type',
    description: 'Type text into element (ref or selector). clear=true replaces content',
    params: { text: 'string', ref: 'string?', selector: 'string?', clear: 'boolean?', tabId: 'string?' }
  },
  {
    name: 'press_key',
    description: 'Press a key (Enter, Tab, Escape, ArrowDown, Meta+l, etc.)',
    params: { key: 'string', tabId: 'string?' }
  },
  {
    name: 'scroll',
    description: 'Scroll page or element. direction: up|down|left|right or amount in px',
    params: { direction: 'string?', amount: 'number?', ref: 'string?', tabId: 'string?' }
  },
  {
    name: 'hover',
    description: 'Hover element by ref or selector',
    params: { ref: 'string?', selector: 'string?', tabId: 'string?' }
  },
  {
    name: 'select_option',
    description: 'Select dropdown option by value or label',
    params: { value: 'string?', label: 'string?', ref: 'string?', selector: 'string?', tabId: 'string?' }
  },
  {
    name: 'wait',
    description: 'Wait milliseconds or until selector/ref appears',
    params: { ms: 'number?', ref: 'string?', selector: 'string?', tabId: 'string?' }
  },
  {
    name: 'screenshot',
    description: 'Capture viewport screenshot (returns size metadata only; bytes are not stored in trajectory)',
    params: { tabId: 'string?' }
  },
  {
    name: 'observe',
    description: 'Snapshot interactive elements with compact refs (e1, e2…) + page meta',
    params: { tabId: 'string?' }
  },
  {
    name: 'extract_text',
    description: 'Extract readable page text (title, url, body excerpt)',
    params: { tabId: 'string?', maxChars: 'number?' }
  },
  {
    name: 'extract_links',
    description: 'Extract links from page',
    params: { tabId: 'string?', limit: 'number?' }
  },
  { name: 'get_url', description: 'Get current URL and title', params: { tabId: 'string?' } },
  {
    name: 'switch_tab',
    description: 'Activate a tab by id',
    params: { tabId: 'string' }
  },
  {
    name: 'new_tab',
    description: 'Open a new tab, optionally with URL',
    params: { url: 'string?' }
  },
  {
    name: 'close_tab',
    description: 'Close a tab',
    params: { tabId: 'string?' }
  },
  {
    name: 'list_tabs',
    description: 'List open tabs with ids, titles, urls',
    params: {}
  },
  {
    name: 'ask_human',
    description: 'Pause and ask the human a question (login, CAPTCHA, choice)',
    params: { question: 'string' },
    sensitive: true
  },
  {
    name: 'done',
    description: 'Mark the task complete with a final answer for the user',
    params: { summary: 'string' }
  },
  {
    name: 'think',
    description: 'Internal reasoning step (no browser side effect)',
    params: { thought: 'string' }
  }
]

export type ToolArgs = Record<string, unknown>

export interface ToolCall {
  id: string
  name: ToolName
  args: ToolArgs
}

export interface ToolResult {
  ok: boolean
  tool: ToolName
  data?: unknown
  error?: string
  /** Human-readable one-liner for trajectory UI */
  summary: string
}

export function isToolName(v: string): v is ToolName {
  return TOOL_DEFS.some((t) => t.name === v)
}
