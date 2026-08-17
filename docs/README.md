# Browgent documentation

Single index for the repo. Prefer these pages over ad-hoc notes.

Current product line: **v0.2.0** (see `package.json`). Dated packets under **Launch / YC** and `docs/release-notes/` are historical — do not treat them as a live status board.

## Start here

| Guide | Description |
|-------|-------------|
| [Getting started](./getting-started.md) | Install (DMG / Win / Linux / source), env vars, first goals |
| [Builders](./builders.md) | Positioning + Claude Code / MCP / Playwright in 5 minutes |
| [MCP](./mcp.md) | Localhost bridge, token auth, STDIO adapter |
| [Playwright + dual driver](./playwright.md) | CDP attach, DOM vs CDP drivers |

## Product

| Guide | Description |
|-------|-------------|
| [Architecture](./architecture.md) | Process model, folders, IPC, identity |
| [Agent guide](./agent-guide.md) | Modes, tools, policies, LLM vs heuristic |
| [QA with Browgent](./qa.md) | Assert tools, form fill, trajectories, Playwright/MCP |
| [Shortcuts](./shortcuts.md) | Keyboard & mouse |
| [Market map](./market.md) | Competitors + non-wedge backlog |
| [Guest identity checklist](./guest-identity-checklist.md) | Chrome-like UA regression |
| [Import & User Hub](./import-and-profile.md) | Browser import, User Hub profile, `fill_form`, vault |

## Launch / YC (dated)

These pages are application / audit artifacts. Leave them as written; product truth lives in the guides above.

| Guide | Description |
|-------|-------------|
| [YC application packet](./yc-application.md) | Answers, demo steps, shipping rhythm, checklist |
| [YC readiness plan](./yc-readiness-plan.md) | Phased implementation audit (dated 2026-07-23) |
| [Design partners](./design-partners.md) | Program + outreach templates |

## Engineering

| Guide | Description |
|-------|-------------|
| [Contributing](./contributing.md) | Dev setup, conventions, CI |
| [Releasing](./releasing.md) | Dist + GitHub Releases + Pages |
| [Release notes v0.2.0](./release-notes/v0.2.0.md) | First public release highlights |

## Also in repo root

| Path | Role |
|------|------|
| [README.md](../README.md) | Overview, stack, run / test / release |
| [AGENTS.md](../AGENTS.md) | Map for coding agents |
| [CHANGELOG.md](../CHANGELOG.md) | Unreleased + history |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Short pointer here |
| [SECURITY.md](../SECURITY.md) | Vulnerability reports |
| [website/](../website/) | GitHub Pages landing |
| [recipes/](../recipes/) | Recipe index (prompts live in `src/shared/recipes.ts`) |
| [scripts/](../scripts/) | MCP, demo, unit smokes, YC packet |
| [examples/](../examples/) | Playwright sample + sample trajectory |
| [`.github/workflows/`](../.github/workflows/) | `ci.yml` · `release.yml` · `pages.yml` |

## Commands

```bash
npm run dev                   # Electron + Vite; CDP off
npm run typecheck && npm run lint && npm run test:unit && npm run build
npm run mcp / mcp:smoke       # STDIO adapter / HTTP smoke (app running)
npm run test:identity         # guest navigate smoke (app + MCP)
npm run demo:hero             # automated hero path via MCP
npm run yc:packet             # traction JSON → release/
npm run dist:mac|win|linux    # installers → release/
```
