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
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'about:'
  } catch {
    return false
  }
}

export function hostFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host || null
  } catch {
    return null
  }
}

export function isHostAllowed(host: string, policy: AgentPolicy): boolean {
  if (!host) return false
  if (policy.blockHosts.some((b) => host === b || host.endsWith(`.${b}`))) return false
  if (policy.allowHosts.length === 0) return true
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
