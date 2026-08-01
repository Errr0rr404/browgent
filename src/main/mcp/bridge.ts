/**
 * Localhost HTTP bridge for MCP / external tool clients.
 *
 * Bound to 127.0.0.1 only. Optional shared token (BROWGENT_MCP_TOKEN or auto file).
 * STDIO MCP adapter (scripts/browgent-mcp.mjs) proxies here so Claude Code / Cursor
 * can drive the same tabs as the desktop agent.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { randomBytes, timingSafeEqual } from 'crypto'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import type { AgentSession } from '../agent/session'
import type { TabManager } from '../browser/tab-manager'
import {
  type McpHealthResponse,
  type McpStatus,
  type McpToolCallResponse
} from '../../shared/mcp'
import { listMcpToolDescriptors, toolNames } from './tool-schema'
import { getRuntimeFlags } from '../browser/runtime-flags'
import { recordMcpCall } from '../metrics/store'

const MAX_BODY = 256 * 1024
const HOST = '127.0.0.1'

/** Max elements shipped to HTTP clients; full arrays stay in-session only. */
const MAX_HTTP_ELEMENTS = 40

/**
 * Cap an observe/snapshot-shaped object's `elements` array so large element
 * arrays never ship uncapped to HTTP clients. Returns a shallow copy with the
 * array sliced (and an accurate `elementCount`) when over the cap; otherwise the
 * original object unchanged. Applied to BOTH the flat observe shape
 * (data.elements) and the nested snapshot shape (data.snapshot.elements).
 */
function capElements(obj: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(obj.elements) && obj.elements.length > MAX_HTTP_ELEMENTS) {
    return {
      ...obj,
      elementCount: obj.elements.length,
      elements: obj.elements.slice(0, MAX_HTTP_ELEMENTS)
    }
  }
  return obj
}

export interface McpBridgeDeps {
  getAgent: () => AgentSession | null
  getTabs: () => TabManager | null
  getVersion: () => string
}

export class McpBridge {
  private server: Server | null = null
  private port: number | null = null
  private token: string | null = null
  private callCount = 0
  private lastError: string | null = null
  private deps: McpBridgeDeps | null = null
  private starting = false
  private toolChain: Promise<void> = Promise.resolve()
  private queuedTools = 0
  private static readonly MAX_QUEUED = 8
  /** Bridge-level ceiling so one wedged tool can't freeze the FIFO queue. */
  private static readonly TOOL_TIMEOUT_MS = 60_000

  attach(deps: McpBridgeDeps): void {
    this.deps = deps
  }

  getStatus(): McpStatus {
    const flags = getRuntimeFlags()
    const enabled = this.server != null && this.port != null
    const tools = toolNames()
    const baseUrl = enabled ? `http://${HOST}:${this.port}` : null
    const stdioHint =
      'npm run mcp — requires BROWGENT_MCP_TOKEN or userData/mcp-bridge.json'

    if (flags.mcpPort == null) {
      return {
        enabled: false,
        host: HOST,
        port: null,
        baseUrl: null,
        tools,
        callCount: this.callCount,
        lastError: this.lastError,
        note: 'MCP bridge off (set BROWGENT_MCP_PORT=17342 or BROWGENT_MCP=1).',
        stdioHint
      }
    }

    if (!enabled) {
      return {
        enabled: false,
        host: HOST,
        port: flags.mcpPort,
        baseUrl: null,
        tools,
        callCount: this.callCount,
        lastError: this.lastError,
        note: this.lastError
          ? `MCP bridge failed: ${this.lastError}`
          : `MCP bridge starting on :${flags.mcpPort}…`,
        stdioHint
      }
    }

    return {
      enabled: true,
      host: HOST,
      port: this.port,
      baseUrl,
      tools,
      callCount: this.callCount,
      lastError: this.lastError,
      note: `MCP bridge live at ${baseUrl} (token required) · ${tools.length} tools · ${this.callCount} ok calls`,
      stdioHint
    }
  }

  async start(): Promise<void> {
    if (this.server || this.starting) return
    const flags = getRuntimeFlags()
    if (flags.mcpPort == null) {
      console.info('[browgent-mcp] bridge disabled (BROWGENT_MCP=0 or port unset)')
      return
    }

    this.starting = true
    this.token = this.loadOrCreateToken()
    const preferred = flags.mcpPort

    try {
      await this.listen(preferred)
      this.lastError = null
      console.info(
        `[browgent-mcp] bridge http://${HOST}:${this.port} (token in userData/mcp-bridge.json)`
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.lastError = msg
      console.error('[browgent-mcp] failed to start:', msg)
    } finally {
      this.starting = false
    }
  }

  stop(): void {
    if (this.server) {
      try {
        this.server.close()
      } catch {
        // ignore
      }
      this.server = null
      this.port = null
    }
  }

  private listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        void this.handle(req, res)
      })

      server.once('error', (err) => {
        reject(err)
      })

      server.listen(port, HOST, () => {
        this.server = server
        this.port = port
        resolve()
      })
    })
  }

  private loadOrCreateToken(): string {
    const envToken = process.env.BROWGENT_MCP_TOKEN?.trim()
    // Enforce the same >=16 floor as the file-stored token: a too-short env token is
    // rejected (warn + fall through) rather than silently accepted as a weak secret.
    if (envToken && envToken.length >= 16) return envToken
    if (envToken) {
      console.warn(
        '[browgent-mcp] BROWGENT_MCP_TOKEN too short (<16 chars) — ignoring, using file/generated token'
      )
    }

    try {
      const dir = app.getPath('userData')
      const file = join(dir, 'mcp-bridge.json')
      if (existsSync(file)) {
        const raw = JSON.parse(readFileSync(file, 'utf8')) as { token?: string }
        if (raw.token && typeof raw.token === 'string' && raw.token.length >= 16) {
          return raw.token
        }
      }
      mkdirSync(dir, { recursive: true })
      const token = randomBytes(24).toString('hex')
      writeFileSync(
        file,
        JSON.stringify(
          {
            token,
            host: HOST,
            port: getRuntimeFlags().mcpPort,
            createdAt: new Date().toISOString()
          },
          null,
          2
        ),
        { mode: 0o600 }
      )
      return token
    } catch {
      return randomBytes(24).toString('hex')
    }
  }

  /**
   * Bridge binds 127.0.0.1 only AND requires a bearer/token for all /v1 routes.
   * Health stays open for liveness probes.
   */
  private authorized(req: IncomingMessage): boolean {
    if (!this.token) return false
    const header = req.headers['authorization']
    let sent: string | null = null
    if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
      sent = header.slice(7).trim()
    } else if (typeof req.headers['x-browgent-token'] === 'string') {
      sent = req.headers['x-browgent-token'].trim()
    }
    if (!sent) return false
    try {
      const a = Buffer.from(sent)
      const b = Buffer.from(this.token)
      if (a.length !== b.length) return false
      return timingSafeEqual(a, b)
    } catch {
      return false
    }
  }

  private enqueueTool<T>(fn: () => Promise<T>): Promise<T> {
    if (this.queuedTools >= McpBridge.MAX_QUEUED) {
      return Promise.reject(new Error('Too many queued tool calls — retry shortly'))
    }
    this.queuedTools += 1
    const run = this.toolChain.then(async () => {
      try {
        // Client-facing timeout + wait-for-settle so the FIFO queue never advances while
        // a timed-out navigate/click is still mutating the same tabs.
        return await this.runToolWithTimeout(fn, McpBridge.TOOL_TIMEOUT_MS)
      } finally {
        this.queuedTools -= 1
      }
    })
    // Keep chain alive even if a tool rejects
    this.toolChain = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  /**
   * Reject with a clear timeout if `fn` exceeds `ms`, but always await the underlying
   * work before returning control to the tool queue (prevents overlapping mutators).
   */
  private async runToolWithTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    const work = fn()
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true
        reject(new Error(`Tool timed out after ${Math.round(ms / 1000)}s`))
      }, ms)
    })
    try {
      return await Promise.race([work, timeout])
    } finally {
      if (timer) clearTimeout(timer)
      if (timedOut) {
        await work.catch(() => undefined)
      }
    }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS not needed (localhost CLI); reject non-local just in case
    const url = new URL(req.url ?? '/', `http://${HOST}`)
    const path = url.pathname

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')

    try {
      if (req.method === 'GET' && path === '/health') {
        const body: McpHealthResponse = {
          ok: true,
          service: 'browgent-mcp-bridge',
          version: this.deps?.getVersion() ?? '0.0.0',
          tools: toolNames().length
        }
        this.json(res, 200, body)
        return
      }

      if (!this.authorized(req)) {
        this.json(res, 401, { ok: false, error: 'Unauthorized — set BROWGENT_MCP_TOKEN or read userData/mcp-bridge.json' })
        return
      }

      if (req.method === 'GET' && path === '/v1/status') {
        this.json(res, 200, this.getStatus())
        return
      }

      if (req.method === 'GET' && path === '/v1/tools') {
        this.json(res, 200, { tools: listMcpToolDescriptors() })
        return
      }

      if (req.method === 'GET' && path === '/v1/tabs') {
        const tabs = this.deps?.getTabs()?.getState() ?? []
        this.json(res, 200, { tabs })
        return
      }

      if (req.method === 'POST' && path === '/v1/tools/call') {
        const body = await this.readJson(req)
        const name = typeof body['name'] === 'string' ? body['name'].slice(0, 64) : ''
        const args =
          body['arguments'] && typeof body['arguments'] === 'object' && !Array.isArray(body['arguments'])
            ? (body['arguments'] as Record<string, unknown>)
            : body['args'] && typeof body['args'] === 'object' && !Array.isArray(body['args'])
              ? (body['args'] as Record<string, unknown>)
              : {}

        if (!name) {
          this.json(res, 400, { ok: false, error: 'name required' } satisfies Partial<McpToolCallResponse>)
          return
        }

        const agent = this.deps?.getAgent()
        if (!agent) {
          this.json(res, 503, {
            ok: false,
            tool: name,
            summary: 'Browgent agent not ready',
            error: 'Agent session not available — is the app window open?'
          } satisfies McpToolCallResponse)
          return
        }

        let result
        try {
          result = await this.enqueueTool(() => agent.executeMcpTool(name, args))
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          const isBusy = /queued tool calls/i.test(msg)
          this.json(res, isBusy ? 429 : 500, {
            ok: false,
            tool: name,
            summary: isBusy ? 'MCP busy' : 'Tool failed',
            error: msg
          } satisfies McpToolCallResponse)
          return
        }
        // Strip oversized element arrays for HTTP clients (full arrays stay in-session only).
        // Covers BOTH the flat observe shape (data.elements) and the nested snapshot shape
        // most tools attach via withAutoSnapshot (data.snapshot.elements).
        let data = result.data
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          let o = capElements(data as Record<string, unknown>)
          const snap = o.snapshot
          if (snap && typeof snap === 'object' && !Array.isArray(snap)) {
            const cappedSnap = capElements(snap as Record<string, unknown>)
            if (cappedSnap !== snap) o = { ...o, snapshot: cappedSnap }
          }
          data = o
        }
        if (result.ok) {
          this.callCount += 1
          try {
            recordMcpCall()
          } catch {
            // ignore
          }
        }
        const response: McpToolCallResponse = {
          ok: result.ok,
          tool: result.tool,
          summary: result.summary,
          data,
          error: result.error,
          needsHuman: result.needsHuman
        }
        this.json(res, result.ok ? 200 : 422, response)
        return
      }

      this.json(res, 404, { ok: false, error: `Not found: ${path}` })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.lastError = msg.slice(0, 200)
      this.json(res, 500, { ok: false, error: msg })
    }
  }

  private readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let size = 0
      req.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_BODY) {
          reject(new Error('Body too large'))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        if (!chunks.length) {
          resolve({})
          return
        }
        try {
          const raw = Buffer.concat(chunks).toString('utf8')
          const parsed = JSON.parse(raw) as unknown
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            reject(new Error('JSON body must be an object'))
            return
          }
          resolve(parsed as Record<string, unknown>)
        } catch {
          reject(new Error('Invalid JSON body'))
        }
      })
      req.on('error', reject)
    })
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    let payload: string
    try {
      payload = JSON.stringify(body)
    } catch {
      // A non-serializable body (circular ref / BigInt) must never throw inside this
      // void-ed async handler and take down Electron main — fall back to a safe body.
      status = 500
      payload = JSON.stringify({ ok: false, error: 'Response serialization failed' })
    }
    res.statusCode = status
    res.end(payload)
  }
}

/** Process-wide bridge (main only). */
export const mcpBridge = new McpBridge()

export function getMcpStatus(): McpStatus {
  return mcpBridge.getStatus()
}
