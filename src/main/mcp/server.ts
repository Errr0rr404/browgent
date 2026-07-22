/**
 * Lightweight STDIO MCP server skeleton.
 * Exposes the same tab tools coding agents use (Cursor / Claude / Grok).
 *
 * Run: node out/main/mcp-cli.js  (or npm run mcp)
 * Full @modelcontextprotocol/sdk wiring can replace this protocol loop later.
 */

import { ToolExecutor, makeToolCall } from '../agent/executor'
import type { TabManager } from '../browser/tab-manager'
import { DEFAULT_POLICY } from '../../shared/policies'
import type { ToolName } from '../../shared/tools'
import { TOOL_DEFS } from '../../shared/tools'

export interface McpStatus {
  enabled: boolean
  tools: string[]
  note: string
}

export function getMcpStatus(): McpStatus {
  return {
    enabled: true,
    tools: TOOL_DEFS.map((t) => t.name),
    note: 'In-process tool bridge ready. Wire STDIO MCP via `npm run mcp` (session shares desktop tabs when launched from app).'
  }
}

/** Programmatic MCP-style invoke used by desktop + future STDIO adapter */
export async function mcpCallTool(
  tabs: TabManager,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const executor = new ToolExecutor(tabs)
  const result = await executor.execute(makeToolCall(name as ToolName, args), {
    policy: DEFAULT_POLICY,
    mode: 'act'
  })
  return result
}

export function listMcpTools(): typeof TOOL_DEFS {
  return TOOL_DEFS
}
