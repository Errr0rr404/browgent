# Recipes

Canonical prompts live in **`src/shared/recipes.ts`** (agent panel chips + first-run).

| Id | Mode | Job |
|----|------|-----|
| research-summary | research | Read-only page summary |
| form-smoke | act | Public form fill (no submit) |
| qa-smoke | act | Smoke-check after human login |
| takeover-handoff | act | Login wall → ask_human |
| export-trajectory | act | Short task + export reminder |
| mcp-check | watch | Confirm MCP readiness |
| competitive-scrape | research | Competitive brief |
| inbox-triage | act | HITL inbox summary |
| sensitive-confirm | act | Policy gate demo |

**In-app:** Agent → recipe chips or **Run demo** (hero path in `src/shared/demo.ts`).  
**CLI B-roll:** `npm run demo:hero` (Browgent must be running).
