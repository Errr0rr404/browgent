/**
 * Heuristic planner — offline / no-API-key fallback only.
 *
 * Production path is the LLM tool-calling loop in session.ts: the model
 * understands any user goal and drives the browser via navigate/observe/click/type.
 *
 * This fallback is intentionally general (keyword match + value fill), not a
 * hard-coded login/signup script. It will never match a real LLM for open-ended tasks.
 */
import type { AgentMode } from '../../shared/policies'
import type { ObserveElement, ObserveSnapshot } from '../../shared/types'
import type { ToolCall } from '../../shared/tools'
import {
  extractCredentials,
  parseBrowseIntent,
  resolveNavigableTarget
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

      // Multi-step goal: open site, then keep working — do NOT done yet
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

    // Default: observe first so follow-up steps can act on any goal
    return [
      makeToolCall('think', { thought: `Work toward: ${goal.slice(0, 160)}` }),
      makeToolCall('observe', {})
    ]
  }

  // ── Follow-up steps: general goal-directed browser control ─
  const task = intent.task || goal
  const snap = ctx.lastObservation

  if (!snap) {
    return [makeToolCall('observe', {})]
  }

  // Explicit click / type language always wins
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

  if (/summar|what|explain|describe|extract|read/i.test(lower) && ctx.step <= 2) {
    return [
      makeToolCall('extract_text', { maxChars: 5000 }),
      makeToolCall('extract_links', { limit: 12 }),
      makeToolCall('done', { summary: buildResearchSummary(ctx) })
    ]
  }

  // General: fill values found in the goal into matching fields, then click goal-related controls
  if (ctx.step >= 1 && ctx.step < 8) {
    const toward = planTowardGoal(ctx, task)
    if (toward) return toward
  }

  if (ctx.step >= 6) {
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

/**
 * Generic act-toward-goal loop:
 * 1) type any values the user already put in the goal into matching inputs
 * 2) click the control whose label best matches the goal
 * 3) otherwise scroll / hand off
 */
function planTowardGoal(ctx: PlanContext, task: string): ToolCall[] | null {
  const snap = ctx.lastObservation
  if (!snap) return null

  const fill = planFillValuesFromGoal(ctx)
  if (fill) return fill

  const hit = findBestControlForGoal(snap, task, ctx.lastToolResults)
  if (hit) {
    return [
      makeToolCall('think', {
        thought: `Click [${hit.ref}] “${hit.name}” toward goal`
      }),
      makeToolCall('click', { ref: hit.ref }),
      makeToolCall('wait', { ms: 1100 }),
      makeToolCall('observe', {})
    ]
  }

  // No strong match yet — scroll once to reveal more controls
  const scrolled = ctx.lastToolResults.some((n) => /scroll/i.test(n))
  if (!scrolled && ctx.step <= 3) {
    return [
      makeToolCall('scroll', { direction: 'down', amount: 500 }),
      makeToolCall('wait', { ms: 400 }),
      makeToolCall('observe', {})
    ]
  }

  return null
}

/** Map values mentioned in the goal onto visible form fields (any task, not just auth). */
function planFillValuesFromGoal(ctx: PlanContext): ToolCall[] | null {
  const snap = ctx.lastObservation
  if (!snap) return null

  const values = collectGoalValues(ctx.goal)
  if (!values.length) return null

  const typedRef = (ref: string): boolean =>
    ctx.lastToolResults.some((n) => /typed into/i.test(n) && n.includes(ref))

  const inputs = snap.elements.filter(
    (e) =>
      e.role === 'textbox' ||
      e.role === 'searchbox' ||
      e.role === 'email' ||
      e.role === 'password' ||
      e.role === 'search' ||
      e.tag === 'input' ||
      e.tag === 'textarea'
  )
  if (!inputs.length) return null

  const calls: ToolCall[] = []
  const usedRefs = new Set<string>()

  for (const v of values) {
    const field = pickFieldForValue(inputs, v, usedRefs)
    if (!field || typedRef(field.ref)) continue
    usedRefs.add(field.ref)
    calls.push(
      makeToolCall('type', {
        ref: field.ref,
        text: v.text,
        clear: true
      })
    )
  }

  if (!calls.length) return null

  // After filling, click a primary action that matches goal keywords if present
  const action = findBestControlForGoal(snap, ctx.goal, ctx.lastToolResults)
  if (action) {
    calls.push(
      makeToolCall('click', { ref: action.ref }),
      makeToolCall('wait', { ms: 1200 }),
      makeToolCall('observe', {})
    )
  } else {
    calls.push(makeToolCall('wait', { ms: 500 }), makeToolCall('observe', {}))
  }
  return calls
}

interface GoalValue {
  text: string
  kind: 'email' | 'password' | 'quoted' | 'generic'
}

function collectGoalValues(goal: string): GoalValue[] {
  const out: GoalValue[] = []
  const seen = new Set<string>()
  const push = (text: string, kind: GoalValue['kind']): void => {
    const t = text.trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push({ text: t, kind })
  }

  // Structured credentials if present (also useful for any form with email/password)
  const creds = extractCredentials(goal)
  if (creds.email) push(creds.email, 'email')
  if (creds.password) push(creds.password, 'password')
  if (creds.username) push(creds.username, 'generic')

  // Quoted strings: type "hello world"
  for (const m of goal.matchAll(/["“](.+?)["”]/g)) {
    if (m[1]) push(m[1], 'quoted')
  }

  // key: value / key=value pairs (username: bob, query=foo)
  for (const m of goal.matchAll(
    /\b([a-z][a-z0-9_-]{1,20})\s*[:=]\s*["']?([^\s"',]{2,80})["']?/gi
  )) {
    const key = (m[1] ?? '').toLowerCase()
    const val = m[2] ?? ''
    if (/password|passwd|pwd|pass/.test(key)) push(val, 'password')
    else if (/email|e-mail/.test(key)) push(val, 'email')
    else if (
      /user|login|name|query|search|message|text|city|phone|code|otp|url/.test(key)
    ) {
      push(val, 'generic')
    }
  }

  return out
}

function pickFieldForValue(
  inputs: ObserveElement[],
  value: GoalValue,
  used: Set<string>
): ObserveElement | null {
  const free = inputs.filter((e) => !used.has(e.ref))
  if (!free.length) return null

  const score = (e: ObserveElement): number => {
    const hay = `${e.name} ${e.role} ${e.placeholder ?? ''} ${e.tag}`.toLowerCase()
    let s = 0
    if (value.kind === 'email') {
      if (e.role === 'email' || /email|e-mail/.test(hay)) s += 10
      if (/phone|mobile|user/.test(hay)) s += 3
    } else if (value.kind === 'password') {
      if (e.role === 'password' || /password|passcode/.test(hay)) s += 10
    } else if (value.kind === 'quoted' || value.kind === 'generic') {
      if (/search|query|q\b/.test(hay)) s += 4
      if (/message|comment|compose|text|body/.test(hay)) s += 3
      if (e.role === 'textbox' || e.tag === 'textarea' || e.tag === 'input') s += 1
    }
    if (/password|passcode/.test(hay) && value.kind !== 'password') s -= 8
    return s
  }

  const ranked = free
    .map((e) => ({ e, s: score(e) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)

  if (ranked[0]) return ranked[0].e

  // Fallback: first free non-password field for generic/quoted/email
  if (value.kind !== 'password') {
    return (
      free.find((e) => !/password/i.test(`${e.name} ${e.role} ${e.placeholder ?? ''}`)) ?? null
    )
  }
  return free.find((e) => /password/i.test(`${e.name} ${e.role}`)) ?? null
}

function findBestControlForGoal(
  snap: ObserveSnapshot,
  task: string,
  lastToolResults: string[]
): ObserveElement | null {
  const words = goalKeywords(task)
  const phrases = goalPhrases(task)
  if (!words.length && !phrases.length) return null

  let best: { el: ObserveElement; score: number } | null = null
  for (const el of snap.elements) {
    // Never re-click the same ref in this run (observe again after navigation)
    if (
      lastToolResults.some((n) => n.toLowerCase().includes('clicked') && n.includes(el.ref))
    ) {
      continue
    }

    const hay = `${el.name} ${el.role} ${el.placeholder ?? ''}`.toLowerCase()
    let score = 0
    let phraseHits = 0
    let wordHits = 0

    // Multi-word phrases from the goal beat single tokens ("sign up" vs "sign in")
    for (const p of phrases) {
      if (hay.includes(p)) {
        phraseHits++
        score += 14 + p.length
      }
    }
    for (const w of words) {
      if (hay.includes(w)) {
        wordHits++
        score += Math.min(w.length, 10)
      }
    }
    // Prefer buttons/links for actions
    if (el.role === 'button' || el.tag === 'button') score += 3
    if (el.role === 'link' || el.tag === 'a') score += 2

    // Single-token overlap is too weak when the goal has multi-word phrases
    // (avoids "sign" matching both "Sign up" and "Sign in")
    if (phraseHits === 0 && phrases.length > 0 && wordHits < 2) {
      score = 0
    }

    if (score > 0 && (!best || score > best.score)) best = { el, score }
  }

  // Require a meaningful match so we don't click noise
  return best && best.score >= 6 ? best.el : null
}

function goalKeywords(task: string): string[] {
  return task
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
}

/** Bigrams / short phrases so "sign up" ranks above "sign in" */
function goalPhrases(task: string): string[] {
  const toks = task
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
  const phrases: string[] = []
  for (let i = 0; i < toks.length - 1; i++) {
    phrases.push(`${toks[i]} ${toks[i + 1]}`)
  }
  return phrases
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
  'in',
  'using',
  'from',
  'into',
  'your',
  'you',
  'can',
  'could',
  'help',
  'just',
  'then'
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
    `Next: keep going in chat, say “click eN”, or take over the tab.` +
    isHeuristicNote()
  )
}

function isHeuristicNote(): string {
  return ' (Offline heuristic fallback — set an LLM API key for full natural-language browser control.)'
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
