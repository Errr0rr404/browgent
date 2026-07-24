# MCP — same session as the desktop agent

Browgent exposes an **MCP tool surface** that drives the **same local tabs** the human sees (cookies, SSO, takeover, policies).

## Architecture

```
Claude Code / Cursor / other MCP client
        │ STDIO
        ▼
scripts/browgent-mcp.mjs          (npm run mcp)
        │ HTTP 127.0.0.1
        ▼
Browgent main process bridge      (default :17342)
        │
        ▼
ToolExecutor + TabManager         (shared with chat agent)
```

| Piece | Role |
|-------|------|
| **HTTP bridge** | Always-on localhost control plane inside Electron |
| **STDIO adapter** | MCP protocol for Claude Code / Cursor |
| **Tools** | Same catalog as the in-app agent (`src/shared/tools.ts`) |

## Quick start

1. **Start Browgent** (bridge on by default):

```bash
npm run dev
# status bar should show: mcp · :17342
```

2. **Smoke-test the bridge:**

```bash
npm run mcp:smoke
```

3. **Wire Claude Code** (example project config):

```json
{
  "mcpServers": {
    "browgent": {
      "command": "node",
      "args": ["/absolute/path/to/browgent/scripts/browgent-mcp.mjs"],
      "env": {
        "BROWGENT_MCP_URL": "http://127.0.0.1:17342"
      }
    }
  }
}
```

Or from the repo root: `"command": "npm", "args": ["run", "mcp"], "cwd": "/path/to/browgent"`.

4. **Try tools:** `list_tabs` → `navigate` → `observe` → `click` / `type`.

## Env / flags

| Variable | Meaning |
|----------|---------|
| `BROWGENT_MCP=0` | Disable bridge |
| `BROWGENT_MCP_PORT=17342` | Port (default **on**) |
| `BROWGENT_MCP_TOKEN` | Optional shared secret (must match if client sends one) |
| `BROWGENT_MCP_URL` | STDIO proxy target (default `http://127.0.0.1:17342`) |

CLI: `--mcp=0`, `--mcp-port=17342`.

Token file (optional): `userData/mcp-bridge.json` after first launch (`app.setName('browgent')`).

## Policy & human-in-the-loop

- MCP calls use the **current agent mode + policy** (act / research / watch, host allow/block, sensitive clicks).
- Actions that need UI confirmation **do not auto-approve**. The tool returns `needsHuman` — take over or Accept/Reject in Browgent, then retry.
- Prefer **Takeover** when logging in or solving CAPTCHAs; **Resume** when the agent (or MCP) should continue.

## Security

- Bridge binds **127.0.0.1 only** (not LAN/public).
- **Token required** for all `/v1/*` routes (Bearer or `X-Browgent-Token`). Token is written to `userData/mcp-bridge.json` (mode 0600) or set via `BROWGENT_MCP_TOKEN`.
- `/health` stays unauthenticated for liveness only.
- Agent navigations block **private/metadata hosts** by default (loopback, RFC1918, 169.254.x). Override with `BROWGENT_ALLOW_PRIVATE_HOSTS=1` and/or policy `allowHosts`.
- Tool calls are **serialized** (one at a time) to avoid thrashing the guest page.
- Disable when not needed: `BROWGENT_MCP=0`.
- Do not tunnel the port to the public internet.

## Endpoints (HTTP)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness |
| GET | `/v1/status` | `McpStatus` JSON |
| GET | `/v1/tools` | Tool descriptors + JSON Schema |
| GET | `/v1/tabs` | Open tabs |
| POST | `/v1/tools/call` | `{ "name", "arguments" }` → tool result |

## Related

- [Playwright + CDP](./playwright.md)
- [Agent guide](./agent-guide.md)
- [QA with Browgent](./qa.md)
