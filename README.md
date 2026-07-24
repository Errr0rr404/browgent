# Browgent

> **An AI agent that works inside your real, logged-in browser — with you one click from taking the wheel.**
>
> *Builder's cut:* a local-first, open-source **co-browse runtime**. The in-app agent, Claude Code (over MCP), and Playwright (over CDP) all drive the **same Chromium tabs you do** — behind a policy engine, with human takeover→resume and exportable trajectories. Cookies stay on disk. **v0.2.0.**

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](./LICENSE)
[![Release](https://img.shields.io/github/v/release/Errr0rr404/browgent?include_prereleases&label=release)](https://github.com/Errr0rr404/browgent/releases/latest)

Not another chat sidebar bolted onto Chrome. Browgent is a desktop runtime: real multi-tab Chromium, an agent tool loop, safety policies, trajectory export, a localhost **MCP** bridge, and **Playwright over CDP** — all on your machine.

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

> First open on macOS: right-click the app → **Open** (unsigned open-source build).

## Quick start (from source)

```bash
git clone https://github.com/Errr0rr404/browgent.git
cd browgent
./setup.sh
npm run dev
```

Optional: copy `.env.example` → `.env` and set `XAI_API_KEY` for [Grok](https://console.x.ai) (default brain), or point `BROWGENT_PROVIDER` / `BROWGENT_API_KEY` / `BROWGENT_BASE_URL` at any OpenAI-compatible model. Without a key, the heuristic agent still drives the browser. Full env vars, modes, and CDP flags: [docs/getting-started.md](./docs/getting-started.md).

### Attach an agent (MCP) or Playwright

With Browgent running, the localhost MCP bridge listens on **:17342** (status bar: `mcp · :17342`; token auto-written to userData).

```bash
npm run mcp:smoke   # HTTP bridge smoke
npm run mcp         # STDIO MCP server for Claude Code / Cursor
npm run demo:hero   # automated co-browse path (Browgent must be running)
```

Playwright attaches to the same cookies over CDP — see [docs/playwright.md](./docs/playwright.md). The Act / Research / Watch modes and the dual DOM/CDP driver are documented there too, so this page stays skimmable.

## Documentation

| Doc | Description |
|-----|-------------|
| [**Docs index**](./docs/README.md) | Full documentation map |
| [Getting started](./docs/getting-started.md) | Install, env vars, CDP flags, first run |
| [Builders](./docs/builders.md) | Positioning + Claude Code / MCP / Playwright |
| [MCP](./docs/mcp.md) | Bridge + STDIO + security |
| [Playwright + dual driver](./docs/playwright.md) | CDP attach, DOM vs CDP driver |
| [Market map](./docs/market.md) | Competitors + where Browgent fits |
| [YC application](./docs/yc-application.md) | Application packet + checklist |

## License

[MIT](./LICENSE) · [Contributing](./CONTRIBUTING.md) · [Security](./SECURITY.md)
