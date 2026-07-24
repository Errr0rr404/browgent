/**
 * Site aliases + intent parsing so "go to fb and sign up"
 * becomes navigate(facebook.com) + continue task "sign up"
 * instead of a Google search for "fb and sign up".
 */

import { looksLikeForbiddenScheme } from './policies'

/** Common short names / brand tokens → host */
export const SITE_ALIASES: Record<string, string> = {
  // Social
  fb: 'www.facebook.com',
  facebook: 'www.facebook.com',
  meta: 'www.facebook.com',
  ig: 'www.instagram.com',
  instagram: 'www.instagram.com',
  insta: 'www.instagram.com',
  x: 'x.com',
  twitter: 'x.com',
  tw: 'x.com',
  linkedin: 'www.linkedin.com',
  li: 'www.linkedin.com',
  reddit: 'www.reddit.com',
  tiktok: 'www.tiktok.com',
  snap: 'www.snapchat.com',
  snapchat: 'www.snapchat.com',
  pinterest: 'www.pinterest.com',
  threads: 'www.threads.net',
  // Video / media
  yt: 'www.youtube.com',
  youtube: 'www.youtube.com',
  netflix: 'www.netflix.com',
  spotify: 'open.spotify.com',
  twitch: 'www.twitch.tv',
  // Dev
  gh: 'github.com',
  github: 'github.com',
  gitlab: 'gitlab.com',
  stackoverflow: 'stackoverflow.com',
  so: 'stackoverflow.com',
  npm: 'www.npmjs.com',
  mdn: 'developer.mozilla.org',
  // Search / google
  google: 'www.google.com',
  gmail: 'mail.google.com',
  drive: 'drive.google.com',
  maps: 'maps.google.com',
  // Shopping / commerce
  amazon: 'www.amazon.com',
  ebay: 'www.ebay.com',
  etsy: 'www.etsy.com',
  // Productivity
  notion: 'www.notion.so',
  slack: 'slack.com',
  discord: 'discord.com',
  dropbox: 'www.dropbox.com',
  // News / wiki
  wikipedia: 'www.wikipedia.org',
  wiki: 'www.wikipedia.org',
  bbc: 'www.bbc.com',
  cnn: 'www.cnn.com',
  // Other
  wikipediaen: 'en.wikipedia.org',
  chatgpt: 'chatgpt.com',
  openai: 'chatgpt.com',
  grok: 'grok.com',
  bing: 'www.bing.com',
  duckduckgo: 'duckduckgo.com',
  ddg: 'duckduckgo.com'
}

const NAV_PREFIX =
  /^(?:please\s+)?(?:can you\s+)?(?:could you\s+)?(?:go\s+to|open|navigate\s+to|visit|browse(?:\s+to)?|launch|load)\s+/i

const AND_THEN = /\s+(?:and|&|then|,)\s+/i

/** Words that signal a multi-step task after navigation */
const TASK_VERBS =
  /\b(sign\s*up|signup|register|create\s+(?:an?\s+)?account|log\s*in|login|sign\s*in|search|find|buy|order|subscribe|post|tweet|upload|download|fill|apply|book|checkout|join|follow|like|share|message|compose|write|submit|pay|settings|profile)\b/i

export interface BrowseIntent {
  /** Resolved https URL to open, if any */
  navigateUrl: string | null
  /** Remaining natural-language task after the navigate phrase */
  task: string
  /** True when user only wants to open a page */
  navigateOnly: boolean
  /** Raw site token that was recognized */
  siteToken: string | null
}

/**
 * Parse user text into a browse intent.
 * Examples:
 *  - "go to fb and sign up" → facebook.com + "sign up"
 *  - "sign up for github using a@b.com/Pass" → github.com + full task
 *  - "open github.com" → github.com + navigateOnly
 *  - "search electron webcontentsview" → google search + navigateOnly-ish
 *  - "summarize this page" → no navigate, full task
 */
export function parseBrowseIntent(goal: string): BrowseIntent {
  const trimmed = goal.trim()
  if (!trimmed) {
    return { navigateUrl: null, task: '', navigateOnly: true, siteToken: null }
  }

  // Explicit full URL first
  if (/^https?:\/\//i.test(trimmed)) {
    const space = trimmed.search(/\s/)
    if (space > 0) {
      return {
        navigateUrl: trimmed.slice(0, space),
        task: trimmed.slice(space).trim(),
        navigateOnly: !trimmed.slice(space).trim(),
        siteToken: null
      }
    }
    return { navigateUrl: trimmed, task: '', navigateOnly: true, siteToken: null }
  }

  // Explicit "search/find/look up X" prefix (not "go to …")
  if (
    /^(?:please\s+)?(?:can you\s+)?(?:could you\s+)?(?:search|find|look\s*up)\s+(?:for\s+)?/i.test(
      trimmed
    ) &&
    !NAV_PREFIX.test(trimmed)
  ) {
    const searchQ = extractBrowserSearchQuery(trimmed)
    if (searchQ) {
      return {
        navigateUrl: buildAgentSearchUrl(searchQ),
        task: '',
        navigateOnly: true,
        siteToken: 'search'
      }
    }
  }

  // "sign up for github …" / "log in to facebook …" / "register on github using …"
  // Site comes AFTER the task verb — very common natural phrasing.
  const actionOnSite = parseActionOnSite(trimmed)
  if (actionOnSite) return actionOnSite

  let rest = trimmed
  let hadNavPrefix = false
  if (NAV_PREFIX.test(rest)) {
    rest = rest.replace(NAV_PREFIX, '')
    hadNavPrefix = true
  }

  // Split "fb and sign up" / "facebook.com then create account"
  const parts = rest.split(AND_THEN)
  const head = (parts[0] ?? '').trim()
  const tail = parts.slice(1).join(' and ').trim()

  const resolved = resolveSiteToken(head)
  if (resolved) {
    const task = tail || (TASK_VERBS.test(head) ? extractTaskFromHead(head, resolved.token) : '')
    // If head was pure site and no tail but original had more words after alias
    const navigateOnly = !task && !TASK_VERBS.test(trimmed)
    return {
      navigateUrl: resolved.url,
      task: task || (navigateOnly ? '' : tail),
      navigateOnly: !task,
      siteToken: resolved.token
    }
  }

  // "go to something" where something isn't a known site — treat whole rest as URL/search
  if (hadNavPrefix) {
    // Prefer first token as site if looks domain-like
    const firstWord = head.split(/\s+/)[0] ?? head
    const asUrl = resolveNavigableTarget(firstWord)
    if (asUrl && firstWord !== head) {
      const leftover = head.slice(firstWord.length).trim()
      const task = [leftover, tail].filter(Boolean).join(' ').trim()
      return {
        navigateUrl: asUrl,
        task,
        navigateOnly: !task,
        siteToken: firstWord
      }
    }
    const target = resolveNavigableTarget(head) || resolveNavigableTarget(rest)
    if (target && !tail) {
      return {
        navigateUrl: target,
        task: '',
        navigateOnly: true,
        siteToken: head
      }
    }
    if (target && tail) {
      return {
        navigateUrl: target,
        task: tail,
        navigateOnly: false,
        siteToken: head
      }
    }
  }

  // Bare site alias alone: "facebook", "gh"
  const bare = resolveSiteToken(trimmed)
  if (bare && !TASK_VERBS.test(trimmed)) {
    return {
      navigateUrl: bare.url,
      task: '',
      navigateOnly: true,
      siteToken: bare.token
    }
  }

  // Site token appears anywhere + auth/task verb (e.g. "please sign up github now")
  const embedded = findSiteTokenInText(trimmed)
  if (embedded && TASK_VERBS.test(trimmed)) {
    return {
      navigateUrl: embedded.url,
      task: trimmed,
      navigateOnly: false,
      siteToken: embedded.token
    }
  }

  // Open-ended web research: "whats the cheapest iphone find that on browser"
  const openSearch = extractBrowserSearchQuery(trimmed)
  if (openSearch) {
    return {
      navigateUrl: buildAgentSearchUrl(openSearch),
      task: '',
      navigateOnly: true,
      siteToken: 'search'
    }
  }

  return { navigateUrl: null, task: trimmed, navigateOnly: false, siteToken: null }
}

/**
 * "sign up for github using email/pass", "log into facebook", "create account on gh"
 */
function parseActionOnSite(trimmed: string): BrowseIntent | null {
  const re =
    /^(?:please\s+)?(?:can you\s+)?(?:could you\s+)?(?:help me\s+)?(sign\s*up|signup|register|create\s+(?:an?\s+)?account|log\s*in|login|sign\s*in|signin)\s+(?:for|on|to|at|into|onto)\s+([a-z0-9][\w.-]*)\b([\s\S]*)$/i
  const m = trimmed.match(re)
  if (!m) return null
  const action = (m[1] ?? '').trim()
  const siteRaw = (m[2] ?? '').trim()
  const rest = (m[3] ?? '').trim()
  const resolved = resolveSiteToken(siteRaw)
  if (!resolved) return null
  const task = [action, rest].filter(Boolean).join(' ').trim()
  return {
    navigateUrl: resolved.url,
    task: task || action,
    navigateOnly: false,
    siteToken: resolved.token
  }
}

/** First known site alias / domain token found as a whole word in free text */
function findSiteTokenInText(
  text: string
): { token: string; host: string; url: string } | null {
  const words = text.toLowerCase().split(/[^a-z0-9.-]+/).filter(Boolean)
  for (const w of words) {
    // Skip pure TLD-ish noise; require alias or domain-like
    if (w.length < 2) continue
    if (SITE_ALIASES[w]) {
      const host = SITE_ALIASES[w]
      return { token: w, host, url: `https://${host}/` }
    }
  }
  // Domain-like token: github.com
  for (const w of words) {
    if (/^[\w-]+\.[a-z]{2,}$/i.test(w)) {
      const hit = resolveSiteToken(w)
      if (hit) return hit
    }
  }
  return null
}

/** Pull email / password / username the user already supplied in the goal */
export interface GoalCredentials {
  email?: string
  password?: string
  username?: string
}

export function extractCredentials(goal: string): GoalCredentials {
  const text = goal.trim()
  if (!text) return {}

  const out: GoalCredentials = {}

  // email/password or email:password (common slash form)
  const slash = text.match(
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s*[\/|]\s*(\S+)/
  )
  if (slash) {
    out.email = slash[1]
    out.password = stripTrailingPunct(slash[2] ?? '')
    return out
  }

  const emailMatch = text.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/)
  if (emailMatch) out.email = emailMatch[1]

  const passLabeled = text.match(
    /(?:password|passwd|pwd|pass)\s*[:=]\s*["']?([^\s"']+)["']?/i
  )
  if (passLabeled) {
    out.password = stripTrailingPunct(passLabeled[1] ?? '')
  } else if (out.email) {
    // "using demo@x.com Demo123" or "with demo@x.com and Demo123"
    const afterEmail = text.slice(text.indexOf(out.email) + out.email.length)
    const nextTok = afterEmail.match(
      /^\s*(?:\/|,|and|&|with|password|pass|pwd|:)?\s*["']?([^\s"'/,]{4,})["']?/i
    )
    const cand = nextTok?.[1]
    if (
      cand &&
      !/^(using|with|and|for|on|to|at|please|password|pass|pwd)$/i.test(cand) &&
      !/@/.test(cand)
    ) {
      out.password = stripTrailingPunct(cand)
    }
  }

  const userLabeled = text.match(
    /(?:username|user\s*name|login)\s*[:=]\s*["']?([^\s"']+)["']?/i
  )
  if (userLabeled && !out.email) out.username = stripTrailingPunct(userLabeled[1] ?? '')

  return out
}

function stripTrailingPunct(s: string): string {
  return s.replace(/[.,;:!?)]+$/g, '')
}

export interface SecretRedactionMap {
  placeholders: string[]
  rawByPlaceholder: Record<string, string>
}

/**
 * Replace extracted credentials / API tokens in user-supplied text with local
 * opaque placeholders. The raw values stay in a local map and are only
 * resolved immediately before a tool (e.g. type) executes — never sent to
 * the remote LLM.
 */
export function redactSecrets(text: string): { redacted: string; map: SecretRedactionMap } {
  const empty: SecretRedactionMap = { placeholders: [], rawByPlaceholder: {} }
  if (!text) return { redacted: '', map: empty }

  const placeholders: string[] = []
  const rawByPlaceholder: Record<string, string> = {}
  let counter = 0
  const sub = (raw: string): string => {
    const r = raw.replace(/[.,;:!?)]+$/g, '')
    const ph = `[BROWGENT_SECRET_${++counter}]`
    placeholders.push(ph)
    rawByPlaceholder[ph] = r
    return ph
  }

  let out = text

  out = out.replace(
    /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b\s*[\/|]\s*(\S+)/g,
    (_m, email, rest) => `${sub(String(email))} / ${sub(String(rest ?? ''))}`
  )

  out = out.replace(
    /\b(password|passwd|pwd|pass|username|user\s*name|login|otp|code|token|secret|api[_-]?key)\s*[:=]\s*["']?([^\s"',]{2,200})["']?/gi,
    (_m, k, v) => `${k} ${sub(String(v ?? ''))}`
  )

  const emailRe = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g
  out = out.replace(emailRe, (m) => {
    if (m.includes('[BROWGENT_SECRET_')) return m
    return sub(m)
  })

  return { redacted: out, map: { placeholders, rawByPlaceholder } }
}

/** Inverse of redactSecrets — restore raw values for local tool execution. */
export function resolveSecretPlaceholders(text: string, map: SecretRedactionMap): string {
  if (!text || !map.placeholders.length) return text
  let out = text
  for (const ph of map.placeholders) {
    const raw = map.rawByPlaceholder[ph]
    if (raw === undefined) continue
    out = out.split(ph).join(raw)
  }
  return out
}

const SENSITIVE_QUERY_PARAMS = new Set([
  'api_key', 'apikey', 'token', 'auth', 'password', 'passwd', 'pwd', 'pass',
  'secret', 'otp', 'code', 'sid', 'sessionid', 'session', 'csrf', 'phpsessid',
  'sig', 'signature', 'access_token', 'refresh_token', 'bearer', 'key'
])

export const BLOCKED_URL_SENTINEL = '<blocked-url>'

/** URL safe to send to a remote LLM — strips common credential-leaking query params.
 *  Non-http(s) URLs collapse to a sentinel instead of an empty string so downstream
 *  readers can still see that a URL existed but was redacted. */
export function safeUrlForLlm(url: string, maxLen = 200): string {
  if (typeof url !== 'string' || !url) return ''
  if (url === 'about:blank') return 'about:blank'
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return BLOCKED_URL_SENTINEL
    let changed = false
    for (const k of Array.from(u.searchParams.keys())) {
      if (SENSITIVE_QUERY_PARAMS.has(k.toLowerCase())) {
        u.searchParams.set(k, '[REDACTED]')
        changed = true
      }
    }
    const s = changed ? u.toString() : url
    return s.length > maxLen ? s.slice(0, maxLen) + '…' : s
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen) + '…' : url
  }
}

function extractTaskFromHead(head: string, token: string): string {
  // "fb signup" without "and"
  const re = new RegExp(`^${escapeRe(token)}\\s+`, 'i')
  return head.replace(re, '').trim()
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function resolveSiteToken(
  input: string
): { token: string; host: string; url: string } | null {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
  if (!cleaned) return null

  // Exact alias
  const exact = SITE_ALIASES[cleaned]
  if (exact) {
    return { token: cleaned, host: exact, url: `https://${exact}/` }
  }

  // First word alias: "fb page" 
  const first = cleaned.split(/[\s/?#]+/)[0] ?? ''
  if (first && SITE_ALIASES[first]) {
    const host = SITE_ALIASES[first]
    return { token: first, host, url: `https://${host}/` }
  }

  // Domain-like without scheme (path allowed: github.com/pulls)
  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(cleaned)) {
    const host = cleaned.split(/[/:?#]/)[0] ?? cleaned
    // cleaned is lowercased; strip any accidental scheme leftovers
    const path = cleaned.replace(/^https?:\/\//, '')
    return { token: host, host, url: `https://${path}` }
  }

  return null
}

/**
 * Build a web-search URL for the **agent** `search` tool.
 *
 * DuckDuckGo by design — automated multi-step agent runs trip Google reCAPTCHA
 * far more often than a human using the omnibox. User-facing search (new tab /
 * address bar) defaults to Google via chromePrefs.searchEngine.
 *
 * There is no reliable way to guarantee Google never shows captcha after a
 * “server restart” — risk scoring is IP + cookie + behavior based.
 */
export function buildAgentSearchUrl(query: string): string {
  const q = query.trim()
  if (!q) return 'https://duckduckgo.com/'
  return `https://duckduckgo.com/?q=${encodeURIComponent(q)}`
}

/**
 * Detect natural-language "find this on the web/browser" goals and extract a search query.
 * Returns null when the goal is not a web-search intent (e.g. "summarize this page").
 *
 * Examples that match:
 *  - "search for cheapest iphone"
 *  - "find wireless earbuds under $50"
 *  - "whats the cheapest iphone find that on browser"
 *  - "look up electron webcontentsview"
 *  - "best price for macbook air"
 */
export function extractBrowserSearchQuery(goal: string): string | null {
  const trimmed = goal.trim()
  if (!trimmed) return null

  // Pure page-local research — do not leave the tab
  if (
    /^(summar(y|ize)|describe|extract|read)\b/i.test(trimmed) ||
    /\b(this page|current page|the page|on this page)\b/i.test(trimmed)
  ) {
    return null
  }

  // Explicit search/find/lookup prefix
  const explicit = trimmed.match(
    /^(?:please\s+)?(?:can you\s+)?(?:could you\s+)?(?:search|find|look\s*up)\s+(?:for\s+)?(.+)/i
  )
  if (explicit?.[1]) {
    const rest = explicit[1].trim()
    // "find me on facebook" / "search github for issues" — prefer site when clear
    const onSite = rest.match(/^(.+?)\s+on\s+([a-z0-9][\w.-]*)$/i)
    if (onSite?.[2] && SITE_ALIASES[onSite[2].toLowerCase()]) {
      // Not a pure web search — let parseBrowseIntent site path handle it
      return null
    }
    return cleanSearchQuery(rest)
  }

  // "… find that on browser" / "… on the browser" / "using the browser"
  if (/\b(find\s+that|on|in|using|via)\s+(the\s+)?browser\b/i.test(trimmed)) {
    return cleanSearchQuery(trimmed)
  }

  // Price / product discovery (avoid bare "buy" alone — too many false positives)
  if (
    /\b(cheapest|best\s+price|lowest\s+price|most\s+affordable|how\s+much\s+(?:is|are|does)|price\s+of|shop\s+for)\b/i.test(
      trimmed
    )
  ) {
    return cleanSearchQuery(trimmed)
  }

  // "what's the X" / "what is the best X" when not about the current page
  if (
    /\bwhat(?:'s|s|\s+is)\s+(?:the\s+)?(?:cheapest|best|lowest|most|latest|newest)\b/i.test(
      trimmed
    )
  ) {
    return cleanSearchQuery(trimmed)
  }

  return null
}

function cleanSearchQuery(raw: string): string | null {
  const q = raw
    .replace(/\bfind\s+that\b/gi, ' ')
    .replace(/\b(on|in|using|via)\s+(the\s+)?browser\b/gi, ' ')
    .replace(
      /\b(please|for me|can you|could you|would you|i want|i need|help me|go ahead and)\b/gi,
      ' '
    )
    .replace(/\bwhat(?:'s|s)?\b/gi, ' ')
    .replace(/\bwhat\s+is\b/gi, ' ')
    .replace(/\b(search|find|look\s*up|shop)\s+(for\s+)?/gi, ' ')
    .replace(/\b(price\s+of|how\s+much\s+(?:is|are|does))\b/gi, ' ')
    .replace(/^\s*me\s+/i, ' ')
    .replace(/^\s*the\s+/i, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
  // Need at least one real content token
  if (!q || q.length < 2) return null
  if (/^(the|a|an|to|for|me)$/i.test(q)) return null
  return q
}

/** Turn free text into a navigable URL (alias, domain, intent, or web search). */
export function resolveNavigableTarget(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return 'about:blank'

  // Safe by construction: only http(s) and the exact about:blank literal may pass through
  // verbatim. file:/data:/javascript:/blob:/non-blank about: (and any other forbidden scheme,
  // incl. "open file:///…" which re-enters here) are routed to web search, never opened. [scheme-safety fix]
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }
  if (trimmed === 'about:blank') {
    return 'about:blank'
  }
  if (looksLikeForbiddenScheme(trimmed)) {
    return buildAgentSearchUrl(trimmed)
  }

  // Intent path: "go to fb and sign up", "search electron", bare "yt"
  // parseBrowseIntent only calls resolveNavigableTarget on short heads (no re-entry loops)
  if (
    NAV_PREFIX.test(trimmed) ||
    /^(search|find)\s+/i.test(trimmed) ||
    /\s+(?:and|&|then)\s+/i.test(trimmed) ||
    !/\s/.test(trimmed)
  ) {
    const intent = parseBrowseIntent(trimmed)
    if (intent.navigateUrl) return intent.navigateUrl
  }

  const searchQ = extractBrowserSearchQuery(trimmed)
  if (searchQ) return buildAgentSearchUrl(searchQ)

  const alias = resolveSiteToken(trimmed)
  if (alias) return alias.url

  if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/.*)?$/i.test(trimmed)) {
    return `http://${trimmed}`
  }

  if (/^[\w.-]+\.[a-z]{2,}([/:].*)?$/i.test(trimmed)) {
    return `https://${trimmed}`
  }

  // Multi-word that starts with alias: "fb login"
  const first = trimmed.split(/\s+/)[0]?.toLowerCase() ?? ''
  if (first && SITE_ALIASES[first] && trimmed.includes(' ')) {
    return `https://${SITE_ALIASES[first]}/`
  }

  return buildAgentSearchUrl(trimmed)
}
