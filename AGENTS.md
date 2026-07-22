# Agent notes for Browgent

Guidance for coding agents working in this repository.

## Stack

- **Electron 36** + **electron-vite** + **React 19** + **TypeScript**
- Main process owns tabs (`WebContentsView`) and the agent session
- Renderer is chrome-only UI; pages never render inside React

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

## Critical invariants

1. Guest pages use partition `persist:browgent-pages`, sandbox, no node integration.
2. Chrome dropdowns must not paint over the content hole without expanding chrome — `WebContentsView` stacks above HTML (see ThemePicker flyout).
3. Agent session uses a generation token; stop/clear must invalidate in-flight runs.
4. Tools live in `src/shared/tools.ts`; execution in `src/main/agent/executor.ts`.
5. Secrets only via env (`.env`); never hardcode keys.

## Key paths

| Path | Role |
|------|------|
| `src/main/index.ts` | Window + IPC |
| `src/main/browser/tab-manager.ts` | Tabs / layout / observe |
| `src/main/agent/session.ts` | Agent loop (Grok + heuristic) |
| `src/main/agent/planner.ts` | Heuristic multi-step planner |
| `src/shared/sites.ts` | Site aliases + browse intent |
| `src/renderer/src/App.tsx` | Shell + shortcuts |

## Do not

- Commit `.env`, `out/`, `node_modules/`, or binary builds
- Disable contextIsolation / enable nodeIntegration for guest pages
- Add absolute menus over the page without chrome reserve
