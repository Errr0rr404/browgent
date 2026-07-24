/**
 * Unit smoke for MCP tool-schema conversion — imports the REAL source
 * (src/main/mcp/tool-schema.ts + the real TOOL_DEFS) via tsx, so a drift in
 * either the converter or the tool definitions is actually caught.
 * Run: tsx scripts/test-tool-schema.mjs   (or: npm run test:unit)
 */
import { toolDefToInputSchema } from '../src/main/mcp/tool-schema'
import { TOOL_DEFS } from '../src/shared/tools'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

// Every real tool definition must convert to a well-formed JSON Schema, with
// required ⇔ non-optional params and correct primitive types.
for (const def of TOOL_DEFS) {
  const schema = toolDefToInputSchema(def)
  assert(schema.type === 'object', `${def.name}: schema is object`)
  assert(schema.additionalProperties === false, `${def.name}: additionalProperties false`)
  const params = Object.entries(def.params)
  assert(
    Object.keys(schema.properties).length === params.length,
    `${def.name}: every param mapped`
  )
  for (const [key, spec] of params) {
    const optional = spec.endsWith('?')
    const inRequired = (schema.required ?? []).includes(key)
    assert(optional ? !inRequired : inRequired, `${def.name}.${key}: required iff not optional`)
    const expected =
      /^(number|integer)\??$/.test(spec) ? 'number' : /^boolean\??$/.test(spec) ? 'boolean' : 'string'
    assert(schema.properties[key].type === expected, `${def.name}.${key}: type ${expected}`)
  }
}

assert(TOOL_DEFS.length >= 10, `TOOL_DEFS is non-trivial (${TOOL_DEFS.length} tools)`)
assert(
  TOOL_DEFS.some((t) => t.name === 'navigate') && TOOL_DEFS.some((t) => t.name === 'click'),
  'core tools (navigate, click) present'
)

if (failed) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log(`\nAll tool-schema unit checks passed (${TOOL_DEFS.length} tools verified)`)
