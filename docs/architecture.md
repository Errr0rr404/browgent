# Architecture

Browgent is an **Electron** desktop app: the main process owns real Chromium tabs and the agent; the renderer is **chrome UI only** (address bar, sidebar, agent panel). Guest pages never run inside React.

## Process model

```
┌─────────────────────────────────────────────────────────────┐
│  Main process                                               │
│  ├─ BrowserWindow (chrome shell)                            │
│  ├─ TabManager → WebContentsView per tab                    │
│  │    partition: persist:browgent-pages                     │
│  │    dual driver: DOM inject | CDP debugger                │
│  │    request filter · cookie banners · asset scan          │
│  ├─ CDP endpoint → remote-debugging-port (Playwright)       │
│  ├─ AgentSession → planner / LLM / tools / trajectory       │
│  ├─ McpBridge → localhost HTTP :17342 (token required)      │
│  ├─ PrivacyStore · History · Downloads · Profile · Vault    │
│  ├─ Metrics store → privacy-safe counters (userData)        │
│  └─ IPC (tabs, agent, driver, privacy, metrics, window)     │
├─────────────────────────────────────────────────────────────┤
│  Preload (contextBridge → window.browgent)                  │
├─────────────────────────────────────────────────────────────┤
│  Renderer (React) — chrome only                             │
│  Tabs · Toolbar · Downloads · Settings · Agent · Status     │
└─────────────────────────────────────────────────────────────┘
          │
          ├─ STDIO: scripts/browgent-mcp.mjs → bridge
          └─ Playwright: connectOverCDP → same guest tabs
```

**Important Electron detail:** native `WebContentsView` paints **above** HTML in the content region. Dropdowns that overlap the page get clipped. UI that must stay fully visible (e.g. theme picker) is rendered **in-flow inside chrome** so the page view is pushed down.

## Source layout

```
src/
  main/
    index.ts              Window lifecycle, IPC, permissions
    browser/
      tab-manager.ts      Tabs, navigation, observe, screenshots, find/zoom/print
      history-store.ts    Persistent browsing history (userData)
      download-manager.ts Guest-session downloads + asset subfolders
      asset-scanner.ts    Page images/media/docs inventory
      request-filter.ts   Ad/tracker host cancel (guest session)
      cookie-banner.ts    Best-effort consent button click
      privacy-store.ts    Privacy prefs + block stats (userData)
      form-fill.ts        Profile → form field plan for fill_form
      profile-store.ts    User Hub contact fields
      password-vault.ts   Local encrypted password vault
      browser-import.ts   One-click import from other browsers
      guest-identity.ts   Chrome-like UA / client hints
      page-driver.ts      Dual DOM / CDP actuation
      cdp-endpoint.ts     remote-debugging-port + status
      runtime-flags.ts    CDP port, driver, agent-only, headless
      observe-script.ts   Injected DOM refs (e1, e2…) + actions
      actions.ts          executeJavaScript helpers
      pet-overlay.ts      Floating companion over guest views
    agent/
      session.ts          Run loop, pause/stop, trajectory
      executor.ts         Tool implementations + policy gates
      planner.ts          Heuristic multi-step planner
      llm.ts              OpenAI-compatible LLM (Grok default)
      env.ts              .env loader
    mcp/
      bridge.ts           Localhost HTTP MCP bridge (token auth)
      tool-schema.ts      TOOL_DEFS → JSON Schema
      server.ts           getMcpStatus re-export
    metrics/
      store.ts            Local counters + traction packet
  preload/
    index.ts · guest.ts · pet.ts
  renderer/src/           React chrome only
  shared/
    tools · policies · policy-presets · recipes · demo · summary
    privacy-prefs · profile · blocklists · mcp · metrics
    sites · types · driver · bookmarks · import-types
scripts/                  browgent-mcp, unit smokes, demo-hero, yc-packet
examples/                 playwright-connect, sample trajectory
recipes/README.md         Index (canonical prompts in shared/recipes.ts)
```

## Dual driver

| Mode | Mechanism | Default |
|------|-----------|---------|
| `dom` | `webContents.executeJavaScript` + observe refs | In-app agent |
| `cdp` | `webContents.debugger` Input domain | Optional / agent-only |
| Endpoint | Chromium `--remote-debugging-port` | **Off** for normal `npm run dev`; opt in with `BROWGENT_CDP_PORT` (default 9222, localhost) |

External Playwright uses the **endpoint**, not the in-app debugger. Prefer **DOM** driver while a remote Playwright client is attached to the same page (only one debugger client per target).

See [playwright.md](./playwright.md).

## Shared session & identity

- All guest tabs use `persist:browgent-pages` so cookies/login state are shared (local-first identity).
- Guest pages use a **Chrome-like identity by default for every install** (`guest-identity.ts` + `preload/guest.ts`): stock Chrome user-agent (no `Electron/…`), matching `sec-ch-ua` client hints, `AutomationControlled` disabled, early main-world `webdriver` patch. Always on (not a user setting). Reduces false blocks from Google reCAPTCHA / Akamai (e.g. GoDaddy). Not a full anti-detect suite — aggressive WAFs, CDP automation, or flagged IPs can still challenge.
- Guest permissions: mic/camera/notifications **denied** by default.
- Chrome UI may request **media** for speech recognition.

## Agent pipeline

1. User message → `AgentSession.send`
2. Provider: **LLM** if any supported API key is set (Grok preferred in auto), else **heuristic**
3. LLM path seeds a live page snapshot (refs) when a real tab is open
4. Tool calls → `ToolExecutor` (policy, confirm, DOM/nav). Mutators **auto-snapshot** after act (BrowserOS-style) so the model skips an extra observe round
5. `search` tool = navigate + extract results in one step (DuckDuckGo)
6. Read-only tools may run **in parallel** in one model turn
7. Trajectory + chat messages stream to the renderer via IPC
8. `done` / max steps / stop / ask_human ends or pauses the run

Generation tokens invalidate in-flight work on **Stop** / **Clear** so sessions do not race.

## IPC surface

Exposed as `window.browgent` (see `src/preload/index.ts`):

- Tabs: create, close, activate, navigate, back/forward/reload/stop, print
- Find in page / zoom (factor get/set/in/out/reset)
- History: list, search, delete, clear (persisted under userData)
- Downloads: list, open, show in folder, cancel, clear, open folder; page asset list/download
- Privacy: get/set prefs (ads, trackers, cookie banners), stats push
- Page assets: list / download into downloads folder
- Import / profile / vault: browser import, User Hub, credentials
- Chrome layout (top/right/bottom/left) for view bounds
- Agent: send, getState, stop, clear, pause, resume, takeover, mode, policy, confirm, reject, answerHuman, export
- Driver: status (CDP URL when enabled, mode), setMode (`dom` | `cdp`)
- MCP: getMcpStatus; metrics get/export/demo/recipe  
- STDIO adapter: `scripts/browgent-mcp.mjs`
- Window controls (non-macOS)

## Privacy & network filter

- Guest partition only (`persist:browgent-pages`) — chrome UI is never filtered.
- Compact host/path blocklist (`src/shared/blocklists/compact-hosts.ts`), not a full uBlock engine.
- Settings → **Privacy & data**: block ads/trackers, cookie-banner mode, allowlist hosts, shield badge.
- Status bar shows session block count when the shield badge is enabled.

## Related

- [Agent guide](./agent-guide.md)
- [QA with Browgent](./qa.md)
- [Import & User Hub](./import-and-profile.md)
- [Playwright + dual driver](./playwright.md)
- [Contributing](./contributing.md)
