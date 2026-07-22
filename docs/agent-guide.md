# Agent guide

## Modes

| Mode | Tools | Use when |
|------|-------|----------|
| **Act** | Full set (navigate, click, type, …) | Automation and multi-step goals |
| **Research** | Navigate/history, observe, extract, screenshot, scroll/wait, tabs — **no** click/type/hover/press | Read + move without form mutation |
| **Watch** | observe, extract, get_url, screenshot, list_tabs, think, done, ask_human | You drive; agent answers from page state |

Set mode in the agent panel. Mode updates policy (`researchOnly` when Research).

## Brain: LLM vs heuristic

| | LLM (default: Grok) | Heuristic |
|--|---------------------|-----------|
| Requires | API key (see below) | Nothing |
| Loop | Multi-turn OpenAI-compatible tool-calling | Pattern planner + observe |
| Best for | Open-ended multi-step tasks | Offline, demos, known patterns |

**Default:** set `XAI_API_KEY` for [Grok](https://console.x.ai).  
**Any OpenAI-compatible API** works — OpenAI, OpenRouter (Claude/Gemini/…), Groq, DeepSeek, Ollama, custom proxies — via `BROWGENT_PROVIDER`, `BROWGENT_API_KEY`, `BROWGENT_BASE_URL`, and `BROWGENT_MODEL`. See [Getting started](./getting-started.md#environment-variables).

If the LLM fails (network, bad key), the session falls back to heuristics and notes it in chat.

## Tools (canonical)

Defined in `src/shared/tools.ts`, executed in `src/main/agent/executor.ts`:

| Tool | Purpose |
|------|---------|
| `navigate` | URL, alias, or search query |
| `back` / `forward` / `reload` | History |
| `click` / `type` / `hover` / `select_option` / `press_key` | DOM actions via `eN` refs or CSS |
| `scroll` / `wait` | Viewport timing |
| `observe` | Interactive elements + text preview |
| `extract_text` / `extract_links` | Page content |
| `screenshot` | Viewport size metadata only (not stored in trajectory) |
| `get_url` / `list_tabs` / `new_tab` / `close_tab` / `switch_tab` | Tab control |
| `ask_human` | Pause for credentials / CAPTCHA / choice |
| `think` / `done` | Reasoning + completion |

Always **observe** before inventing refs. Refs look like `e1`, `e2` from the last observe.

## Site aliases & intent

`src/shared/sites.ts` turns natural language into real navigation:

- `go to fb and sign up` → `https://www.facebook.com/` + task “sign up”
- `gh`, `yt`, `ig`, … → real hosts (not Google-by-default)
- Explicit `search …` → Google search URL

## Dual driver

In-app actuation path (independent of Playwright attach):

| Mode | Mechanism | When |
|------|-----------|------|
| **DOM** (default) | Injected observe/act + `eN` refs | Fastest agent loop |
| **CDP** | `webContents.debugger` Input events | Real key/mouse events |

Toggle in the **status bar** (`drive dom · cdp:9222`) or **Policy** tab. Env: `BROWGENT_DRIVER=dom|cdp`.  
External Playwright always uses the **CDP endpoint** (`connectOverCDP`) — keep the in-app driver on **DOM** while Playwright is attached to avoid debugger contention. Details: [playwright.md](./playwright.md).

## Policies

Configurable in the **Policy** tab (and via IPC):

| Setting | Default | Effect |
|---------|---------|--------|
| In-app driver | DOM | DOM inject vs CDP Input events |
| Max steps | 40 | Cap tool steps per task |
| Confirm sensitive clicks | on | Pay / submit / delete-style labels |
| Confirm new host | off | Cross-host navigation gate |
| Pause on ask_human | on | Human handoff |
| Allow hosts | empty = all | Suffix allowlist |
| Block hosts | empty | Suffix denylist |

## Human control

| Control | Behavior |
|---------|----------|
| **Takeover / Pause** | You own the tab; agent waits (Stop still available) |
| **Resume** | Continue after pause |
| **Stop** | Cancel run (works while thinking/acting/paused/waiting); you keep the tabs |
| **Clear** | Wipe chat/trajectory; tabs unchanged |
| **Allow / Deny** | Policy confirmation banners |
| **Reply in composer** | When `waiting_human`, Enter answers `ask_human` (not a new goal) |

## Trajectory

Every tool step is logged. **Export** downloads JSON (`exportedAt`, `mode`, `provider`, `model`, `policy`, `steps`, `messages`). Useful for debugging and later skill replay. Password field values are masked in observe snapshots.

## Voice

Mic uses Chromium **Web Speech API** (system STT on many macOS setups). Guest pages cannot access the mic by default; only the chrome UI may.

## MCP

`getMcpStatus` returns the **tool catalog** (same names as the desktop agent). There is **no** live STDIO MCP server yet — that is on the roadmap. External automation today uses **Playwright over CDP** ([playwright.md](./playwright.md)).
