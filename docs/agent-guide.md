# Agent guide

## Modes

| Mode | Tools | Use when |
|------|-------|----------|
| **Act** | Full set (navigate, click, type, …) | Automation and multi-step goals |
| **Research** | Navigate + observe/extract (no click/type) | Read pages without mutating |
| **Watch** | Observe / extract only | You drive; agent answers questions |

Set mode in the agent panel. Mode updates policy (`researchOnly` when Research).

## Brain: Grok vs heuristic

| | Grok | Heuristic |
|--|------|-----------|
| Requires | `XAI_API_KEY` | Nothing |
| Loop | Multi-turn tool-calling API | Pattern planner + observe |
| Best for | Open-ended multi-step tasks | Offline, demos, known patterns |

If Grok fails (network, bad key), the session falls back to heuristics and notes it in chat.

## Tools (canonical)

Defined in `src/shared/tools.ts`, executed in `src/main/agent/executor.ts`:

| Tool | Purpose |
|------|---------|
| `navigate` | URL, alias, or search query |
| `back` / `forward` / `reload` | History |
| `click` / `type` / `hover` / `select_option` / `press_key` | DOM actions via `eN` refs or CSS |
| `scroll` / `wait` | Viewport timing |
| `observe` | Interactive elements + text preview |
| `extract_text` / `extract_links` / `screenshot` | Page content |
| `get_url` / `list_tabs` / `new_tab` / `close_tab` / `switch_tab` | Tab control |
| `ask_human` | Pause for credentials / CAPTCHA / choice |
| `think` / `done` | Reasoning + completion |

Always **observe** before inventing refs. Refs look like `e1`, `e2` from the last observe.

## Site aliases & intent

`src/shared/sites.ts` turns natural language into real navigation:

- `go to fb and sign up` → `https://www.facebook.com/` + task “sign up”
- `gh`, `yt`, `ig`, … → real hosts (not Google-by-default)
- Explicit `search …` → Google search URL

## Policies

Configurable in the **Policy** tab (and via IPC):

| Setting | Default | Effect |
|---------|---------|--------|
| Max steps | 40 | Cap tool steps per task |
| Confirm sensitive clicks | on | Pay / submit / delete-style labels |
| Confirm new host | off | Cross-host navigation gate |
| Pause on ask_human | on | Human handoff |
| Allow hosts | empty = all | Suffix allowlist |
| Block hosts | empty | Suffix denylist |

## Human control

| Control | Behavior |
|---------|----------|
| **Takeover / Pause** | You own the tab; agent waits |
| **Resume** | Continue after pause |
| **Stop** | Cancel run; you keep the tabs |
| **Clear** | Wipe chat/trajectory; tabs unchanged |
| **Allow / Deny** | Policy confirmation banners |

## Trajectory

Every tool step is logged. **Export** downloads JSON (`exportedAt`, messages, steps, policy, provider). Useful for debugging and later skill replay.

## Voice

Mic uses Chromium **Web Speech API** (system STT on many macOS setups). Guest pages cannot access the mic by default; only the chrome UI may.

## MCP

In-process tool names match the desktop tool surface (`getMcpStatus`). Full STDIO MCP binary is on the roadmap — see [market notes](./market.md).
