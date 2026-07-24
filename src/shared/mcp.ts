/**
 * MCP bridge types — shared by main process, preload, and renderer.
 *
 * Architecture:
 *   Claude Code / Cursor  ──stdio──► scripts/browgent-mcp.mjs
 *                                        │ HTTP localhost
 *   Browgent Electron main  ◄────────────┘  (ToolExecutor + same tabs)
 */

import type { ToolName } from './tools'

export const DEFAULT_MCP_PORT = 17342
export const MCP_BRIDGE_PATH_PREFIX = '/v1'

export interface McpStatus {
  /** Local HTTP bridge is listening */
  enabled: boolean
  /** Bridge bound host (always 127.0.0.1) */
  host: string
  /** Bridge port, or null when disabled */
  port: number | null
  /** Base URL for the bridge, e.g. http://127.0.0.1:17342 */
  baseUrl: string | null
  /** Tool names exposed over MCP (same catalog as the desktop agent) */
  tools: string[]
  /** Successful tool calls since process start */
  callCount: number
  /** Last error from bridge start or a failed call (short) */
  lastError: string | null
  /** Human-readable note for status bar / settings */
  note: string
  /** How to wire Claude Code / Cursor */
  stdioHint: string
}

export interface McpToolCallRequest {
  name: string
  arguments?: Record<string, unknown>
}

export interface McpToolCallResponse {
  ok: boolean
  tool: string
  summary: string
  data?: unknown
  error?: string
  /** When true, human must act in Browgent UI (policy confirm / takeover) */
  needsHuman?: boolean
}

export interface McpHealthResponse {
  ok: true
  service: 'browgent-mcp-bridge'
  version: string
  tools: number
}

/** Tools that only observe — safe while chat agent may also be running */
export const MCP_READ_TOOLS = new Set<ToolName>([
  'observe',
  'extract_text',
  'extract_links',
  'get_url',
  'list_tabs',
  'screenshot',
  'think',
  'done',
  'wait'
])
