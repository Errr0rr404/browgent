# Browgent

**Local-first browser for AI agents** — humans and agents share the same Chromium tabs.

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](./LICENSE)
[![Release](https://img.shields.io/github/v/release/Errr0rr404/browgent?include_prereleases&label=release)](https://github.com/Errr0rr404/browgent/releases/latest)

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

Optional: copy `.env.example` → `.env` and set `XAI_API_KEY` for [Grok](https://console.x.ai) tool-calling. Without a key, the heuristic agent still drives the browser.

## What it is

Desktop co-browse runtime: multi-tab Chromium, agent tools (navigate / click / type / observe), policies, trajectory export, voice input, themes — all local.

| Mode | Behavior |
|------|----------|
| **Act** | Full browser control |
| **Research** | Read-mostly tools |
| **Watch** | You browse; agent observes |

## Documentation

| Doc | Description |
|-----|-------------|
| [Getting started](./docs/getting-started.md) | Install, env, first run |
| [Architecture](./docs/architecture.md) | Process model & folders |
| [Agent guide](./docs/agent-guide.md) | Modes, tools, policies, Grok |
| [Shortcuts](./docs/shortcuts.md) | Keyboard shortcuts |
| [Contributing](./docs/contributing.md) | Dev setup & PR guide |
| [Releasing](./docs/releasing.md) | DMG / GitHub Releases |
| [Market notes](./docs/market.md) | Competitive context |
| [Security](./SECURITY.md) | Vulnerability reporting |

## License

[MIT](./LICENSE) · [Contributing](./CONTRIBUTING.md) · [Security](./SECURITY.md)
