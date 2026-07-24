# Browgent documentation

Single index for the repo. Prefer these pages over ad-hoc notes.

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
| [Shortcuts](./shortcuts.md) | Keyboard & mouse |
| [Market map](./market.md) | Competitors + non-wedge backlog |
| [Guest identity checklist](./guest-identity-checklist.md) | Chrome-like UA regression |
| [Import & User Hub](./import-and-profile.md) | Browser import + local profile vault |

## Launch / YC

| Guide | Description |
|-------|-------------|
| [YC application packet](./yc-application.md) | Answers, demo steps, shipping rhythm, checklist |
| [YC readiness plan](./yc-readiness-plan.md) | Phased implementation audit |
| [Design partners](./design-partners.md) | Program + outreach templates |

## Engineering

| Guide | Description |
|-------|-------------|
| [Contributing](./contributing.md) | Dev setup, conventions |
| [Releasing](./releasing.md) | Dist + GitHub Releases |
| [Release notes v0.2.0](./release-notes/v0.2.0.md) | Version highlights |

## Also in repo root

| Path | Role |
|------|------|
| [README.md](../README.md) | Overview + download |
| [AGENTS.md](../AGENTS.md) | Map for coding agents |
| [CHANGELOG.md](../CHANGELOG.md) | Unreleased + history |
| [website/](../website/) | Landing page |
| [recipes/](../recipes/) | Recipe index (prompts live in `src/shared/recipes.ts`) |
| [scripts/](../scripts/) | MCP, demo, smoke, YC packet |
| [examples/](../examples/) | Playwright sample + sample trajectory |

Commands: `npm run dev` · `mcp` · `mcp:smoke` · `demo:hero` · `yc:packet` · `dist:mac|win|linux`
