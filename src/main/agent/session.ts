import { randomUUID } from 'crypto'
import type { TabManager } from '../browser/tab-manager'
import { ToolExecutor } from './executor'
import { formatObservationForUser, planNextActions } from './planner'
import {
  completeWithTools,
  getModel,
  getProviderDisplayName,
  getProviderLabel,
  isLlmConfigured,
  isVisionEnabled,
  pngDataUrl,
  buildSystemPrompt,
  slimToolResultForLlm,
  type ChatMessage,
  type LlmProvider,
  type LlmToolCall
} from './llm'
import {
  extractBrowserSearchQuery,
  extractCredentials,
  parseBrowseIntent,
  redactSecrets,
  resolveSecretPlaceholders,
  safeUrlForLlm,
  type SecretRedactionMap
} from '../../shared/sites'
import {
  DEFAULT_POLICY,
  type AgentMode,
  type AgentPolicy
} from '../../shared/policies'
import type {
  AgentAction,
  AgentMessage,
  AgentSessionState,
  AgentSessionStatus,
  ObserveSnapshot,
  PendingConfirmation,
  TabId,
  TrajectoryStep
} from '../../shared/types'
import {
  isToolName,
  PARALLEL_SAFE_TOOLS,
  type ToolArgs,
  type ToolCall,
  type ToolName,
  type ToolResult
} from '../../shared/tools'
import { MCP_READ_TOOLS } from '../../shared/mcp'

export class AgentSession {
  private status: AgentSessionStatus = 'idle'
  private mode: AgentMode = 'act'
  private policy: AgentPolicy = { ...DEFAULT_POLICY }
  private messages: AgentMessage[] = []
  private trajectory: TrajectoryStep[] = []
  private cancelled = false
  private paused = false
  private stepCount = 0
  private pendingConfirmation: PendingConfirmation | null = null
  private waitingQuestion: string | null = null
  private confirmResolver: ((ok: boolean) => void) | null = null
  private lastObservation: ObserveSnapshot | null = null
  private lastToolNotes: string[] = []
  private currentGoal = ''
  private provider: LlmProvider = getProviderLabel()
  private model: string | null = isLlmConfigured() ? getModel() : null
  private abort: AbortController | null = null
  private executor: ToolExecutor
  /** Monotonic run id — invalidates in-flight loops after stop/clear/new send */
  private runGeneration = 0
  private taskInFlight = false
  private mutationInFlight = false
  private pendingOwnershipTransfer = false
  /**
   * Snapshot so ask_human can resume the same LLM thread (goal + messages + secrets)
   * instead of starting a brand-new task from only the human's short answer.
   */
  private humanHandoff: {
    kind: 'llm' | 'heuristic'
    goal: string
    llmMessages?: ChatMessage[]
    map?: SecretRedactionMap
    visionEnabled?: boolean
  } | null = null

  constructor(
    private tabs: TabManager,
    private onChange: (state: AgentSessionState) => void,
    private onAgentRunStarted?: () => void
  ) {
    this.executor = new ToolExecutor(tabs)
    this.refreshProvider()
    const brain =
      this.provider !== 'heuristic'
        ? `Powered by **${getProviderDisplayName()}** (\`${this.model}\`) with live browser tools.`
        : 'Running in **heuristic** mode (no API key). Set `XAI_API_KEY` for Grok (default), or any OpenAI-compatible provider via `BROWGENT_PROVIDER` / `BROWGENT_API_KEY` / `BROWGENT_BASE_URL`.'
    this.pushSystem(
      `Browgent agent online. ${brain}\nModes: **act** · **research** · **watch**. Shared tabs — take over anytime. Try a **recipe** or wire **MCP** (\`npm run mcp\`).`
    )
    this.trace('system', 'Agent session started', this.provider)
    this.emit()
  }

  private refreshProvider(): void {
    this.provider = getProviderLabel()
    this.model = isLlmConfigured() ? getModel() : null
  }

  getState(): AgentSessionState {
    return {
      status: this.status,
      mode: this.mode,
      messages: this.messages,
      activeTabId: this.tabs.getActiveTabId(),
      trajectory: this.trajectory,
      pendingConfirmation: this.pendingConfirmation,
      waitingQuestion: this.waitingQuestion,
      stepCount: this.stepCount,
      maxSteps: this.policy.maxSteps,
      policy: this.policy,
      provider: this.provider,
      model: this.model
    }
  }

  setMode(mode: AgentMode): void {
    this.mode = mode
    this.policy = {
      ...this.policy,
      researchOnly: modeSetsResearchOnly(mode)
    }
    this.trace('system', `Mode → ${mode}`)
    this.pushSystem(`Mode set to **${mode}**.`)
    this.emit()
  }

  setPolicy(partial: Partial<AgentPolicy>): void {
    const next: AgentPolicy = { ...this.policy, ...partial }
    if (typeof next.maxSteps === 'number' && Number.isFinite(next.maxSteps)) {
      next.maxSteps = Math.min(100, Math.max(5, Math.round(next.maxSteps) || 40))
    } else {
      next.maxSteps = this.policy.maxSteps
    }
    if (Array.isArray(next.allowHosts)) {
      next.allowHosts = next.allowHosts
        .map((h) => String(h).toLowerCase().trim())
        .filter(Boolean)
        .slice(0, 200)
    }
    if (Array.isArray(next.blockHosts)) {
      next.blockHosts = next.blockHosts
        .map((h) => String(h).toLowerCase().trim())
        .filter(Boolean)
        .slice(0, 200)
    }
    if (!Array.isArray(next.sensitiveClickPatterns)) {
      next.sensitiveClickPatterns = this.policy.sensitiveClickPatterns
    } else {
      next.sensitiveClickPatterns = next.sensitiveClickPatterns
        .map((p) => String(p).trim())
        .filter(Boolean)
        .slice(0, 100)
    }
    next.confirmCrossHost = !!next.confirmCrossHost
    next.confirmSensitiveClicks = !!next.confirmSensitiveClicks
    next.pauseOnAskHuman = !!next.pauseOnAskHuman
    next.researchOnly = modeSetsResearchOnly(this.mode)
    this.policy = next
    this.trace('system', 'Policy updated', JSON.stringify(summarizePolicyDiff(this.policy, partial)))
    this.emit()
  }

  clear(): void {
    this.invalidateRun()
    this.status = 'idle'
    this.paused = false
    this.messages = []
    this.trajectory = []
    this.stepCount = 0
    this.pendingConfirmation = null
    this.waitingQuestion = null
    this.lastObservation = null
    this.lastToolNotes = []
    this.currentGoal = ''
    this.humanHandoff = null
    this.taskInFlight = false
    this.mutationInFlight = false
    this.pendingOwnershipTransfer = false
    this.tabs.releaseAgentTabs()
    this.refreshProvider()
    this.pushSystem('Session cleared. Shared browser tabs are unchanged.')
    this.trace('system', 'Session cleared')
    this.emit()
  }

  stop(): void {
    this.invalidateRun()
    this.status = 'idle'
    this.waitingQuestion = null
    this.pendingConfirmation = null
    this.humanHandoff = null
    this.paused = false
    this.taskInFlight = false
    this.mutationInFlight = false
    this.pendingOwnershipTransfer = false
    this.tabs.releaseAgentTabs()
    this.pushAssistant('Stopped. You own the tabs again.')
    this.trace('system', 'Agent stopped')
    this.emit()
  }

  /** Abort in-flight LLM/tool work and mark cancelled for the active generation. */
  private invalidateRun(): void {
    // Bump generation so any in-flight run exits without writing more state
    this.runGeneration++
    this.cancelled = true
    if (this.abort) {
      this.abort.abort()
      this.abort = null
    }
    this.resolveConfirm(false)
  }

  pause(): void {
    this.paused = true
    this.status = 'paused'
    this.transferOwnershipToHumanIfSafe('Paused — human takeover')
    this.emit()
  }

  resume(): void {
    this.pendingOwnershipTransfer = false
    this.paused = false
    if (this.status === 'paused') {
      // Keep a stoppable busy status while work is still in flight — idle would
      // hide Stop / Escape-to-stop in the UI even though the loop continues.
      this.status = this.taskInFlight
        ? this.waitingQuestion || this.pendingConfirmation
          ? 'waiting_human'
          : 'acting'
        : 'idle'
      if (this.taskInFlight) {
        const id = this.tabs.getActiveTabId() ?? ''
        if (id && this.tabs.has(id)) {
          this.tabs.setOwner(id, 'agent')
          this.tabs.applyGuardPolicy(id, {
            allowHosts: this.policy.allowHosts ?? [],
            blockHosts: this.policy.blockHosts ?? [],
            crossHostRequired: !!this.policy.confirmCrossHost
          })
        }
      }
    }
    this.trace('system', 'Resumed')
    this.emit()
  }

  takeover(): void {
    this.pause()
    this.pushSystem('Takeover: you control the browser. Click Resume when the agent should continue.')
    this.emit()
  }

  /**
   * Execute a single tool for external clients (MCP bridge / STDIO proxy).
   * Uses the same ToolExecutor + policy + mode as the chat agent on shared tabs.
   * Policy confirmations cannot be clicked over MCP — they fail with needsHuman.
   * Mutators are blocked during Takeover/pause and while a chat task is in flight.
   */
  async executeMcpTool(name: string, args: ToolArgs = {}): Promise<ToolResult & { needsHuman?: boolean }> {
    if (!isToolName(name)) {
      return {
        ok: false,
        tool: 'think',
        error: `Unknown tool: ${name}`,
        summary: `Unknown tool: ${name}`
      }
    }

    const isRead = MCP_READ_TOOLS.has(name)

    // Takeover / pause: only non-mutating tools (human owns the wheel)
    if ((this.paused || this.status === 'paused') && !isRead) {
      return {
        ok: false,
        tool: name,
        error: 'Session paused (takeover) — Resume in Browgent before MCP mutators',
        summary: 'Blocked: takeover/pause active',
        needsHuman: true
      }
    }

    // Chat agent running: do not race mutators on the same tabs
    if (
      (this.taskInFlight ||
        this.status === 'thinking' ||
        this.status === 'acting' ||
        this.status === 'waiting_human') &&
      !isRead
    ) {
      return {
        ok: false,
        tool: name,
        error: 'Chat agent busy — Stop or wait, or use read-only tools (observe, list_tabs, …)',
        summary: 'Blocked: agent task in flight'
      }
    }

    if (this.pendingConfirmation && !isRead) {
      return {
        ok: false,
        tool: name,
        error: 'Human confirmation pending in Browgent UI — approve or reject first',
        summary: 'Blocked: confirmation pending',
        needsHuman: true
      }
    }

    let deniedReason: string | null = null
    const call: ToolCall = { id: randomUUID(), name, args }
    try {
      const result = await this.executor.execute(call, {
        policy: this.policy,
        mode: this.mode,
        lastObservation: this.lastObservation,
        requestConfirm: async (reason: string) => {
          deniedReason = reason
          return false
        }
      })

      // Cache observe snapshot so subsequent MCP click/type refs resolve (stamp tabId).
      // Do not overwrite the chat agent's snapshot while a run is in flight — concurrent
      // MCP observe renumbers refs and breaks sensitive gates / click identity.
      const chatBusy =
        this.taskInFlight ||
        this.status === 'thinking' ||
        this.status === 'acting' ||
        this.status === 'waiting_human'
      if (
        name === 'observe' &&
        result.ok &&
        result.data &&
        typeof result.data === 'object' &&
        !chatBusy
      ) {
        const d = result.data as {
          url?: string
          title?: string
          elements?: ObserveSnapshot['elements']
          textPreview?: string
        }
        if (Array.isArray(d.elements)) {
          const obsTabId =
            typeof args.tabId === 'string' && args.tabId
              ? args.tabId
              : this.tabs.getActiveTabId() ?? undefined
          this.lastObservation = {
            url: d.url ?? '',
            title: d.title ?? '',
            elements: d.elements,
            textPreview: d.textPreview ?? '',
            tabId: obsTabId
          }
        }
      }

      if (!result.ok && deniedReason) {
        this.trace('tool', `mcp:${name}`, deniedReason, name, false)
        this.emit()
        return {
          ...result,
          error: `Confirmation required in Browgent UI: ${deniedReason}`,
          summary: `Needs human: ${deniedReason}`,
          needsHuman: true
        }
      }

      if (name === 'ask_human' && result.ok) {
        const q = String(args.question ?? result.summary ?? 'Agent needs help')
        this.waitingQuestion = q
        this.status = 'waiting_human'
        this.transferOwnershipToHumanIfSafe('MCP ask_human')
        this.trace('tool', 'mcp:ask_human', q, name, true)
        this.emit()
        return {
          ...result,
          needsHuman: true,
          summary: result.summary || 'Ask the human in Browgent (takeover / answer)'
        }
      }

      this.trace(
        'tool',
        `mcp:${name}`,
        result.ok ? result.summary : result.error,
        name,
        result.ok
      )
      this.emit()
      return result
    } finally {
      // MCP is fire-and-forget vs chat loops: release ownership so human browsing
      // is not stuck behind agent tab guards after a lone navigate/click.
      // Defer release so in-flight loadURL / redirects keep agent scheme+host guards
      // (new_tab returns before load finishes).
      if (!this.taskInFlight && !this.paused && !this.pendingConfirmation) {
        setTimeout(() => {
          if (this.taskInFlight || this.paused || this.pendingConfirmation) return
          try {
            this.tabs.releaseAgentTabs()
          } catch {
            // ignore
          }
        }, 2500)
      }
    }
  }

  private transferOwnershipToHumanIfSafe(traceLabel: string): void {
    this.pendingOwnershipTransfer = false
    if (!this.mutationInFlight) {
      const transferred = this.tabs.transferAgentTabsToHuman()
      this.trace('system', `${traceLabel} (released ${transferred} agent tab(s))`)
      return
    }
    this.trace('system', `${traceLabel} (deferred — mutation in flight)`)
    this.pendingOwnershipTransfer = true
    this.emit()
  }

  confirm(id: string): void {
    if (this.pendingConfirmation?.id === id) this.resolveConfirm(true)
  }

  reject(id: string): void {
    if (this.pendingConfirmation?.id === id) this.resolveConfirm(false)
  }

  answerHuman(text: string): void {
    // Only for ask_human handoffs — policy confirm uses confirm()/reject().
    if (this.status !== 'waiting_human' || !this.waitingQuestion) return
    if (this.pendingConfirmation) return
    const answer = text.trim()
    if (!answer) return
    this.waitingQuestion = null
    this.paused = false
    this.push('user', answer)
    this.status = 'idle'
    this.emit()

    const handoff = this.humanHandoff
    this.humanHandoff = null

    if (handoff?.kind === 'llm' && handoff.llmMessages && handoff.map) {
      void this.resumeLlmAfterHuman(answer, handoff)
      return
    }

    // Heuristic (or missing handoff): keep original goal so the model/planner
    // does not treat a short 2FA code as a brand-new task.
    const goal = handoff?.goal
      ? `Human answered your question with: ${answer}\n\nContinue the original task from where you left off:\n${handoff.goal}`
      : `Continue the previous task. Human answered: ${answer}`
    void this.runTask(goal, this.tabs.getActiveTabId() ?? undefined, { skipUserMessage: true })
  }

  exportTrajectory(): string {
    const steps = this.trajectory.map(sanitizeTrajectoryStepForExport)
    const toolSteps = steps.filter((s) => s.kind === 'tool' || s.tool)
    const payload = {
      schemaVersion: 1,
      format: 'browgent.trajectory.eval',
      exportedAt: new Date().toISOString(),
      mode: this.mode,
      provider: this.provider,
      model: this.model,
      goal: this.currentGoal ? redactTextForTrajectory(this.currentGoal).slice(0, 500) : null,
      policy: sanitizePolicyForExport(this.policy),
      stats: {
        stepCount: this.stepCount,
        trajectoryLength: steps.length,
        toolCalls: toolSteps.length,
        okTools: toolSteps.filter((s) => s.ok === true).length,
        failedTools: toolSteps.filter((s) => s.ok === false).length
      },
      /** Compact eval pack — preferred for offline grading */
      evalSteps: toolSteps.map((s, i) => ({
        i,
        ts: s.ts,
        tool: s.tool ?? null,
        ok: s.ok ?? null,
        title: s.title,
        detail: s.detail ?? null
      })),
      steps,
      messages: this.messages.map(sanitizeMessageForExport)
    }
    return JSON.stringify(payload, null, 2)
  }

  async send(userText: string, tabId?: TabId): Promise<void> {
    const text = userText.trim()
    if (!text) return
    if (this.status === 'waiting_human' && this.waitingQuestion) {
      this.answerHuman(text)
      return
    }
    // Reject concurrent tasks (pending confirmation is also human-gated).
    // Throw so renderer can restore drafts (soft return looked like success over IPC).
    if (this.status === 'waiting_human' && this.pendingConfirmation) {
      this.pushSystem('Confirm or deny the pending action before sending a new instruction.')
      this.emit()
      throw new Error('Confirm or deny the pending action before sending a new instruction.')
    }
    if (this.taskInFlight || this.status === 'thinking' || this.status === 'acting') {
      this.pushSystem('Agent is busy — Stop first, or wait for the current task to finish.')
      this.emit()
      throw new Error('Agent is busy — Stop first, or wait for the current task to finish.')
    }
    await this.runTask(text, tabId, { skipUserMessage: false })
  }

  private async runTask(
    text: string,
    tabId?: TabId,
    opts: { skipUserMessage?: boolean } = {}
  ): Promise<void> {
    // Start a new generation; previous loops (if any) see isActiveRun() === false
    this.runGeneration++
    const gen = this.runGeneration
    this.cancelled = false
    this.paused = false
    this.taskInFlight = true
    try {
      this.onAgentRunStarted?.()
    } catch {
      // metrics must never break the agent
    }
    this.currentGoal = text
    this.stepCount = 0
    this.lastToolNotes = []
    this.refreshProvider()
    this.abort = new AbortController()

    if (!opts.skipUserMessage) {
      this.push('user', text)
    }
    const redactedUserText = redactSecrets(text).redacted
    this.trace('user', redactedUserText, redactedUserText)
    this.status = 'thinking'
    this.tabs.setOwner(tabId ?? this.tabs.getActiveTabId(), 'agent')
    this.tabs.applyGuardPolicy(
      tabId ?? this.tabs.getActiveTabId() ?? '',
      {
        allowHosts: this.policy.allowHosts ?? [],
        blockHosts: this.policy.blockHosts ?? [],
        crossHostRequired: !!this.policy.confirmCrossHost
      }
    )
    this.emit()

    try {
      if (this.provider !== 'heuristic') {
        await this.runWithLlm(text, gen)
      } else {
        await this.runHeuristic(text, gen)
      }
    } catch (e) {
      if (!this.isActiveRun(gen)) return
      const err = e instanceof Error ? e.message : 'Agent error'
      this.trace('system', 'Agent error', err)
      // Fallback to heuristics only when no mutating steps ran yet (avoid re-submits).
      if (this.provider !== 'heuristic' && this.isActiveRun(gen) && this.stepCount === 0) {
        this.pushSystem(
          `${getProviderDisplayName()} error — falling back to heuristics: ${err}`
        )
        this.emit()
        try {
          await this.runHeuristic(text, gen)
        } catch (e2) {
          if (!this.isActiveRun(gen)) return
          const err2 = e2 instanceof Error ? e2.message : 'Heuristic error'
          this.pushAssistant(`Failed: ${err2}`)
          this.status = 'error'
          this.taskInFlight = false
          this.pendingOwnershipTransfer = false
          this.tabs.releaseAgentTabs()
          this.emit()
          return
        }
      } else if (this.isActiveRun(gen)) {
        this.pushAssistant(
          this.stepCount > 0
            ? `Stopped after LLM error (partial progress kept — check trajectory): ${err}`
            : `Failed: ${err}`
        )
        this.status = 'error'
        this.taskInFlight = false
        this.pendingOwnershipTransfer = false
        this.tabs.releaseAgentTabs()
        this.emit()
        return
      }
    }

    if (!this.isActiveRun(gen)) return
    // ask_human leaves the session waiting for the human
    const endedWaiting = this.waitingQuestion != null || this.pendingConfirmation != null
    if (endedWaiting) {
      this.taskInFlight = false
      this.emit()
      return
    }
    this.status = 'idle'
    this.taskInFlight = false
    this.pendingOwnershipTransfer = false
    this.tabs.releaseAgentTabs()
    this.emit()
  }

  private isActiveRun(gen: number): boolean {
    return !this.cancelled && gen === this.runGeneration
  }

  /** Keep lastObservation in sync with observe + mutator auto-snapshots. */
  private ingestToolObservation(result: ToolResult): void {
    if (!result.ok || !result.data || typeof result.data !== 'object') return
    const data = result.data as {
      snapshot?: {
        url?: string
        title?: string
        elements?: ObserveSnapshot['elements']
        textPreview?: string
        tabId?: string
      }
      elements?: ObserveSnapshot['elements']
      url?: string
      title?: string
      textPreview?: string
      tabId?: string
    }
    const snap = data.snapshot
    if (snap?.elements && Array.isArray(snap.elements)) {
      this.lastObservation = {
        url: safeUrlForLlm(snap.url ?? '', 200),
        title: snap.title ?? '',
        elements: snap.elements,
        textPreview: (snap.textPreview ?? '').slice(0, 800),
        tabId: snap.tabId
      }
      return
    }
    if (Array.isArray(data.elements)) {
      this.lastObservation = {
        url: safeUrlForLlm(data.url ?? '', 200),
        title: data.title ?? '',
        elements: data.elements,
        textPreview: (data.textPreview ?? '').slice(0, 800),
        tabId: data.tabId
      }
    }
  }

  /** Multi-turn OpenAI-compatible tool-calling loop (Grok default, any provider) */
  private async runWithLlm(goal: string, gen: number): Promise<void> {
    const visionEnabled = isVisionEnabled()
    const active = this.tabs.getState().find((t) => t.isActive)
    const safeActiveUrl = active?.url ? safeUrlForLlm(active.url) : active?.url
    const intent = parseBrowseIntent(goal)
    const creds = extractCredentials(goal)
    const { redacted: redactedGoal, map } = redactSecrets(goal)

    // Light hints only — the model owns planning for any goal (not a fixed auth script)
    let intentHint = ''
    const searchQ = extractBrowserSearchQuery(goal)
    if (searchQ || intent.siteToken === 'search') {
      const q = searchQ || intent.task || goal
      intentHint +=
        `\n\n(Hint) Web-search goal — call search with query “${q.slice(0, 120)}” immediately, ` +
        `then answer from results (extract_text if needed) and done. Do not only summarize the current tab.`
    } else if (intent.navigateUrl) {
      intentHint +=
        `\n\n(Hint) A site was recognized — navigate there and complete the user's full request:\n` +
        `- Suggested start URL: ${safeUrlForLlm(intent.navigateUrl)}\n` +
        (intent.task ? `- Remaining goal: ${intent.task}\n` : '')
    }
    // Point at values already in the user message — do NOT re-echo secrets into the prompt.
    if (creds.email || creds.password || creds.username) {
      intentHint +=
        `\n(Hint) The user message already includes credentials/values to type into the form:\n` +
        (creds.email ? `- email is present in the message (type it into the email field)\n` : '') +
        (creds.username ? `- username is present in the message\n` : '') +
        (creds.password
          ? `- password is present in the message — type it into the password field; never repeat it in chat or think text\n`
          : '')
    }
    if (this.mode === 'act') {
      intentHint +=
        `\nACT mode: use browser tools to carry out whatever they asked. Do not only describe the page.`
    }

    const llmMessages: ChatMessage[] = [
      {
        role: 'system',
        content: buildSystemPrompt(this.mode, safeActiveUrl, active?.title, visionEnabled)
      },
      { role: 'user', content: redactedGoal + intentHint }
    ]

    // Fast path: clear web-search goals → run search before the model thinks
    // (saves 1–2 LLM rounds for "cheapest X" / "find Y on browser")
    let preSearched = false
    if (
      this.isActiveRun(gen) &&
      this.mode !== 'watch' &&
      (searchQ || intent.siteToken === 'search')
    ) {
      const q = (searchQ || intent.task || goal).trim().slice(0, 200)
      if (q) {
        try {
          this.status = 'acting'
          this.emit()
          const result = await this.executor.execute(
            { id: randomUUID(), name: 'search', args: { query: q } },
            {
              policy: this.policy,
              mode: this.mode,
              requestConfirm: (reason, tool, args) => this.waitForConfirm(reason, tool, args),
              lastObservation: this.lastObservation,
              signal: this.abort?.signal,
              vision: visionEnabled
            }
          )
          if (this.isActiveRun(gen) && result.ok) {
            this.stepCount++
            preSearched = true
            this.ingestToolObservation(result)
            this.trace(
              'tool',
              redactTextForTrajectory(result.summary ?? `Searched “${q}”`),
              undefined,
              'search',
              true,
              scrubDataForTrajectory(result.data)
            )
            const slim = slimToolResultForLlm(
              scrubSensitiveUrlFields({
                ok: true,
                summary: result.summary,
                data: scrubDataForTrajectory(result.data)
              })
            )
            llmMessages.push({
              role: 'user',
              content:
                `(Pre-search already executed for “${q}”.)\n` +
                `Tool result:\n${slim}\n\n` +
                `Continue: answer from these results with done, or click a result ref if you need a deeper page. Do not search again unless results are empty/useless.`
            })
          }
        } catch (e) {
          if (this.isActiveRun(gen)) {
            this.trace(
              'system',
              'Pre-search failed — model will retry',
              e instanceof Error ? e.message : String(e)
            )
          }
        }
      }
    }

    // Seed with a live snapshot when we did not already open search results
    if (!preSearched) {
      const liveUrl = active?.url ?? ''
      if (liveUrl && liveUrl !== 'about:blank' && !/^about:/i.test(liveUrl)) {
        try {
          const snap = await this.tabs.observe(active?.id)
          if (snap) {
            this.lastObservation = {
              url: safeUrlForLlm(snap.url ?? '', 200),
              title: snap.title ?? '',
              elements: snap.elements ?? [],
              textPreview: (snap.textPreview ?? '').slice(0, 800),
              tabId: active?.id
            }
            const compact = (snap.elements ?? [])
              .slice(0, 28)
              .map(
                (e) =>
                  `[${e.ref}] ${e.role}: ${e.name || e.tag}${e.href ? ` → ${e.href}` : ''}`
              )
              .join('\n')
            llmMessages.push({
              role: 'user',
              content:
                `(Live snapshot) ${snap.title || 'Page'} — ${safeUrlForLlm(snap.url ?? '', 200)}\n` +
                `${(snap.textPreview ?? '').replace(/\s+/g, ' ').trim().slice(0, 400)}\n` +
                (compact ? `Interactive:\n${compact}` : '')
            })
          } else {
            llmMessages.push({
              role: 'user',
              content: `(Context) Active tab: ${active?.title || 'untitled'} — ${safeActiveUrl}`
            })
          }
        } catch {
          llmMessages.push({
            role: 'user',
            content: `(Context) Active tab: ${active?.title || 'untitled'} — ${safeActiveUrl}`
          })
        }
      }
    }

    if (!this.isActiveRun(gen)) return
    await this.continueLlmLoop(llmMessages, map, visionEnabled, gen)
  }

  /** Multi-step heuristic planner (no API key) */
  private async runHeuristic(goal: string, gen: number): Promise<void> {
    let step = 0
    const assistantId = randomUUID()
    const actions: AgentAction[] = []
    this.messages.push({
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      actions
    })
    this.trimMessages()
    this.status = 'acting'
    this.emit()

    let finalSummary = ''
    let observationDump = ''
    // Multi-step goals (e.g. go to site + sign up) need more heuristic loops
    const intent = parseBrowseIntent(goal)
    const maxLoops = Math.min(intent.task ? 12 : 8, this.policy.maxSteps)

    while (step < maxLoops && this.isActiveRun(gen)) {
      while (this.paused && this.isActiveRun(gen)) await sleep(150)
      if (!this.isActiveRun(gen)) break
      if (this.stepCount >= this.policy.maxSteps) {
        finalSummary = 'Stopped: max steps reached (policy).'
        break
      }

      const active = this.tabs.getState().find((t) => t.isActive)
      const plan = planNextActions({
        goal,
        mode: this.mode,
        step,
        lastObservation: this.lastObservation,
        lastToolResults: this.lastToolNotes,
        pageUrl: active?.url,
        pageTitle: active?.title
      })

      if (plan.length === 0) break

      let finished = false

      for (const call of plan) {
        if (!this.isActiveRun(gen)) break
        while (this.paused && this.isActiveRun(gen)) await sleep(150)
        if (!this.isActiveRun(gen)) break

        const action: AgentAction = {
          type: call.name,
          label: call.name,
          detail: summarizeArgs(call),
          status: 'running'
        }
        actions.push(action)
        this.emit()

        if (call.name === 'ask_human') {
          action.status = 'waiting'
          this.waitingQuestion = String(call.args.question ?? 'Need your help')
          this.status = 'waiting_human'
          this.transferOwnershipToHumanIfSafe('Waiting for human')
          if (this.policy.pauseOnAskHuman) this.paused = true
          this.humanHandoff = { kind: 'heuristic', goal }
          this.trace('tool', 'ask_human', this.waitingQuestion)
          this.emit()
          return
        }

        this.mutationInFlight = isMutatingTool(call.name)
        let result
        try {
          result = await this.executor.execute(call, {
            policy: this.policy,
            mode: this.mode,
            requestConfirm: (reason, tool, args) => this.waitForConfirm(reason, tool, args),
            lastObservation: this.lastObservation,
            signal: this.abort?.signal
          })
        } finally {
          this.mutationInFlight = false
          if (this.pendingOwnershipTransfer && this.isActiveRun(gen)) {
            this.pendingOwnershipTransfer = false
            this.tabs.transferAgentTabsToHuman()
          } else if (this.pendingOwnershipTransfer) {
            this.pendingOwnershipTransfer = false
          }
        }

        if (!this.isActiveRun(gen)) {
          if (action.status === 'running') {
            action.status = 'error'
            action.detail = 'Stopped'
            this.emit()
          }
          return
        }

        this.stepCount++
        const summaryText = redactTextForTrajectory(result.summary ?? '')
        this.lastToolNotes.push(summaryText)
        if (this.lastToolNotes.length > 40) this.lastToolNotes = this.lastToolNotes.slice(-30)
        this.trace('tool', summaryText, undefined, call.name, result.ok, scrubDataForTrajectory(result.data))

        this.ingestToolObservation(result)
        if (result.ok && result.data) {
          if (call.name === 'observe' || call.name === 'navigate') {
            observationDump += `\n\n${formatObservationForUser(
              (result.data as { snapshot?: unknown }).snapshot ?? result.data
            )}`
          } else if (call.name === 'search' || call.name === 'extract_text') {
            observationDump += `\n\n${formatObservationForUser(result.data)}`
          }
        }

        action.status = result.ok ? 'done' : 'error'
        if (!result.ok) action.detail = result.error
        this.emit()

        if (call.name === 'done' && result.ok) {
          finalSummary = String(call.args.summary ?? summaryText)
          finished = true
          break
        }

        // Do not keep running a success-framed plan after a real tool failure
        // (avoids heuristic "Web search complete" after a blocked navigate/search).
        if (!result.ok && call.name !== 'think' && call.name !== 'done') {
          finalSummary =
            finalSummary ||
            `Stopped after ${call.name} failed: ${result.error ?? summaryText}`
          finished = true
          break
        }
      }

      if (finished) break
      step++
    }

    if (!this.isActiveRun(gen)) return

    let reply =
      finalSummary ||
      'Finished this step. Check the trajectory for tool results.'
    // Always surface extracts/search previews in chat (was wrongly skipped for "Searched for…")
    if (observationDump.trim()) {
      reply = `${reply}\n${observationDump.slice(0, 2800)}`
    }

    await this.streamAssistant(assistantId, reply, gen)
    if (this.isActiveRun(gen)) this.trace('assistant', redactTextForTrajectory(reply).slice(0, 200))
  }

  private async streamAssistant(messageId: string, reply: string, gen?: number): Promise<void> {
    const msg = this.messages.find((m) => m.id === messageId)
    if (!msg) {
      if (gen === undefined || this.isActiveRun(gen)) this.pushAssistant(reply)
      return
    }
    // Single emit — fake per-chunk streaming was multi-KB IPC storms over full agent state
    if (gen !== undefined && !this.isActiveRun(gen)) return
    if (this.cancelled) return
    msg.content = reply
    this.trimMessages()
    this.emit()
  }

  private trimMessages(): void {
    const MAX = 80
    if (this.messages.length > MAX) {
      const head = this.messages[0]
      const tail = this.messages.slice(-(MAX - 1))
      this.messages = head?.role === 'system' ? [head, ...tail.filter((m) => m.id !== head.id)] : tail
    }
    // Cap actions arrays so long tool loops don't bloat IPC
    for (const m of this.messages) {
      if (m.actions && m.actions.length > 40) {
        m.actions = m.actions.slice(-40)
      }
    }
  }

  private waitForConfirm(
    reason: string,
    tool: ToolName,
    args: ToolArgs
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const id = randomUUID()
      const waitGen = this.runGeneration
      this.pendingConfirmation = { id, reason, tool, args }
      this.status = 'waiting_human'

      const wasInFlight = this.mutationInFlight
      const targetTabId =
        typeof args.tabId === 'string' ? args.tabId : this.tabs.getActiveTabId()
      this.mutationInFlight = false

      this.trace('policy', reason, tool)
      this.confirmResolver = (ok) => {
        this.pendingConfirmation = null
        this.confirmResolver = null

        // Capture waitGen at create time — isActiveRun(this.runGeneration) is always
        // true for the current gen and cannot detect a bumped generation.
        // Do not treat pause as automatic reject: user may inspect then Accept.
        const takenOver = this.cancelled || !this.isActiveRun(waitGen)

        if (!ok || takenOver) {
          this.pendingOwnershipTransfer = false
          this.mutationInFlight = wasInFlight
          if (this.status === 'waiting_human') this.status = 'acting'
          this.emit()
          resolve(false)
          return
        }

        if (this.paused) {
          this.paused = false
        }

        if (targetTabId && this.tabs.has(targetTabId)) {
          this.tabs.setOwner(targetTabId, 'agent')
          this.tabs.applyGuardPolicy(targetTabId, {
            allowHosts: this.policy.allowHosts ?? [],
            blockHosts: this.policy.blockHosts ?? [],
            crossHostRequired: !!this.policy.confirmCrossHost
          })
        }
        this.pendingOwnershipTransfer = false
        this.mutationInFlight = wasInFlight
        if (this.status === 'waiting_human' || this.status === 'paused') {
          this.status = 'acting'
        }
        this.emit()
        resolve(true)
      }
      this.emit()
    })
  }

  /**
   * Continue an LLM tool loop after ask_human, preserving prior messages and
   * the secret redaction map from the interrupted run.
   */
  private async resumeLlmAfterHuman(
    answer: string,
    handoff: {
      kind: 'llm' | 'heuristic'
      goal: string
      llmMessages?: ChatMessage[]
      map?: SecretRedactionMap
      visionEnabled?: boolean
    }
  ): Promise<void> {
    const baseMessages = handoff.llmMessages
    const map = handoff.map
    if (!baseMessages || !map) {
      const goal = `Human answered: ${answer}\n\nContinue:\n${handoff.goal}`
      await this.runTask(goal, this.tabs.getActiveTabId() ?? undefined, { skipUserMessage: true })
      return
    }

    this.runGeneration++
    const gen = this.runGeneration
    this.cancelled = false
    this.paused = false
    this.taskInFlight = true
    this.currentGoal = handoff.goal
    this.refreshProvider()
    this.abort = new AbortController()

    const tabId = this.tabs.getActiveTabId()
    this.tabs.setOwner(tabId, 'agent')
    this.tabs.applyGuardPolicy(tabId ?? '', {
      allowHosts: this.policy.allowHosts ?? [],
      blockHosts: this.policy.blockHosts ?? [],
      crossHostRequired: !!this.policy.confirmCrossHost
    })

    const llmMessages: ChatMessage[] = [
      ...baseMessages,
      {
        role: 'user',
        content:
          `Human answered your ask_human question:\n${answer}\n\n` +
          `Continue the original task using tools. Do not re-ask unless still blocked.`
      }
    ]

    this.status = 'thinking'
    this.emit()

    try {
      await this.continueLlmLoop(llmMessages, map, Boolean(handoff.visionEnabled), gen)
    } catch (e) {
      if (!this.isActiveRun(gen)) return
      const err = e instanceof Error ? e.message : 'Agent error'
      this.trace('system', 'Agent error after human reply', err)
      this.pushAssistant(`Failed after human reply: ${err}`)
      this.status = 'error'
      this.taskInFlight = false
      this.pendingOwnershipTransfer = false
      this.tabs.releaseAgentTabs()
      this.emit()
      return
    }

    if (!this.isActiveRun(gen)) return
    const endedWaiting = this.waitingQuestion != null || this.pendingConfirmation != null
    if (endedWaiting) {
      this.taskInFlight = false
      this.emit()
      return
    }
    this.status = 'idle'
    this.taskInFlight = false
    this.pendingOwnershipTransfer = false
    this.tabs.releaseAgentTabs()
    this.emit()
  }

  /** Shared LLM tool loop used by runWithLlm and resumeLlmAfterHuman. */
  private async continueLlmLoop(
    llmMessages: ChatMessage[],
    map: SecretRedactionMap,
    visionEnabled: boolean,
    gen: number
  ): Promise<void> {
    const assistantId = randomUUID()
    const actions: AgentAction[] = []
    this.messages.push({
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      actions
    })
    this.trimMessages()
    this.emit()

    let finalSummary = ''
    let rounds = 0
    let textOnlyNudges = 0
    const maxRounds = Math.min(this.policy.maxSteps, 24)
    const maxTextNudges = 2
    const secretResolver = (text: string): string => resolveSecretPlaceholders(text, map)
    // Goal string for handoff storage only
    const goal = this.currentGoal

    while (rounds < maxRounds && this.isActiveRun(gen)) {
      while (this.paused && this.isActiveRun(gen)) await sleep(150)
      if (!this.isActiveRun(gen)) break
      if (this.stepCount >= this.policy.maxSteps) {
        finalSummary = 'Stopped: max steps reached (policy).'
        break
      }

      this.status = 'thinking'
      this.emit()

      if (visionEnabled) keepOnlyLatestImage(llmMessages)

      let turn
      try {
        turn = await completeWithTools(llmMessages, this.mode, this.abort?.signal)
      } catch (e) {
        if (!this.isActiveRun(gen) || (e instanceof Error && e.name === 'AbortError')) return
        throw e
      }

      if (!this.isActiveRun(gen)) return

      const toolCalls = turn.toolCalls ?? []

      if (toolCalls.length === 0) {
        const text = (turn.content || '').trim()
        const shouldNudge =
          this.mode === 'act' &&
          textOnlyNudges < maxTextNudges &&
          (this.stepCount === 0 || looksLikePassiveDescription(text))

        if (shouldNudge) {
          textOnlyNudges++
          if (text) {
            llmMessages.push({ role: 'assistant', content: text })
          }
          llmMessages.push({
            role: 'user',
            content:
              'Stop describing. Call browser tools now (search / navigate / click / type / extract_text / done). ' +
              'For "find/cheapest/what is" goals: call search first. Mutators already return snapshots — do not only observe. ' +
              'Only call done when finished or blocked on CAPTCHA/2FA.'
          })
          this.trace('system', 'Nudged model to use tools (text-only reply)')
          rounds++
          continue
        }

        finalSummary = text || 'Done.'
        break
      }

      llmMessages.push({
        role: 'assistant',
        content: turn.content,
        tool_calls: toolCalls
      })

      this.status = 'acting'
      this.emit()

      let hitDone = false
      let hitAskHuman = false
      const pendingImages: string[] = []

      // Parallelize pure read tools (extract_text + extract_links) like BrowserOS multi-tool turns
      const parallelOk =
        toolCalls.length > 1 &&
        toolCalls.every((tc) => {
          const n = tc.function?.name
          return Boolean(n && isToolName(n) && PARALLEL_SAFE_TOOLS.has(n))
        })

      if (parallelOk) {
        const prepared = toolCalls.map((tc) => {
          const rawCall = toolCallFromLlm(tc)
          if (!rawCall) {
            return { tc, error: `Unknown tool: ${tc.function.name}` as string }
          }
          const redactedArgs = scrubCallArgsForTrajectory(rawCall)
          const resolvedArgs = resolveCallPlaceholders(rawCall, map)
          const redactedCall: ToolCall = { id: rawCall.id, name: rawCall.name, args: redactedArgs }
          const resolvedCall: ToolCall = { id: rawCall.id, name: rawCall.name, args: resolvedArgs }
          const action: AgentAction = {
            type: redactedCall.name,
            label: redactedCall.name,
            detail: summarizeArgs(redactedCall),
            status: 'running'
          }
          actions.push(action)
          return { tc, redactedCall, resolvedCall, action }
        })
        this.emit()

        const settled = await Promise.all(
          prepared.map(async (p) => {
            if ('error' in p && p.error && !('resolvedCall' in p)) {
              return { ...p, result: null as ToolResult | null }
            }
            if (!('resolvedCall' in p) || !p.resolvedCall || !p.action) {
              return { ...p, result: null as ToolResult | null }
            }
            if (!this.isActiveRun(gen) || this.abort?.signal.aborted) {
              p.action.status = 'error'
              p.action.detail = 'Stopped'
              return { ...p, result: null as ToolResult | null }
            }
            try {
              const result = await this.executor.execute(p.resolvedCall, {
                policy: this.policy,
                mode: this.mode,
                lastObservation: this.lastObservation,
                signal: this.abort?.signal,
                resolver: secretResolver,
                vision: visionEnabled
              })
              return { ...p, result }
            } catch (e) {
              const err = e instanceof Error ? e.message : 'Tool error'
              return {
                ...p,
                result: {
                  ok: false,
                  tool: p.resolvedCall.name,
                  error: err,
                  summary: err
                } as ToolResult
              }
            }
          })
        )

        // Always finalize action statuses even if the run was stopped — otherwise UI chips stick on "running".
        // Skip further LLM/message mutation that would corrupt a newer generation.
        const runStillActive = this.isActiveRun(gen)
        for (const item of settled) {
          if ('error' in item && item.error && !item.result) {
            if (runStillActive) {
              llmMessages.push({
                role: 'tool',
                tool_call_id: item.tc.id,
                content: JSON.stringify({ ok: false, error: item.error })
              })
            }
            continue
          }
          const result = item.result
          const redactedCall = 'redactedCall' in item ? item.redactedCall : null
          const action = 'action' in item ? item.action : null
          if (!result || !redactedCall || !action) {
            if (action && action.status === 'running') {
              action.status = 'error'
              action.detail = 'Stopped'
            }
            if (runStillActive) {
              llmMessages.push({
                role: 'tool',
                tool_call_id: item.tc.id,
                content: JSON.stringify({ ok: false, error: 'Aborted' })
              })
            }
            continue
          }
          if (action.status === 'running') {
            action.status = result.ok ? 'done' : 'error'
            if (!result.ok) action.detail = result.error
          }
          if (!runStillActive) continue
          this.stepCount++
          const summaryText = redactTextForTrajectory(result.summary ?? '')
          this.lastToolNotes.push(summaryText)
          if (this.lastToolNotes.length > 40) this.lastToolNotes = this.lastToolNotes.slice(-30)
          this.trace(
            'tool',
            summaryText,
            undefined,
            redactedCall.name,
            result.ok,
            scrubDataForTrajectory(result.data)
          )
          this.ingestToolObservation(result)
          llmMessages.push({
            role: 'tool',
            tool_call_id: item.tc.id,
            content: formatLlmToolContent(redactedCall.name, result, summaryText, map)
          })
          if (visionEnabled && redactedCall.name === 'screenshot' && result.ok && result.image) {
            pendingImages.push(result.image)
          }
        }
        this.emit()
        if (!runStillActive) return
      } else {
        for (const tc of toolCalls) {
          if (!this.isActiveRun(gen)) break
          while (this.paused && this.isActiveRun(gen)) await sleep(150)
          if (!this.isActiveRun(gen)) break

          if (this.abort?.signal.aborted) {
            llmMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify({ ok: false, error: 'Aborted before execution' })
            })
            continue
          }

          const rawCall = toolCallFromLlm(tc)
          if (!rawCall) {
            llmMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify({ ok: false, error: `Unknown tool: ${tc.function.name}` })
            })
            continue
          }

          const redactedArgs = scrubCallArgsForTrajectory(rawCall)
          const resolvedArgs = resolveCallPlaceholders(rawCall, map)
          const redactedCall: ToolCall = { id: rawCall.id, name: rawCall.name, args: redactedArgs }
          const resolvedCall: ToolCall = { id: rawCall.id, name: rawCall.name, args: resolvedArgs }

          const action: AgentAction = {
            type: redactedCall.name,
            label: redactedCall.name,
            detail: summarizeArgs(redactedCall),
            status: 'running'
          }
          actions.push(action)
          this.emit()

          if (redactedCall.name === 'ask_human') {
            action.status = 'waiting'
            this.waitingQuestion = String(redactedCall.args.question ?? 'Need your help')
            this.status = 'waiting_human'
            this.transferOwnershipToHumanIfSafe('Waiting for human')
            if (this.policy.pauseOnAskHuman) this.paused = true
            this.trace('tool', 'ask_human', this.waitingQuestion, 'ask_human', true)
            llmMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify({ ok: true, note: 'Waiting for human reply' })
            })
            // Pad remaining tool_calls so resumeLlmAfterHuman does not 400 (missing tool results).
            const askIdx = toolCalls.indexOf(tc)
            for (let i = askIdx + 1; i < toolCalls.length; i++) {
              const skipped = toolCalls[i]
              llmMessages.push({
                role: 'tool',
                tool_call_id: skipped.id,
                content: JSON.stringify({ ok: false, error: 'Skipped: waiting for human' })
              })
            }
            this.humanHandoff = {
              kind: 'llm',
              goal,
              llmMessages: [...llmMessages],
              map,
              visionEnabled
            }
            this.emit()
            hitAskHuman = true
            break
          }

          this.mutationInFlight = isMutatingTool(redactedCall.name)
          let result
          try {
            result = await this.executor.execute(resolvedCall, {
              policy: this.policy,
              mode: this.mode,
              requestConfirm: (reason, tool, args) => this.waitForConfirm(reason, tool, args),
              lastObservation: this.lastObservation,
              signal: this.abort?.signal,
              resolver: secretResolver,
              vision: visionEnabled
            })
          } finally {
            this.mutationInFlight = false
            if (this.pendingOwnershipTransfer && this.isActiveRun(gen)) {
              this.pendingOwnershipTransfer = false
              this.tabs.transferAgentTabsToHuman()
            } else if (this.pendingOwnershipTransfer) {
              this.pendingOwnershipTransfer = false
            }
          }

          if (!this.isActiveRun(gen)) {
            if (action.status === 'running') {
              action.status = 'error'
              action.detail = 'Stopped'
              this.emit()
            }
            return
          }

          this.stepCount++
          const summaryText = redactTextForTrajectory(result.summary ?? '')
          this.lastToolNotes.push(summaryText)
          if (this.lastToolNotes.length > 40) this.lastToolNotes = this.lastToolNotes.slice(-30)
          this.trace(
            'tool',
            summaryText,
            undefined,
            redactedCall.name,
            result.ok,
            scrubDataForTrajectory(result.data)
          )

          this.ingestToolObservation(result)

          action.status = result.ok ? 'done' : 'error'
          if (!result.ok) action.detail = result.error
          this.emit()

          llmMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: formatLlmToolContent(redactedCall.name, result, summaryText, map)
          })

          if (visionEnabled && redactedCall.name === 'screenshot' && result.ok && result.image) {
            pendingImages.push(result.image)
          }

          if (redactedCall.name === 'done') {
            finalSummary = String(redactedCall.args.summary ?? summaryText)
            hitDone = true
            break
          }
        }
      }

      for (const img of pendingImages) {
        llmMessages.push({
          role: 'user',
          content: [
            { type: 'text', text: 'Screenshot of the current viewport:' },
            { type: 'image_url', image_url: { url: pngDataUrl(img), detail: 'auto' } }
          ]
        })
      }

      if (hitAskHuman) return
      if (hitDone) break
      rounds++
    }

    if (!this.isActiveRun(gen)) return
    if (!finalSummary) {
      finalSummary =
        rounds >= maxRounds
          ? 'Reached step limit before finishing. Check the trajectory and try a more specific request.'
          : 'Finished this pass. Check the trajectory for details.'
    }

    await this.streamAssistant(assistantId, finalSummary, gen)
    if (this.isActiveRun(gen)) this.trace('assistant', redactTextForTrajectory(finalSummary).slice(0, 200))
  }

  private resolveConfirm(ok: boolean): void {
    if (this.confirmResolver) this.confirmResolver(ok)
  }

  private pushSystem(content: string): void {
    this.push('system', content)
  }

  private pushAssistant(content: string): void {
    this.push('assistant', content)
  }

  private push(role: AgentMessage['role'], content: string): void {
    this.messages.push({
      id: randomUUID(),
      role,
      content,
      timestamp: Date.now()
    })
  }

  private trace(
    kind: TrajectoryStep['kind'],
    title: string,
    detail?: string,
    tool?: ToolName,
    ok?: boolean,
    data?: unknown
  ): void {
    this.trajectory.push({
      id: randomUUID(),
      ts: Date.now(),
      kind,
      title,
      detail,
      tool,
      ok,
      data: data && typeof data === 'object' ? slimData(data) : data
    })
    if (this.trajectory.length > 200) {
      this.trajectory = this.trajectory.slice(-150)
    }
  }

  private emit(): void {
    this.onChange(this.getState())
  }
}

function toolCallFromLlm(tc: LlmToolCall): ToolCall | null {
  const name = tc.function?.name
  if (!name || !isToolName(name)) return null
  let args: ToolArgs = {}
  try {
    args = JSON.parse(tc.function.arguments || '{}') as ToolArgs
  } catch {
    args = {}
  }
  return { id: tc.id || randomUUID(), name, args }
}

function summarizeArgs(c: ToolCall): string {
  const a = c.args
  if (typeof a.query === 'string' && a.query) return a.query.slice(0, 60)
  if (a.url) return String(a.url)
  if (a.ref) return String(a.ref)
  if (a.text != null && String(a.text).length > 0) {
    // Never show typed secrets in action chips / trajectory titles
    if (c.name === 'type' && looksSecretText(String(a.text))) return '••••••'
    return String(a.text).slice(0, 40)
  }
  if (a.summary) return String(a.summary).slice(0, 60)
  if (a.thought) return String(a.thought).slice(0, 60)
  if (a.question) return String(a.question).slice(0, 60)
  if (a.key) return String(a.key)
  if (a.direction) return String(a.direction)
  return ''
}

/** Heuristic: likely password / token — hide from UI summaries. */
function looksSecretText(text: string): boolean {
  if (text.length >= 8 && /[A-Za-z]/.test(text) && /\d/.test(text)) return true
  if (text.length >= 12 && !/\s/.test(text)) return true
  return false
}

/** Heuristic: model is narrating / listing refs instead of finishing a real browser task */
function looksLikePassiveDescription(text: string): boolean {
  if (!text) return true
  const lower = text.toLowerCase()
  if (
    /i inspected|trajectory shows|interactive elements|use research mode|ask me to click|click\/type by ref|say [“"]?click e\d|here (are|is) (the )?element/i.test(
      lower
    )
  ) {
    return true
  }
  // Long element dumps without claiming completion
  if (/\[e\d+\]/.test(lower) && !/\b(done|finished|completed|signed up|created|logged in)\b/i.test(lower)) {
    return true
  }
  return false
}

/**
 * Build LLM tool message content. Trajectory stays scrubbed via scrubDataForTrajectory;
 * profile/credentials must remain usable for form fill (passwords → secret placeholders).
 */
function formatLlmToolContent(
  toolName: ToolName,
  result: ToolResult,
  summaryText: string,
  map: SecretRedactionMap
): string {
  if (!result.ok) {
    return slimToolResultForLlm({ ok: false, error: result.error, summary: summaryText })
  }

  if (toolName === 'get_credentials' && result.data && typeof result.data === 'object') {
    const d = result.data as { username?: string; password?: string; id?: string }
    let passwordField: string | undefined
    if (typeof d.password === 'string' && d.password) {
      const n = map.placeholders.length + 1
      const ph = `[BROWGENT_SECRET_${n}]`
      map.placeholders.push(ph)
      map.rawByPlaceholder[ph] = d.password
      passwordField = ph
    }
    return slimToolResultForLlm({
      ok: true,
      summary: summaryText,
      data: {
        username: d.username ?? '',
        password: passwordField ?? '',
        id: d.id,
        note: 'Type password via the placeholder string — it resolves locally only.'
      }
    })
  }

  if (toolName === 'get_profile') {
    // Contact fields are intentional for fill; do not email-scrub them for the model.
    return slimToolResultForLlm({
      ok: true,
      summary: summaryText,
      data: result.data
    })
  }

  const sanitizedPayload = {
    ok: true,
    summary: summaryText,
    data: scrubDataForTrajectory(result.data)
  }
  return slimToolResultForLlm(scrubSensitiveUrlFields(sanitizedPayload))
}

function slimData(data: unknown): unknown {
  try {
    const s = JSON.stringify(data)
    if (s.length < 2000) return data
    return { truncated: true, preview: s.slice(0, 1500) }
  } catch {
    return undefined
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function messageHasImage(m: ChatMessage): boolean {
  return Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url')
}

/**
 * Vision context control: keep only the newest screenshot image; collapse older
 * image messages to a text placeholder. Bounds token cost on multi-screenshot runs.
 */
function keepOnlyLatestImage(messages: ChatMessage[]): void {
  let lastIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messageHasImage(messages[i])) {
      lastIdx = i
      break
    }
  }
  if (lastIdx < 0) return
  for (let i = 0; i < lastIdx; i++) {
    if (messageHasImage(messages[i])) {
      messages[i] = { role: 'user', content: '[earlier screenshot omitted to save context]' }
    }
  }
}

const SECRET_PLACEHOLDER_RE = /\[BROWGENT_SECRET_\d+\]/g
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const URL_VALUE_RE = /\b((?:https?|file|data|javascript|ftp):\/\/[^\s"'<>)]+)/g

function redactTextForTrajectory(text: string): string {
  if (!text) return text
  let out = text.replace(SECRET_PLACEHOLDER_RE, '[REDACTED]')
  out = out.replace(EMAIL_RE, '[REDACTED_EMAIL]')
  out = out.replace(URL_VALUE_RE, (m) => safeUrlForLlm(m, 200))
  return out
}

function scrubCallArgsForTrajectory(call: ToolCall): ToolArgs {
  const args: ToolArgs = { ...call.args }
  if (call.name === 'type') {
    const raw = typeof args.text === 'string' ? args.text : ''
    if (looksSecretText(raw) || SECRET_PLACEHOLDER_RE.test(raw)) args.text = '[REDACTED]'
    SECRET_PLACEHOLDER_RE.lastIndex = 0
  }
  if (typeof args.url === 'string') args.url = safeUrlForLlm(args.url, 200)
  if (typeof args.summary === 'string') args.summary = redactTextForTrajectory(args.summary)
  if (typeof args.question === 'string') args.question = redactTextForTrajectory(args.question)
  if (typeof args.thought === 'string') args.thought = redactTextForTrajectory(args.thought)
  return args
}

function resolveCallPlaceholders(call: ToolCall, map: SecretRedactionMap): ToolArgs {
  const args: ToolArgs = { ...call.args }
  for (const key of Object.keys(args)) {
    const v = args[key]
    if (typeof v === 'string') args[key] = resolveSecretPlaceholders(v, map)
  }
  return args
}

function scrubDataForTrajectory(data: unknown): unknown {
  if (data == null) return data
  if (typeof data === 'string') return redactTextForTrajectory(data)
  try {
    const visited = new WeakSet<object>()
    const walk = (v: unknown): unknown => {
      if (v == null) return v
      if (typeof v === 'string') return redactTextForTrajectory(v)
      if (Array.isArray(v)) {
        // Cap huge arrays (e.g. raw elements[] must never land in trajectory)
        if (v.length > 80) return v.slice(0, 80).map(walk).concat([`…+${v.length - 80} more`])
        return v.map(walk)
      }
      if (typeof v === 'object') {
        const obj = v as Record<string, unknown>
        if (visited.has(obj)) return '[Circular]'
        visited.add(obj)
        const out: Record<string, unknown> = {}
        for (const [k, val] of Object.entries(obj)) {
          // Auto-snapshots carry full elements for in-session refs; trajectory only needs count + compact
          if (k === 'elements' && Array.isArray(val)) {
            out.elementCount = val.length
            continue
          }
          if (k === 'value' && typeof val === 'string' && val.length > 0) {
            out[k] = '[REDACTED]'
          } else if (k === 'url' || k === 'href' || k === 'finalUrl' || k === 'searchUrl') {
            out[k] = typeof val === 'string' ? safeUrlForLlm(val, 200) : walk(val)
          } else if (k === 'password' || k === 'secret' || k === 'token' || k === 'otp' || k === 'code') {
            out[k] = typeof val === 'string' ? '[REDACTED]' : walk(val)
          } else if (k === 'compact' && typeof val === 'string' && val.length > 4000) {
            out[k] = val.slice(0, 4000) + '…'
          } else if (
            (k === 'text' || k === 'textPreview' || k === 'body') &&
            typeof val === 'string' &&
            val.length > 4000
          ) {
            out[k] = val.slice(0, 4000) + '…'
          } else {
            out[k] = walk(val)
          }
        }
        return out
      }
      return v
    }
    return walk(data)
  } catch {
    return undefined
  }
}

function scrubSensitiveUrlFields(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload
  const obj = { ...(payload as Record<string, unknown>) }
  for (const key of ['url', 'finalUrl', 'href']) {
    const v = obj[key]
    if (typeof v === 'string') obj[key] = safeUrlForLlm(v, 200)
  }
  if (obj.data && typeof obj.data === 'object') obj.data = scrubDataForTrajectory(obj.data)
  return obj
}

function sanitizePolicyForExport(policy: AgentPolicy): AgentPolicy {
  return {
    allowHosts: (policy.allowHosts ?? []).map((h) => String(h).toLowerCase().trim()).filter(Boolean),
    blockHosts: (policy.blockHosts ?? []).map((h) => String(h).toLowerCase().trim()).filter(Boolean),
    maxSteps: Math.min(100, Math.max(5, Math.round(policy.maxSteps) || 40)),
    confirmCrossHost: !!policy.confirmCrossHost,
    confirmSensitiveClicks: !!policy.confirmSensitiveClicks,
    sensitiveClickPatterns: (policy.sensitiveClickPatterns ?? []).map((p) => String(p)).filter(Boolean),
    pauseOnAskHuman: !!policy.pauseOnAskHuman,
    researchOnly: !!policy.researchOnly
  }
}

function sanitizeTrajectoryStepForExport(step: TrajectoryStep): TrajectoryStep {
  const out: TrajectoryStep = {
    id: step.id,
    ts: step.ts,
    kind: step.kind,
    title: redactTextForTrajectory(step.title ?? ''),
    tool: step.tool,
    ok: step.ok
  }
  if (step.detail != null) out.detail = redactTextForTrajectory(step.detail)
  if (step.data !== undefined) out.data = scrubDataForTrajectory(step.data)
  return out
}

function sanitizeMessageForExport(msg: AgentMessage): AgentMessage {
  const out: AgentMessage = {
    id: msg.id,
    role: msg.role,
    content: redactTextForTrajectory(msg.content ?? ''),
    timestamp: msg.timestamp
  }
  if (msg.actions) {
    out.actions = msg.actions.map((a) => ({
      ...a,
      detail: a.detail ? redactTextForTrajectory(a.detail) : a.detail,
      label: redactTextForTrajectory(a.label ?? '')
    }))
  }
  if (msg.toolCall) out.toolCall = { id: msg.toolCall.id, name: msg.toolCall.name, args: scrubCallArgsForTrajectory(msg.toolCall) }
  if (msg.toolResult) {
    out.toolResult = {
      ...msg.toolResult,
      summary: redactTextForTrajectory(msg.toolResult.summary ?? ''),
      error: msg.toolResult.error ? redactTextForTrajectory(msg.toolResult.error) : msg.toolResult.error,
      data: msg.toolResult.data === undefined ? msg.toolResult.data : scrubDataForTrajectory(msg.toolResult.data)
    }
  }
  return out
}

function summarizePolicyDiff(prev: AgentPolicy, partial: Partial<AgentPolicy>): string {
  const keys: Array<keyof AgentPolicy> = [
    'allowHosts',
    'blockHosts',
    'maxSteps',
    'confirmCrossHost',
    'confirmSensitiveClicks',
    'sensitiveClickPatterns',
    'pauseOnAskHuman',
    'researchOnly'
  ]
  const prevR = prev as unknown as Record<string, unknown>
  const partR = partial as unknown as Record<string, unknown>
  const changed: string[] = []
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(partial, k)) {
      const a = JSON.stringify(prevR[k])
      const b = JSON.stringify(partR[k])
      if (a !== b) changed.push(`${String(k)}=${truncate(b, 80)}`)
    }
  }
  return changed.join(', ') || 'unchanged'
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

function modeSetsResearchOnly(mode: AgentMode): boolean {
  return mode === 'research'
}

function isMutatingTool(name: ToolName): boolean {
  switch (name) {
    case 'navigate':
    case 'search':
    case 'back':
    case 'forward':
    case 'reload':
    case 'click':
    case 'type':
    case 'press_key':
    case 'hover':
    case 'select_option':
    case 'scroll':
    case 'new_tab':
    case 'close_tab':
    case 'switch_tab':
      return true
    default:
      return false
  }
}




