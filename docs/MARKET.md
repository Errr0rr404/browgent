# Agent Browser Market (mid-2026) & Browgent Feature Map

Research synthesized from Browserbase/Stagehand, browser-use, Skyvern, MultiOn, Anthropic CU / Claude Chrome, OpenAI ChatGPT agent, Perplexity Comet, Dia, Gemini Computer Use, Steel, Kernel, Hyperbrowser, Airtop, Browserless, Playwright/CDT MCP, Firecrawl, Anchor, Lightpanda, agent-browser.

## Market layers

| Layer | Who | What they sell |
|-------|-----|----------------|
| Cloud BaaS | Browserbase, Steel, Kernel, Hyperbrowser, Browserless, Anchor | Remote Chromium fleets, stealth, CAPTCHA, proxies |
| Agent frameworks | Stagehand, browser-use, Skyvern, Airtop | NL → act/extract/observe loops |
| Consumer AI browsers | Comet, Dia, ChatGPT agent | Co-pilot browsing for humans |
| Model primitives | Anthropic CU, Gemini CU | Screenshot → mouse/keyboard |
| Local MCP | Playwright MCP, Chrome DevTools MCP, agent-browser | Coding-agent browser tools |

## Competitor feature checklist → Browgent

| Feature | Leaders | Browgent |
|---------|---------|----------|
| Multi-tab real Chromium | All browsers / BaaS | ✅ Desktop shared tabs |
| Navigate / click / type / scroll / keys | browser-use, Stagehand, CU | ✅ Tool surface |
| Compact element refs (`@e1`) | agent-browser, browser-use | ✅ A11y+DOM index |
| Screenshots + text extract | Everyone | ✅ Dual observation |
| Structured extract | Stagehand, Skyvern | ✅ extract_text / links / JSON-ish |
| Session cookies / profile | BaaS contexts | ✅ `persist:browgent-pages` |
| Human takeover / confirm | Operator, Claude Chrome | ✅ Takeover + policy gates |
| Action trajectory / export | Skyvern audit, Stagehand replay | ✅ Trajectory log + JSON export |
| Live narration of steps | ChatGPT agent UX | ✅ Action chips + activity feed |
| Research vs act modes | Comet vs Operator | ✅ research / act / watch |
| Domain policy / safety | Claude allowlists | ✅ Policy engine (differentator) |
| MCP server same session | Browserbase MCP (cloud) | ✅ Local MCP → same tabs |
| SDK parity | All infra | ✅ `@browgent/core` types + tools |
| CAPTCHA solve / residential proxy | Cloud BaaS | ⏳ Optional later (cloud runner) |
| Visual workflow builder | Skyvern, Airtop | ⏳ Later |
| Cloud fleet scale | Kernel/Steel | ⏳ Hybrid routing later |

## Whitespace only Browgent owns (differentiators)

1. **Human + agent true co-browsing** — same tab tree, not cloud live-view
2. **Local-first identity** — real cookies/SSO without shipping session to multi-tenant cloud
3. **Desktop + MCP + SDK one object model**
4. **Browser-native policy engine** (allowlist, max steps, confirm submits/payments)
5. **Dual observation timeline** (compact refs + optional screenshots) in one UI
6. **Tab locks / ownership** primitives for multi-agent (foundation)
7. **Handoff**: agent stuck → human acts → agent resumes same tab

## Implementation priority (this sprint)

P0 tools + observations + trajectory + policies + takeover + modes + MCP + UI  
P1 cloud runners, CAPTCHA, skill replay compiler, multi-agent locks
