# Agent guide

## Modes

| Mode | Tools | Use when |
|------|-------|----------|
| **Act** | Full set (navigate, click, type, fill_form, download_assets, asserts, …) | Automation, form fill, multi-step goals |
| **Research** | Nav/history, observe, extract, screenshot, scroll/wait, tabs, `list_assets`, asserts, `get_profile` — **no** click/type/hover/press/`fill_form` | Read + move without form mutation |
| **Watch** | observe, extract_text / extract_links, get_url, screenshot, list_tabs, think, done, ask_human, `list_assets`, asserts, `get_profile` | You drive; agent answers / QA-checks from page state |

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

Settings → **Brain** shows the resolved provider and model. Keys are never stored in the UI. `BROWGENT_VISION=1` sends viewport screenshots to multimodal models (off by default; extra tokens).

## Tools (canonical)

Defined in `src/shared/tools.ts`, executed in `src/main/agent/executor.ts`:

| Tool | Purpose |
|------|---------|
| `navigate` | URL, host, or free text (auto search). Returns a **fresh element snapshot** after load |
| `search` | DuckDuckGo web search + snapshot + result text/links in one step (price/find goals) |
| `back` / `forward` / `reload` | History (with snapshot) |
| `click` / `type` / `hover` / `select_option` / `press_key` | DOM actions via `eN` refs or CSS (mutators return snapshot) |
| `scroll` / `wait` | Viewport timing |
| `observe` | Interactive elements + text preview (only when page changed without a tool) |
| `extract_text` / `extract_links` | Page content |
| `screenshot` | Viewport screenshot — returns size metadata only in the trajectory (image bytes are not stored) |
| `get_url` / `list_tabs` / `new_tab` / `close_tab` / `switch_tab` | Tab control |
| `get_profile` / `get_credentials` | User Hub profile / vault password (confirm) |
| `fill_form` | Profile-assisted form fill (no passwords) |
| `list_assets` / `download_assets` | Page media/docs → downloads folder |
| `assert_text` / `assert_url` / `assert_element` | QA pass/fail checks (trajectory) |
| `ask_human` | Pause for credentials / CAPTCHA / choice |
| `think` / `done` | Reasoning + completion |

See also [qa.md](./qa.md) for smoke-testing your own webapp.

**Speed model (BrowserOS-style):** mutators return accessibility snapshots with refs `e1`, `e2`… — skip a redundant `observe` after navigate/click/type. Prefer `search` for open-ended “find / cheapest / what is” goals.

## Site aliases & intent

`src/shared/sites.ts` turns natural language into real navigation:

- `go to fb and sign up` → `https://www.facebook.com/` + task “sign up”
- `gh`, `yt`, `ig`, … → real hosts (not Google-by-default)
- Explicit `search …` / “cheapest … find on browser” → DuckDuckGo search (avoids Google captcha)

## Dual driver

In-app actuation path (independent of Playwright attach):

| Mode | Mechanism | When |
|------|-----------|------|
| **DOM** (default) | Injected observe/act + `eN` refs | Fastest agent loop |
| **CDP** | `webContents.debugger` Input events | Real key/mouse events |

Toggle in the **status bar** (`drive dom · cdp:9222`) or **Policy** tab. Env: `BROWGENT_DRIVER=dom|cdp`.  
External Playwright always uses the **CDP endpoint** (`connectOverCDP`) — keep the in-app driver on **DOM** while Playwright is attached to avoid debugger contention. Details: [playwright.md](./playwright.md).

## Policies

Named packs in the **Policy** tab (and Settings → Agent & policy): **Strict** (confirm new hosts + sensitive clicks, 30 steps), **Builder** (default — sensitive clicks only, 40 steps), **Open** (minimal gates, 60 steps). Per-setting defaults (Builder / `DEFAULT_POLICY`):

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

Every tool step is logged. **Export** downloads JSON (`exportedAt`, `mode`, `provider`, `model`, `policy`, `steps`, `messages`). Useful for debugging and later skill replay. Password field values are masked in observe snapshots, prompts sent to remote LLMs are redacted, and exported trajectories scrub credentials and sensitive URLs — but you should still avoid sending secrets unnecessarily and review what you export.

## Voice

Mic uses Chromium **Web Speech API** (system STT on many macOS setups). Guest pages cannot access the mic by default; only the chrome UI may.

## MCP

Live localhost bridge (default port **17342**) + STDIO adapter (`npm run mcp`). Same tools and policies as the desktop agent on shared tabs. See [mcp.md](./mcp.md).

External automation also: **Playwright over CDP** ([playwright.md](./playwright.md)).

## Navigation policy

The agent and app only navigate `http://`, `https://`, or `about:blank`. `file:`, `data:`, and `javascript:` URLs are rejected by the navigation gate and `new_tab` flow. Private/metadata hosts are blocked by default (`BROWGENT_ALLOW_PRIVATE_HOSTS=1` to override).

## Convenience chrome

| UI | Behavior |
|----|----------|
| **Summarize** (toolbar / ⌘⇧U) | Research-mode page summary (`src/shared/summary.ts`) |
| Downloads → **Save page assets** | List/select images & docs; same as `list_assets` / `download_assets` |
| Settings → **Brain** | Resolved provider/model (keys stay in `.env`) |
| Settings → **Privacy & data** | Ad/tracker filter, cookie banners, metrics/traction export |
| Settings → **User Hub** | Profile for `fill_form` / `get_profile`; vault for `get_credentials` |
| Settings → **Search & new tab** | Omnibox engine (Google / DuckDuckGo / Brave / Kagi). Agent `search` stays on DuckDuckGo |

QA recipes and assert tools: [qa.md](./qa.md).
