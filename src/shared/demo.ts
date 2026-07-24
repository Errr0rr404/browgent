/**
 * Canonical hero demo prompt — a real multi-page research task on public sites,
 * no credentials and nothing that changes state. Shows the agent browsing and
 * reasoning, not just scraping one page.
 * Used by the in-app "Run demo" starter (AgentPanel / FirstRunModal).
 */
export const HERO_DEMO_PROMPT = `You are running Browgent's hero demo: a real research task on the live web — no logins, nothing that changes state.

Goal: find the year each of these web browsers was first released — Google Chrome, Mozilla Firefox, and Apple Safari — reading each browser's Wikipedia page, then compare them.

Steps:
1) navigate to https://en.wikipedia.org/wiki/Google_Chrome — observe, extract_text of the intro/infobox (maxChars 600), and note the initial release year.
2) navigate to https://en.wikipedia.org/wiki/Firefox — do the same.
3) navigate to https://en.wikipedia.org/wiki/Safari_(web_browser) — do the same.
4) list_tabs.
5) call done with a done.summary of 2-3 sentences that gives each browser's first-release year and says which shipped first — using only what you actually read on the pages.

Browse and reason from what is on each page; do not invent dates or logins. Prefer tools over prose. Keep it under 12 tool steps.`

export const HERO_DEMO_MODE = 'act' as const
