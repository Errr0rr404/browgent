import { randomUUID } from 'crypto'
import type { TabManager } from '../browser/tab-manager'
import type { ToolArgs, ToolCall, ToolName, ToolResult } from '../../shared/tools'
import {
  DEFAULT_POLICY,
  hostFromUrl,
  isAgentNavigableUrl,
  isHostAllowed,
  looksLikeForbiddenScheme,
  looksSensitiveLabel,
  RESEARCH_TOOLS,
  WATCH_TOOLS,
  type AgentMode,
  type AgentPolicy
} from '../../shared/policies'
import { normalizeUrl } from '../../shared/types'
import type { ObserveElement, ObserveSnapshot } from '../../shared/types'

export interface ExecuteContext {
  policy: AgentPolicy
  mode: AgentMode
  /** Return false to block and request human confirmation */
  requestConfirm?: (reason: string, tool: ToolName, args: ToolArgs) => Promise<boolean>
  /** Cached observation — used to validate ref identity without re-observing (which renumbers refs) */
  lastObservation?: ObserveSnapshot | null
  /** Abort signal — when aborted, in-flight waits/actions terminate */
  signal?: AbortSignal
  /** Resolve placeholder strings (e.g. LLM-secret placeholders) to raw values for local tool use */
  resolver?: (text: string) => string
}

const GUARDED_TAB_TOOLS = new Set<ToolName>([
  'navigate',
  'back',
  'forward',
  'click',
  'type',
  'select_option',
  'press_key'
])

export class ToolExecutor {
  constructor(private tabs: TabManager) {}

  async execute(call: ToolCall, ctx: ExecuteContext): Promise<ToolResult> {
    const { name, args } = call
    const policy = ctx.policy ?? DEFAULT_POLICY

    if (ctx.mode === 'research' || policy.researchOnly) {
      if (!RESEARCH_TOOLS.has(name)) {
        return fail(name, `Tool "${name}" blocked in research mode`)
      }
    }

    if (ctx.mode === 'watch' && !WATCH_TOOLS.has(name)) {
      return fail(name, 'Watch mode is observation-only (human controls the browser)')
    }

    if (GUARDED_TAB_TOOLS.has(name)) {
      const targetTabId = str(args.tabId) ?? this.tabs.getActiveTabId() ?? undefined
      if (!targetTabId || !this.tabs.has(targetTabId)) return fail(name, 'No such tab')
      this.tabs.setOwner(targetTabId, 'agent')
      this.tabs.applyGuardPolicy(targetTabId, {
        allowHosts: policy.allowHosts ?? [],
        blockHosts: policy.blockHosts ?? [],
        crossHostRequired: !!policy.confirmCrossHost
      })
    }

    try {
      switch (name) {
        case 'think':
          return ok(name, { thought: args.thought }, `Thought: ${String(args.thought ?? '').slice(0, 120)}`)

        case 'done':
          return ok(name, { summary: args.summary }, String(args.summary ?? 'Done'))

        case 'ask_human':
          return ok(name, { question: args.question }, `Asked human: ${String(args.question ?? '')}`)

        case 'list_tabs':
          return ok(name, { tabs: this.tabs.getState() }, `Listed ${this.tabs.count()} tabs`)

        case 'new_tab': {
          if (ctx.signal?.aborted) return fail(name, 'Aborted')
          const raw = String(args.url ?? 'https://www.google.com')
          if (looksLikeForbiddenScheme(raw)) return fail(name, 'URL blocked: forbidden scheme')
          const url = normalizeUrl(raw)
          if (!isAgentNavigableUrl(url)) {
            return fail(name, 'URL blocked: only http/https/about:blank allowed')
          }
          const host = hostFromUrl(url)
          if (host && !isHostAllowed(host, policy)) {
            return fail(name, `Host blocked by policy: ${host}`)
          }
          const currentHost = this.tabs.getCommittedHost()
          const isCrossHost = !!host && (currentHost === '' || currentHost !== host)
          if (host && isCrossHost && policy.confirmCrossHost && ctx.requestConfirm) {
            const reason = currentHost === ''
              ? `Open new tab on ${host}?`
              : `Open new tab on ${host} (from ${currentHost})?`
            const allowed = await ctx.requestConfirm(reason, name, args)
            if (!allowed) return fail(name, 'New tab rejected by human')
          }
          const guardPolicy = {
            allowHosts: policy.allowHosts ?? [],
            blockHosts: policy.blockHosts ?? [],
            crossHostRequired: !!policy.confirmCrossHost
          }
          const id = this.tabs.createAgentTab(url, true, guardPolicy, host ?? '')
          if (!id) return fail(name, 'Could not open tab (limit reached or URL blocked)')
          return ok(name, { tabId: id, url }, `Opened tab ${id.slice(0, 8)}`)
        }

        case 'close_tab': {
          const id = String(args.tabId ?? this.tabs.getActiveTabId() ?? '')
          if (!id) return fail(name, 'No tab')
          const closed = this.tabs.closeTab(id)
          return closed ? ok(name, {}, 'Closed tab') : fail(name, 'No such tab')
        }

        case 'switch_tab': {
          const id = String(args.tabId ?? '')
          if (!id) return fail(name, 'tabId required')
          if (!this.tabs.has(id)) return fail(name, `Unknown tab: ${id.slice(0, 8)}`)
          this.tabs.setOwner(id, 'agent')
          this.tabs.applyGuardPolicy(id, {
            allowHosts: policy.allowHosts ?? [],
            blockHosts: policy.blockHosts ?? [],
            crossHostRequired: !!policy.confirmCrossHost
          })
          const activated = this.tabs.activateTab(id)
          return activated ? ok(name, { tabId: id }, 'Switched tab') : fail(name, 'Cannot switch tab')
        }

        case 'navigate': {
          if (ctx.signal?.aborted) return fail(name, 'Aborted')
          const input = String(args.url ?? '')
          if (!input) return fail(name, 'url required')
          if (looksLikeForbiddenScheme(input)) return fail(name, 'URL blocked: forbidden scheme')
          const url = normalizeUrl(input)
          if (!isAgentNavigableUrl(url)) {
            return fail(name, 'URL blocked: only http/https/about:blank allowed')
          }
          const host = hostFromUrl(url)
          if (host && !isHostAllowed(host, policy)) {
            return fail(name, `Host blocked by policy: ${host}`)
          }
          const tabId = typeof args.tabId === 'string' ? args.tabId : undefined
          const resolvedId = tabId ?? this.tabs.getActiveTabId() ?? undefined
          if (!resolvedId) return fail(name, 'No active tab')
          const currentHost = this.tabs.getCommittedHost(resolvedId)
          const isCrossHost = !!host && (currentHost === '' || currentHost !== host)
          if (host && isCrossHost) {
            if (policy.confirmCrossHost && ctx.requestConfirm) {
              const reason = currentHost === ''
                ? `Navigate to new host ${host}?`
                : `Navigate to new host ${host} (from ${currentHost})?`
              const allowed = await ctx.requestConfirm(reason, name, args)
              if (!allowed) return fail(name, 'Navigation rejected by human')
            }
          }
          const started = this.tabs.navigate(resolvedId, input)
          if (!started) {
            return fail(name, 'Navigation rejected: URL blocked by tab manager')
          }
          const loaded = await this.tabs.waitForLoad(resolvedId, 15000, ctx.signal)
          if (!loaded) {
            this.tabs.clearNavigationAttempt(resolvedId)
            const finalTab = this.tabs.getState().find((t) =>
              resolvedId ? t.id === resolvedId : t.isActive
            )
            const finalTitle = finalTab?.title ?? ''
            if (ctx.signal?.aborted) return fail(name, 'Aborted')
            if (/blocked by policy/i.test(finalTitle)) return fail(name, 'Navigation blocked by policy')
            if (finalTitle === 'Failed to load' || /failed to load/i.test(finalTitle)) {
              return fail(name, `Navigation failed: ${finalTitle}`)
            }
            return fail(name, 'Navigation timeout')
          }
          const finalTab = this.tabs.getState().find((t) =>
            resolvedId ? t.id === resolvedId : t.isActive
          )
          const finalUrl = finalTab?.url
          if (
            finalUrl &&
            host &&
            policy.confirmCrossHost &&
            hostFromUrl(finalUrl) !== host
          ) {
            return fail(name, `Navigation ended on unexpected host: ${hostFromUrl(finalUrl)}`)
          }
          return ok(name, { url, finalUrl }, `Navigated to ${finalUrl || url}`)
        }

        case 'back': {
          const targetId = str(args.tabId) ?? this.tabs.getActiveTabId() ?? undefined
          const targetUrl = targetId ? this.tabs.getHistoryTargetUrl(targetId, -1) : null
          const historyCheck = await this.confirmHistoryNavigation(name, targetId, targetUrl, ctx)
          if (!historyCheck.ok) return historyCheck.result
          const moved = this.tabs.goBack(targetId)
          if (!moved) return fail(name, 'Cannot go back')
          await abortSleep(400, ctx.signal)
          if (ctx.signal?.aborted) return fail(name, 'Aborted')
          return ok(name, {}, 'Went back')
        }

        case 'forward': {
          const targetId = str(args.tabId) ?? this.tabs.getActiveTabId() ?? undefined
          const targetUrl = targetId ? this.tabs.getHistoryTargetUrl(targetId, 1) : null
          const historyCheck = await this.confirmHistoryNavigation(name, targetId, targetUrl, ctx)
          if (!historyCheck.ok) return historyCheck.result
          const moved = this.tabs.goForward(targetId)
          if (!moved) return fail(name, 'Cannot go forward')
          await abortSleep(400, ctx.signal)
          if (ctx.signal?.aborted) return fail(name, 'Aborted')
          return ok(name, {}, 'Went forward')
        }

        case 'reload': {
          const reloaded = this.tabs.reload(str(args.tabId))
          if (!reloaded) return fail(name, 'Cannot reload')
          const loaded = await this.tabs.waitForLoad(str(args.tabId), 15000, ctx.signal)
          if (!loaded && ctx.signal?.aborted) return fail(name, 'Aborted')
          if (!loaded) return fail(name, 'Reload timeout')
          return ok(name, {}, 'Reloaded')
        }

        case 'get_url': {
          const tab = this.tabs.getState().find((t) =>
            args.tabId ? t.id === args.tabId : t.isActive
          )
          return ok(name, { url: tab?.url, title: tab?.title }, tab?.url ?? 'none')
        }

        case 'observe': {
          const snap = await this.tabs.observe(str(args.tabId))
          if (!snap) return fail(name, 'Could not observe page')
          const compact = snap.elements
            .slice(0, 40)
            .map((e) => `[${e.ref}] ${e.role}: ${e.name || e.tag}${e.href ? ` → ${e.href}` : ''}`)
            .join('\n')
          return ok(
            name,
            {
              url: snap.url,
              title: snap.title,
              elements: snap.elements,
              textPreview: snap.textPreview.slice(0, 800),
              compact
            },
            `Observed ${snap.elements.length} elements on ${snap.title || snap.url}`
          )
        }

        case 'extract_text': {
          const data = await this.tabs.extractText(str(args.tabId), num(args.maxChars, 8000))
          if (!data) return fail(name, 'Extract failed')
          return ok(name, data, 'Extracted text')
        }

        case 'extract_links': {
          const data = await this.tabs.extractLinks(str(args.tabId), num(args.limit, 40))
          if (!data) return fail(name, 'Extract links failed')
          return ok(name, data, 'Extracted links')
        }

        case 'screenshot': {
          const buf = await this.tabs.screenshotActive(str(args.tabId))
          if (!buf) return fail(name, 'Screenshot failed')
          // Don't dump full base64 into trajectory — just metadata
          return ok(
            name,
            { bytes: buf.length, base64Length: buf.toString('base64').length },
            `Screenshot ${buf.length} bytes`
          )
        }

        case 'click': {
          if (!args.ref && !args.selector) return fail(name, 'ref or selector required')

          const usesSelector = typeof args.selector === 'string' && args.selector.length > 0
          const clickTabId = str(args.tabId) ?? this.tabs.getActiveTabId() ?? null
          const observationMatchesTarget =
            clickTabId !== null && clickTabId === this.tabs.getActiveTabId()
          let cachedEl: ObserveElement | null = null
          if (
            observationMatchesTarget &&
            typeof args.ref === 'string' &&
            args.ref &&
            ctx.lastObservation
          ) {
            cachedEl = ctx.lastObservation.elements.find((e) => e.ref === args.ref) ?? null
          }
          const identityKnown = !!cachedEl

          if (policy.confirmSensitiveClicks && ctx.requestConfirm) {
            if (usesSelector) {
              const allowed = await ctx.requestConfirm(
                'Click via CSS selector — element identity is opaque. Allow?',
                name,
                args
              )
              if (!allowed) return fail(name, 'Click rejected by human')
            } else if (!identityKnown) {
              const allowed = await ctx.requestConfirm(
                'Click on unknown / stale ref (re-observe first?). Allow?',
                name,
                args
              )
              if (!allowed) return fail(name, 'Click rejected by human')
            } else if (cachedEl) {
              const label = `${cachedEl.name ?? ''} ${cachedEl.role ?? ''}`.trim()
              if (looksSensitiveLabel(label, policy)) {
                const allowed = await ctx.requestConfirm(
                  `Sensitive click: "${label}" — allow?`,
                  name,
                  args
                )
                if (!allowed) return fail(name, 'Click rejected by human')
              }
            }
          }

          let preAttemptId = -1
          let noNavExpected = false
          if (clickTabId && this.tabs.has(clickTabId)) {
            if (identityKnown && cachedEl?.href) {
              const curHost = this.tabs.getCommittedHost(clickTabId)
              const target = parseHref(cachedEl.href, curHost)
              if (target) {
                if (!isAgentNavigableUrl(target.url)) {
                  return fail(name, `Click destination URL blocked: ${target.url.slice(0, 80)}`)
                }
                if (target.host && !isHostAllowed(target.host, policy)) {
                  return fail(name, `Click destination host blocked: ${target.host}`)
                }
                const isCross = target.host && (curHost === '' || curHost !== target.host)
                if (isCross) {
                  if (policy.confirmCrossHost && ctx.requestConfirm) {
                    const allowed = await ctx.requestConfirm(
                      `Click navigates to new host ${target.host}. Allow?`,
                      name,
                      args
                    )
                    if (!allowed) return fail(name, 'Click rejected by human (cross-host)')
                  }
                  preAttemptId = this.tabs.updateApprovedHost(clickTabId, target.host)
                }
              }
            } else if (identityKnown && !cachedEl?.href) {
              const curHost = this.tabs.getCommittedHost(clickTabId)
              if (curHost) {
                preAttemptId = this.tabs.beginNavigationAttempt(clickTabId, '')
                noNavExpected = true
              }
            }
          }

          let r
          try {
            r = await this.tabs.domAction('click', args, str(args.tabId), ctx.signal)
          } catch (e) {
            if (preAttemptId !== -1 && clickTabId) this.tabs.clearNavigationAttempt(clickTabId, preAttemptId)
            throw e
          }
          await abortSleep(300, ctx.signal)
          if (!r.ok || ctx.signal?.aborted) {
            if (preAttemptId !== -1 && clickTabId) this.tabs.clearNavigationAttempt(clickTabId, preAttemptId)
            if (ctx.signal?.aborted) return fail(name, 'Aborted')
            return fail(name, r.error ?? 'Click failed')
          }
          if (noNavExpected && preAttemptId !== -1 && clickTabId) {
            const cleanupTabId = clickTabId
            const cleanupAttemptId = preAttemptId
            setTimeout(() => {
              this.tabs.clearNavigationAttempt(cleanupTabId, cleanupAttemptId)
            }, 5000)
          }
          return ok(name, r, `Clicked ${args.ref ?? args.selector ?? r.name ?? ''}`)
        }

        case 'type': {
          const hasText = typeof args.text === 'string'
          const rawText = hasText ? String(args.text) : ''
          // allow empty string when clear=true (wipe field)
          if (!hasText && !args.clear) return fail(name, 'text or clear=true required')
          if (!args.ref && !args.selector) return fail(name, 'ref or selector required')
          const resolved = ctx.resolver ? ctx.resolver(rawText) : rawText
          const safeArgs: ToolArgs = { ...args, text: resolved }
          const r = await this.tabs.domAction('type', safeArgs, str(args.tabId), ctx.signal)
          return r.ok
            ? ok(name, r, `Typed into ${args.ref ?? args.selector ?? 'field'}`)
            : fail(name, r.error ?? 'Type failed')
        }

        case 'hover': {
          const r = await this.tabs.domAction('hover', args, str(args.tabId), ctx.signal)
          return r.ok ? ok(name, r, 'Hovered') : fail(name, r.error ?? 'Hover failed')
        }

        case 'select_option': {
          if (args.value == null && args.label == null) return fail(name, 'value or label required')
          const r = await this.tabs.domAction('select', args, str(args.tabId), ctx.signal)
          return r.ok ? ok(name, r, 'Selected option') : fail(name, r.error ?? 'Select failed')
        }

        case 'press_key': {
          const r = await this.tabs.domAction('press', args, str(args.tabId), ctx.signal)
          return r.ok
            ? ok(name, r, `Pressed ${args.key}`)
            : fail(name, r.error ?? 'Key failed')
        }

        case 'scroll': {
          const r = await this.tabs.domAction('scroll', args, str(args.tabId), ctx.signal)
          return r.ok ? ok(name, r, `Scrolled ${args.direction ?? 'down'}`) : fail(name, r.error ?? 'Scroll failed')
        }

        case 'wait': {
          if (ctx.signal?.aborted) return fail(name, 'Aborted')
          const ms = clampMs(num(args.ms, args.ref || args.selector ? 5000 : 1000))
          if (args.ref || args.selector) {
            const deadline = Date.now() + ms
            while (Date.now() < deadline) {
              if (ctx.signal?.aborted) return fail(name, 'Aborted')
              const r = await this.tabs.domAction('wait_for', args, str(args.tabId), ctx.signal)
              if (r.ok) return ok(name, {}, 'Element appeared')
              await abortSleep(200, ctx.signal)
            }
            return fail(name, 'Wait timeout')
          }
          await abortSleep(ms, ctx.signal)
          if (ctx.signal?.aborted) return fail(name, 'Aborted')
          return ok(name, {}, `Waited ${ms}ms`)
        }

        default:
          return fail(name, `Unknown tool: ${name}`)
      }
    } catch (e) {
      return fail(name, e instanceof Error ? e.message : 'Tool error')
    }
  }

  private async confirmHistoryNavigation(
    name: ToolName,
    tabId: string | undefined,
    targetUrl: string | null,
    ctx: ExecuteContext
  ): Promise<{ ok: true } | { ok: false; result: ToolResult }> {
    if (!tabId || !this.tabs.has(tabId)) {
      return { ok: false, result: fail(name, 'No such tab') }
    }
    if (!targetUrl) {
      return { ok: false, result: fail(name, `Cannot ${name === 'back' ? 'go back' : 'go forward'}`) }
    }
    if (!isAgentNavigableUrl(targetUrl)) {
      return { ok: false, result: fail(name, 'History target blocked by URL policy') }
    }
    const host = hostFromUrl(targetUrl)
    if (host && !isHostAllowed(host, ctx.policy)) {
      return { ok: false, result: fail(name, `History target host blocked: ${host}`) }
    }
    const currentHost = this.tabs.getCommittedHost(tabId)
    if (host && (currentHost === '' || currentHost !== host) && ctx.policy.confirmCrossHost) {
      if (!ctx.requestConfirm) {
        return { ok: false, result: fail(name, 'Cross-host history navigation requires confirmation') }
      }
      const allowed = await ctx.requestConfirm(
        `${name === 'back' ? 'Go back' : 'Go forward'} to ${host}?`,
        name,
        { tabId, url: targetUrl }
      )
      if (!allowed) return { ok: false, result: fail(name, 'Navigation rejected by human') }
    }
    return { ok: true }
  }
}

function ok(tool: ToolName, data: unknown, summary: string): ToolResult {
  return { ok: true, tool, data, summary }
}

function fail(tool: ToolName, error: string): ToolResult {
  return { ok: false, tool, error, summary: error }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function num(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** Cap wait duration so a bad model arg cannot hang Stop for minutes. */
function clampMs(ms: number): number {
  if (!Number.isFinite(ms) || ms < 0) return 0
  return Math.min(Math.round(ms), 30_000)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function abortSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return sleep(ms)
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(t)
      resolve()
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function parseHref(href: string, baseHost: string): { url: string; host: string } | null {
  if (!href) return null
  try {
    const abs = baseHost
      ? new URL(href, `http://${baseHost}`).toString()
      : href
    const u = new URL(abs)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return { url: u.toString(), host: u.hostname.toLowerCase() }
  } catch {
    return null
  }
}

export function makeToolCall(name: ToolName, args: ToolArgs = {}): ToolCall {
  return { id: randomUUID(), name, args }
}
