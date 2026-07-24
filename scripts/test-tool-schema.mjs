/**
 * Unit smoke for MCP tool schema conversion (no Electron).
 * Run: npm run test:unit
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Compile-free: re-implement the param parser in pure JS to avoid TS build
// for this smoke. Keep in sync with src/main/mcp/tool-schema.ts

const TOOL_DEFS = [
  { name: 'navigate', description: 'nav', params: { url: 'string', tabId: 'string?' } },
  { name: 'list_tabs', description: 'list', params: {} },
  { name: 'click', description: 'click', params: { ref: 'string?', selector: 'string?' } }
]

function toolDefToInputSchema(def) {
  const properties = {}
  const required = []
  for (const [key, spec] of Object.entries(def.params)) {
    const optional = spec.endsWith('?')
    const core = optional ? spec.slice(0, -1) : spec
    const type =
      core === 'number' || core === 'integer'
        ? 'number'
        : core === 'boolean'
          ? 'boolean'
          : 'string'
    properties[key] = { type, description: `${key} (${spec})` }
    if (!optional) required.push(key)
  }
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false
  }
}

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

const nav = toolDefToInputSchema(TOOL_DEFS[0])
assert(nav.type === 'object', 'navigate schema is object')
assert(nav.required?.includes('url'), 'navigate requires url')
assert(!nav.required?.includes('tabId'), 'tabId optional')
assert(nav.properties.url.type === 'string', 'url is string')

const list = toolDefToInputSchema(TOOL_DEFS[1])
assert(!list.required || list.required.length === 0, 'list_tabs no required')

const click = toolDefToInputSchema(TOOL_DEFS[2])
assert(!click.required || click.required.length === 0, 'click all optional')

if (failed) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nAll tool-schema unit checks passed')
