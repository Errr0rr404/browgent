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
  buildSystemPrompt,
  slimToolResultForLlm,
  type ChatMessage,
  type LlmProvider,
  type LlmToolCall
} from './llm'
import { extractCredentials, parseBrowseIntent } from '../../shared/sites'
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
import { isToolName, type ToolArgs, type ToolCall, type ToolName } from '../../shared/tools'

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

  constructor(
    private tabs: TabManager,
    private onChange: (state: AgentSessionState) => void
  ) {
    this.executor = new ToolExecutor(tabs)
    this.refreshProvider()
    const brain =
      this.provider !== 'heuristic'
        ? `Powered by **${getProviderDisplayName()}** (\`${this.model}\`) with live browser tools.`
        : 'Running in **heuristic** mode (no API key). Set `XAI_API_KEY` for Grok (default), or any OpenAI-compatible provider via `BROWGENT_PROVIDER` / `BROWGENT_API_KEY` / `BROWGENT_BASE_URL`.'
    this.pushSystem(
      `Browgent agent online. ${brain}\nModes: **act** · **research** · **watch**. Shared tabs — take over anytime.`
    )
    this.trace('system', 'Agent session started', this.provider)
    this.emit()
  }

  /** True while a task loop is executing (thinking/acting/paused mid-run). */
  isBusy(): boolean {
    return (
      this.taskInFlight ||
      this.status === 'thinking' ||
      this.status === 'acting' ||
      this.status === 'paused'
    )
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
      researchOnly: mode === 'research'
    }
    this.trace('system', `Mode → ${mode}`)
    this.pushSystem(`Mode set to **${mode}**.`)
    this.emit()
  }

  setPolicy(partial: Partial<AgentPolicy>): void {
    const next = { ...this.policy, ...partial }
    if (typeof next.maxSteps === 'number') {
      next.maxSteps = Math.min(100, Math.max(5, Math.round(next.maxSteps) || 40))
    }
    if (Array.isArray(next.allowHosts)) {
      next.allowHosts = next.allowHosts.map((h) => String(h).toLowerCase().trim()).filter(Boolean)
    }
    if (Array.isArray(next.blockHosts)) {
      next.blockHosts = next.blockHosts.map((h) => String(h).toLowerCase().trim()).filter(Boolean)
    }
    this.policy = next
    this.trace('system', 'Policy updated', JSON.stringify(partial))
    this.emit()
  }

  clear(): void {
    // Bump generation so any in-flight run exits without writing more state
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
    this.taskInFlight = false
    this.tabs.setOwner(null, null)
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
    this.paused = false
    this.taskInFlight = false
    this.tabs.setOwner(null, 'human')
    this.pushAssistant('Stopped. You own the tabs again.')
    this.trace('system', 'Agent stopped')
    this.emit()
  }

  /** Abort in-flight LLM/tool work and mark cancelled for the active generation. */
  private invalidateRun(): void {
    this.runGeneration++
    this.cancelled = true
    this.abort?.abort()
    this.abort = null
    this.resolveConfirm(false)
  }

  pause(): void {
    this.paused = true
    this.status = 'paused'
    this.tabs.setOwner(null, 'human')
    this.trace('system', 'Paused — human takeover')
    this.emit()
  }

  resume(): void {
    this.paused = false
    if (this.status === 'paused') this.status = 'idle'
    this.trace('system', 'Resumed')
    this.emit()
  }

  takeover(): void {
    this.pause()
    this.pushSystem('Takeover: you control the browser. Click Resume when the agent should continue.')
    this.emit()
  }

  confirm(id: string): void {
    if (this.pendingConfirmation?.id === id) this.resolveConfirm(true)
  }

  reject(id: string): void {
    if (this.pendingConfirmation?.id === id) this.resolveConfirm(false)
  }

  answerHuman(text: string): void {
    if (this.status !== 'waiting_human') return
    const answer = text.trim()
    if (!answer) return
    this.waitingQuestion = null
    this.pendingConfirmation = null
    this.push('user', answer)
    this.trace('user', 'Human answer', answer)
    this.status = 'idle'
    this.emit()
    void this.runTask(
      `Continue. Human answered: ${answer}`,
      this.tabs.getActiveTabId() ?? undefined,
      { skipUserMessage: true }
    )
  }

  exportTrajectory(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        mode: this.mode,
        provider: this.provider,
        model: this.model,
        policy: this.policy,
        steps: this.trajectory,
        messages: this.messages
      },
      null,
      2
    )
  }

  async send(userText: string, tabId?: TabId): Promise<void> {
    const text = userText.trim()
    if (!text) return
    if (this.status === 'waiting_human' && this.waitingQuestion) {
      this.answerHuman(text)
      return
    }
    // Reject concurrent tasks (pending confirmation is also human-gated)
    if (this.status === 'waiting_human' && this.pendingConfirmation) {
      this.pushSystem('Confirm or deny the pending action before sending a new instruction.')
      this.emit()
      return
    }
    if (this.taskInFlight || this.status === 'thinking' || this.status === 'acting') {
      this.pushSystem('Agent is busy — Stop first, or wait for the current task to finish.')
      this.emit()
      return
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
    this.currentGoal = text
    this.stepCount = 0
    this.lastToolNotes = []
    this.refreshProvider()
    this.abort = new AbortController()

    if (!opts.skipUserMessage) {
      this.push('user', text)
      this.trace('user', text)
    }
    this.status = 'thinking'
    this.tabs.setOwner(tabId ?? this.tabs.getActiveTabId(), 'agent')
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
      // Fallback to heuristics if LLM fails (e.g. bad key, network)
      if (this.provider !== 'heuristic' && this.isActiveRun(gen)) {
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
          this.tabs.setOwner(null, null)
          this.emit()
          return
        }
      } else if (this.isActiveRun(gen)) {
        this.pushAssistant(`Failed: ${err}`)
        this.status = 'error'
        this.taskInFlight = false
        this.tabs.setOwner(null, null)
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
    this.tabs.setOwner(null, null)
    this.emit()
  }

  private isActiveRun(gen: number): boolean {
    return !this.cancelled && gen === this.runGeneration
  }

  /** Multi-turn OpenAI-compatible tool-calling loop (Grok default, any provider) */
  private async runWithLlm(goal: string, gen: number): Promise<void> {
    const active = this.tabs.getState().find((t) => t.isActive)
    const intent = parseBrowseIntent(goal)
    const creds = extractCredentials(goal)
    // Light hints only — the model owns planning for any goal (not a fixed auth script)
    let intentHint = ''
    if (intent.navigateUrl) {
      intentHint +=
        `\n\n(Hint) A site was recognized — navigate there and complete the user's full request:\n` +
        `- Suggested start URL: ${intent.navigateUrl}\n` +
        (intent.task ? `- Remaining goal: ${intent.task}\n` : '')
    }
    if (creds.email || creds.password || creds.username) {
      intentHint +=
        `\n(Hint) Values already in the user message — type them into the right fields when needed:\n` +
        (creds.email ? `- email-like: ${creds.email}\n` : '') +
        (creds.username ? `- username-like: ${creds.username}\n` : '') +
        (creds.password ? `- password-like: ${creds.password}\n` : '')
    }
    if (this.mode === 'act') {
      intentHint +=
        `\nACT mode: use browser tools to carry out whatever they asked. Do not only describe the page.`
    }

    const llmMessages: ChatMessage[] = [
      {
        role: 'system',
        content: buildSystemPrompt(this.mode, active?.url, active?.title)
      },
      { role: 'user', content: goal + intentHint }
    ]

    // Seed with a light page orientation so the model doesn't guess
    if (active?.url && active.url !== 'about:blank') {
      llmMessages.push({
        role: 'user',
        content: `(Context) Active tab: ${active.title || 'untitled'} — ${active.url}`
      })
    }

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

    while (rounds < maxRounds && this.isActiveRun(gen)) {
      while (this.paused && this.isActiveRun(gen)) await sleep(150)
      if (!this.isActiveRun(gen)) break
      if (this.stepCount >= this.policy.maxSteps) {
        finalSummary = 'Stopped: max steps reached (policy).'
        break
      }

      this.status = 'thinking'
      this.emit()

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
        // Model often "helpfully" describes the page instead of controlling it.
        // Nudge it back into tool-calling unless it clearly finished after real work.
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
              'Stop describing. Call browser tools now (navigate / observe / type / click / wait). ' +
              'If the user already gave email/password in their message, type them into the form. ' +
              'Only call done when the task is finished or blocked on CAPTCHA/2FA/human verification.'
          })
          this.trace('system', 'Nudged model to use tools (text-only reply)')
          rounds++
          continue
        }

        finalSummary = text || 'Done.'
        break
      }

      // Record assistant tool-call turn for the API
      llmMessages.push({
        role: 'assistant',
        content: turn.content,
        tool_calls: toolCalls
      })

      this.status = 'acting'
      this.emit()

      let hitDone = false
      let hitAskHuman = false

      for (const tc of toolCalls) {
        if (!this.isActiveRun(gen)) break
        while (this.paused && this.isActiveRun(gen)) await sleep(150)
        if (!this.isActiveRun(gen)) break

        const call = toolCallFromLlm(tc)
        if (!call) {
          llmMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({ ok: false, error: `Unknown tool: ${tc.function.name}` })
          })
          continue
        }

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
          this.tabs.setOwner(null, 'human')
          if (this.policy.pauseOnAskHuman) this.paused = true
          this.trace('tool', 'ask_human', this.waitingQuestion, 'ask_human', true)
          llmMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({ ok: true, note: 'Waiting for human reply' })
          })
          this.emit()
          hitAskHuman = true
          break
        }

        const result = await this.executor.execute(call, {
          policy: this.policy,
          mode: this.mode,
          requestConfirm: (reason, tool, args) => this.waitForConfirm(reason, tool, args)
        })

        if (!this.isActiveRun(gen)) return

        this.stepCount++
        this.lastToolNotes.push(result.summary)
        if (this.lastToolNotes.length > 40) this.lastToolNotes = this.lastToolNotes.slice(-30)
        this.trace('tool', result.summary, undefined, call.name, result.ok, result.data)

        if (call.name === 'observe' && result.ok && result.data) {
          const d = result.data as ObserveSnapshot & { compact?: string }
          this.lastObservation = {
            url: d.url,
            title: d.title,
            elements: d.elements ?? [],
            textPreview: d.textPreview ?? ''
          }
        }

        action.status = result.ok ? 'done' : 'error'
        if (!result.ok) action.detail = result.error
        this.emit()

        const payload = result.ok
          ? { ok: true, summary: result.summary, data: result.data }
          : { ok: false, error: result.error, summary: result.summary }

        llmMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: slimToolResultForLlm(payload)
        })

        if (call.name === 'done') {
          finalSummary = String(call.args.summary ?? result.summary)
          hitDone = true
        }
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
    if (this.isActiveRun(gen)) this.trace('assistant', finalSummary.slice(0, 200))
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
          this.tabs.setOwner(null, 'human')
          if (this.policy.pauseOnAskHuman) this.paused = true
          this.trace('tool', 'ask_human', this.waitingQuestion)
          this.emit()
          return
        }

        const result = await this.executor.execute(call, {
          policy: this.policy,
          mode: this.mode,
          requestConfirm: (reason, tool, args) => this.waitForConfirm(reason, tool, args)
        })

        if (!this.isActiveRun(gen)) return

        this.stepCount++
        this.lastToolNotes.push(result.summary)
        if (this.lastToolNotes.length > 40) this.lastToolNotes = this.lastToolNotes.slice(-30)
        this.trace('tool', result.summary, undefined, call.name, result.ok, result.data)

        if (call.name === 'observe' && result.ok && result.data) {
          const d = result.data as ObserveSnapshot & { compact?: string }
          this.lastObservation = {
            url: d.url,
            title: d.title,
            elements: d.elements ?? [],
            textPreview: d.textPreview ?? ''
          }
          observationDump += `\n\n${formatObservationForUser(result.data)}`
        }

        if (call.name === 'extract_text' && result.ok) {
          observationDump += `\n\n${formatObservationForUser(result.data)}`
        }

        if (call.name === 'done' && result.ok) {
          finalSummary = String(call.args.summary ?? result.summary)
          finished = true
        }

        action.status = result.ok ? 'done' : 'error'
        if (!result.ok) action.detail = result.error
        this.emit()
      }

      if (finished) break
      step++
    }

    if (!this.isActiveRun(gen)) return

    let reply =
      finalSummary ||
      'Finished this step. Check the trajectory for tool results.'
    if (observationDump.trim() && !/opened |searched /i.test(reply)) {
      reply = `${reply}\n${observationDump.slice(0, 2200)}`
    }

    await this.streamAssistant(assistantId, reply, gen)
    if (this.isActiveRun(gen)) this.trace('assistant', reply.slice(0, 200))
  }

  private async streamAssistant(messageId: string, reply: string, gen?: number): Promise<void> {
    const msg = this.messages.find((m) => m.id === messageId)
    if (!msg) {
      if (gen === undefined || this.isActiveRun(gen)) this.pushAssistant(reply)
      return
    }
    msg.content = ''
    for (const chunk of chunkText(reply, 36)) {
      if (gen !== undefined && !this.isActiveRun(gen)) return
      if (this.cancelled) return
      msg.content += chunk
      this.emit()
      await sleep(8)
    }
  }

  private trimMessages(): void {
    const MAX = 120
    if (this.messages.length <= MAX) return
    // Keep the first system welcome + the newest messages
    const head = this.messages[0]
    const tail = this.messages.slice(-(MAX - 1))
    this.messages = head?.role === 'system' ? [head, ...tail.filter((m) => m.id !== head.id)] : tail
  }

  private waitForConfirm(
    reason: string,
    tool: ToolName,
    args: ToolArgs
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const id = randomUUID()
      this.pendingConfirmation = { id, reason, tool, args }
      this.status = 'waiting_human'
      this.tabs.setOwner(null, 'human')
      this.trace('policy', reason, tool)
      this.confirmResolver = (ok) => {
        this.pendingConfirmation = null
        this.confirmResolver = null
        if (this.status === 'waiting_human') this.status = 'acting'
        this.emit()
        resolve(ok)
      }
      this.emit()
    })
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
  if (a.url) return String(a.url)
  if (a.ref) return String(a.ref)
  if (a.text) return String(a.text).slice(0, 40)
  if (a.summary) return String(a.summary).slice(0, 60)
  if (a.thought) return String(a.thought).slice(0, 60)
  if (a.question) return String(a.question).slice(0, 60)
  if (a.key) return String(a.key)
  if (a.direction) return String(a.direction)
  return ''
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

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
  return chunks
}
