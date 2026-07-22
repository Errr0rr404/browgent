/**
 * In-process MCP tool bridge status.
 * Tool names match the desktop agent (`TOOL_DEFS`). Full STDIO MCP binary is roadmap.
 */

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
    note:
      'In-process tool bridge ready. Dual mode: in-app agent uses DOM or CDP driver; Playwright attaches via remote-debugging-port (see driver:status / BROWGENT_CDP_PORT).'
  }
}

export function listMcpTools(): typeof TOOL_DEFS {
  return TOOL_DEFS
}
