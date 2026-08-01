import { randomUUID } from 'crypto'
import type { TabManager } from '../browser/tab-manager'
import type { ToolArgs, ToolCall, ToolName, ToolResult } from '../../shared/tools'
import {
  DEFAULT_POLICY,
  hostFromUrl,
  isAgentNavigableUrl,
  isHostAllowed,
  isPrivateOrMetadataHost,
  looksLikeForbiddenScheme,
  looksSensitiveLabel,
  RESEARCH_TOOLS,
  WATCH_TOOLS,
  type AgentMode,
  type AgentPolicy
} from '../../shared/policies'
import { buildAgentSearchUrl } from '../../shared/sites'
import { normalizeUrl } from '../../shared/types'
import type { ObserveElement, ObserveSnapshot } from '../../shared/types'
import { getProfileStore } from '../browser/profile-store'
import { getPasswordVault } from '../browser/password-vault'
import { profileToAgentMap } from '../../shared/profile'
import { planFormFill } from '../browser/form-fill'
import type { AssetKind } from '../browser/asset-scanner'

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
  /** When true, screenshot results carry the base64 image for a vision model. */
  vision?: boolean
}

const GUARDED_TAB_TOOLS = new Set<ToolName>([
  'navigate',
  'search',
  'back',
  'forward',
  'click',
  'type',
  'select_option',
  'press_key',
  'fill_form',
  'download_assets'
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

        case 'get_profile': {
          const profile = getProfileStore().get()
          if (!profile.agentMayUse) {
            return fail(
              name,
              'User disabled agent access to profile (Settings → User Hub → Allow agent)'
            )
          }
          const map = profileToAgentMap(profile)
          const keys = Object.keys(map)
          return ok(
            name,
            { fields: map, agentMayUse: true },
            keys.length
              ? `Profile fields: ${keys.join(', ')}`
              : 'Profile is empty — ask the user for missing contact details'
          )
        }

        case 'get_credentials': {
          if (!ctx.requestConfirm) {
            return fail(name, 'Credential access requires human confirmation')
          }
          // Bind lookup to the visible http(s) tab — never accept an agent-supplied URL when
          // the active tab has no host (about:blank) or is a different registrable site.
          const activeUrl = this.tabs.getState().find((t) => t.isActive)?.url || ''
          const activeHost = hostFromUrl(activeUrl)
          if (!activeHost || !/^https?:\/\//i.test(activeUrl)) {
            return fail(
              name,
              'Open an http(s) page first — credential lookup is bound to the active tab'
            )
          }
          const argUrl = str(args.url) || ''
          let url = activeUrl
          if (argUrl) {
            const argHost = hostFromUrl(argUrl)
            if (!argHost || !/^https?:\/\//i.test(argUrl)) {
              return fail(name, 'Credential URL must be http(s) with a valid host')
            }
            // Same host, or a subdomain of the active host (not parent → child vault fishing).
            const sameOrSub =
              argHost === activeHost || argHost.endsWith(`.${activeHost}`)
            if (!sameOrSub) {
              return fail(
                name,
                `Credential URL host (${argHost}) does not match active tab (${activeHost})`
              )
            }
            url = argUrl
          }
          const vault = getPasswordVault()
          const meta = vault.findMetaForUrl(url)
          if (!meta) {
            return fail(name, 'No saved credentials for this site')
          }
          const userLabel = meta.username ? ` user “${meta.username}”` : ''
          const allowed = await ctx.requestConfirm(
            `Allow reading vault password for ${meta.origin}${userLabel}?`,
            name,
            { ...args, url, origin: meta.origin, username: meta.username }
          )
          if (!allowed) return fail(name, 'Credential access rejected by human')
          const hit = vault.getPassword(meta.id)
          if (!hit) {
            return fail(name, 'Could not decrypt saved password')
          }
          // Password returned only to the agent tool loop (local); trajectory redaction should scrub
          return ok(
            name,
            { username: hit.username, password: hit.password, id: meta.id, origin: hit.origin },
            `Found credentials for user ${hit.username || '(blank)'} on ${hit.origin}`
          )
        }

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
          if (host && isCrossHost && policy.confirmCrossHost) {
            if (!ctx.requestConfirm) {
              return fail(name, 'Cross-host new tab requires confirmation but no confirm handler is available')
            }
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

        case 'search': {
          if (ctx.signal?.aborted) return fail(name, 'Aborted')
          const query = String(args.query ?? '').trim()
          if (!query) return fail(name, 'query required')
          const searchUrl = buildAgentSearchUrl(query)
          const tabId = str(args.tabId)
          const navResult = await this.execute(
            { id: randomUUID(), name: 'navigate', args: { url: searchUrl, tabId } },
            ctx
          )
          if (!navResult.ok) {
            return fail(name, navResult.error ?? 'Search navigation failed')
          }
          if (ctx.signal?.aborted) return fail(name, 'Aborted')
          // Settle SPA results pages briefly, then pull content (BrowserOS-style)
          await abortSleep(350, ctx.signal)
          if (ctx.signal?.aborted) return fail(name, 'Aborted')
          const text = await this.tabs.extractText(tabId, 3500)
          const linksRaw = await this.tabs.extractLinks(tabId, 12)
          if (ctx.signal?.aborted) return fail(name, 'Aborted')
          // extractLinks returns { url, links: [...] } — unwrap for the model/UI
          const linkList = unwrapLinkList(linksRaw)
          const baseData =
            navResult.data && typeof navResult.data === 'object'
              ? (navResult.data as Record<string, unknown>)
              : {}
          return ok(
            name,
            {
              ...baseData,
              query,
              searchUrl,
              text: text ?? null,
              links: linkList
            },
            `Searched “${query.slice(0, 80)}”`
          )
        }

        case 'navigate': {
          if (ctx.signal?.aborted) return fail(name, 'Aborted')
          const rawInput = String(args.url ?? '').trim()
          if (!rawInput) return fail(name, 'url required')
          if (looksLikeForbiddenScheme(rawInput)) return fail(name, 'URL blocked: forbidden scheme')
          // Free text / hosts → real URL or DuckDuckGo (BrowserOS-style smart navigate)
          // normalizeUrl already runs resolveNavigableTarget
          const url = normalizeUrl(rawInput)
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
          if (host && isCrossHost && policy.confirmCrossHost) {
            if (!ctx.requestConfirm) {
              return fail(name, 'Cross-host navigation requires confirmation but no confirm handler is available')
            }
            const reason = currentHost === ''
              ? `Navigate to new host ${host}?`
              : `Navigate to new host ${host} (from ${currentHost})?`
            const allowed = await ctx.requestConfirm(reason, name, args)
            if (!allowed) return fail(name, 'Navigation rejected by human')
          }
          const started = this.tabs.navigate(resolvedId, url)
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
          return this.withAutoSnapshot(
            ok(name, { url, finalUrl }, `Navigated to ${finalUrl || url}`),
            resolvedId,
            ctx.signal
          )
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
          return this.withAutoSnapshot(ok(name, {}, 'Went back'), targetId, ctx.signal)
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
          return this.withAutoSnapshot(ok(name, {}, 'Went forward'), targetId, ctx.signal)
        }

        case 'reload': {
          const reloadId = str(args.tabId)
          const reloaded = this.tabs.reload(reloadId)
          if (!reloaded) return fail(name, 'Cannot reload')
          const loaded = await this.tabs.waitForLoad(reloadId, 15000, ctx.signal)
          if (!loaded && ctx.signal?.aborted) return fail(name, 'Aborted')
          if (!loaded) return fail(name, 'Reload timeout')
          return this.withAutoSnapshot(ok(name, {}, 'Reloaded'), reloadId, ctx.signal)
        }

        case 'get_url': {
          const tab = this.tabs.getState().find((t) =>
            args.tabId ? t.id === args.tabId : t.isActive
          )
          return ok(name, { url: tab?.url, title: tab?.title }, tab?.url ?? 'none')
        }

        case 'observe': {
          const tabId = str(args.tabId) || this.tabs.getActiveTabId() || undefined
          const snap = await this.tabs.observe(tabId)
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
              compact,
              // Stamp tabId so multi-tab ref identity / sensitive-click gates stay bound
              // to the observed page (not whichever tab is later active).
              tabId: tabId ?? snap.tabId
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
          // Avoid base64 allocation when vision is off (large string for metadata only).
          if (!ctx.vision) {
            return ok(name, { bytes: buf.length }, `Screenshot ${buf.length} bytes`)
          }
          const base64 = buf.toString('base64')
          const result = ok(
            name,
            { bytes: buf.length, base64Length: base64.length },
            `Screenshot ${buf.length} bytes`
          )
          result.image = base64
          return result
        }

        case 'click': {
          if (!args.ref && !args.selector) return fail(name, 'ref or selector required')

          const usesSelector = typeof args.selector === 'string' && args.selector.length > 0
          const clickTabId = str(args.tabId) ?? this.tabs.getActiveTabId() ?? null
          // Prefer tabId stamped on the observation (MCP multi-tab); fall back to active-tab match
          const observationMatchesTarget =
            clickTabId !== null &&
            !!ctx.lastObservation &&
            (ctx.lastObservation.tabId
              ? ctx.lastObservation.tabId === clickTabId
              : clickTabId === this.tabs.getActiveTabId())
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
                  if (policy.confirmCrossHost) {
                    if (!ctx.requestConfirm) {
                      return fail(
                        name,
                        'Cross-host click requires confirmation but no confirm handler is available'
                      )
                    }
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
          return this.withAutoSnapshot(
            ok(name, r, `Clicked ${args.ref ?? args.selector ?? r.name ?? ''}`),
            clickTabId ?? undefined,
            ctx.signal
          )
        }

        case 'type': {
          const hasText = typeof args.text === 'string'
          const rawText = hasText ? String(args.text) : ''
          // allow empty string when clear=true (wipe field)
          if (!hasText && !args.clear) return fail(name, 'text or clear=true required')
          if (!args.ref && !args.selector) return fail(name, 'ref or selector required')
          const resolved = ctx.resolver ? ctx.resolver(rawText) : rawText
          const safeArgs: ToolArgs = { ...args, text: resolved }

          // Sensitive field gate (password/otp) — align with click path
          if (ctx.requestConfirm) {
            const usesSelector = typeof args.selector === 'string' && args.selector.length > 0
            const ref = typeof args.ref === 'string' ? args.ref : ''
            const el =
              ref && ctx.lastObservation
                ? ctx.lastObservation.elements.find((e) => e.ref === ref)
                : undefined
            const identityKnown = !!el

            // Always confirm when we know the target is a password/OTP field
            if (el && looksLikePasswordField(el)) {
              const allowed = await ctx.requestConfirm(
                `Type into sensitive field “${el.name || el.role || ref}” — allow?`,
                name,
                args
              )
              if (!allowed) return fail(name, 'Type into sensitive field rejected by human')
            } else if (policy.confirmSensitiveClicks) {
              // Opaque targets can reach password fields without snapshot identity
              if (usesSelector) {
                const allowed = await ctx.requestConfirm(
                  'Type via CSS selector — element identity is opaque. Allow?',
                  name,
                  args
                )
                if (!allowed) return fail(name, 'Type rejected by human')
              } else if (!identityKnown) {
                const allowed = await ctx.requestConfirm(
                  'Type into unknown / stale ref (re-observe first?). Allow?',
                  name,
                  args
                )
                if (!allowed) return fail(name, 'Type rejected by human')
              }
            }
          }

          const typeTab = str(args.tabId)
          const r = await this.tabs.domAction('type', safeArgs, typeTab, ctx.signal)
          if (!r.ok) return fail(name, r.error ?? 'Type failed')
          return this.withAutoSnapshot(
            ok(name, r, `Typed into ${args.ref ?? args.selector ?? 'field'}`),
            typeTab,
            ctx.signal
          )
        }

        case 'hover': {
          const r = await this.tabs.domAction('hover', args, str(args.tabId), ctx.signal)
          return r.ok ? ok(name, r, 'Hovered') : fail(name, r.error ?? 'Hover failed')
        }

        case 'select_option': {
          if (args.value == null && args.label == null) return fail(name, 'value or label required')
          const selectTab = str(args.tabId)
          const r = await this.tabs.domAction('select', args, selectTab, ctx.signal)
          if (!r.ok) return fail(name, r.error ?? 'Select failed')
          return this.withAutoSnapshot(ok(name, r, 'Selected option'), selectTab, ctx.signal)
        }

        case 'press_key': {
          const keyRaw = String(args.key ?? '')
          const keyLower = keyRaw.toLowerCase()
          // Enter / numpad Enter often submits forms — same human gate as sensitive clicks.
          if (
            policy.confirmSensitiveClicks &&
            ctx.requestConfirm &&
            (keyLower === 'enter' || keyLower === 'return' || keyLower === 'numpadenter')
          ) {
            const allowed = await ctx.requestConfirm(
              'Press Enter (may submit a form). Allow?',
              name,
              args
            )
            if (!allowed) return fail(name, 'Key press rejected by human')
          }
          const keyTab = str(args.tabId)
          const r = await this.tabs.domAction('press', args, keyTab, ctx.signal)
          if (!r.ok) return fail(name, r.error ?? 'Key failed')
          // Enter often navigates — short settle then snapshot
          if (keyLower === 'enter' || keyLower === 'return' || keyLower === 'numpadenter') {
            await abortSleep(400, ctx.signal)
          }
          return this.withAutoSnapshot(ok(name, r, `Pressed ${args.key}`), keyTab, ctx.signal)
        }

        case 'scroll': {
          const scrollTab = str(args.tabId)
          const r = await this.tabs.domAction('scroll', args, scrollTab, ctx.signal)
          if (!r.ok) return fail(name, r.error ?? 'Scroll failed')
          return this.withAutoSnapshot(
            ok(name, r, `Scrolled ${args.direction ?? 'down'}`),
            scrollTab,
            ctx.signal
          )
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

        case 'list_assets': {
          const tabId = str(args.tabId)
          const kinds = parseAssetKinds(args.kinds)
          const assets = await this.tabs.listAssets(tabId, kinds)
          return ok(
            name,
            { assets, count: assets.length },
            `Found ${assets.length} asset(s)`
          )
        }

        case 'download_assets': {
          const urls = parseUrlList(args.urls)
          if (!urls.length) return fail(name, 'urls required (array or JSON/comma string)')
          // Gate each URL with the same private-host / policy rules as navigate
          const filtered: string[] = []
          const blocked: string[] = []
          for (const u of urls) {
            try {
              const parsed = new URL(u)
              if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                blocked.push(`scheme ${parsed.protocol}`)
                continue
              }
              const host = parsed.hostname.toLowerCase()
              if (
                process.env.BROWGENT_ALLOW_PRIVATE_HOSTS !== '1' &&
                isPrivateOrMetadataHost(host)
              ) {
                blocked.push(`private ${host}`)
                continue
              }
              if (!isHostAllowed(host, policy)) {
                blocked.push(`policy ${host}`)
                continue
              }
              filtered.push(parsed.href)
            } catch {
              blocked.push(`bad url ${u.slice(0, 40)}`)
            }
          }
          if (!filtered.length) {
            return fail(
              name,
              `No allowed URLs (${blocked.slice(0, 3).join('; ') || 'empty'})`
            )
          }
          if (filtered.length > 10 && ctx.requestConfirm) {
            const allowed = await ctx.requestConfirm(
              `Download ${filtered.length} assets to the downloads folder?`,
              name,
              { count: filtered.length }
            )
            if (!allowed) return fail(name, 'Download rejected by human')
          }
          const subfolder =
            typeof args.subfolder === 'string' && args.subfolder.trim()
              ? args.subfolder.trim().slice(0, 80)
              : 'browgent-assets'
          const result = await this.tabs.downloadAssets(filtered, {
            tabId: str(args.tabId),
            subfolder
          })
          if (result.started === 0) {
            return fail(
              name,
              result.errors[0] ?? 'No downloads started'
            )
          }
          return ok(
            name,
            { ...result, blocked },
            `Started ${result.started} download(s)${result.errors.length ? `; ${result.errors.length} error(s)` : ''}`
          )
        }

        case 'fill_form': {
          const tabId = str(args.tabId)
          const useProfile = args.useProfile !== false
          const dryRun = args.dryRun === true
          const fields = parseFieldsMap(args.fields)
          const profile = useProfile ? getProfileStore().get() : null
          if (useProfile && profile && !profile.agentMayUse) {
            return fail(name, 'User disabled agent access to profile (Settings → User Hub)')
          }
          let snap = ctx.lastObservation ?? null
          const activeId = tabId ?? this.tabs.getActiveTabId()
          if (!snap || (snap.tabId && activeId && snap.tabId !== activeId)) {
            snap = await this.tabs.observe(tabId)
          }
          if (!snap) return fail(name, 'Could not observe page for form fill')
          const plan = planFormFill(snap, profile, fields, useProfile)
          if (!plan.length) {
            return ok(
              name,
              { filled: [], plan: [], dryRun },
              'No matching fields to fill'
            )
          }
          if (dryRun) {
            return ok(
              name,
              {
                dryRun: true,
                plan: plan.map((p) => ({
                  ref: p.ref,
                  reason: p.reason,
                  valuePreview: p.value.slice(0, 40)
                }))
              },
              `Dry run: would fill ${plan.length} field(s)`
            )
          }
          const filled: Array<{ ref: string; reason: string; valuePreview: string }> = []
          const errors: string[] = []
          for (const item of plan) {
            if (ctx.signal?.aborted) return fail(name, 'Aborted')
            const actionArgs: ToolArgs = item.isSelect
              ? { ref: item.ref, label: item.value, value: item.value }
              : { ref: item.ref, text: item.value, clear: true }
            const r = await this.tabs.domAction(
              item.isSelect ? 'select' : 'type',
              actionArgs,
              tabId,
              ctx.signal
            )
            if (r.ok) {
              filled.push({
                ref: item.ref,
                reason: item.reason,
                valuePreview: item.value.slice(0, 40)
              })
            } else {
              errors.push(`${item.ref}: ${r.error ?? 'failed'}`)
            }
          }
          return this.withAutoSnapshot(
            ok(
              name,
              { filled, errors, count: filled.length },
              `Filled ${filled.length} field(s)${errors.length ? `; ${errors.length} error(s)` : ''}`
            ),
            tabId,
            ctx.signal
          )
        }

        case 'assert_text': {
          const needle = String(args.includes ?? '').trim()
          if (!needle) return fail(name, 'includes required')
          const data = await this.tabs.extractText(str(args.tabId), num(args.maxChars, 12000))
          const text =
            data && typeof data === 'object' && data !== null && 'text' in data
              ? String((data as { text: unknown }).text ?? '')
              : typeof data === 'string'
                ? data
                : JSON.stringify(data ?? '')
          const pass = text.toLowerCase().includes(needle.toLowerCase())
          const summary = pass
            ? `ASSERT PASS text includes “${needle.slice(0, 60)}”`
            : `ASSERT FAIL text missing “${needle.slice(0, 60)}”`
          // Always ok:true so heuristic/LLM multi-assert recipes can finish a pass/fail table
          return ok(name, { pass, includes: needle }, summary)
        }

        case 'assert_url': {
          const tab = this.tabs.getState().find((t) =>
            args.tabId ? t.id === args.tabId : t.isActive
          )
          const url = tab?.url ?? ''
          if (!url) {
            return ok(name, { pass: false, url: '' }, 'ASSERT FAIL no URL')
          }
          const includes = typeof args.includes === 'string' ? args.includes : ''
          const equals = typeof args.equals === 'string' ? args.equals : ''
          const hostWant = typeof args.host === 'string' ? args.host.toLowerCase() : ''
          let pass = true
          const reasons: string[] = []
          if (equals && url !== equals) {
            pass = false
            reasons.push(`expected equals ${equals.slice(0, 80)}`)
          }
          if (includes && !url.includes(includes)) {
            pass = false
            reasons.push(`missing “${includes.slice(0, 60)}”`)
          }
          if (hostWant) {
            const h = hostFromUrl(url) ?? ''
            if (h !== hostWant && !h.endsWith(`.${hostWant}`)) {
              pass = false
              reasons.push(`host ${h} ≠ ${hostWant}`)
            }
          }
          if (!equals && !includes && !hostWant) {
            return fail(name, 'assert_url needs includes, equals, or host')
          }
          const summary = pass
            ? `ASSERT PASS url ${url.slice(0, 100)}`
            : `ASSERT FAIL url ${url.slice(0, 80)}: ${reasons.join('; ')}`
          return ok(name, { pass, url, reasons }, summary)
        }

        case 'assert_element': {
          const ref = str(args.ref)
          const nameIncludes =
            typeof args.nameIncludes === 'string' ? args.nameIncludes.trim() : ''
          if (!ref && !nameIncludes) return fail(name, 'ref or nameIncludes required')
          const snap = await this.tabs.observe(str(args.tabId))
          if (!snap) {
            return ok(name, { pass: false }, 'ASSERT FAIL could not observe')
          }
          let hit = null as (typeof snap.elements)[0] | null
          if (ref) {
            hit = snap.elements.find((e) => e.ref === ref) ?? null
          } else if (nameIncludes) {
            const n = nameIncludes.toLowerCase()
            hit =
              snap.elements.find((e) => (e.name || '').toLowerCase().includes(n)) ?? null
          }
          if (hit) {
            return ok(
              name,
              { pass: true, element: hit },
              `ASSERT PASS element [${hit.ref}] ${hit.name || hit.tag}`
            )
          }
          return ok(
            name,
            { pass: false },
            `ASSERT FAIL no element matching ${ref ? `ref ${ref}` : `name “${nameIncludes}”`}`
          )
        }

        default:
          return fail(name, `Unknown tool: ${name}`)
      }
    } catch (e) {
      return fail(name, e instanceof Error ? e.message : 'Tool error')
    }
  }

  /**
   * BrowserOS / browser-use pattern: after each mutation, return a fresh
   * accessibility snapshot so the model does not spend a round on observe.
   */
  private async withAutoSnapshot(
    result: ToolResult,
    tabId: string | undefined,
    signal?: AbortSignal
  ): Promise<ToolResult> {
    if (!result.ok || signal?.aborted) return result
    try {
      await abortSleep(120, signal)
      if (signal?.aborted) return result
      const snap = await this.tabs.observe(tabId)
      if (!snap) return result
      const compact = snap.elements
        .slice(0, 36)
        .map(
          (e) =>
            `[${e.ref}] ${e.role}: ${e.name || e.tag}${e.href ? ` → ${e.href}` : ''}`
        )
        .join('\n')
      const base =
        result.data && typeof result.data === 'object' && !Array.isArray(result.data)
          ? (result.data as Record<string, unknown>)
          : { value: result.data }
      return {
        ...result,
        data: {
          ...base,
          snapshot: {
            url: snap.url,
            title: snap.title,
            textPreview: (snap.textPreview ?? '').slice(0, 700),
            compact,
            elementCount: snap.elements.length,
            elements: snap.elements,
            tabId: tabId ?? this.tabs.getActiveTabId() ?? undefined
          }
        },
        summary: `${result.summary} · ${snap.elements.length} els`
      }
    } catch {
      return result
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

function parseUrlList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u.trim()))
  }
  if (typeof raw !== 'string' || !raw.trim()) return []
  const t = raw.trim()
  if (t.startsWith('[')) {
    try {
      const parsed = JSON.parse(t) as unknown
      if (Array.isArray(parsed)) return parseUrlList(parsed)
    } catch {
      /* fall through */
    }
  }
  return t
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((u) => /^https?:\/\//i.test(u))
}

function parseFieldsMap(raw: unknown): Record<string, string> | undefined {
  if (!raw) return undefined
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof k === 'string' && typeof v === 'string') out[k] = v
    }
    return out
  }
  if (typeof raw === 'string' && raw.trim().startsWith('{')) {
    try {
      return parseFieldsMap(JSON.parse(raw))
    } catch {
      return undefined
    }
  }
  return undefined
}

function parseAssetKinds(raw: unknown): AssetKind[] | undefined {
  const allowed = new Set<AssetKind>(['image', 'video', 'audio', 'document', 'other'])
  const list: string[] = []
  if (Array.isArray(raw)) {
    for (const x of raw) if (typeof x === 'string') list.push(x)
  } else if (typeof raw === 'string' && raw.trim()) {
    if (raw.trim().startsWith('[')) {
      try {
        const p = JSON.parse(raw) as unknown
        if (Array.isArray(p)) return parseAssetKinds(p)
      } catch {
        /* split */
      }
    }
    list.push(...raw.split(/[\s,]+/))
  } else {
    return undefined
  }
  const kinds = list
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is AssetKind => allowed.has(s as AssetKind))
  return kinds.length ? kinds : undefined
}

/** Normalize extractLinks payload → flat array of { text, href }. */
function unwrapLinkList(raw: unknown): Array<{ text?: string; href?: string }> {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.filter((x) => x && typeof x === 'object') as Array<{
      text?: string
      href?: string
    }>
  }
  if (typeof raw === 'object') {
    const links = (raw as { links?: unknown }).links
    if (Array.isArray(links)) {
      return links.filter((x) => x && typeof x === 'object') as Array<{
        text?: string
        href?: string
      }>
    }
  }
  return []
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

function looksLikePasswordField(el: ObserveElement): boolean {
  const blob = `${el.role ?? ''} ${el.name ?? ''} ${el.tag ?? ''} ${el.placeholder ?? ''}`.toLowerCase()
  if (el.role === 'textbox' && /password|passcode|otp|one[- ]?time|2fa|totp|pin code/.test(blob)) {
    return true
  }
  return /password|passcode|otp|one[- ]?time|2fa|totp/.test(blob)
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
