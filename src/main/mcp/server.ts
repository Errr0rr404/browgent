/**
 * MCP status surface for IPC / UI.
 * Live bridge: ./bridge.ts · STDIO adapter: scripts/browgent-mcp.mjs
 */

export { getMcpStatus, mcpBridge } from './bridge'
export type { McpStatus } from '../../shared/mcp'
