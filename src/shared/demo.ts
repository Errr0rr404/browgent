/**
 * Canonical hero demo prompt — reliable on public sites without credentials.
 * Used by in-app "Run demo" and scripts/demo-hero.mjs narrative.
 */
export const HERO_DEMO_PROMPT = `You are running Browgent's 60-second hero demo for co-browse.

Steps:
1) navigate to https://example.com
2) observe the page
3) extract_text with maxChars 500
4) list_tabs
5) call done with a 2-sentence summary: what co-browse means (same tabs, local cookies) and that MCP/Playwright can attach to this session.

Do not invent logins. Prefer tools over prose. Keep it under 8 tool steps.`

export const HERO_DEMO_MODE = 'act' as const
