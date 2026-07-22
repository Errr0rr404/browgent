/**
 * xAI Grok client (OpenAI-compatible chat completions + tools).
 * Env: XAI_API_KEY (preferred) or SPACE_XAI_API_KEY
 * Model: BROWGENT_MODEL (default grok-4.5)
 */
import { TOOL_DEFS, type ToolName } from '../../shared/tools'
import type { AgentMode } from '../../shared/policies'

const DEFAULT_BASE = 'https://api.x.ai/v1'
const DEFAULT_MODEL = 'grok-4.5'

export type LlmProvider = 'grok' | 'heuristic'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
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

export function getApiKey(): string | null {
  const key =
    process.env.XAI_API_KEY?.trim() ||
    process.env.SPACE_XAI_API_KEY?.trim() ||
    process.env.GROK_API_KEY?.trim() ||
    null
  return key || null
}

export function getModel(): string {
  return process.env.BROWGENT_MODEL?.trim() || DEFAULT_MODEL
}

export function isLlmConfigured(): boolean {
  return Boolean(getApiKey())
}

export function getProviderLabel(): LlmProvider {
  return isLlmConfigured() ? 'grok' : 'heuristic'
}

/** OpenAI-style tool definitions for Grok */
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
  if (mode === 'watch') {
    return new Set([
      'observe',
      'extract_text',
      'extract_links',
      'get_url',
      'screenshot',
      'list_tabs',
      'think',
      'done',
      'ask_human'
    ])
  }
  if (mode === 'research') {
    return new Set([
      'navigate',
      'back',
      'forward',
      'reload',
      'scroll',
      'wait',
      'observe',
      'extract_text',
      'extract_links',
      'get_url',
      'screenshot',
      'list_tabs',
      'switch_tab',
      'new_tab',
      'think',
      'done',
      'ask_human'
    ])
  }
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

export function buildSystemPrompt(mode: AgentMode, pageUrl?: string, pageTitle?: string): string {
  return `You are Browgent, a desktop browser agent. You CONTROL a real Chromium tab shared with a human — you do not just search Google and claim success.

Mode: ${mode}
- act: full tools (navigate, click, type, scroll, etc.) — USE THEM
- research: read-mostly (navigate/observe/extract; no click/type)
- watch: observation only; human drives the browser

Current page: ${pageTitle || 'unknown'} — ${pageUrl || 'none'}

CRITICAL — follow the user's full instruction:
1. Multi-step goals are normal. "go to fb and sign up" means: open Facebook, THEN find Sign Up / Create account, click it, progress the form. Do NOT stop after a Google search for the phrase.
2. Site shortcuts → real hosts (never Google unless they asked to search):
   fb/facebook → https://www.facebook.com/
   ig/instagram → https://www.instagram.com/
   yt/youtube → https://www.youtube.com/
   gh/github → https://github.com/
   x/twitter → https://x.com/
   google → https://www.google.com/
   gmail → https://mail.google.com/
   Use full https URLs in navigate. Prefer the real site over search results.
3. Only navigate to a Google search URL when the user explicitly wants to search the web (e.g. "search for …", "google …").
4. Always observe before click/type so you have element refs (e1, e2…). Never invent refs.
5. Click/type with ref from the latest observe. CSS selector is a fallback only.
6. After navigate or click, wait + observe again before the next act.
7. For signup/login: open the site → click the matching CTA → fill fields you can → ask_human for credentials, CAPTCHA, phone/email codes. Never invent passwords.
8. When the goal is truly complete (or blocked on human-only steps), call done with an honest summary of what you DID in the browser.
9. Use think sparingly. Prefer acting with tools over monologues.
10. Be careful with purchases, deletes, and irreversible submits — ask_human if unsure.

You and the human co-browse the same tabs. Takeover is always available.`
}

export async function completeWithTools(
  messages: ChatMessage[],
  mode: AgentMode,
  signal?: AbortSignal
): Promise<LlmTurnResult> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('XAI_API_KEY not set')

  const model = getModel()
  const base = (process.env.XAI_BASE_URL || DEFAULT_BASE).replace(/\/$/, '')
  const tools = buildOpenAiTools(mode)

  let res: Response
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: 'auto',
        parallel_tool_calls: true,
        temperature: 0.2
      }),
      signal
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e
    throw new Error(
      `Grok network error: ${e instanceof Error ? e.message : 'fetch failed'}. Check connectivity and XAI_BASE_URL.`
    )
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const hint =
      res.status === 401
        ? ' (invalid XAI_API_KEY?)'
        : res.status === 429
          ? ' (rate limited — retry shortly)'
          : res.status === 404
            ? ' (model not found — check BROWGENT_MODEL)'
            : ''
    throw new Error(`Grok API ${res.status}${hint}: ${body.slice(0, 400) || res.statusText}`)
  }

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
  if (!msg) throw new Error('Empty Grok response')

  return {
    content: msg.content ?? null,
    toolCalls: msg.tool_calls ?? [],
    model
  }
}

export function slimToolResultForLlm(data: unknown, max = 6000): string {
  try {
    const s = typeof data === 'string' ? data : JSON.stringify(data, null, 0)
    if (s.length <= max) return s
    return s.slice(0, max) + '…[truncated]'
  } catch {
    return String(data)
  }
}
