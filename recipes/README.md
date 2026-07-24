# Recipes

Canonical prompts live in **`src/shared/recipes.ts`** (agent panel chips + first-run).

| Id | Mode | Job |
|----|------|-----|
| research-summary | research | Read-only page summary (same prompt as toolbar Summarize) |
| form-smoke | act | Public form fill (prefer `fill_form`, no submit) |
| qa-smoke | act | Smoke-check after human login |
| qa-assert-smoke | act | Assert URL + text + element on current app |
| fill-profile | act | `fill_form` from User Hub (dryRun then fill, no submit) |
| takeover-handoff | act | Login wall → ask_human |
| export-trajectory | act | Short task + export reminder |
| mcp-check | watch | Confirm MCP readiness |
| competitive-scrape | research | Competitive brief |
| inbox-triage | act | HITL inbox summary |
| sensitive-confirm | act | Policy gate demo |

**In-app:** Agent → recipe chips or **Run demo** (hero path in `src/shared/demo.ts`).  
**CLI B-roll:** `npm run demo:hero` (Browgent must be running).  
**QA guide:** [docs/qa.md](../docs/qa.md).
