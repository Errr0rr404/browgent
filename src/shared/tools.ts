/**
 * Canonical agent tool surface — parity with Stagehand / browser-use / BrowserOS-style
 * accessibility snapshots, plus Browgent-specific tools (tab control, policies, human handoff).
 */

export type ToolName =
  | 'navigate'
  | 'search'
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
  | 'get_profile'
  | 'get_credentials'
  | 'list_assets'
  | 'download_assets'
  | 'fill_form'
  | 'assert_text'
  | 'assert_url'
  | 'assert_element'

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
    description:
      'Open a URL. Pass a full https URL, a host (github.com), or free text (auto web-search). After load, returns a fresh element snapshot (refs e1…). Prefer search for product/price lookups.',
    params: { url: 'string', tabId: 'string?' }
  },
  {
    name: 'search',
    description:
      'Web search (DuckDuckGo) + page snapshot + result text. Use for "cheapest X", "find Y", comparisons, or facts not on the current page. Faster than manual navigate+observe+extract.',
    params: { query: 'string', tabId: 'string?' }
  },
  {
    name: 'back',
    description: 'Go back in history (returns updated snapshot)',
    params: { tabId: 'string?' }
  },
  {
    name: 'forward',
    description: 'Go forward in history (returns updated snapshot)',
    params: { tabId: 'string?' }
  },
  {
    name: 'reload',
    description: 'Reload page (returns updated snapshot)',
    params: { tabId: 'string?' }
  },
  {
    name: 'click',
    description:
      'Click by ref from the latest snapshot (e.g. e3). Prefer refs over CSS. Returns a fresh snapshot after the click.',
    params: { ref: 'string?', selector: 'string?', tabId: 'string?' }
  },
  {
    name: 'type',
    description:
      'Type into a field by ref. clear=true wipes first. Prefer refs from the latest snapshot. Returns a fresh snapshot.',
    params: {
      text: 'string?',
      ref: 'string?',
      selector: 'string?',
      clear: 'boolean?',
      tabId: 'string?'
    }
  },
  {
    name: 'press_key',
    description:
      'Press a key (Enter, Tab, Escape, ArrowDown, Meta+l). Use Enter to submit forms/search. Returns a fresh snapshot.',
    params: { key: 'string', tabId: 'string?' }
  },
  {
    name: 'scroll',
    description:
      'Scroll page or element. direction: up|down|left|right; amount optional px. Returns a fresh snapshot.',
    params: { direction: 'string?', amount: 'number?', ref: 'string?', tabId: 'string?' }
  },
  {
    name: 'hover',
    description: 'Hover element by ref or selector',
    params: { ref: 'string?', selector: 'string?', tabId: 'string?' }
  },
  {
    name: 'select_option',
    description: 'Select dropdown option by value or label (returns snapshot)',
    params: {
      value: 'string?',
      label: 'string?',
      ref: 'string?',
      selector: 'string?',
      tabId: 'string?'
    }
  },
  {
    name: 'wait',
    description:
      'Wait ms or until ref/selector appears. Prefer short waits (300–800ms); navigate/search already wait for load.',
    params: { ms: 'number?', ref: 'string?', selector: 'string?', tabId: 'string?' }
  },
  {
    name: 'screenshot',
    description:
      'Capture viewport (use when icons/canvas lack text refs; vision models only when enabled)',
    params: { tabId: 'string?' }
  },
  {
    name: 'observe',
    description:
      'Accessibility-style snapshot: interactive elements with refs e1, e2…. Mutating tools already return a snapshot — only call observe when the page changed without a tool (or after human takeover).',
    params: { tabId: 'string?' }
  },
  {
    name: 'extract_text',
    description:
      'Extract readable page text for answering questions / prices / summaries. Pair with search results pages.',
    params: { tabId: 'string?', maxChars: 'number?' }
  },
  {
    name: 'extract_links',
    description: 'Extract links (title + href). Use after search to pick a result to click.',
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
    description:
      'Pause for CAPTCHA, 2FA, login wall, or a real choice. Do not ask for data already in the user message.',
    params: { question: 'string' },
    sensitive: true
  },
  {
    name: 'done',
    description:
      'Finish with a direct answer: what you found, prices/links, or why blocked. Always call when the goal is met.',
    params: { summary: 'string' }
  },
  {
    name: 'think',
    description: 'Brief internal plan only — do not monologue. Prefer acting with tools.',
    params: { thought: 'string' }
  },
  {
    name: 'get_profile',
    description:
      'Read the local User Hub profile (name, email, phone, address) for form fill. Never invent contact details.',
    params: {}
  },
  {
    name: 'get_credentials',
    description:
      'Look up a saved password for the current (or given) site from the local vault. Use only when logging in; returns password for local type only.',
    params: { url: 'string?' },
    sensitive: true
  },
  {
    name: 'list_assets',
    description:
      'List downloadable images, media, and document links on the current page (url, kind, name). Read-only.',
    params: { tabId: 'string?', kinds: 'string?' }
  },
  {
    name: 'download_assets',
    description:
      'Download one or more asset URLs from the page into the downloads folder. Prefer urls from list_assets. May require confirm for many files.',
    params: { urls: 'string', tabId: 'string?', subfolder: 'string?' },
    sensitive: true
  },
  {
    name: 'fill_form',
    description:
      'Fill form fields using User Hub profile and/or explicit fields map. Matches by label/placeholder/name. Never fills passwords (use get_credentials). Prefer dryRun first on sensitive pages.',
    params: {
      useProfile: 'boolean?',
      fields: 'string?',
      dryRun: 'boolean?',
      tabId: 'string?'
    }
  },
  {
    name: 'assert_text',
    description:
      'QA: pass if page text includes the given substring (case-insensitive). Returns ok false on failure without throwing.',
    params: { includes: 'string', tabId: 'string?', maxChars: 'number?' }
  },
  {
    name: 'assert_url',
    description:
      'QA: pass if current URL matches includes/equals/host constraints.',
    params: {
      includes: 'string?',
      equals: 'string?',
      host: 'string?',
      tabId: 'string?'
    }
  },
  {
    name: 'assert_element',
    description:
      'QA: pass if observe snapshot has a matching ref, or nameIncludes substring on an element name.',
    params: {
      ref: 'string?',
      nameIncludes: 'string?',
      tabId: 'string?'
    }
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
  /**
   * Base64 PNG for a vision model (screenshot only). Consumed in-session and
   * injected as an image message — never written to the trajectory or export.
   */
  image?: string
  /** MCP / takeover: human must act before mutators continue */
  needsHuman?: boolean
}

export function isToolName(v: string): v is ToolName {
  return TOOL_DEFS.some((t) => t.name === v)
}

/** Tools safe to run concurrently in one LLM turn (no DOM mutations). */
export const PARALLEL_SAFE_TOOLS = new Set<ToolName>([
  'observe',
  'extract_text',
  'extract_links',
  'get_url',
  'list_tabs',
  'screenshot',
  'think',
  'list_assets',
  'assert_text',
  'assert_url',
  'assert_element',
  'get_profile'
])
