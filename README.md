# Browgent

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](./LICENSE)
[![Electron](https://img.shields.io/badge/Electron-36-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

**Local-first browser for AI agents** — humans and agents share the same Chromium tabs.

Unlike cloud fleets (Browserbase, Steel, Kernel) or consumer AI browsers (Comet, Dia), Browgent is a **desktop co-browse runtime** with tool parity for agent frameworks, safety policies, trajectory export, and an MCP-ready tool surface.

> Open source · MIT · macOS / Windows / Linux (Electron)

## Quick start

```bash
git clone https://github.com/Errr0rr404/browgent.git
cd browgent
./setup.sh          # or: npm install && cp .env.example .env
npm run dev
```

### Agent brain (Grok)

| Setup | Behavior |
|-------|----------|
| `XAI_API_KEY` in `.env` | **Grok** multi-step tool-calling (navigate, click, type, observe…) |
| No key | **Heuristic** planner (patterns + DOM refs) — still drives the browser |

```bash
# .env
XAI_API_KEY=xai-...
# BROWGENT_MODEL=grok-4.5   # optional
```

Get a key at [console.x.ai](https://console.x.ai).

## What you get (v0.2+)

### Market parity

| Capability | Status |
|------------|--------|
| Multi-tab Chromium | ✅ |
| navigate / click / type / scroll / keys / hover / select | ✅ |
| Multi-step goals (`go to fb and sign up`) | ✅ real site + continue task |
| Site aliases (`fb`, `gh`, `yt`…) | ✅ not Google-by-default |
| Compact element refs (`e1`, `e2`…) | ✅ observe |
| Screenshots + text/link extract | ✅ |
| Session cookies (shared partition) | ✅ |
| Human takeover / pause / resume | ✅ |
| Voice instructions (mic → agent) | ✅ system STT |
| Chrome themes (10 designs) | ✅ Theme picker in toolbar |
| Action trajectory + JSON export | ✅ |
| Research vs act modes | ✅ |
| Sensitive-action confirmation | ✅ |
| Domain allowlist policy | ✅ |
| MCP tool surface (in-process) | ✅ foundation |

### Differentiators

- **Shared human+agent tabs** (not cloud live-view)
- **Local-first** identity / cookies
- **Policy engine** in the browser chrome
- **Dual UI**: chat + trajectory + policy
- **Tab ownership** badges (`agent` / human)
- **Arc-style sidebar**: favorites grid, folders, vertical tabs
- **Voice-driven browsing** via system speech recognition
- **Themeable chrome** — Midnight, Classic, Paper, Vintage, Aurora, Noir, Sakura, Neon Tokyo, Art Deco, Deep Ocean

## Agent modes

| Mode | Behavior |
|------|----------|
| **Act** | Full tool use (navigate, click, type…) |
| **Research** | Read-mostly tools (observe, extract, navigate) |
| **Watch** | You drive; agent only observes / answers |

## Shortcuts

| Key | Action |
|-----|--------|
| ⌘/Ctrl+T | New tab |
| ⌘/Ctrl+W | Close tab |
| ⌘/Ctrl+L | Focus address bar |
| ⌘/Ctrl+J | Toggle agent panel |
| ⌘/Ctrl+R | Reload page |
| ⌘/Ctrl+D | Pin / unpin favorite (Arc-style) |
| ⌘/Ctrl+⇧+S | Toggle sidebar |
| ⌘/Ctrl+1–8 | Switch to tab N |
| ⌘/Ctrl+9 | Switch to last tab |
| ⌘/Ctrl+[ / ] | Back / forward |
| Escape | Blur address bar · Stop agent when busy |
| Middle-click tab | Close tab |

## Try

In the agent panel:

- `go to facebook and sign up` — opens facebook.com and seeks Sign up (not a Google search)
- `go to gh` / `open youtube` — site aliases
- `search electron webcontentsview` — explicit web search
- `summarize this page`
- **Mic** button — speak instructions (system speech recognition)
- **Theme** in the toolbar — pick Midnight, Paper, Neon Tokyo, …
- Switch to **Trajectory** to see tool steps; **Export** for JSON
- **Policy** → enable “Confirm navigation to a new host”
- **Takeover** when you need to log in; **Resume** after

## Architecture

```
src/main/browser/   TabManager + observe/act inject
src/main/agent/     Planner + ToolExecutor + Session
src/main/mcp/       Tool bridge status (STDIO next)
src/shared/         Tools, policies, types
src/renderer/       Chrome UI only
docs/MARKET.md      Competitor research matrix
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Bug reports and feature ideas are welcome via [GitHub Issues](https://github.com/Errr0rr404/browgent/issues).

Security-sensitive reports: see [SECURITY.md](./SECURITY.md).

## Roadmap

See [docs/MARKET.md](./docs/MARKET.md). Next: full STDIO MCP binary, skill replay, cloud burst runners, multi-agent tab locks.

## License

[MIT](./LICENSE) © Browgent contributors
