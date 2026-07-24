#!/usr/bin/env node
/**
 * STDIO MCP server — proxies to a running Browgent localhost bridge.
 *
 * 1. Start Browgent (MCP bridge on by default at http://127.0.0.1:17342)
 * 2. Wire Claude Code / Cursor (see docs/mcp.md)
 * 3. npm run mcp
 */

import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const DEFAULT_URL = (process.env.BROWGENT_MCP_URL || 'http://127.0.0.1:17342').replace(/\/$/, '')

function loadToken() {
  if (process.env.BROWGENT_MCP_TOKEN?.trim()) return process.env.BROWGENT_MCP_TOKEN.trim()
  if (process.env.BROWGENT_MCP_TOKEN_FILE && existsSync(process.env.BROWGENT_MCP_TOKEN_FILE)) {
    try {
      const j = JSON.parse(readFileSync(process.env.BROWGENT_MCP_TOKEN_FILE, 'utf8'))
      if (j.token) return String(j.token)
    } catch {
      /* fall through */
    }
  }
  const candidates = [
    join(homedir(), 'Library/Application Support/browgent/mcp-bridge.json'),
    join(homedir(), 'Library/Application Support/Browgent/mcp-bridge.json'),
    join(homedir(), '.config/browgent/mcp-bridge.json'),
    join(homedir(), 'AppData/Roaming/browgent/mcp-bridge.json'),
    join(homedir(), 'AppData/Roaming/Browgent/mcp-bridge.json')
  ]
  for (const file of candidates) {
    try {
      if (existsSync(file)) {
        const j = JSON.parse(readFileSync(file, 'utf8'))
        if (j.token) return String(j.token)
      }
    } catch {
      /* continue */
    }
  }
  return null
}

const token = loadToken()

async function bridgeFetch(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}`, 'X-Browgent-Token': token } : {})
  }
  const res = await fetch(`${DEFAULT_URL}${path}`, { ...options, headers })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { error: text || res.statusText }
  }
  if (!res.ok && res.status !== 422) {
    throw new Error(`Bridge ${res.status}: ${data.error || data.summary || res.statusText}`)
  }
  return data
}

function formatToolResult(result) {
  const parts = []
  if (result.summary) parts.push(String(result.summary))
  if (result.error) parts.push(`Error: ${result.error}`)
  if (result.needsHuman) {
    parts.push('Needs human in Browgent UI (policy confirm, takeover, or login).')
  }
  if (result.data !== undefined) {
    try {
      parts.push('```json\n' + JSON.stringify(result.data, null, 2).slice(0, 12000) + '\n```')
    } catch {
      /* ignore */
    }
  }
  return parts.join('\n\n') || '(empty)'
}

async function main() {
  try {
    await bridgeFetch('/health')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[browgent-mcp] Cannot reach Browgent bridge at ${DEFAULT_URL}`)
    console.error(`[browgent-mcp] ${msg}`)
    console.error('[browgent-mcp] Start Browgent first (MCP on by default).')
    process.exit(1)
  }

  const catalog = await bridgeFetch('/v1/tools')
  const bridgeTools = catalog.tools || []

  /** @type {import('@modelcontextprotocol/sdk/types.js').Tool[]} */
  const tools = [
    ...bridgeTools.map((t) => ({
      name: t.name,
      description: t.description || t.name,
      inputSchema: t.inputSchema || { type: 'object', properties: {} }
    })),
    {
      name: 'browgent_status',
      description: 'Browgent bridge health, MCP status, and open tabs summary',
      inputSchema: { type: 'object', properties: {} }
    }
  ]

  const server = new Server(
    { name: 'browgent', version: '0.2.0' },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name
    const args = request.params.arguments ?? {}

    if (name === 'browgent_status') {
      const [status, tabs] = await Promise.all([
        bridgeFetch('/v1/status'),
        bridgeFetch('/v1/tabs')
      ])
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ status, tabs: tabs.tabs ?? tabs }, null, 2)
          }
        ]
      }
    }

    const result = await bridgeFetch('/v1/tools/call', {
      method: 'POST',
      body: JSON.stringify({ name, arguments: args })
    })

    return {
      content: [{ type: 'text', text: formatToolResult(result) }],
      isError: result.ok === false
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(
    `[browgent-mcp] STDIO connected → ${DEFAULT_URL} (${tools.length} tools, token=${token ? 'yes' : 'no'})`
  )
}

main().catch((err) => {
  console.error('[browgent-mcp] fatal:', err)
  process.exit(1)
})
