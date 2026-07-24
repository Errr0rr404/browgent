# Agent Browser Market (mid-2026) & Browgent Feature Map

Research synthesized from BrowserOS, Browserbase/Stagehand, browser-use, Skyvern, MultiOn, Anthropic CU / Claude Chrome, OpenAI ChatGPT agent / Atlas, Perplexity Comet, Dia, Gemini Computer Use, Steel, Kernel, Hyperbrowser, Airtop, Browserless, Playwright/CDT MCP, Firecrawl, Anchor, Lightpanda, agent-browser.

## Primary foil: BrowserOS

The product people will most often confuse Browgent with is **BrowserOS** — the closest open-source agentic browser. Address it head-on, the same way, everywhere:

> **BrowserOS is a browser for end-users to automate their own browsing. Browgent is a runtime you attach agents and Playwright to, with a human in the loop.**

Where we honestly **tie** BrowserOS: both are open-source and local-first (cookies stay on disk), and both are model-agnostic. Where Browgent is **distinct**: external tools (Claude Code over MCP, Playwright over CDP) drive the *same* session you see; a policy engine plus exportable trajectory gives an audit surface; and takeover→resume on the same tab is a first-class handoff, not just "a human is also present." Keep **Comet / Dia / Atlas** as the consumer-category reference (closed AI product browsers), not the primary foil.

## Market layers

| Layer | Who | What they sell |
|-------|-----|----------------|
| Cloud BaaS | Browserbase, Steel, Kernel, Hyperbrowser, Browserless, Anchor | Remote Chromium fleets, stealth, CAPTCHA, proxies |
| Agent frameworks | Stagehand, browser-use, Skyvern, Airtop | NL → act/extract/observe loops |
| Consumer AI browsers | BrowserOS (OSS), Comet, Dia, ChatGPT Atlas | Co-pilot browsing for humans (BrowserOS = OSS agentic browser; our primary foil) |
| Model primitives | Anthropic CU, Gemini CU | Screenshot → mouse/keyboard |
| Local MCP | Playwright MCP, Chrome DevTools MCP, agent-browser | Coding-agent browser tools |

## Competitor feature checklist → Browgent

| Feature | Leaders | Browgent |
|---------|---------|----------|
| Multi-tab real Chromium | All browsers / BaaS | ✅ Desktop shared tabs |
| Navigate / click / type / scroll / keys | browser-use, Stagehand, CU | ✅ Tool surface |
| Compact element refs (`@e1`) | agent-browser, browser-use | ✅ A11y+DOM index |
| Screenshots + text extract | Everyone | ✅ Dual observation |
| Structured extract | Stagehand, Skyvern | ✅ `extract_text` / `extract_links` |
| Session cookies / profile | BaaS contexts | ✅ `persist:browgent-pages` |
| Human takeover / confirm | Operator, Claude Chrome | ✅ Takeover + policy gates |
| Action trajectory / export | Skyvern audit, Stagehand replay | ✅ Trajectory log + JSON export |
| Live narration of steps | ChatGPT agent UX | ✅ Action chips + activity feed |
| Research vs act modes | Comet vs Operator | ✅ research / act / watch |
| Domain policy / safety | Claude allowlists | ✅ Policy engine (differentiator) |
| MCP server same session | Browserbase MCP (cloud) | ✅ Localhost bridge + STDIO (`npm run mcp`) |
| Playwright connectOverCDP | Browserbase / raw Chromium | ✅ Dual mode (CDP endpoint + DOM driver) |
| Shared tool/type surface | All infra | ✅ `src/shared` tools + policies + driver types |
| CAPTCHA solve / residential proxy | Cloud BaaS | ⏳ Optional later (cloud runner) |
| Visual workflow builder | Skyvern, Airtop | ⏳ Later |
| Cloud fleet scale | Kernel/Steel | ⏳ Hybrid routing later |

## Whitespace only Browgent owns (differentiators)

1. **Human + agent true co-browsing** — same tab tree, not cloud live-view
2. **Local-first identity** — real cookies/SSO without shipping session to multi-tenant cloud
3. **Shared tool surface** (`src/shared`) — STDIO MCP + published SDK planned
4. **Browser-native policy engine** (allowlist, max steps, confirm submits/payments)
5. **Dual observation timeline** (compact refs; screenshot bytes are not persisted) in one UI
6. **Tab locks / ownership** primitives for multi-agent (foundation)
7. **Handoff**: agent stuck → human acts → agent resumes same tab
8. **Dual driver** — DOM inject (fast in-app) + CDP endpoint (Playwright/Stagehand attach) without shipping Playwright inside the app

## Implementation status

| Priority | Scope | Status |
|----------|--------|--------|
| P0 | Tools, trajectory, policies, takeover, modes, dual driver, UI | ✅ |
| P1 | STDIO MCP + HTTP bridge, recipes, installers, traction export | ✅ |
| P2 / non-wedge | Cloud runners, CAPTCHA solve, skill marketplace, multi-agent locks, Chromium fork, consumer parity with Comet | ⏸ parked until real demand |

## Non-wedge backlog (do not prioritize over attach + users)

| Item | Why parked |
|------|------------|
| Agent pet / theme candy | Brand, not wedge |
| CAPTCHA / residential proxies as core | Cloud BaaS game |
| Chromium fork | Months of cost |
| Multi-tenant cloud browser | Contradicts local-first |
| Auto-update | After release cadence stabilizes |

When in doubt: does it make **co-browse attach + policy + usage** stronger? If no, leave it here.
