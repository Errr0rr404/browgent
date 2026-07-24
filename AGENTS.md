# Agent notes

Short map for coding agents. Full architecture: [docs/architecture.md](./docs/architecture.md).

## Commands

```bash
npm ci                         # when package-lock.json exists
npm install                    # otherwise
npm run dev                    # normal UI; CDP off by default
BROWGENT_CDP_PORT=9222 npm run dev
npm run typecheck
npm run build
npm run preview
npm run dist:mac              # DMG → release/
npm run dist / dist:dir       # all targets / unpacked dir
npm run dev:agent             # compact automation shell
npm run dev:headless          # hidden + agent-only + CDP
npm run playwright:example    # needs Browgent running + playwright
npm run mcp                   # STDIO MCP (Browgent must be running)
npm run mcp:smoke             # HTTP bridge smoke (Browgent must be running)
npm run test:unit             # tool schema unit smoke
npm run test:identity         # guest navigate smoke (app + MCP up)
npm run demo:hero             # automated YC hero path via MCP
npm run yc:packet             # traction packet for application
```

Docs index: [docs/README.md](./docs/README.md). YC: [docs/yc-application.md](./docs/yc-application.md).

## Layout

| Path | Role |
|------|------|
| `src/main/` | Window, tabs, agent, MCP bridge |
| `scripts/browgent-mcp.mjs` | STDIO MCP proxy → localhost bridge |
| `src/main/browser/page-driver.ts` | Dual DOM / CDP actuation |
| `src/main/browser/guest-identity.ts` | Chrome-like UA / client hints for guest tabs |
| `src/main/browser/cdp-endpoint.ts` | Playwright `connectOverCDP` endpoint |
| `src/preload/guest.ts` | Early main-world identity patches for guest pages |
| `src/renderer/` | Chrome UI only (no guest DOM) |
| `src/shared/` | Tools, policies, sites, types, driver |
| `examples/` | Playwright attach sample |
| `docs/` | Human documentation (incl. playwright.md) |

## Invariants

1. Guest partition `persist:browgent-pages`, sandboxed, no nodeIntegration.
2. Do not paint absolute menus over the content hole — `WebContentsView` stacks above HTML.
3. Agent runs use a generation token; stop/clear must invalidate in-flight work.
4. Secrets only via `.env` (gitignored). Never hardcode keys.
5. **Guest identity always Chrome-like** (`guest-identity.ts` + `preload/guest.ts`) — never ship an Electron UA/client-hints to guest pages (Google/Akamai block new users).
