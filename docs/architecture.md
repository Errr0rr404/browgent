# Architecture

Browgent is an **Electron** desktop app: the main process owns real Chromium tabs and the agent; the renderer is **chrome UI only** (address bar, sidebar, agent panel). Guest pages never run inside React.

## Process model

```
┌─────────────────────────────────────────────────────────┐
│  Main process                                           │
│  ├─ BrowserWindow (chrome shell)                        │
│  ├─ TabManager → WebContentsView per tab                │
│  │    partition: persist:browgent-pages                 │
│  │    dual driver: DOM inject | CDP debugger            │
│  ├─ CDP endpoint → remote-debugging-port (Playwright)   │
│  ├─ AgentSession → planner / LLM (Grok default) / tools │
│  └─ IPC (tabs, agent, driver, window, chrome metrics)   │
├─────────────────────────────────────────────────────────┤
│  Preload (contextBridge → window.browgent)              │
├─────────────────────────────────────────────────────────┤
│  Renderer (React) — chrome only                         │
│  TitleBar · Tabs · Toolbar · Sidebar · Agent · Status   │
└─────────────────────────────────────────────────────────┘
          │ chrome layout (top/right/bottom/left)
          ▼
   WebContentsView bounds sit in the “content hole”
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
      download-manager.ts Guest-session downloads + panel state
      page-driver.ts      Dual DOM / CDP actuation
      cdp-endpoint.ts     remote-debugging-port + status
      runtime-flags.ts    CDP port, driver, agent-only, headless
      observe-script.ts   Injected DOM refs (e1, e2…) + actions
      actions.ts          executeJavaScript helpers
    agent/
      session.ts          Run loop, pause/stop, trajectory
      executor.ts         Tool implementations + policy gates
      planner.ts          Heuristic multi-step planner
      llm.ts              OpenAI-compatible LLM (Grok default)
      env.ts              .env loader
    mcp/
      server.ts           Tool catalog / MCP status (STDIO MCP is roadmap)
  preload/
    index.ts              Safe API surface for renderer
  renderer/
    src/                  React chrome UI, themes, bookmarks
  shared/
    tools.ts              Canonical tool definitions
    policies.ts           Allow/block hosts, confirm rules, mode tool sets
    sites.ts              Aliases + browse-intent parsing
    types.ts              Tab/agent IPC types
    driver.ts             DriverMode + CdpEndpointStatus
    bookmarks.ts          Arc-style bookmark model
examples/
  playwright-connect.mjs  connectOverCDP sample (repo root, not under src/)
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
3. Tool calls → `ToolExecutor` (policy, confirm, DOM/nav)
4. Trajectory + chat messages stream to the renderer via IPC
5. `done` / max steps / stop / ask_human ends or pauses the run

Generation tokens invalidate in-flight work on **Stop** / **Clear** so sessions do not race.

## IPC surface

Exposed as `window.browgent` (see `src/preload/index.ts`):

- Tabs: create, close, activate, navigate, back/forward/reload/stop, print
- Find in page / zoom (factor get/set/in/out/reset)
- History: list, search, delete, clear (persisted under userData)
- Downloads: list, open, show in folder, cancel, clear, open folder
- Chrome layout (top/right/bottom/left) for view bounds
- Agent: send, getState, stop, clear, pause, resume, takeover, mode, policy, confirm, reject, answerHuman, export
- Driver: status (CDP URL when enabled, mode), setMode (`dom` | `cdp`)
- MCP: getMcpStatus (tool catalog stub; full STDIO server roadmap)
- Window controls (non-macOS)

## Related

- [Agent guide](./agent-guide.md)
- [Playwright + dual driver](./playwright.md)
- [Contributing](./contributing.md)
