/**
 * Site aliases + intent parsing so "go to fb and sign up"
 * becomes navigate(facebook.com) + continue task "sign up"
 * instead of a Google search for "fb and sign up".
 */

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

  // "search X" / "find X" — google search, no multi-step browser act unless more follows
  if (/^(search|find)\s+(for\s+)?/i.test(trimmed) && !NAV_PREFIX.test(trimmed)) {
    const q = trimmed.replace(/^(search|find)\s+(for\s+)?/i, '').trim()
    return {
      navigateUrl: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
      task: '',
      navigateOnly: true,
      siteToken: 'google'
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

/** Turn free text into a navigable URL (alias, domain, intent, or Google search). */
export function resolveNavigableTarget(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return 'about:blank'

  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('about:') ||
    trimmed.startsWith('data:')
  ) {
    return trimmed
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

  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
}
