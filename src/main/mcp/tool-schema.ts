/**
 * Convert Browgent TOOL_DEFS → MCP / JSON Schema for list_tools.
 */

import { TOOL_DEFS, type ToolDef, type ToolName } from '../../shared/tools'

export interface JsonSchemaProperty {
  type?: string | string[]
  description?: string
  enum?: string[]
}

export interface McpJsonSchema {
  type: 'object'
  properties: Record<string, JsonSchemaProperty>
  required?: string[]
  additionalProperties?: boolean
}

export interface McpToolDescriptor {
  name: ToolName
  description: string
  inputSchema: McpJsonSchema
}

function paramToSchema(spec: string): JsonSchemaProperty {
  const optional = spec.endsWith('?')
  const core = optional ? spec.slice(0, -1) : spec
  const type =
    core === 'number' || core === 'integer'
      ? 'number'
      : core === 'boolean'
        ? 'boolean'
        : 'string'
  return { type }
}

/** Build JSON Schema from ToolDef.params shorthand (`string`, `number?`, …). */
export function toolDefToInputSchema(def: ToolDef): McpJsonSchema {
  const properties: Record<string, JsonSchemaProperty> = {}
  const required: string[] = []

  for (const [key, spec] of Object.entries(def.params)) {
    const optional = spec.endsWith('?')
    properties[key] = {
      ...paramToSchema(spec),
      description: `${key} (${spec})`
    }
    if (!optional) required.push(key)
  }

  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false
  }
}

export function listMcpToolDescriptors(): McpToolDescriptor[] {
  return TOOL_DEFS.map((def) => ({
    name: def.name,
    description: def.description + (def.sensitive ? ' (may require human in Browgent UI)' : ''),
    inputSchema: toolDefToInputSchema(def)
  }))
}

export function toolNames(): ToolName[] {
  return TOOL_DEFS.map((t) => t.name)
}
