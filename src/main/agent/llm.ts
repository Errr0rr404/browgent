/**
 * OpenAI-compatible chat completions + tools for the browser agent.
 *
 * Default brain: xAI Grok. Any OpenAI-compatible endpoint works — OpenAI,
 * OpenRouter, Groq, DeepSeek, Ollama, Azure-style proxies, etc.
 *
 * Env (see resolveLlmConfig):
 *   BROWGENT_PROVIDER  grok | openai | openrouter | groq | deepseek | ollama | custom | auto
 *   BROWGENT_API_KEY / BROWGENT_BASE_URL / BROWGENT_MODEL  generic overrides
 *   XAI_API_KEY, OPENAI_API_KEY, …  provider-specific keys
 */
import { TOOL_DEFS, type ToolName } from '../../shared/tools'
import { RESEARCH_TOOLS, WATCH_TOOLS, type AgentMode } from '../../shared/policies'
import type { AgentProvider } from '../../shared/types'

const DEFAULT_GROK_BASE = 'https://api.x.ai/v1'
const DEFAULT_GROK_MODEL = 'grok-4.5'

/** Known OpenAI-compatible presets */
export type LlmPreset =
  | 'grok'
  | 'openai'
  | 'openrouter'
  | 'groq'
  | 'deepseek'
  | 'ollama'
  | 'custom'

export type LlmProvider = AgentProvider

export interface LlmConfig {
  provider: LlmPreset
  apiKey: string
  baseUrl: string
  model: string
  /** Human label for UI / logs */
  label: string
  /** Send viewport screenshots to the model (BROWGENT_VISION). Multimodal models only. */
  vision: boolean
  /** Cap completion length (BROWGENT_MAX_TOKENS); null = provider default. */
  maxTokens: number | null
}

/** OpenAI multimodal content parts (used only when vision is enabled). */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ContentPart[] | null
  tool_calls?: LlmToolCall[]
  tool_call_id?: string
  name?: string
}

export interface LlmToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface LlmTurnResult {
  content: string | null
  toolCalls: LlmToolCall[]
  model: string
}

interface ProviderDefaults {
  id: LlmPreset
  label: string
  baseUrl: string
  model: string
  /** Env vars checked (first non-empty wins) for the API key */
  keyEnv: string[]
  /** Optional base-url env overrides besides BROWGENT_BASE_URL */
  baseEnv?: string[]
  /** Ollama etc. may work without a real key */
  keyOptional?: boolean
}

const PROVIDERS: Record<LlmPreset, ProviderDefaults> = {
  grok: {
    id: 'grok',
    label: 'Grok',
    baseUrl: DEFAULT_GROK_BASE,
    model: DEFAULT_GROK_MODEL,
    keyEnv: ['XAI_API_KEY', 'SPACE_XAI_API_KEY', 'GROK_API_KEY', 'BROWGENT_API_KEY'],
    baseEnv: ['XAI_BASE_URL']
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    keyEnv: ['OPENAI_API_KEY', 'BROWGENT_API_KEY'],
    baseEnv: ['OPENAI_BASE_URL']
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    keyEnv: ['OPENROUTER_API_KEY', 'BROWGENT_API_KEY'],
    baseEnv: ['OPENROUTER_BASE_URL']
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    keyEnv: ['GROQ_API_KEY', 'BROWGENT_API_KEY'],
    baseEnv: ['GROQ_BASE_URL']
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    keyEnv: ['DEEPSEEK_API_KEY', 'BROWGENT_API_KEY'],
    baseEnv: ['DEEPSEEK_BASE_URL']
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'llama3.2',
    keyEnv: ['OLLAMA_API_KEY', 'BROWGENT_API_KEY'],
    baseEnv: ['OLLAMA_BASE_URL', 'OLLAMA_HOST'],
    keyOptional: true
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    baseUrl: '',
    model: 'gpt-4o',
    keyEnv: ['BROWGENT_API_KEY', 'OPENAI_API_KEY'],
    keyOptional: true
  }
}

function env(name: string): string | null {
  const v = process.env[name]?.trim()
  return v || null
}

function firstEnv(names: string[]): string | null {
  for (const n of names) {
    const v = env(n)
    if (v) return v
  }
  return null
}

function parseProviderHint(): LlmPreset | 'auto' {
  const raw = (env('BROWGENT_PROVIDER') || env('LLM_PROVIDER') || 'auto')?.toLowerCase()
  if (!raw || raw === 'auto') return 'auto'
  if (raw === 'xai' || raw === 'x.ai') return 'grok'
  if (raw in PROVIDERS) return raw as LlmPreset
  // Unknown string → treat as custom label via custom preset
  if (raw === 'anthropic') {
    // Native Anthropic Messages API is not OpenAI-compatible; steer to OpenRouter or a proxy.
    console.warn(
      '[browgent] BROWGENT_PROVIDER=anthropic is not supported natively. Use OpenRouter (anthropic/…) or an OpenAI-compatible Anthropic proxy via BROWGENT_BASE_URL.'
    )
  }
  return 'custom'
}

function normalizeBaseUrl(url: string, preset: LlmPreset): string {
  let u = url.trim().replace(/\/$/, '')
  // OLLAMA_HOST is often host:port without scheme or /v1
  if (preset === 'ollama') {
    if (!/^https?:\/\//i.test(u)) u = `http://${u}`
    if (!u.endsWith('/v1')) u = `${u.replace(/\/$/, '')}/v1`
  }
  return u
}

function envTruthy(name: string): boolean {
  const v = env(name)?.toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

function resolveVisionFlag(): boolean {
  return envTruthy('BROWGENT_VISION') || envTruthy('LLM_VISION')
}

function resolveMaxTokens(): number | null {
  const raw = env('BROWGENT_MAX_TOKENS') || env('LLM_MAX_TOKENS')
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
}

/**
 * Resolve which LLM to use. Grok is preferred when auto-detecting keys.
 * Returns null → heuristic planner. Decorates the resolved provider with
 * runtime tuning (vision, max tokens) read from env.
 */
export function resolveLlmConfig(): LlmConfig | null {
  const base = resolveLlmConfigBase()
  if (!base) return null
  return { ...base, vision: resolveVisionFlag(), maxTokens: resolveMaxTokens() }
}

type LlmConfigBase = Omit<LlmConfig, 'vision' | 'maxTokens'>

function resolveLlmConfigBase(): LlmConfigBase | null {
  const hint = parseProviderHint()
  const modelOverride = env('BROWGENT_MODEL') || env('LLM_MODEL')
  const baseOverride = env('BROWGENT_BASE_URL') || env('LLM_BASE_URL')
  const keyOverride = env('BROWGENT_API_KEY') || env('LLM_API_KEY')

  const tryPreset = (preset: LlmPreset): LlmConfigBase | null => {
    const def = PROVIDERS[preset]
    let baseUrl = baseOverride || firstEnv(def.baseEnv ?? []) || def.baseUrl
    if (!baseUrl) {
      if (preset === 'custom' && !baseOverride) return null
      return null
    }
    baseUrl = normalizeBaseUrl(baseUrl, preset)

    const apiKey =
      keyOverride ||
      firstEnv(def.keyEnv) ||
      (def.keyOptional ? 'ollama' : null)
    if (!apiKey && !def.keyOptional) return null

    // Custom without explicit key still allowed if base is set (local proxies)
    const key = apiKey || (preset === 'custom' ? 'not-needed' : '')
    if (!key) return null

    const model = modelOverride || def.model
    return {
      provider: preset,
      apiKey: key,
      baseUrl,
      model,
      label: def.label
    }
  }

  if (hint !== 'auto') {
    return tryPreset(hint)
  }

  // Auto: provider-specific keys only (so BROWGENT_API_KEY alone does not claim OpenAI)
  const autoKeys: Record<Exclude<LlmPreset, 'custom' | 'ollama'>, string[]> = {
    grok: ['XAI_API_KEY', 'SPACE_XAI_API_KEY', 'GROK_API_KEY'],
    openai: ['OPENAI_API_KEY'],
    openrouter: ['OPENROUTER_API_KEY'],
    groq: ['GROQ_API_KEY'],
    deepseek: ['DEEPSEEK_API_KEY']
  }

  for (const preset of ['grok', 'openai', 'openrouter', 'groq', 'deepseek'] as const) {
    const key = firstEnv(autoKeys[preset])
    if (!key) continue
    const def = PROVIDERS[preset]
    const base = baseOverride || firstEnv(def.baseEnv ?? []) || def.baseUrl
    return {
      provider: preset,
      apiKey: key,
      baseUrl: normalizeBaseUrl(base, preset),
      model: modelOverride || def.model,
      label: def.label
    }
  }

  // Ollama only if user pointed a host at it
  if (firstEnv(['OLLAMA_BASE_URL', 'OLLAMA_HOST'])) {
    const cfg = tryPreset('ollama')
    if (cfg) return cfg
  }

  // Explicit custom base (local proxy, Azure-style, etc.)
  if (baseOverride) {
    const cfg = tryPreset('custom')
    if (cfg) return cfg
  }

  // Generic BROWGENT_API_KEY alone → Grok defaults (product default)
  if (keyOverride) {
    return {
      provider: 'grok',
      apiKey: keyOverride,
      baseUrl: normalizeBaseUrl(DEFAULT_GROK_BASE, 'grok'),
      model: modelOverride || DEFAULT_GROK_MODEL,
      label: 'Grok'
    }
  }

  return null
}

export function getModel(): string {
  return resolveLlmConfig()?.model ?? DEFAULT_GROK_MODEL
}

export function isLlmConfigured(): boolean {
  return resolveLlmConfig() != null
}

export function getProviderLabel(): LlmProvider {
  const cfg = resolveLlmConfig()
  return cfg ? cfg.provider : 'heuristic'
}

export function getProviderDisplayName(): string {
  const cfg = resolveLlmConfig()
  return cfg?.label ?? 'Heuristic'
}

/** True when screenshots should be sent to the model (multimodal + BROWGENT_VISION). */
export function isVisionEnabled(): boolean {
  return resolveLlmConfig()?.vision ?? false
}

/** Data URL wrapper for a base64 PNG screenshot destined for a vision model. */
export function pngDataUrl(base64: string): string {
  return `data:image/png;base64,${base64}`
}

/** OpenAI-style tool definitions for any compatible chat-completions API */
export function buildOpenAiTools(mode: AgentMode): Array<{
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}> {
  const allowed = toolsForMode(mode)
  return TOOL_DEFS.filter((t) => allowed.has(t.name)).map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: paramsToJsonSchema(t.params)
    }
  }))
}

function toolsForMode(mode: AgentMode): Set<ToolName> {
  if (mode === 'watch') return new Set(WATCH_TOOLS) as Set<ToolName>
  if (mode === 'research') return new Set(RESEARCH_TOOLS) as Set<ToolName>
  return new Set(TOOL_DEFS.map((t) => t.name))
}

function paramsToJsonSchema(params: Record<string, string>): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [key, raw] of Object.entries(params)) {
    const optional = raw.endsWith('?')
    const base = optional ? raw.slice(0, -1) : raw
    let type: string | string[] = 'string'
    if (base === 'number') type = 'number'
    else if (base === 'boolean') type = 'boolean'
    else if (base.startsWith('string')) type = 'string'
    properties[key] = { type, description: `${key} (${base})` }
    if (!optional) required.push(key)
  }
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false
  }
}

export function buildSystemPrompt(
  mode: AgentMode,
  pageUrl?: string,
  pageTitle?: string,
  vision = false
): string {
  const visionLine = vision
    ? `\nVision: on. Call screenshot only when the accessibility snapshot is ambiguous (canvas, icon-only buttons). Refs still come from snapshots.`
    : ''
  return `You are Browgent — a local agentic browser (like BrowserOS): you share a real Chromium tab with a human and complete goals by driving it with tools. Be fast, decisive, and accurate.

Mode: ${mode}
- act: full control — call tools every turn until done
- research: navigate/search/extract (no click/type)
- watch: observe only; human drives

Current page: ${pageTitle || 'unknown'} — ${pageUrl || 'none'}

Speed rules (critical):
1. Prefer few high-value tools. Mutating tools (navigate, search, click, type, press_key, scroll, …) already return a fresh element snapshot with refs e1… — do NOT call observe right after them unless the snapshot is empty/stale.
2. Web research ("cheapest…", "find…", "what is…", "on the browser"): call search with a clean query first. It returns results text + links in one step.
3. Then extract_text / extract_links only if you still need more body text, open the best result with click, and call done with a direct answer (prices, product names, links).
4. Prefer real product sites when the user names one (apple.com, amazon.com). Otherwise search.
5. Never invent refs. Only use refs from the latest snapshot in tool results or context.
6. Skip long waits — navigate/search already wait for load. Use wait only for spinners (≤800ms) or wait_for a ref.
7. Batch mentally: search → (optional click result) → answer with done. Do not monologue with think.
8. Use credentials/values already in the user message. For forms, call get_profile (User Hub) instead of inventing email/phone/name. For site login, get_credentials when a vault entry may exist (user confirms). ask_human only for CAPTCHA, 2FA, missing secrets, or real choices.
9. Site shortcuts: fb→facebook.com, ig→instagram.com, yt→youtube.com, gh→github.com, x→x.com, gmail→mail.google.com.
10. Purchases / deletes / wire transfers: ask_human if irreversible.

Answer quality:
- done.summary must answer the user (e.g. cheapest options with prices and sources), not "I searched for X".
- If blocked (login wall, captcha), say so and ask_human or done with the blocker.

You co-browse the same tabs; the human can Takeover anytime.${visionLine}`
}

/** Transient HTTP statuses worth retrying — rate limits + upstream/gateway blips. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const MAX_LLM_ATTEMPTS = 3
const RETRY_BASE_MS = 800
const RETRY_MAX_MS = 8000

/** Sleep that resolves early (does not reject) if the signal aborts. */
function retrySleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(t)
      resolve()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Honour a numeric or HTTP-date `Retry-After`; fall back to exponential backoff. */
function retryDelayMs(res: Response | null, attempt: number): number {
  const header = res?.headers.get('retry-after')
  if (header) {
    const secs = Number(header)
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, RETRY_MAX_MS)
    const dateMs = Date.parse(header)
    if (Number.isFinite(dateMs)) {
      const delta = dateMs - Date.now()
      if (delta > 0) return Math.min(delta, RETRY_MAX_MS)
    }
  }
  // Exponential backoff with mild jitter (attempt is 1-based)
  const base = Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_MS)
  return base + Math.floor(Math.random() * 250)
}

/** Coerce provider content (string | multimodal array | null) to a plain string. */
function normalizeLlmContent(content: unknown): string | null {
  if (content == null) return null
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object') {
          const p = part as { type?: string; text?: string }
          if (typeof p.text === 'string') return p.text
        }
        return ''
      })
      .filter(Boolean)
    return parts.length ? parts.join('\n') : null
  }
  if (typeof content === 'number' || typeof content === 'boolean') return String(content)
  return null
}

export async function completeWithTools(
  messages: ChatMessage[],
  mode: AgentMode,
  signal?: AbortSignal
): Promise<LlmTurnResult> {
  const cfg = resolveLlmConfig()
  if (!cfg) {
    throw new Error(
      'No LLM configured. Set XAI_API_KEY (Grok default), or BROWGENT_PROVIDER + API key / BROWGENT_BASE_URL for another OpenAI-compatible model.'
    )
  }

  const tools = buildOpenAiTools(mode)
  const url = `${cfg.baseUrl}/chat/completions`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.apiKey}`,
    'Content-Type': 'application/json',
    // OpenRouter optional attribution; harmless elsewhere
    ...(cfg.provider === 'openrouter'
      ? {
          'HTTP-Referer': 'https://github.com/Errr0rr404/browgent',
          'X-Title': 'Browgent'
        }
      : {})
  }

  // Some reasoning models (o-series, etc.) reject `temperature` / `parallel_tool_calls`
  // or want `max_completion_tokens` instead of `max_tokens`. We drop/rename adaptively
  // when a 400 names the parameter, so one config works across model families.
  const stripped = new Set<string>()
  let maxTokensKey: 'max_tokens' | 'max_completion_tokens' = 'max_tokens'

  const buildBody = (): string => {
    const payload: Record<string, unknown> = {
      model: cfg.model,
      messages,
      tools,
      tool_choice: 'auto'
    }
    // Allow parallel read tools (extract_text + extract_links); session serializes mutators
    if (!stripped.has('parallel_tool_calls')) payload.parallel_tool_calls = true
    if (!stripped.has('temperature')) payload.temperature = 0.15
    if (cfg.maxTokens && !stripped.has('max_tokens')) payload[maxTokensKey] = cfg.maxTokens
    return JSON.stringify(payload)
  }

  let lastError: Error | null = null
  let transientAttempt = 1
  // Backstop against pathological loops: transient retries + a few adaptive param fixes.
  const maxIterations = MAX_LLM_ATTEMPTS + 4

  for (let iter = 0; iter < maxIterations; iter++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    let res: Response
    try {
      res = await fetch(url, { method: 'POST', headers, body: buildBody(), signal })
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e
      // Network errors are transient — retry a couple of times before giving up.
      lastError = new Error(
        `${cfg.label} network error: ${e instanceof Error ? e.message : 'fetch failed'}. Check connectivity and base URL (${cfg.baseUrl}).`
      )
      if (transientAttempt < MAX_LLM_ATTEMPTS) {
        console.warn(`[browgent] ${cfg.label} network error (attempt ${transientAttempt}/${MAX_LLM_ATTEMPTS}) — retrying`)
        await retrySleep(retryDelayMs(null, transientAttempt), signal)
        transientAttempt++
        continue
      }
      throw lastError
    }

    if (res.ok) {
      const data = (await res.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null
            tool_calls?: LlmToolCall[]
          }
          finish_reason?: string
        }>
      }
      const msg = data.choices?.[0]?.message
      if (!msg) throw new Error(`Empty ${cfg.label} response`)
      return {
        // Some providers return multimodal content arrays; normalize to string.
        content: normalizeLlmContent(msg.content),
        toolCalls: msg.tool_calls ?? [],
        model: cfg.model
      }
    }

    const body = await res.text().catch(() => '')

    // Adaptive parameter fix on 400 — retry immediately, without spending transient budget.
    if (res.status === 400) {
      const fix = detectParamFix(body, stripped, maxTokensKey)
      if (fix) {
        if (fix.rename) maxTokensKey = 'max_completion_tokens'
        else stripped.add(fix.param)
        console.warn(`[browgent] ${cfg.label} 400 — retrying with ${fix.note}`)
        continue
      }
    }

    const hint =
      res.status === 401
        ? ' (invalid API key?)'
        : res.status === 429
          ? ' (rate limited — retry shortly)'
          : res.status === 404
            ? ' (model or endpoint not found — check BROWGENT_MODEL / base URL)'
            : res.status === 400
              ? ' (bad request — check model / parameters)'
              : ''
    lastError = new Error(
      `${cfg.label} API ${res.status}${hint}: ${body.slice(0, 400) || res.statusText}`
    )

    // Retry transient statuses (rate limit / gateway) with backoff or Retry-After.
    if (RETRYABLE_STATUS.has(res.status) && transientAttempt < MAX_LLM_ATTEMPTS) {
      const delay = retryDelayMs(res, transientAttempt)
      console.warn(
        `[browgent] ${cfg.label} API ${res.status} (attempt ${transientAttempt}/${MAX_LLM_ATTEMPTS}) — retrying in ${delay}ms`
      )
      await retrySleep(delay, signal)
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      transientAttempt++
      continue
    }

    throw lastError
  }

  // Loop exhausted (all attempts were transient failures / param fixes)
  throw lastError ?? new Error(`${cfg.label} request failed`)
}

/**
 * Inspect a 400 body for a parameter the model rejects. Returns the adjustment to
 * apply (strip the param, or rename max_tokens → max_completion_tokens), once each.
 */
function detectParamFix(
  body: string,
  stripped: Set<string>,
  maxTokensKey: 'max_tokens' | 'max_completion_tokens'
): { param: string; rename?: boolean; note: string } | null {
  const b = body.toLowerCase()
  if (!stripped.has('temperature') && b.includes('temperature')) {
    return { param: 'temperature', note: 'temperature dropped (model default)' }
  }
  if (!stripped.has('parallel_tool_calls') && b.includes('parallel_tool_calls')) {
    return { param: 'parallel_tool_calls', note: 'parallel_tool_calls dropped' }
  }
  if (maxTokensKey === 'max_tokens' && b.includes('max_completion_tokens')) {
    return { param: 'max_tokens', rename: true, note: 'max_tokens → max_completion_tokens' }
  }
  return null
}

export function slimToolResultForLlm(data: unknown, max = 6000): string {
  try {
    let payload: unknown = data
    // Observe / auto-snapshot: never ship full elements[] (refs live in compact)
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const o = payload as Record<string, unknown>
      payload = slimSnapshotFields(o)
    }
    const s = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 0)
    if (s.length <= max) return s
    return s.slice(0, max) + '…[truncated]'
  } catch {
    return String(data)
  }
}

function slimSnapshotFields(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...o }
  // Always drop full elements[] — refs live in compact strings
  if (Array.isArray(out.elements)) {
    out.elementCount =
      typeof out.elementCount === 'number' ? out.elementCount : out.elements.length
    delete out.elements
  }
  if (out.snapshot && typeof out.snapshot === 'object' && !Array.isArray(out.snapshot)) {
    const s = { ...(out.snapshot as Record<string, unknown>) }
    if (Array.isArray(s.elements)) {
      s.elementCount =
        typeof s.elementCount === 'number' ? s.elementCount : s.elements.length
      delete s.elements
    }
    if (typeof s.compact === 'string' && s.compact.length > 3500) {
      s.compact = s.compact.slice(0, 3500) + '…'
    }
    out.snapshot = s
  }
  if (typeof out.compact === 'string' && out.compact.length > 3500) {
    out.compact = out.compact.slice(0, 3500) + '…'
  }
  // Cap large text blobs from search/extract
  if (out.text && typeof out.text === 'object') {
    const t = out.text as Record<string, unknown>
    if (typeof t.text === 'string' && t.text.length > 2800) {
      out.text = { ...t, text: t.text.slice(0, 2800) + '…' }
    }
  } else if (typeof out.text === 'string' && out.text.length > 2800) {
    out.text = out.text.slice(0, 2800) + '…'
  }
  return out
}
