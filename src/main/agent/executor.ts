import { randomUUID } from 'crypto'
import type { TabManager } from '../browser/tab-manager'
import type { ToolArgs, ToolCall, ToolName, ToolResult } from '../../shared/tools'
import {
  DEFAULT_POLICY,
  hostFromUrl,
  isAgentNavigableUrl,
  isHostAllowed,
  looksSensitiveLabel,
  RESEARCH_TOOLS,
  WATCH_TOOLS,
  type AgentMode,
  type AgentPolicy
} from '../../shared/policies'
import { normalizeUrl } from '../../shared/types'

export interface ExecuteContext {
  policy: AgentPolicy
  mode: AgentMode
  /** Return false to block and request human confirmation */
  requestConfirm?: (reason: string, tool: ToolName, args: ToolArgs) => Promise<boolean>
}

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
          const raw = String(args.url ?? 'https://www.google.com')
          const url = normalizeUrl(raw)
          if (!isAgentNavigableUrl(url)) {
            return fail(name, `Blocked URL scheme (agent may only open http/https/about): ${url.slice(0, 80)}`)
          }
          const host = hostFromUrl(url)
          if (host && !isHostAllowed(host, policy)) {
            return fail(name, `Host blocked by policy: ${host}`)
          }
          const id = this.tabs.createTab(url, true)
          return id
            ? ok(name, { tabId: id }, `Opened tab ${id.slice(0, 8)}`)
            : fail(name, 'Could not open tab (limit reached)')
        }

        case 'close_tab': {
          const id = String(args.tabId ?? this.tabs.getActiveTabId() ?? '')
          if (!id) return fail(name, 'No tab')
          this.tabs.closeTab(id)
          return ok(name, {}, `Closed tab`)
        }

        case 'switch_tab': {
          const id = String(args.tabId ?? '')
          if (!id) return fail(name, 'tabId required')
          const exists = this.tabs.getState().some((t) => t.id === id)
          if (!exists) return fail(name, `Unknown tab: ${id.slice(0, 8)}`)
          this.tabs.activateTab(id)
          return ok(name, { tabId: id }, `Switched tab`)
        }

        case 'navigate': {
          const input = String(args.url ?? '')
          if (!input) return fail(name, 'url required')
          const url = normalizeUrl(input)
          if (!isAgentNavigableUrl(url)) {
            return fail(name, `Blocked URL scheme (agent may only open http/https/about): ${url.slice(0, 80)}`)
          }
          const host = hostFromUrl(url)
          if (host && !isHostAllowed(host, policy)) {
            return fail(name, `Host blocked by policy: ${host}`)
          }
          if (policy.confirmCrossHost && host && ctx.requestConfirm) {
            const current = this.tabs.getState().find((t) => t.isActive)?.url
            const curHost = current ? hostFromUrl(current) : null
            if (curHost && curHost !== host) {
              const allowed = await ctx.requestConfirm(
                `Navigate to new host ${host}?`,
                name,
                args
              )
              if (!allowed) return fail(name, 'Navigation rejected by human')
            }
          }
          const tabId = typeof args.tabId === 'string' ? args.tabId : undefined
          this.tabs.navigate(tabId, url)
          await this.tabs.waitForLoad(tabId)
          const finalUrl = this.tabs.getState().find((t) =>
            tabId ? t.id === tabId : t.isActive
          )?.url
          if (finalUrl && /failed to load/i.test(
            this.tabs.getState().find((t) => (tabId ? t.id === tabId : t.isActive))?.title ?? ''
          )) {
            return fail(name, `Navigation failed: ${url}`)
          }
          return ok(name, { url, finalUrl }, `Navigated to ${finalUrl || url}`)
        }

        case 'back':
          this.tabs.goBack(str(args.tabId))
          await sleep(400)
          return ok(name, {}, 'Went back')

        case 'forward':
          this.tabs.goForward(str(args.tabId))
          await sleep(400)
          return ok(name, {}, 'Went forward')

        case 'reload':
          this.tabs.reload(str(args.tabId))
          await this.tabs.waitForLoad(str(args.tabId))
          return ok(name, {}, 'Reloaded')

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
          if (!args.ref && !args.selector) {
            return fail(name, 'ref or selector required')
          }
          if (policy.confirmSensitiveClicks && ctx.requestConfirm) {
            // Best-effort: observe first for name
            const snap = await this.tabs.observe(str(args.tabId))
            const el = snap?.elements.find((e) => e.ref === args.ref)
            const label = el?.name ?? String(args.selector ?? args.ref ?? '')
            if (looksSensitiveLabel(label, policy)) {
              const allowed = await ctx.requestConfirm(
                `Sensitive click: “${label}” — allow?`,
                name,
                args
              )
              if (!allowed) return fail(name, 'Click rejected by human')
            }
          }
          const r = await this.tabs.domAction('click', args, str(args.tabId))
          await sleep(300)
          return r.ok
            ? ok(name, r, `Clicked ${args.ref ?? args.selector ?? r.name ?? ''}`)
            : fail(name, r.error ?? 'Click failed')
        }

        case 'type': {
          if (args.text == null || String(args.text).length === 0) {
            // allow empty string when clear=true (wipe field)
            if (!args.clear) return fail(name, 'text required')
          }
          if (!args.ref && !args.selector) {
            return fail(name, 'ref or selector required')
          }
          const r = await this.tabs.domAction('type', args, str(args.tabId))
          return r.ok
            ? ok(name, r, `Typed into ${args.ref ?? args.selector ?? 'field'}`)
            : fail(name, r.error ?? 'Type failed')
        }

        case 'hover': {
          const r = await this.tabs.domAction('hover', args, str(args.tabId))
          return r.ok ? ok(name, r, 'Hovered') : fail(name, r.error ?? 'Hover failed')
        }

        case 'select_option': {
          if (args.value == null && args.label == null) {
            return fail(name, 'value or label required')
          }
          const r = await this.tabs.domAction('select', args, str(args.tabId))
          return r.ok ? ok(name, r, 'Selected option') : fail(name, r.error ?? 'Select failed')
        }

        case 'press_key': {
          const r = await this.tabs.domAction('press', args, str(args.tabId))
          return r.ok
            ? ok(name, r, `Pressed ${args.key}`)
            : fail(name, r.error ?? 'Key failed')
        }

        case 'scroll': {
          const r = await this.tabs.domAction('scroll', args, str(args.tabId))
          return r.ok ? ok(name, r, `Scrolled ${args.direction ?? 'down'}`) : fail(name, r.error ?? 'Scroll failed')
        }

        case 'wait': {
          const ms = clampMs(num(args.ms, args.ref || args.selector ? 5000 : 1000))
          if (args.ref || args.selector) {
            const deadline = Date.now() + ms
            while (Date.now() < deadline) {
              const r = await this.tabs.domAction('wait_for', args, str(args.tabId))
              if (r.ok) return ok(name, {}, 'Element appeared')
              await sleep(200)
            }
            return fail(name, 'Wait timeout')
          }
          await sleep(ms)
          return ok(name, {}, `Waited ${ms}ms`)
        }

        default:
          return fail(name, `Unknown tool: ${name}`)
      }
    } catch (e) {
      return fail(name, e instanceof Error ? e.message : 'Tool error')
    }
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

export function makeToolCall(name: ToolName, args: ToolArgs = {}): ToolCall {
  return { id: randomUUID(), name, args }
}
