# Playwright + dual driver

Browgent is a **desktop co-browse** runtime. Dual mode keeps the fast in-app agent path while exposing a standard CDP endpoint for Playwright and other tools.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browgent (Electron)                                    │
│                                                         │
│  In-app agent ──► driver: dom  ──► executeJavaScript    │
│               └─► driver: cdp  ──► webContents.debugger │
│                                                         │
│  Guest tabs (partition persist:browgent-pages)          │
│         ▲                                               │
│         │ remote-debugging-port (localhost)             │
│  Playwright.connectOverCDP / Chrome DevTools            │
└─────────────────────────────────────────────────────────┘
```

| Path | Who | How | Best for |
|------|-----|-----|----------|
| **DOM driver** | In-app agent (default) | Injected observe/act scripts + `eN` refs | Low latency, agent loop |
| **CDP driver** | In-app agent (optional) | `Input.dispatchMouseEvent` / `insertText` | Real input events, harder synthetic detection |
| **CDP endpoint** | Playwright, Puppeteer, Stagehand-on-PW | `connectOverCDP(browserURL)` | Existing scripts, tests, external agents |

Observe / extract / refs always use DOM scripts (Browgent-native). Click/type/hover/scroll/press can use CDP when driver mode is `cdp`.

## Enable CDP

Default for `npm run dev`: **off**. CDP is localhost-only (`http://127.0.0.1:9222`) and only enabled when you ask for it.

```bash
# default for normal dev — CDP off
npm run dev

# enable on the default port
BROWGENT_CDP_PORT=9222 npm run dev

# custom port
BROWGENT_CDP_PORT=9333 npm run dev

# off (when previously enabled)
BROWGENT_CDP=0 npm run dev

# lightweight automation shell (compact UI; implies CDP unless disabled)
BROWGENT_AGENT_ONLY=1 npm run dev

# hidden window for CI-ish local runs (implies CDP unless disabled)
BROWGENT_HEADLESS=1 BROWGENT_AGENT_ONLY=1 npm run dev
```

CLI equivalents mirror the env vars: `--cdp-port=9222`, `--cdp=1|0`, `--driver=cdp|dom`, `--agent-only`, `--headless`. Explicit `BROWGENT_CDP=0`/`off`/`false` (or port `0`) always wins, even when `AGENT_ONLY`/`HEADLESS` is set.

## Playwright attach

```bash
npm i -D playwright
npx playwright install chromium
# Browgent already running (npm run dev)…
npm run playwright:example
# or custom endpoint:
# BROWGENT_CDP_URL=http://127.0.0.1:9333 npm run playwright:example
```

```js
import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const context = browser.contexts()[0]
const page = context.pages()[0] ?? await context.newPage()
await page.goto('https://example.com')
// … same tabs the human sees in Browgent
```

### Prefer guest pages

Electron exposes the chrome shell *and* guest tabs. Always pick pages whose URL is real `http(s)` content (not `chrome://`, `devtools://`, or the app `file://` / vite chrome URL). The example script already filters for this.

```js
const page = contexts
  .flatMap((c) => c.pages())
  .find((p) => {
    const u = p.url()
    return u.startsWith('http://') || u.startsWith('https://')
  })
```

### Caveats

1. **Multiple targets** — Electron exposes chrome UI + guest pages. Prefer pages with real `http(s)` URLs.
2. **Shared session** — Guest tabs use `persist:browgent-pages`. Playwright sees those cookies when attached to the right context.
3. **Dual control** — Human + in-app agent + Playwright + MCP can all act; use takeover / pause when coordinating.
4. **Debugger exclusivity** — A page target accepts one active debugger client. Keep the **in-app driver on `dom`** while Playwright is attached (default). Switching in-app driver to `cdp` uses `webContents.debugger` and can contend with remote CDP on that tab.
5. **Security** — CDP is **off** by default for normal `npm run dev`. When you enable it, it listens on localhost only; any local process can control the session. Disable with `BROWGENT_CDP=0` when you do not need external automation. Never tunnel CDP to the public internet without auth.
6. **No Playwright dependency in app** — keeps Browgent install lean; attach from outside.
7. **MCP vs CDP** — MCP (`docs/mcp.md`) uses Browgent's tool surface + policies. CDP/Playwright bypasses the policy engine. Use MCP for governed automation; CDP for raw scripts.

## Toggle in-app driver

- **Status bar** — click `drive dom · cdp:9222` to flip `dom` ↔ `cdp` (CDP port only shows when enabled)
- **Policy tab** — “In-app driver” select
- **Env** — `BROWGENT_DRIVER=dom|cdp` (restart for env; UI toggle is live)

## Lightweight notes

Dual mode does **not** make Electron as light as headless Playwright alone. It makes Browgent **Playwright-friendly** without shipping Playwright inside the app, and offers:

- **agent-only** — smaller window, CDP preferred
- **headless** — no show; drive only via CDP / tools
- **DOM driver** — still the fastest path for the chat agent when you do not need CDP events
