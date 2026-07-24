# Browgent

**Local-first browser for AI agents** — humans and agents share the same Chromium tabs. **Version 0.2.0.**

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](./LICENSE)
[![Release](https://img.shields.io/github/v/release/Errr0rr404/browgent?include_prereleases&label=release)](https://github.com/Errr0rr404/browgent/releases/latest)

Not another chat sidebar bolted onto Chrome. Browgent is a **desktop co-browse runtime**: real multi-tab Chromium, agent tools, safety policies, trajectory export, **MCP**, and Playwright over CDP — all on your machine.

> **One-liner:** Local co-browse runtime where humans and agents share real Chromium tabs — policy, takeover, trajectories, MCP + Playwright. Cookies stay on disk.

| Not | Instead |
|-----|---------|
| BrowserOS (agentic consumer browser) | **Runtime / control plane** for builders + HITL |
| Comet / Dia / Atlas | Open, attachable, policy-auditable co-browse |
| Browserbase / cloud BaaS | **Local-first** same-session tabs, not multi-tenant fleets |

Builder path: [docs/builders.md](./docs/builders.md) · Install: [docs/getting-started.md](./docs/getting-started.md) · **YC:** [docs/yc-application.md](./docs/yc-application.md)

```bash
npm run demo:hero    # automated co-browse path (Browgent must be running)
npm run yc:packet    # traction JSON → release/yc-traction-packet.json
```

## What Browgent does that others don’t

Consumer AI browsers (Comet, Dia, Atlas) optimize for “ask the assistant.” Cloud fleets (Browserbase, Steel…) optimize for headless scale. Browgent optimizes for **you + an agent on the same local tabs**, with builder-grade control.

| Capability | **Browgent** | Chrome | Comet | Dia | ChatGPT Atlas | Cloud BaaS\* |
|------------|:------------:|:------:|:-----:|:---:|:-------------:|:------------:|
| **True co-browse** — agent & human share the same local tab tree (not a remote live-view) | ✅ | — | ⚠️ | ⚠️ | ⚠️ | ❌ remote |
| **Local-first identity** — cookies / SSO stay on disk (`persist:browgent-pages`) | ✅ | ✅ human | ⚠️ product | ⚠️ product | ⚠️ product | ❌ multi-tenant |
| **Open source (MIT)** — inspect, fork, self-host the runtime | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ / partial |
| **Dual driver** — fast DOM inject *and* CDP for real input events | ✅ | — | ❌ | ❌ | ❌ | CDP only |
| **Playwright attach** — `connectOverCDP` to the *same* desktop session | ✅ | ⚠️ manual | ❌ | ❌ | ❌ | ✅ separate fleet |
| **Browser-native policy engine** — allow/block hosts, confirm sensitive clicks, max steps | ✅ | — | ⚠️ product | ⚠️ product | ⚠️ product | ⚠️ API |
| **Act / Research / Watch modes** — full control, read-mostly, or human-only drive | ✅ | — | ⚠️ | ⚠️ | ⚠️ | — |
| **Human takeover → resume same tab** — agent pauses; you log in / fix; agent continues | ✅ | — | ⚠️ | ⚠️ | ⚠️ | live-view only |
| **Tab ownership badges** — see who owns the tab (`agent` / human) | ✅ | — | ❌ | ❌ | ❌ | — |
| **Trajectory log + JSON export** — every tool step for debug, evals, replay | ✅ | — | ❌ | ❌ | ⚠️ | ⚠️ product |
| **Compact element refs** (`e1`, `e2`…) — Stagehand / browser-use style observe | ✅ | — | ❌ | ❌ | ❌ | via frameworks |
| **Works offline of a vendor chat** — heuristic planner without API key | ✅ | n/a | ❌ | ❌ | ❌ | n/a |
| **Model not locked to one cloud chat** — Grok via key; swap/extend the loop | ✅ | n/a | Perplexity | product LLM | OpenAI | bring-your-agent |
| **Shared tool surface** — desktop tools + live STDIO MCP + Playwright CDP | ✅ | extensions | ❌ | ❌ | ❌ | cloud MCP |
| **Voice → agent on real tabs** | ✅ | — | ⚠️ | ⚠️ | ⚠️ | — |

\*Browserbase, Steel, Kernel, Hyperbrowser, etc. — great for fleets; not a local co-browse desktop.

**Legend:** ✅ strong / first-class · ⚠️ partial or product-gated · ❌ not the product · — not applicable

### Why that combination matters

```
Chrome          →  You browse. No agent runtime.
Comet / Dia / Atlas →  Polished AI product browser (closed, vendor brain).
Cloud BaaS      →  Agents at scale in someone else's Chromium.
Browgent        →  You + agent + Playwright (CDP) on *your* tabs, with policy + audit.
```

Browgent is not trying to be lighter than headless Playwright. It is trying to be the **best local co-browse agent browser**: open, attachable, policy-aware, and human-in-the-loop by default.

## Download

| Platform | Download |
|----------|----------|
| **macOS** (Apple Silicon) | [**Download DMG**](https://github.com/Errr0rr404/browgent/releases/latest/download/Browgent-mac-arm64.dmg) |
| All builds & notes | [Releases](https://github.com/Errr0rr404/browgent/releases/latest) |

> First open on macOS: right-click the app → **Open** (unsigned open-source build).

## Quick start (from source)

```bash
git clone https://github.com/Errr0rr404/browgent.git
cd browgent
./setup.sh
npm run dev
```

Optional: copy `.env.example` → `.env` and set `XAI_API_KEY` for [Grok](https://console.x.ai) (default brain), or point `BROWGENT_PROVIDER` / `BROWGENT_API_KEY` / `BROWGENT_BASE_URL` at any OpenAI-compatible model. Without a key, the heuristic agent still drives the browser.

### MCP (Claude Code / Cursor)

With Browgent running, the localhost bridge listens on **:17342** by default (status bar: `mcp · :17342`).

```bash
npm run mcp:smoke    # HTTP bridge smoke
npm run mcp          # STDIO MCP server for coding agents
```

See [docs/mcp.md](./docs/mcp.md), [docs/getting-started.md](./docs/getting-started.md), [recipes/](./recipes/).  
Landing: [website/index.html](./website/index.html).

## Capabilities at a glance

| Mode | Behavior |
|------|----------|
| **Act** | Full browser control (navigate, click, type, …) |
| **Research** | Read-mostly (nav + observe/extract/tabs; no click/type) |
| **Watch** | You browse; agent observes / answers |

### Dual driver + Playwright

| Path | Role |
|------|------|
| **DOM** (default in-app) | Fast inject observe/act for the chat agent |
| **CDP** (in-app optional) | Real `Input` events via DevTools protocol |
| **CDP endpoint** | Playwright / external tools: `connectOverCDP` |

CDP is off for normal `npm run dev`; enable it explicitly with `BROWGENT_CDP_PORT=9222` (or `BROWGENT_CDP=1`/`on`). A custom positive port is also supported. `BROWGENT_CDP=0`/`off`/`false` or port `0` always disables it. `BROWGENT_AGENT_ONLY` and `BROWGENT_HEADLESS` imply CDP unless explicitly disabled. CDP is localhost-only, but any local process can control or read the session; never expose it publicly.

```bash
npm run dev                                      # normal UI; CDP off
BROWGENT_CDP_PORT=9222 npm run dev              # normal UI + localhost CDP
npm run dev:agent                                # compact automation shell + CDP
npm run dev:headless                             # hidden window + agent-only + CDP
npm i -D playwright && npm run playwright:example
```

Disable remote debugging with `BROWGENT_CDP=0`. Details: [docs/playwright.md](./docs/playwright.md).

## Documentation

| Doc | Description |
|-----|-------------|
| [**Docs index**](./docs/README.md) | Full documentation map |
| [Getting started](./docs/getting-started.md) | Install, env, first run |
| [Builders](./docs/builders.md) | Positioning + Claude / MCP / Playwright |
| [MCP](./docs/mcp.md) | Bridge + STDIO + security |
| [YC application](./docs/yc-application.md) | Application packet + checklist |
| [Architecture](./docs/architecture.md) | Process model |
| [Security](./SECURITY.md) | Vulnerability reporting |

## License

[MIT](./LICENSE) · [Contributing](./CONTRIBUTING.md) · [Security](./SECURITY.md)
