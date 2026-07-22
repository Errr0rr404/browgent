/**
 * Heuristic planner — used when XAI_API_KEY is missing, or as Grok fallback.
 * Multi-step: navigate → observe → act on the remaining task (signup, click, type…).
 * Production path: Grok tool-calling in session.ts (same ToolCall schema).
 */
import type { AgentMode } from '../../shared/policies'
import type { ObserveSnapshot } from '../../shared/types'
import type { ToolCall } from '../../shared/tools'
import {
  LOGIN_NAME_RE,
  SIGNUP_NAME_RE,
  parseBrowseIntent,
  resolveNavigableTarget,
  taskWantsLogin,
  taskWantsSignup
} from '../../shared/sites'
import { makeToolCall } from './executor'

export interface PlanContext {
  goal: string
  mode: AgentMode
  step: number
  lastObservation: ObserveSnapshot | null
  lastToolResults: string[]
  pageUrl?: string
  pageTitle?: string
}

export function planNextActions(ctx: PlanContext): ToolCall[] {
  const goal = ctx.goal.trim()
  const lower = goal.toLowerCase()
  const intent = parseBrowseIntent(goal)

  // ── Step 0: orient / navigate ──────────────────────────────
  if (ctx.step === 0) {
    if (intent.navigateUrl) {
      const target = intent.navigateUrl
      if (intent.navigateOnly || !intent.task) {
        return [
          makeToolCall('think', { thought: `Open ${target}` }),
          makeToolCall('navigate', { url: target }),
          makeToolCall('wait', { ms: 900 }),
          makeToolCall('observe', {}),
          makeToolCall('done', {
            summary: `Opened ${prettyHost(target)}. You can keep chatting or take over the tab anytime.`
          })
        ]
      }

      // Multi-step goal: open site, then continue working the task — do NOT done yet
      return [
        makeToolCall('think', {
          thought: `Navigate to ${target}, then work on: ${intent.task}`
        }),
        makeToolCall('navigate', { url: target }),
        makeToolCall('wait', { ms: 1100 }),
        makeToolCall('observe', {})
      ]
    }

    if (lower.startsWith('search ') || lower.includes('search for ') || /^find\s+/i.test(goal)) {
      const q = goal
        .replace(/^.*search\s+(for\s+)?/i, '')
        .replace(/^find\s+/i, '')
        .trim()
      const url = resolveNavigableTarget(q.includes('.') && !q.includes(' ') ? q : q)
      // Prefer google search for free-form queries
      const searchUrl =
        url.includes('google.com/search') || !/^https?:\/\//.test(q)
          ? `https://www.google.com/search?q=${encodeURIComponent(q)}`
          : url
      return [
        makeToolCall('navigate', { url: searchUrl }),
        makeToolCall('wait', { ms: 900 }),
        makeToolCall('observe', {}),
        makeToolCall('extract_text', { maxChars: 3000 }),
        makeToolCall('done', {
          summary: `Searched for “${q}”. Say “click the first result” or “click eN” to open a hit.`
        })
      ]
    }

    if (/list tabs|what tabs|open tabs/i.test(lower)) {
      return [makeToolCall('list_tabs', {}), makeToolCall('done', { summary: 'Listed open tabs.' })]
    }

    if (/scroll (down|up)|page down|page up/i.test(lower)) {
      const direction = /up|page up/i.test(lower) ? 'up' : 'down'
      return [
        makeToolCall('scroll', { direction, amount: 600 }),
        makeToolCall('observe', {}),
        makeToolCall('done', { summary: `Scrolled ${direction}.` })
      ]
    }

    if (/go back|previous page/i.test(lower)) {
      return [
        makeToolCall('back', {}),
        makeToolCall('wait', { ms: 500 }),
        makeToolCall('observe', {}),
        makeToolCall('done', { summary: 'Went back.' })
      ]
    }

    if (/reload|refresh/i.test(lower)) {
      return [
        makeToolCall('reload', {}),
        makeToolCall('observe', {}),
        makeToolCall('done', { summary: 'Reloaded page.' })
      ]
    }

    if (
      ctx.mode === 'research' ||
      /summar(y|ize)|what('s| is) on|extract|read this|describe/i.test(lower)
    ) {
      return [
        makeToolCall('observe', {}),
        makeToolCall('extract_text', { maxChars: 5000 }),
        makeToolCall('extract_links', { limit: 15 }),
        makeToolCall('done', { summary: buildResearchSummary(ctx) })
      ]
    }

    if (/click |press |open link/i.test(lower) && ctx.lastObservation) {
      const clickPlan = planClick(ctx, goal)
      if (clickPlan) return clickPlan
    }

    if (/type |fill |enter /i.test(lower) && ctx.lastObservation) {
      const typePlan = planType(ctx, goal)
      if (typePlan) return typePlan
    }

    // Default on current page: observe first so follow-up steps can act
    return [
      makeToolCall('think', { thought: `Interpret and act on: ${goal.slice(0, 160)}` }),
      makeToolCall('observe', {})
    ]
  }

  // ── Follow-up steps: act on the page toward the goal ───────
  const task = intent.task || goal
  const snap = ctx.lastObservation

  if (!snap) {
    return [makeToolCall('observe', {})]
  }

  // Signup / register flow
  if (taskWantsSignup(task) || taskWantsSignup(goal)) {
    const signupPlan = planAuthFlow(ctx, 'signup')
    if (signupPlan) return signupPlan
  }

  // Login flow
  if (taskWantsLogin(task) || taskWantsLogin(goal)) {
    const loginPlan = planAuthFlow(ctx, 'login')
    if (loginPlan) return loginPlan
  }

  // Explicit click / type language
  if (/click |press |open link|first result|second result|third result/i.test(lower)) {
    const clickPlan = planClick(ctx, goal)
    if (clickPlan) return clickPlan
  }

  if (/type |fill |enter /i.test(lower)) {
    const typePlan = planType(ctx, goal)
    if (typePlan) return typePlan
  }

  if (/scroll/i.test(lower)) {
    const direction = /up/i.test(lower) ? 'up' : 'down'
    return [
      makeToolCall('scroll', { direction, amount: 600 }),
      makeToolCall('observe', {}),
      makeToolCall('done', { summary: `Scrolled ${direction}.` })
    ]
  }

  // After initial observe on a free-form goal: try to click a matching control
  if (ctx.step === 1) {
    const ref = findRefByGoalKeywords(snap, task)
    if (ref) {
      return [
        makeToolCall('click', { ref }),
        makeToolCall('wait', { ms: 1000 }),
        makeToolCall('observe', {})
      ]
    }

    // Research-ish free form after observe
    if (/summar|what|explain|describe|extract|read/i.test(lower)) {
      return [
        makeToolCall('extract_text', { maxChars: 5000 }),
        makeToolCall('extract_links', { limit: 12 }),
        makeToolCall('done', { summary: buildResearchSummary(ctx) })
      ]
    }
  }

  // Form fields visible — if goal mentions typing something
  if (ctx.step >= 1 && ctx.step < 5) {
    const formPlan = planFormProgress(ctx, task)
    if (formPlan) return formPlan
  }

  // Cap heuristic multi-step — hand off cleanly
  if (ctx.step >= 4) {
    return [
      makeToolCall('done', {
        summary: buildProgressSummary(ctx, task)
      })
    ]
  }

  return [
    makeToolCall('observe', {}),
    makeToolCall('done', {
      summary: buildProgressSummary(ctx, task)
    })
  ]
}

function planAuthFlow(ctx: PlanContext, kind: 'signup' | 'login'): ToolCall[] | null {
  const snap = ctx.lastObservation
  if (!snap) return null

  const nameRe = kind === 'signup' ? SIGNUP_NAME_RE : LOGIN_NAME_RE
  const prefer = kind === 'signup' ? SIGNUP_NAME_RE : LOGIN_NAME_RE
  const avoid = kind === 'signup' ? LOGIN_NAME_RE : SIGNUP_NAME_RE

  // Prefer buttons/links matching the intent
  const candidates = snap.elements.filter((e) => {
    const label = `${e.name} ${e.role} ${e.tag}`.toLowerCase()
    if (avoid.test(label) && !prefer.test(label)) return false
    return nameRe.test(e.name) || nameRe.test(label)
  })

  // Score: buttons > links > anything
  candidates.sort((a, b) => scoreAuthEl(b) - scoreAuthEl(a))
  const hit = candidates[0]

  if (hit && ctx.step <= 3) {
    // Avoid re-clicking the same thing forever
    const already = ctx.lastToolResults.some(
      (n) => n.toLowerCase().includes('clicked') && n.includes(hit.ref)
    )
    if (!already) {
      return [
        makeToolCall('think', {
          thought: `Click ${kind} control [${hit.ref}] “${hit.name}”`
        }),
        makeToolCall('click', { ref: hit.ref }),
        makeToolCall('wait', { ms: 1200 }),
        makeToolCall('observe', {})
      ]
    }
  }

  // On a form page — look for email/password fields
  const email = snap.elements.find(
    (e) =>
      /email|e-mail|phone|mobile/i.test(e.name) ||
      /email|e-mail/i.test(e.placeholder ?? '') ||
      e.role === 'textbox' ||
      e.tag === 'input'
  )
  const password = snap.elements.find(
    (e) => /password|passcode/i.test(e.name) || /password/i.test(e.placeholder ?? '')
  )

  if (email || password) {
    return [
      makeToolCall('ask_human', {
        question:
          kind === 'signup'
            ? 'I found the sign-up form. Please type the email/phone and password you want to use (I will not store them), or take over the tab and finish signup yourself.'
            : 'I found the login form. Please provide credentials to type, or take over the tab to sign in yourself.'
      })
    ]
  }

  // Maybe need to scroll to find CTA
  if (ctx.step <= 2) {
    return [
      makeToolCall('scroll', { direction: 'down', amount: 500 }),
      makeToolCall('wait', { ms: 400 }),
      makeToolCall('observe', {})
    ]
  }

  return [
    makeToolCall('done', {
      summary:
        kind === 'signup'
          ? `Opened the site and looked for sign-up. ${snap.title || 'Page'} is ready — take over to complete registration (CAPTCHA / phone verify often need a human), or say “click eN” on a specific control.`
          : `Opened the site and looked for log-in. Take over to enter credentials, or point me at a control (e.g. click e3).${isHeuristicNote()}`
    })
  ]
}

function scoreAuthEl(e: { role: string; tag: string; name: string }): number {
  let s = 0
  if (e.role === 'button' || e.tag === 'button') s += 5
  if (e.role === 'link' || e.tag === 'a') s += 3
  if (/create|sign\s*up|register|join/i.test(e.name)) s += 4
  if (/log\s*in|sign\s*in/i.test(e.name)) s += 2
  return s
}

function planFormProgress(ctx: PlanContext, task: string): ToolCall[] | null {
  const snap = ctx.lastObservation
  if (!snap) return null

  // If user quoted text to type
  const textMatch = task.match(/["“](.+?)["”]/) || task.match(/\btype\s+(.+)/i)
  if (textMatch?.[1]) {
    const typePlan = planType(ctx, `type "${textMatch[1]}"`)
    if (typePlan) return typePlan
  }

  // Submit buttons
  if (/\bsubmit|continue|next|done|finish|create account|sign up\b/i.test(task)) {
    const btn = snap.elements.find(
      (e) =>
        (e.role === 'button' || e.tag === 'button') &&
        /submit|continue|next|create|sign\s*up|register|join|done|finish/i.test(e.name)
    )
    if (btn) {
      return [
        makeToolCall('click', { ref: btn.ref }),
        makeToolCall('wait', { ms: 1000 }),
        makeToolCall('observe', {}),
        makeToolCall('done', {
          summary: `Clicked “${btn.name || btn.ref}”. Check the page — CAPTCHA or verification may need you.`
        })
      ]
    }
  }

  return null
}

function planClick(ctx: PlanContext, goal: string): ToolCall[] | null {
  const snap = ctx.lastObservation
  if (!snap) return null

  const rankMatch = goal.match(/\b(first|1st|second|2nd|third|3rd)\s+(result|link|item)?/i)
  if (rankMatch) {
    const rank = /first|1st/i.test(rankMatch[1]) ? 0 : /second|2nd/i.test(rankMatch[1]) ? 1 : 2
    const links = snap.elements.filter((e) => e.role === 'link' || e.tag === 'a')
    const hit = links[rank]
    if (hit) {
      return [
        makeToolCall('click', { ref: hit.ref }),
        makeToolCall('wait', { ms: 900 }),
        makeToolCall('observe', {}),
        makeToolCall('done', {
          summary: `Clicked ${rankMatch[1]} result [${hit.ref}] ${hit.name || ''}.`
        })
      ]
    }
  }

  const ref = findRefByName(snap, goal)
  if (!ref) return null
  return [
    makeToolCall('click', { ref }),
    makeToolCall('wait', { ms: 800 }),
    makeToolCall('observe', {}),
    makeToolCall('done', { summary: `Clicked [${ref}].` })
  ]
}

function planType(ctx: PlanContext, goal: string): ToolCall[] | null {
  const snap = ctx.lastObservation
  if (!snap) return null
  const textMatch = goal.match(/["“](.+?)["”]/) || goal.match(/type\s+(.+)/i)
  const text = textMatch?.[1]?.trim()
  if (!text) return null

  const input =
    snap.elements.find((e) => e.role === 'searchbox' || e.role === 'search') ||
    snap.elements.find((e) => e.role === 'textbox' || e.tag === 'input' || e.tag === 'textarea')
  if (!input) return null

  const submit = /enter|submit|search/i.test(goal)
  const calls: ToolCall[] = [makeToolCall('type', { ref: input.ref, text, clear: true })]
  if (submit) {
    calls.push(makeToolCall('press_key', { key: 'Enter' }))
    calls.push(makeToolCall('wait', { ms: 800 }))
    calls.push(makeToolCall('observe', {}))
  }
  calls.push(
    makeToolCall('done', {
      summary: `Typed into [${input.ref}]${submit ? ' and submitted' : ''}.`
    })
  )
  return calls
}

function findRefByName(snap: ObserveSnapshot, goal: string): string | null {
  const refMatch = goal.match(/\be(\d+)\b/i)
  if (refMatch) return `e${refMatch[1]}`
  const lower = goal.toLowerCase()
  const scored = snap.elements
    .filter((e) => e.name)
    .map((e) => {
      const n = e.name.toLowerCase()
      const hit =
        lower.includes(n.slice(0, Math.min(24, n.length))) ||
        n.includes(lower.replace(/click\s+|the\s+/g, '').slice(0, 20))
      return { e, hit, len: n.length }
    })
    .filter((x) => x.hit)
    .sort((a, b) => b.len - a.len)
  return scored[0]?.e.ref ?? null
}

function findRefByGoalKeywords(snap: ObserveSnapshot, task: string): string | null {
  const words = task
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
  if (!words.length) return null

  let best: { ref: string; score: number } | null = null
  for (const el of snap.elements) {
    const hay = `${el.name} ${el.role} ${el.placeholder ?? ''}`.toLowerCase()
    let score = 0
    for (const w of words) {
      if (hay.includes(w)) score += w.length
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { ref: el.ref, score }
    }
  }
  return best && best.score >= 4 ? best.ref : null
}

const STOP = new Set([
  'the',
  'and',
  'for',
  'with',
  'this',
  'that',
  'page',
  'open',
  'goto',
  'please',
  'want',
  'need',
  'make',
  'me',
  'my',
  'a',
  'an',
  'to',
  'on',
  'in'
])

function prettyHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function buildResearchSummary(ctx: PlanContext): string {
  return `Research pass complete on ${ctx.pageTitle || ctx.pageUrl || 'the active tab'}. See extracted text and links in the trajectory.${isHeuristicNote()}`
}

function buildProgressSummary(ctx: PlanContext, task: string): string {
  const page = ctx.pageTitle || ctx.pageUrl || 'the page'
  const els = ctx.lastObservation?.elements?.length ?? 0
  return (
    `I controlled the browser toward “${task.slice(0, 120)}” on ${page} ` +
    `(${els} interactive elements observed). ` +
    `Check the trajectory for clicks/navigation. ` +
    `Next: “click eN”, “type \\"…\\"”, or take over the tab.` +
    isHeuristicNote()
  )
}

function isHeuristicNote(): string {
  return ' (Heuristic mode — set XAI_API_KEY for Grok multi-step.)'
}

export function formatObservationForUser(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const d = data as {
    title?: string
    url?: string
    compact?: string
    textPreview?: string
    text?: string
  }
  const lines: string[] = []
  if (d.title || d.url) lines.push(`**${d.title || 'Page'}**\n${d.url || ''}`)
  if (d.compact) lines.push(`Interactive elements:\n${d.compact.slice(0, 1500)}`)
  if (d.textPreview) lines.push(`Preview:\n${d.textPreview.slice(0, 600)}`)
  if (d.text) lines.push(`Text:\n${d.text.slice(0, 1200)}`)
  return lines.join('\n\n')
}
