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
| `npm run dev` | Electron + Vite HMR (CDP off by default) |
| `npm run build` / `typecheck` | Compile / TS |
| `npm run test:unit` | Tool schema + privacy host-match unit smokes |
| `npm run mcp` / `mcp:smoke` | STDIO MCP + HTTP smoke (app running) |
| `npm run demo:hero` | Automated hero demo via MCP |
| `npm run yc:packet` | Traction packet → `release/` |
| `npm run playwright:example` | CDP attach sample |
| `npm run dist:mac` / `dist:win` / `dist:linux` | Installers → `release/` |

## Conventions

1. **No secrets** — only `.env.example` with empty placeholders. Never commit `.env`, keys, or tokens.
2. **Typecheck + build** must pass before PR.
3. **Guest safety** — keep sandbox, no `nodeIntegration`, deny sensitive permissions on page sessions.
4. **Chrome vs page** — do not cover the content hole with absolute HTML menus; expand chrome in-flow (see theme picker).
5. **Tools** — add definitions in `src/shared/tools.ts`, implement in `executor.ts`, document in [agent-guide](./agent-guide.md) if user-facing. Recipes: `src/shared/recipes.ts` only (update [recipes/README.md](../recipes/README.md) table).
6. Prefer small, focused PRs. Keep docs linked from [docs/README.md](./README.md) — avoid new top-level doc files without indexing them.

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
