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
    enabled: false,
    tools: TOOL_DEFS.map((t) => t.name),
    note:
      'Tool catalog ready (same names as the desktop agent). Full STDIO MCP server is on the roadmap. Playwright uses CDP (BROWGENT_CDP_PORT), not MCP.'
  }
}
