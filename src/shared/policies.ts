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
  'search',
  'back',
  'forward',
  'reload',
  'new_tab',
  'get_profile',
  'list_assets',
  'assert_text',
  'assert_url',
  'assert_element'
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
  'ask_human',
  'get_profile',
  'list_assets',
  'assert_text',
  'assert_url',
  'assert_element'
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
  // Strip ASCII tab/CR/LF first: WHATWG URL parsing removes these anywhere, so
  // `java\tscript:alert(1)` parses as javascript: and must be caught here too. [scheme-evasion fix]
  const s = input.replace(/[\t\r\n]/g, '').trim().toLowerCase()
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
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return isBlockedIPv4(h)

  // IPv4-mapped IPv6 (e.g. ::ffff:169.254.169.254 / the ::ffff:0:… variant, plus Node's
  // hex-normalized ::ffff:a9fe:a9fe serialization) — unwrap to the embedded IPv4 and apply
  // the same range checks so mapped loopback/metadata can't slip past the gate. [SSRF fix]
  const mappedV4 = unwrapMappedIPv4(h)
  if (mappedV4) return isBlockedIPv4(mappedV4)

  // IPv6 unique-local / link-local (simplified) — only for real IPv6 literals (must contain
  // a colon), so plain DNS names like fdic.gov / fcc.gov / fda.gov are not blocked. [false-positive fix]
  if (h.includes(':') && (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80'))) {
    return true
  }

  return false
}

/** IPv4 dotted-quad → true when it lands in a blocked range (loopback 127/8, link-local +
 *  metadata 169.254/16, RFC1918 10/8, 172.16/12, 192.168/16, CGNAT 100.64/10, 0.0.0.0).
 *  Shared by the plain-IPv4 path and the IPv4-mapped-IPv6 unwrap path. */
function isBlockedIPv4(dotted: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(dotted)
  if (!m) return false
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

/** Extract the embedded IPv4 from an IPv4-mapped IPv6 host, else null. Handles the textual
 *  form (::ffff:1.2.3.4), the ::ffff:0:… variant, and Node's hex-compressed serialization
 *  (::ffff:a9fe:a9fe). `h` is expected already bracket-stripped + lowercased. */
function unwrapMappedIPv4(h: string): string | null {
  const m = /^::ffff:(?:0:)?(.+)$/i.exec(h)
  if (!m) return null
  const tail = m[1]
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(tail)) return tail
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(tail)
  if (hex) {
    const hi = parseInt(hex[1], 16)
    const lo = parseInt(hex[2], 16)
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`
  }
  return null
}

/** Canonicalize a host for allow/block comparison: trim, lowercase, strip trailing dot(s).
 *  `new URL().hostname` preserves a trailing dot (`google.com.`) which would otherwise slip
 *  past exact/suffix matching against a `google.com` list entry (and a mixed-case entry like
 *  `Google.com` would likewise miss). Apply to BOTH the host and every list entry. [block-bypass fix] */
export function canonicalHost(h: string): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.+$/, '')
}

export function isHostAllowed(host: string, policy: AgentPolicy): boolean {
  const h = canonicalHost(host)
  if (!h) return false
  // Canonicalize the host AND every block entry so trailing-dot / mixed-case can't bypass.
  if (
    policy.blockHosts.some((b) => {
      const entry = canonicalHost(b)
      return entry !== '' && (h === entry || h.endsWith(`.${entry}`))
    })
  ) {
    return false
  }
  if (policy.allowHosts.length === 0) {
    // Default: block private/metadata unless explicitly allowed later via allowHosts
    if (
      process.env.BROWGENT_ALLOW_PRIVATE_HOSTS !== '1' &&
      isPrivateOrMetadataHost(h)
    ) {
      return false
    }
    return true
  }
  return policy.allowHosts.some((a) => {
    const entry = canonicalHost(a)
    if (!entry || entry.length < 2) return false
    return h === entry || h.endsWith(`.${entry}`)
  })
}

export function looksSensitiveLabel(label: string, policy: AgentPolicy): boolean {
  const l = label.toLowerCase()
  return policy.sensitiveClickPatterns.some((p) => l.includes(p.toLowerCase()))
}
