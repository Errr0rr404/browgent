# Agent notes

Short map for coding agents. Full architecture: [docs/architecture.md](./docs/architecture.md).

## Commands

```bash
npm install && npm run dev
npm run typecheck
npm run build
npm run dist:mac    # DMG → release/
```

## Layout

| Path | Role |
|------|------|
| `src/main/` | Window, tabs, agent, MCP status |
| `src/renderer/` | Chrome UI only (no guest DOM) |
| `src/shared/` | Tools, policies, sites, types |
| `docs/` | Human documentation |

## Invariants

1. Guest partition `persist:browgent-pages`, sandboxed, no nodeIntegration.
2. Do not paint absolute menus over the content hole — `WebContentsView` stacks above HTML.
3. Agent runs use a generation token; stop/clear must invalidate in-flight work.
4. Secrets only via `.env` (gitignored). Never hardcode keys.
