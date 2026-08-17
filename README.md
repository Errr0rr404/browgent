# Browgent

> **An AI agent that works inside your real, logged-in browser — with you one click from taking the wheel.**
>
> Local-first, open-source **co-browse runtime**. The in-app agent, Claude Code (over MCP), and Playwright (over CDP) all drive the **same Chromium tabs you do** — behind a policy engine, with human takeover→resume and exportable trajectories. Cookies stay on disk. **v0.2.0.**

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](./LICENSE)
[![Release](https://img.shields.io/github/v/release/Errr0rr404/browgent?include_prereleases&label=release)](https://github.com/Errr0rr404/browgent/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/Errr0rr404/browgent/ci.yml?branch=main&label=ci)](https://github.com/Errr0rr404/browgent/actions/workflows/ci.yml)

Landing page: [errr0rr404.github.io/browgent](https://errr0rr404.github.io/browgent/)

Not another chat sidebar bolted onto Chrome. Browgent is a desktop runtime: real multi-tab Chromium, an agent tool loop, safety policies, trajectory export, a localhost **MCP** bridge, and **Playwright over CDP** — all on your machine.

## Who it's for

**Beachhead:** developers building browser agents that keep failing on real **login / SSO / CAPTCHA** walls. Browgent gives that agent a local, logged-in session, a human who can take over mid-task and hand control back on the same tab, and an exportable trajectory for debug and evals.

Also useful for HITL automation/ops and eval/safety work that needs a policy gate and an audit trail. It is **not** a consumer chat-browser and **not** a multi-tenant cloud fleet.

## Why Browgent (vs the browsers you'll confuse it with)

The closest open-source project is **BrowserOS**, and the honest one-line difference is:

> **BrowserOS is a browser for end-users to automate their own browsing. Browgent is a runtime you attach agents and Playwright to, with a human in the loop.**

Comet / Dia / Atlas are the consumer-category reference — polished AI browsers with a closed, built-in assistant. The table below is deliberately short and checkable: every row is something you can verify by cloning the repo.

| Checkable differentiator | Browgent | BrowserOS | Comet / Dia / Atlas | Cloud BaaS\* |
|--------------------------|:--------:|-----------|---------------------|--------------|
| **External tools drive the _same_ session** — attach Claude Code (MCP) & Playwright (CDP) to the tabs you see | ✅ | Built-in agent only | Closed built-in assistant | Separate cloud session |
| **Policy engine + exportable trajectory** — host gates, sensitive-action confirm, JSON audit for evals/replay | ✅ | Not an exported audit surface | No | Product logs / API |
| **Human takeover → resume on the same tab** — agent pauses, you log in, agent continues | ✅ | You drive (consumer browser) | Assistant-led; no resume handoff | Remote live-view |
| **Local-first, open-source runtime you self-host** — cookies / SSO stay on disk | ✅ | ✅ also OSS + local | Local browser, but closed source | Multi-tenant cloud |
| **Model-agnostic** — any OpenAI-compatible model, or none (heuristic) | ✅ | ✅ BYO key / local | Vendor model | Bring your agent |

\* Browserbase, Steel, Kernel, Hyperbrowser, etc. — great for headless fleets; not a local co-browse desktop.

Browgent wins the **attach + audit + human-in-the-loop** axis. It **ties BrowserOS** on being open-source and local, and doesn't pretend otherwise. Full map: [docs/market.md](./docs/market.md).

## Download

| Platform | Download |
|----------|----------|
| **macOS** (Apple Silicon) | [**Download DMG**](https://github.com/Errr0rr404/browgent/releases/latest/download/Browgent-mac-arm64.dmg) |
| All builds & notes | [Releases](https://github.com/Errr0rr404/browgent/releases/latest) |

The published **latest** release is the macOS arm64 DMG. Windows NSIS and Linux AppImage targets exist (`npm run dist:win` / `dist:linux`); tag `v*` CI builds them as a **draft** GitHub Release — they are not attached to the current latest tag unless a maintainer publishes them.

> First open on macOS: right-click the app → **Open** (unsigned open-source build).

## Stack (from `package.json`)

| Piece | Version |
|-------|---------|
| App | **0.2.0** · MIT · Node **≥ 22.12.0** |
| Desktop | Electron **^43.2.0**, electron-vite **^3.1.0**, electron-builder **^26.0.12**, Vite **^6.3.5** |
| Chrome UI | React **^19.1.0**, zustand **^5.0.5**, lucide-react **^0.511.0** |
| Language | TypeScript **^5.8.3** |
| Agent attach | `@modelcontextprotocol/sdk` **^1.29.0** (STDIO MCP adapter) |
| Browser import | sql.js **^1.14.1** (read other browsers’ SQLite) |
| Lint / tests | ESLint **^9.39.5**, tsx **^4.23.1** (unit smokes; no Playwright in the app) |

Playwright is an **external** attach client (`npm i -D playwright`), not an app dependency.

## Quick start (from source)

```bash
git clone https://github.com/Errr0rr404/browgent.git
cd browgent
./setup.sh          # npm ci/install + .env from example + typecheck
npm run dev
```

Copy `.env.example` → `.env` and set provider keys if you want an LLM. Without a key, the heuristic planner still drives the browser. Names only — never commit values. Full table and modes: [docs/getting-started.md](./docs/getting-started.md).

### Attach an agent (MCP) or Playwright

With Browgent running, the localhost MCP bridge listens on port **17342** (status bar: `mcp · :17342`; token auto-written to userData).

```bash
npm run mcp:smoke   # HTTP bridge smoke (app must be running)
npm run mcp         # STDIO MCP server for Claude Code / Cursor
npm run demo:hero   # automated co-browse path (app must be running)
```

Playwright attaches to the same cookies over CDP — enable a port first (`BROWGENT_CDP_PORT`). See [docs/playwright.md](./docs/playwright.md).

## Test

CI on `main` (`.github/workflows/ci.yml`) runs typecheck, lint, unit smokes, and build.

```bash
npm run typecheck     # tsc --noEmit (node + web projects)
npm run lint          # ESLint
npm run test:unit     # tool schema + privacy host-match + policy/SSRF smokes
npm run build         # electron-vite production compile
```

Needs a running app:

```bash
npm run mcp:smoke           # HTTP MCP bridge
npm run test:identity       # guest navigate / UA smoke via MCP
npm run playwright:example  # CDP attach (Playwright + BROWGENT_CDP_PORT)
```

## Build & release

```bash
npm run preview       # electron-vite preview of a built tree
npm run dist:mac      # DMG arm64 → release/Browgent-mac-arm64.dmg
npm run dist:win      # NSIS x64
npm run dist:linux    # AppImage x64
npm run dist:dir      # unpacked dir (all configured targets)
npm run dist          # electron-builder default targets
```

Push a `v*` tag to run `.github/workflows/release.yml` (macOS / Windows / Linux matrix → **draft** GitHub Release). Landing site deploys from `website/` via `.github/workflows/pages.yml`. Details: [docs/releasing.md](./docs/releasing.md).

## Environment variables

Names only. Copy `.env.example` → `.env` (gitignored). Packaged builds do not read a `.env` next to the installer — set the shell env or put `.env` in the app userData folder.

**Brain (any OpenAI-compatible provider; none → heuristic):**
`XAI_API_KEY`, `GROK_API_KEY`, `SPACE_XAI_API_KEY`, `XAI_BASE_URL`,
`BROWGENT_PROVIDER`, `BROWGENT_API_KEY`, `BROWGENT_BASE_URL`, `BROWGENT_MODEL`,
`BROWGENT_VISION`, `BROWGENT_MAX_TOKENS`,
`OPENAI_API_KEY`, `OPENAI_BASE_URL`,
`OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`,
`GROQ_API_KEY`, `GROQ_BASE_URL`,
`DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`,
`OLLAMA_API_KEY`, `OLLAMA_BASE_URL`, `OLLAMA_HOST`

Legacy aliases accepted by the resolver: `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_VISION`, `LLM_MAX_TOKENS`.

**Runtime / attach:**
`BROWGENT_CDP`, `BROWGENT_CDP_PORT`, `BROWGENT_CDP_URL`,
`BROWGENT_DRIVER`, `BROWGENT_AGENT_ONLY`, `BROWGENT_HEADLESS`,
`BROWGENT_MCP`, `BROWGENT_MCP_PORT`, `BROWGENT_MCP_TOKEN`,
`BROWGENT_MCP_TOKEN_FILE`, `BROWGENT_MCP_URL`,
`BROWGENT_ALLOW_PRIVATE_HOSTS`, `BROWGENT_TELEMETRY_URL`

## Repository layout

| Path | Role |
|------|------|
| `src/main/` | Electron main: window, tabs, agent, MCP bridge, metrics |
| `src/main/browser/` | Guest tabs, privacy filter, identity, CDP, import, vault |
| `src/main/agent/` | Session loop, planner, LLM client, tool executor |
| `src/main/mcp/` | Localhost HTTP bridge + JSON Schema for tools |
| `src/preload/` | Chrome IPC (`index`), guest identity (`guest`), pet overlay (`pet`) |
| `src/renderer/` | React chrome UI only (no guest DOM) |
| `src/shared/` | Tools, policies, recipes, privacy, sites, types |
| `scripts/` | STDIO MCP, unit smokes, hero demo, YC packet |
| `examples/` | Playwright attach + sample trajectory |
| `docs/` | Human documentation |
| `website/` | GitHub Pages landing |
| `recipes/` | Recipe index (canonical prompts in `src/shared/recipes.ts`) |
| `.github/workflows/` | `ci.yml`, `release.yml`, `pages.yml` |

Coding-agent map: [AGENTS.md](./AGENTS.md). Architecture: [docs/architecture.md](./docs/architecture.md).

## Documentation

| Doc | Description |
|-----|-------------|
| [**Docs index**](./docs/README.md) | Full documentation map |
| [Getting started](./docs/getting-started.md) | Install, env vars, CDP flags, first run |
| [Builders](./docs/builders.md) | Positioning + Claude Code / MCP / Playwright |
| [MCP](./docs/mcp.md) | Bridge + STDIO + security |
| [Playwright + dual driver](./docs/playwright.md) | CDP attach, DOM vs CDP driver |
| [Market map](./docs/market.md) | Competitors + where Browgent fits |
| [YC application](./docs/yc-application.md) | Application packet + checklist (dated) |

## License

[MIT](./LICENSE) · [Contributing](./CONTRIBUTING.md) · [Security](./SECURITY.md)
