/** Browser-native safety policy — differentiator vs pure cloud agents */

export interface AgentPolicy {
  /** When set, agent may only navigate these host suffixes */
  allowHosts: string[]
  /** Always blocked hosts */
  blockHosts: string[]
  /** Max tool steps per task */
  maxSteps: number
  /** Require human confirm before navigate to new host */
  confirmCrossHost: boolean
  /** Require confirm before click on submit/payment-ish controls */
  confirmSensitiveClicks: boolean
  /** Block form submit keywords */
  sensitiveClickPatterns: string[]
  /** Auto-pause when agent calls ask_human */
  pauseOnAskHuman: boolean
  /** Research mode: only observe/extract tools allowed */
  researchOnly: boolean
}

export const DEFAULT_POLICY: AgentPolicy = {
  allowHosts: [],
  blockHosts: [],
  maxSteps: 40,
  confirmCrossHost: false,
  confirmSensitiveClicks: true,
  sensitiveClickPatterns: [
    'submit',
    'pay',
    'purchase',
    'buy now',
    'checkout',
    'confirm order',
    'delete',
    'transfer',
    'wire'
  ],
  pauseOnAskHuman: true,
  researchOnly: false
}

export type AgentMode = 'act' | 'research' | 'watch'

/** Single source of truth for research-mode tool allowlist (LLM schema + executor). */
export const RESEARCH_TOOLS = new Set([
  'observe',
  'extract_text',
  'extract_links',
  'get_url',
  'screenshot',
  'list_tabs',
  'switch_tab',
  'scroll',
  'wait',
  'think',
  'done',
  'ask_human',
  'navigate',
  'back',
  'forward',
  'reload',
  'new_tab'
])

/** Watch mode: observation only — human drives the browser. */
export const WATCH_TOOLS = new Set([
  'observe',
  'extract_text',
  'extract_links',
  'get_url',
  'screenshot',
  'list_tabs',
  'think',
  'done',
  'ask_human'
])

/** Schemes the agent may open via navigate / new_tab (blocks file:/data: exfil). */
export function isAgentNavigableUrl(url: string): boolean {
  if (url === 'about:blank') return true
  try {
    const u = new URL(url)
    if (u.protocol === 'http:' || u.protocol === 'https:') return true
    if (u.protocol === 'about:' && u.pathname === 'blank') return true
    return false
  } catch {
    return false
  }
}

/** Central gate for any code path that opens a top-level navigation.
 *  http / https / exact about:blank only; everything else (file:, data:, javascript:, …) is rejected. */
export function isHttpOrHttpsOrAboutBlank(url: string): boolean {
  if (typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed) return false
  if (trimmed === 'about:blank') return true
  try {
    const u = new URL(trimmed)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Detect explicit forbidden schemes so we can reject (and never search-for) the raw input.
 *  `about:blank` is the only `about:` value allowed. */
export function looksLikeForbiddenScheme(input: string): boolean {
  if (typeof input !== 'string') return false
  const s = input.trim().toLowerCase()
  if (!s) return false
  if (s === 'about:blank') return false
  return /^(?:file|data|javascript|vbscript|jar|chrome|devtools|view-source|blob|ftp|ws|wss|about):/i.test(s)
}

export function hostFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host || null
  } catch {
    return null
  }
}

/**
 * Hosts agents should not open without an explicit allowlist entry —
 * loopback, link-local, private IPv4, cloud metadata endpoints.
 * Set BROWGENT_ALLOW_PRIVATE_HOSTS=1 to disable this gate (power users).
 */
export function isPrivateOrMetadataHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (!h) return true
  if (h === 'localhost' || h === '0.0.0.0' || h === '::1' || h === '0:0:0:0:0:0:0:1') {
    return true
  }
  if (h === 'metadata.google.internal' || h.endsWith('.metadata.google.internal')) return true
  if (h === 'metadata' || h === 'instance-data') return true

  // IPv4
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return true
    if (a === 127 || a === 0 || a === 10) return true
    if (a === 169 && b === 254) return true // link-local + AWS metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    return false
  }

  // IPv6 unique-local / link-local (simplified)
  if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true

  return false
}

export function isHostAllowed(host: string, policy: AgentPolicy): boolean {
  if (!host) return false
  if (policy.blockHosts.some((b) => host === b || host.endsWith(`.${b}`))) return false
  if (policy.allowHosts.length === 0) {
    // Default: block private/metadata unless explicitly allowed later via allowHosts
    if (
      process.env.BROWGENT_ALLOW_PRIVATE_HOSTS !== '1' &&
      isPrivateOrMetadataHost(host)
    ) {
      return false
    }
    return true
  }
  return policy.allowHosts.some((a) => {
    const entry = a.toLowerCase().trim()
    if (!entry || entry.length < 2) return false
    return host === entry || host.endsWith(`.${entry}`)
  })
}

export function looksSensitiveLabel(label: string, policy: AgentPolicy): boolean {
  const l = label.toLowerCase()
  return policy.sensitiveClickPatterns.some((p) => l.includes(p.toLowerCase()))
}
