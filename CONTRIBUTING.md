# Contributing to Browgent

Thanks for helping build a local-first browser for AI agents.

## Development setup

```bash
git clone https://github.com/Errr0rr404/browgent.git
cd browgent
npm install
cp .env.example .env   # optional: add XAI_API_KEY for Grok
npm run dev
```

### Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Electron + Vite HMR |
| `npm run build` | Production main/preload/renderer |
| `npm run typecheck` | TypeScript (node + web) |
| `npm run preview` | Preview packaged build |

## Project layout

```
src/main/browser/   TabManager, observe/act inject scripts
src/main/agent/     Session, planner, Grok LLM, tool executor
src/main/mcp/       In-process tool bridge status
src/shared/         Tools, policies, sites, types
src/renderer/       Chrome UI (React) — never hosts the page DOM
src/preload/        contextBridge API
docs/               Market notes and design context
```

## Guidelines

1. **No secrets in commits** — use `.env` (gitignored). Only empty placeholders in `.env.example`.
2. **Typecheck before PR** — `npm run typecheck` must pass.
3. **Keep the page view safe** — guest tabs use `persist:browgent-pages`, sandbox, and deny mic/camera by default.
4. **Chrome vs page** — UI that overlaps the content hole is covered by Electron’s `WebContentsView`. Prefer in-flow chrome panels (see theme picker) over absolute dropdowns over the page.
5. **Agent tools** — add tools in `src/shared/tools.ts`, implement in `executor.ts`, document in README if user-facing.
6. **Small, focused PRs** — one concern per PR when possible.

## Pull requests

- Describe *what* and *why*.
- Link related issues.
- Note if you need an `XAI_API_KEY` to reproduce agent behavior.
- Screenshots/GIFs for UI changes help a lot.

## Code of conduct

Be respectful. Harassment and bad-faith contributions are not welcome. Maintainers may close issues/PRs that violate that bar.

## License

By contributing, you agree your contributions are licensed under the MIT License.
