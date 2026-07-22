# Architecture

Browgent is an **Electron** desktop app: the main process owns real Chromium tabs and the agent; the renderer is **chrome UI only** (address bar, sidebar, agent panel). Guest pages never run inside React.

## Process model

```
┌─────────────────────────────────────────────────────────┐
│  Main process                                           │
│  ├─ BrowserWindow (chrome shell)                        │
│  ├─ TabManager → WebContentsView per tab                │
│  │    partition: persist:browgent-pages                 │
│  ├─ AgentSession → planner / Grok / ToolExecutor        │
│  └─ IPC (tabs, agent, window, chrome metrics)           │
├─────────────────────────────────────────────────────────┤
│  Preload (contextBridge → window.browgent)              │
├─────────────────────────────────────────────────────────┤
│  Renderer (React) — chrome only                         │
│  TitleBar · Tabs · Toolbar · Sidebar · Agent · Status   │
└─────────────────────────────────────────────────────────┘
         │ layout metrics (top/right/bottom/left)
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
      tab-manager.ts      Tabs, navigation, observe, screenshots
      observe-script.ts   Injected DOM refs (e1, e2…) + actions
      actions.ts          executeJavaScript helpers
    agent/
      session.ts          Run loop, pause/stop, trajectory
      executor.ts         Tool implementations + policy gates
      planner.ts          Heuristic multi-step planner
      llm.ts              xAI Grok chat + tools
      env.ts              .env loader
    mcp/
      server.ts           In-process tool bridge status
  preload/
    index.ts              Safe API surface for renderer
  renderer/
    src/                  React chrome UI, themes, bookmarks
  shared/
    tools.ts              Canonical tool definitions
    policies.ts           Allow/block hosts, confirm rules
    sites.ts              Aliases + browse-intent parsing
    types.ts              Tab/agent IPC types
    bookmarks.ts          Arc-style bookmark model
```

## Shared session & identity

- All guest tabs use `persist:browgent-pages` so cookies/login state are shared (local-first identity).
- Guest permissions: mic/camera/notifications **denied** by default.
- Chrome UI may request **media** for speech recognition.

## Agent pipeline

1. User message → `AgentSession.send`
2. Provider: **Grok** if `XAI_API_KEY` set, else **heuristic**
3. Tool calls → `ToolExecutor` (policy, confirm, DOM/nav)
4. Trajectory + chat messages stream to the renderer via IPC
5. `done` / max steps / stop / ask_human ends or pauses the run

Generation tokens invalidate in-flight work on **Stop** / **Clear** so sessions do not race.

## IPC surface

Exposed as `window.browgent` (see `src/preload/index.ts`):

- Tabs: create, close, activate, navigate, back/forward/reload/stop
- Chrome metrics for view layout
- Agent: send, stop, clear, pause, resume, takeover, mode, policy, confirm, export
- Window controls (non-macOS)

## Related

- [Agent guide](./agent-guide.md)
- [Contributing](./contributing.md)
