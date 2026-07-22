# Contributing

Thanks for helping build a local-first agent browser.

## Setup

```bash
git clone https://github.com/Errr0rr404/browgent.git
cd browgent
./setup.sh
npm run dev
```

| Command | Purpose |
|---------|---------|
| `npm run dev` | Electron + Vite HMR (CDP on `:9222` by default) |
| `npm run build` | Compile main / preload / renderer |
| `npm run typecheck` | TypeScript (node + web projects) |
| `npm run dist:mac` | Build + package macOS DMG → `release/` |
| `npm run preview` | Preview built app |
| `npm run playwright:example` | Attach Playwright via CDP (Browgent must be running) |
| `npm run dev:agent` | Compact automation shell |
| `npm run dev:headless` | Hidden window + agent-only + CDP |

## Conventions

1. **No secrets** — only `.env.example` with empty placeholders. Never commit `.env`, keys, or tokens.
2. **Typecheck + build** must pass before PR.
3. **Guest safety** — keep sandbox, no `nodeIntegration`, deny sensitive permissions on page sessions.
4. **Chrome vs page** — do not cover the content hole with absolute HTML menus; expand chrome in-flow (see theme picker).
5. **Tools** — add definitions in `src/shared/tools.ts`, implement in `executor.ts`, document in [agent-guide](./agent-guide.md) if user-facing.
6. Prefer small, focused PRs.

## Project map

See [Architecture](./architecture.md). Agent-oriented notes also live in root [`AGENTS.md`](../AGENTS.md).

## Pull requests

Use the PR template. Include:

- What / why
- How you tested (`typecheck`, `build`, manual smoke)
- Screenshots for UI changes

## Code of conduct

Be respectful. Harassment and bad-faith contributions are not welcome.

## License

Contributions are licensed under the [MIT License](../LICENSE).
