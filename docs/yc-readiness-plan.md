# YC Readiness Plan — Browgent

> Product + implementation roadmap so Browgent is fundable by YC (or strong without it).  
> Date: 2026-07-23 · Status: **implementation audit complete** (see Part I)  
> Canonical application packet: [yc-application.md](./yc-application.md) · Docs index: [README.md](./README.md)

**Goal:** Ship a sharp **local co-browse agent runtime** with builder distribution (MCP + Playwright), installable binaries, real usage signal, and a demo story YC cannot confuse with BrowserOS/Comet.

**Architecture (stay the course):** Electron desktop; React chrome-only; guest `WebContentsView` + `persist:browgent-pages`; dual DOM/CDP driver; agent tool loop + policies + trajectory; Playwright via CDP; **live STDIO MCP (shipped)**.

**Tech stack (do not rewrite):** Electron, electron-vite, React, TypeScript, OpenAI-compatible LLM client, Playwright attach (external), `@modelcontextprotocol/sdk` (in dependencies).

---

## Part A — Market reality: is there room?

### Short answer

**Yes — if you pick a wedge and win it.** No — if you compete as “another AI browser.”

Hundreds of apps claim “AI browses for you.” That is noise, not a closed market. Markets that look crowded at the *feature* layer still have open slots at the *job-to-be-done* layer. YC and the market both fund overlapping products when:

1. The **category is huge** (knowledge work + agents on the web).
2. Incumbents are **partial** (chat sidebars, remote VMs, headless fleets, Chromium forks).
3. A team has a **non-obvious insight** and proof people care.

BrowserOS, Browser Use, Comet, Dia, Operator, Browserbase, Playwright MCP, Claude Chrome — all can be true at once. Slack did not die because IRC and email existed.

### Market structure (5 layers, not one)

| Layer | Examples | What they optimize | Browgent relationship |
|-------|----------|--------------------|------------------------|
| Consumer AI browsers | Comet, Dia, Atlas, BrowserOS | End-user chat + automate | Adjacent; **do not lead here** |
| Cloud browser fleets | Browserbase, Steel, Kernel | Scale, stealth, CAPTCHA | Complement later; opposite of local-first |
| Agent frameworks | browser-use, Stagehand, Skyvern | NL → act loop in *someone’s* browser | **Attach to us** as the local host |
| Local coding-agent tools | Playwright MCP, Chrome DevTools MCP | Dev tools for Claude/Cursor | **We become the session** they drive |
| Model CU primitives | Anthropic / Gemini computer use | Screenshot → mouse | Inputs; not the product |

“100 apps” mostly stack into those layers. Very few own **true local co-browse**: human + agent on the same tab tree, local cookies/SSO, policy gates, takeover, trajectory, and external automation (MCP/Playwright) on that same session.

### Why the market still has room

1. **Jobs still unsolved at quality.** Remote agents fail on real logins. Headless fails on bot walls. Consumer AI browsers hide control (no Playwright attach, weak audit). Enterprises need policy + human-in-the-loop.
2. **Platform shift is early.** “Browser as OS for AI employees” is a multi-year wave. Early winners of waves are rarely the only survivors; infrastructure + control planes often win after consumer hype.
3. **Different buyers.** Consumer wants magic. Builders want attachability. Ops/compliance want policy and trajectories. One product cannot be best at all three; specializing is an advantage.
4. **YC already funds multiples.** BrowserOS (S24) and Browser Use (W25) both exist. Category validation is a green light for a *distinct* wedge, not a stop sign.

### Where Browgent loses (honest)

| Failure mode | How it happens |
|--------------|----------------|
| Clone death | Pitch “open-source agentic browser” = BrowserOS with less traction |
| Feature soup | Themes, pets, 50 tools, no hero workflow, no users |
| Hobby distribution | macOS-only, unsigned, clone-to-run, no MCP, no growth curve |
| Wrong buyer | Competing with Perplexity on polish instead of builders/HITL |
| No insight | “AI browser is cool” without a reason *you* win |

### Where Browgent can win

**Positioning (canonical):**

> Browgent is the **local co-browse runtime** for humans and agents on the same Chromium tabs — policy-aware, takeover-first, Playwright- and MCP-attachable. Cookies stay on disk. Trajectory is exportable. Built for agent builders and HITL workflows, not another chat-in-browser consumer app.

**Moat candidates (earn over time, not claim day one):**

| Asset | Why it compounds |
|-------|------------------|
| Session + identity model | Real SSO without multi-tenant session shipping |
| Policy + trajectory | Eval, compliance, replay — builders/enterprises pay for this |
| Attach surface (MCP + CDP) | Becomes default host for coding agents and frameworks |
| Community recipes/skills | Workflow library around co-browse |
| Design-partner depth | Vertical workflows nobody else polishes |

### Verdict for founders

| Question | Answer |
|----------|--------|
| Is the market real? | **Yes** — large and expanding. |
| Is it crowded at the slogan level? | **Yes** — ignore slogan competition. |
| Is there product-market room? | **Yes**, for co-browse runtime / builder control plane. |
| Is YC possible? | **Yes**, with wedge + velocity + usage signal. |
| Is YC required? | **No** — same plan makes the company fundable elsewhere. |

**Do not build if:** you only want “like BrowserOS.”  
**Do build if:** you will obsess over co-browse reliability, attachability, and a narrow set of users who would be angry if you shut down.

---

## Part B — What “YC-ready” means (definition of done)

Not “feature complete.” Ready when a partner can believe:

1. **Problem is real and you know it** (founder insight + demos on real sites).
2. **Product is distinct** (one sentence + 60s video; not confusable with BrowserOS).
3. **You ship weekly** and the product works without a research setup.
4. **Someone uses it** (installs, agent runs, MCP sessions, design partners — any honest curve).
5. **Team is committed** (full-time or clearly all-in; equity clear).

### Application-ready checklist

| Gate | Target | Status today (approx.) |
|------|--------|-------------------------|
| Locked wedge + competitor line | Written + on README/site | ✅ positioning + website/ |
| End-to-end hero demo | Reliable multi-step + takeover + export | ✅ recipes + hero-demo.md (record video still human) |
| Live STDIO MCP on same session | Claude Code/Cursor attach &lt;5 min | ✅ Bridge + STDIO |
| Playwright attach documented | One-command example | ✅ |
| Install without source build | Signed mac + Windows (Linux nice) | ⚠️ scripts ready; notarization needs cert |
| Cross-platform | ≥2 OS installers | ⚠️ dist:win/linux scripts; build on target CI |
| Public face | Landing + 90s video + clear README | ✅ landing HTML; video human |
| Traction signal | Weekly installs/runs + growth | ✅ local metrics + opt-in telemetry |
| Design partners | 3–5 users who depend on you | ⚠️ program doc; outreach human |
| Founder package | Video, equity, full-time story | Outside product |

---

## Part C — Implementation plan (phased)

### Principles

1. **Every phase must make the wedge clearer or the usage numbers higher.**
2. **No Chromium fork.** Stay Electron.
3. **Deprioritize chrome candy** (pets, themes) until P0–P1 gates pass.
4. **Ship vertical slices** users can install, not horizontal refactors.

---

### Phase 0 — Positioning freeze (3–5 days, mostly docs + demo script)

**Outcome:** Anyone (YC, HN, investor) understands Browgent in 15 seconds.

| Task | Deliverable | Owner area |
|------|-------------|------------|
| 0.1 Canonical one-liner + “not BrowserOS / not Comet / not Browserbase” table | README hero + `docs/positioning.md` | Docs |
| 0.2 Hero workflow script | Written scenario: login → agent acts → policy confirm → takeover → resume → export trajectory | Product |
| 0.3 Record internal demo | 60–90s unlisted video of hero workflow | Product |
| 0.4 Kill / park non-wedge work | Explicit backlog: pet polish, theme expansion → P3 | Process |

**Exit:** You can pitch without saying “AI browser” as the primary noun.

---

### Phase 1 — Attachability (2–3 weeks) — *highest product ROI*

**Outcome:** External agents drive the **same** local session Browgent shows the human.

#### 1.1 Live STDIO MCP server

| Item | Detail |
|------|--------|
| **Why** | Builder distribution; parity with market expectation; wedge “same session” |
| **Files (expected)** | `src/main/mcp/server.ts` (replace stub), new package entry e.g. `bin/browgent-mcp` or `browgent mcp`, wire tools from `src/shared/tools.ts` through `ToolExecutor` / TabManager |
| **Behavior** | STDIO MCP; tools mirror desktop agent; respect policy + mode; share tab state; document Claude Code / Cursor config |
| **Done when** | External client can navigate, observe, click, type on open Browgent tabs; status UI shows “MCP connected” |

#### 1.2 Harden dual driver + Playwright path

| Item | Detail |
|------|--------|
| **Why** | Frameworks attach without rewriting their stack |
| **Files** | `cdp-endpoint.ts`, `page-driver.ts`, `docs/playwright.md`, `examples/playwright-connect.mjs` |
| **Done when** | Fresh install: enable CDP → example script works; conflict with in-app debugger documented and safe |

#### 1.3 Policy + takeover reliability (demo-critical)

| Item | Detail |
|------|--------|
| **Why** | Differentiator and demo trust |
| **Files** | `session.ts`, `executor.ts`, `policies.ts`, AgentPanel confirm UX |
| **Done when** | Stop/clear never races; takeover → human login → resume same tab works 9/10; sensitive actions confirm reliably |

**Phase 1 exit:** “Claude Code + Browgent + Playwright” one-pager works for a stranger.

---

### Phase 2 — Installable product (1–2 weeks, parallel with Phase 1 end)

**Outcome:** Non-engineers (and YC partners) can try Browgent without `npm run dev`.

| Task | Deliverable |
|------|-------------|
| 2.1 Windows installer | electron-builder Windows target; smoke test guest identity + agent |
| 2.2 macOS notarization / clearer Open instructions | Reduce “unsigned scary” friction; document Gatekeeper path |
| 2.3 Linux AppImage or deb (optional but good) | Broader OSS distribution |
| 2.4 First-run UX | Provider key or local/heuristic path; open hero recipe; CDP/MCP status visible |
| 2.5 Auto-update (optional P2) | electron-updater later if release cadence justifies |

**Exit:** Download link → agent run in &lt;10 minutes on Mac and Windows.

---

### Phase 3 — Hero product surface (2 weeks)

**Outcome:** One unforgettable workflow, not 40 half-features.

| Task | Deliverable |
|------|-------------|
| 3.1 Skills / recipes (5–10) | Saved prompts + optional step hints: research, form fill, QA smoke, competitive scrape, inbox triage |
| 3.2 Trajectory export UX | One-click export + sample “eval pack” JSON for builders |
| 3.3 Mode defaults that match wedge | Act / Research / Watch obvious; policy presets (strict / builder / open) |
| 3.4 Reliability pass on top 5 sites | Google login, GitHub, Notion-like SaaS, one banking-like confirm flow (synthetic ok) |
| 3.5 Guest identity regression suite | Manual checklist + scripted smoke so Google/Akamai blocks don’t resurface silently |

**Exit:** Demo video is boringly reliable; recipes make first success likely.

---

### Phase 4 — Traction machine (ongoing from Phase 2)

**Outcome:** Numbers you can put on a YC application without lying.

| Task | Deliverable |
|------|-------------|
| 4.1 Landing page | One page: wedge, video, download, GitHub, “for builders” |
| 4.2 Coarse telemetry (privacy-safe) | Opt-in or anonymous: install id, version, agent_run_count, mcp_session_count, OS — **no page contents** |
| 4.3 Public changelog + weekly ship posts | X/HN rhythm; show velocity |
| 4.4 Design partner program | 5 targets (agent startups, RPA-ish ops, indie hackers building agents); free support for quotes |
| 4.5 GitHub presence | Issues templates, good first issues, star-worthy README GIF |
| 4.6 Distribution hooks | MCP directory listings, “works with Claude Code” guide, Playwright community post |

**Target signals (directional, not magic):**

- Week-over-week growth in installs or agent runs (even from small base)
- ≥50–200 real downloads or active installs before applying is strong; smaller OK with partner letters
- 3 written design-partner quotes
- MCP or Playwright attach used outside your machine

---

### Phase 5 — Optional scale (post-traction / post-YC apply)

Only if users pull:

| Item | When |
|------|------|
| Team / org policy packs | Enterprise pilot |
| Cloud hybrid runners | When local isn’t enough (keep sessions local by default) |
| Multi-agent tab locks | Multi-agent customers |
| Skill marketplace | Community recipes take off |
| Paid tier (hosted control plane, priority support) | After retention exists |

**Do not block YC application on Phase 5.**

---

## Part D — Explicit non-goals until Phase 4 exit

| Non-goal | Reason |
|----------|--------|
| Chromium fork | Months of cost; wrong wedge |
| CAPTCHA solving / residential proxies as core | Cloud BaaS game |
| Consumer feature parity with Comet/Dia | Infinite polish race |
| Agent pet / theme expansion as priority | Brand, not fundability |
| Full multi-tenant cloud browser | Contradicts local-first story |
| “Support every LLM UI trick” | Reliability &gt; novelty |

---

## Part E — Suggested timeline (aggressive, solo or 2-person)

```
Week 1       Phase 0 + start MCP
Week 2–3     Phase 1 MCP + Playwright harden + takeover
Week 3–4     Phase 2 Windows + install polish
Week 4–5     Phase 3 recipes + reliability + demo video public
Week 5–8     Phase 4 growth + design partners + apply to YC when gates green
```

Re-apply is fine; shipping does not wait for a batch open window.

---

## Part F — File / subsystem map (implementation anchors)

| Subsystem | Path | YC relevance |
|-----------|------|--------------|
| MCP | `src/main/mcp/server.ts` | P1 critical |
| Agent loop | `src/main/agent/session.ts`, `executor.ts` | Demo reliability |
| Policies | `src/shared/policies.ts` | Differentiator |
| Tools | `src/shared/tools.ts` | Shared surface MCP + UI |
| Tabs / identity | `tab-manager.ts`, `guest-identity.ts`, `preload/guest.ts` | Local session truth |
| CDP | `cdp-endpoint.ts`, `page-driver.ts` | Playwright attach |
| Chrome UI | `src/renderer/...` | Modes, confirm, export UX |
| Dist | `electron-builder.yml`, release scripts | Installs |
| Docs | `README.md`, `docs/playwright.md`, new positioning/MCP docs | Narrative |

---

## Part G — YC narrative (draft for application later)

**What do you do?**  
Local co-browse runtime: humans and AI agents share real Chromium tabs with policy, takeover, and automation attach (MCP/Playwright).

**Why now?**  
Models can drive UIs, but remote agents can’t use real enterprise logins safely, and consumer AI browsers don’t give builders a control plane.

**Why you?**  
[Fill: domain, speed of shipping, insight about co-browse / identity / policy.]

**How is this different from BrowserOS?**  
They are an open-source agentic *browser* for end-user automation. We are the *runtime* for human↔agent co-browse with policy, trajectory, and first-class attach for coding agents and Playwright on the same session.

**Traction:**  
[Fill after Phase 4.]

---

## Part H — Decision summary

| Topic | Decision |
|-------|----------|
| Market potential | **Real**, if wedge stays co-browse runtime not “AI browser #101” |
| Compete with 100 apps? | Compete on **job** (builders + HITL + local session), not on slogan |
| Stack | Keep Electron stack |
| First build priority | MCP → installers → hero reliability → traction |
| YC | Possible after Phase 1–4 gates; apply when usage story exists |
| Success without YC | Same plan |

---

## Part I — Implementation audit (2026-07-23)

Legend: ✅ done in repo · ⚠️ partial / needs human or CI machine · ❌ not done (and not required for product phases 0–4)

### Phase 0 — Positioning

| Task | Status | Evidence |
|------|--------|----------|
| 0.1 One-liner + not-BrowserOS table | ✅ | `README.md` hero, `docs/positioning.md`, `website/index.html` |
| 0.2 Hero workflow script | ✅ | `docs/hero-demo.md`, `docs/builders.md` |
| 0.3 Record demo video | ⚠️ | Script ready; recording is human |
| 0.4 Park non-wedge work | ✅ | `docs/backlog-non-wedge.md` |

### Phase 1 — Attachability

| Task | Status | Evidence |
|------|--------|----------|
| 1.1 Live STDIO MCP same session | ✅ | `src/main/mcp/bridge.ts`, `scripts/browgent-mcp.mjs`, `npm run mcp` / `mcp:smoke` |
| 1.1 Status UI | ✅ | Status bar `mcp · :port`, Settings MCP port + copy config |
| 1.2 Playwright / dual driver | ✅ | `docs/playwright.md`, `examples/playwright-connect.mjs` |
| 1.3 Policy + takeover + stop/clear | ✅ | Generation tokens in `session.ts`, confirm UX, MCP `needsHuman` |
| Builders one-pager | ✅ | `docs/builders.md` |

### Phase 2 — Installable product

| Task | Status | Evidence |
|------|--------|----------|
| 2.1 Windows installer target | ✅ | `electron-builder.yml` win + `npm run dist:win` (build on Win/CI) |
| 2.2 macOS Gatekeeper docs | ✅ | `docs/install.md` (notarization needs cert ⚠️) |
| 2.3 Linux AppImage | ✅ | `npm run dist:linux` |
| 2.4 First-run UX | ✅ | `FirstRunModal.tsx` + recipes + heuristic/API key copy |
| 2.5 Auto-update | ❌ | Explicitly optional / non-goal until release cadence |

### Phase 3 — Hero product surface

| Task | Status | Evidence |
|------|--------|----------|
| 3.1 Recipes 5–10 | ✅ | 9 in-app (`src/shared/recipes.ts`) + `recipes/*.md` |
| 3.2 Trajectory eval export | ✅ | `schemaVersion` + `evalSteps`; sample `examples/trajectory-eval-sample.json` |
| 3.3 Modes + policy presets | ✅ | Act/Research/Watch bar; Strict/Builder/Open in Policy pane |
| 3.4 Reliability site matrix | ✅ | `docs/reliability-sites.md` (manual pass before demos) |
| 3.5 Guest identity suite | ✅ | `docs/guest-identity-checklist.md`, `npm run test:identity` |

### Phase 4 — Traction machine

| Task | Status | Evidence |
|------|--------|----------|
| 4.1 Landing page | ✅ | `website/index.html` |
| 4.2 Privacy-safe metrics | ✅ | `src/main/metrics/store.ts`, Settings opt-in |
| 4.3 Changelog + ship rhythm | ✅ | `CHANGELOG.md`, `docs/shipping-rhythm.md` |
| 4.4 Design partner program | ⚠️ | `docs/design-partners.md` (outreach human) |
| 4.5 GitHub presence | ✅ | Issue templates + good_first_issue; README wedge (GIF optional ⚠️) |
| 4.6 Distribution hooks | ✅ | `docs/mcp.md`, `docs/builders.md`, Playwright docs |

### Phase 5 — Optional scale

| Item | Status |
|------|--------|
| Cloud runners, multi-agent locks, marketplace, paid tier | ❌ intentionally deferred |

### Product vs human remaining

| Still needed for YC application | Owner | Product support now in repo |
|----------------------------------|--------|------------------------------|
| 60–90s demo video | Founder | `docs/hero-demo.md` + **Run demo** + `npm run demo:hero` |
| Signed/notarized multi-OS releases | Founder + secrets | `.github/workflows/release.yml` (tag `v*`) |
| Real design partners + quotes | Founder | outreach templates + landing CTA |
| Usage curve | Founder | Settings **Export YC traction JSON** + `npm run yc:packet` |
| Application answers | Founder | `docs/yc-application.md` drafts |

### Verify commands

```bash
npm run typecheck
npm run test:unit
npm run build
# with app running:
npm run mcp:smoke
npm run test:identity
```

---

## Next step after plan approval

Execute in order:

1. Phase 0 positioning docs + hero script  
2. Phase 1.1 live STDIO MCP (largest product unlock)  
3. Parallel: Windows dist  
4. Land recipes + public demo + telemetry  

**Code phases 0–4 are implemented.** Next: human demo video, release artifacts, design partners.
