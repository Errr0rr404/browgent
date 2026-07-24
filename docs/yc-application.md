# YC application packet (Browgent)

Companion: [builders.md](./builders.md) · [design-partners.md](./design-partners.md) · `npm run yc:packet` · `npm run demo:hero`

## Beachhead ICP (lead with ONE persona)

**Developers building browser agents that keep failing on real login / SSO / CAPTCHA walls.** They have an agent that works in a demo and dies the moment it meets an enterprise SSO screen, an MFA prompt, or a bot check. Browgent gives that agent a **local, logged-in session**, a **human who can take over mid-task and hand control back on the same tab**, and an **exportable trajectory** to debug and eval against.

Everything in this packet should speak to that persona first. HITL automation/ops teams and eval/safety labs are **"also useful for,"** not the wedge — demote them.

**Monetization wedge (one sentence):** the runtime stays **open-source and local**; we monetize the **audit / eval / policy surface** for teams — hosted trajectory history, shared policy packs, eval dashboards — once builders depend on it.

## What YC still needs that code cannot invent

| Requirement | How to close |
|-------------|--------------|
| **Founders all-in** | Full-time (or clear commitment); equity ≥10% each if multi-founder |
| **60–90s video** | Record script below; B-roll via `npm run demo:hero` |
| **Users / design partners** | [design-partners.md](./design-partners.md); get 3 quotes |
| **Growth curve** | Ship weekly; Settings → Export YC traction JSON; track downloads |
| **Why you** | Domain story only you can write |

**Product wedge is ready.** Approval odds rise with proof of pull, not more features.

## Hero demo script (60–90s)

| Time | Action | Say |
|------|--------|-----|
| 0:00 | Window + status bar | “Local co-browse runtime — not another chat browser.” |
| 0:08 | Agent → **Run demo** | “Same tabs for human and agent.” |
| 0:30 | Policy confirm or Takeover (optional live login) | “Policy + human keep control.” |
| 0:50 | Trajectory → Export | “Eval pack for builders.” |
| 1:05 | Terminal MCP (optional) | “Claude Code drives the same session.” |

Pre-check: `npm run mcp:smoke` · `npm run demo:hero` · reliability: public example.com + form recipe + takeover recipe + MCP path.

## Shipping rhythm

Weekly: ship something wedge-related → update [CHANGELOG.md](../CHANGELOG.md) → optional short post with a runnable artifact. Do not claim user counts you don’t have.

---

## Company description (paste / edit)

**One-liner**  
Local co-browse runtime: humans and AI agents share real Chromium tabs with policy, takeover, MCP, and Playwright — cookies stay on disk.

**Longer (paragraph)**  
Browgent is a desktop co-browse runtime for agent builders and HITL workflows. Unlike consumer AI browsers (Comet, Dia, BrowserOS), we optimize for attachability and control: the same local session is driven by the in-app agent, Claude Code over MCP, or Playwright over CDP. Unlike cloud browser fleets, identity and cookies never leave the machine. Policy gates, human takeover, and trajectory export make agent actions auditable.

**Not**  
- Not “another AI browser.”  
- Not a Chromium fork race with BrowserOS.  
- Not multi-tenant Browserbase.

---

## Application Q&A drafts

### What is your company going to make?

A **local co-browse runtime** where people and agents share Chromium tabs — with safety policy, takeover, trajectories, and first-class MCP + Playwright attach on the same session.

### Why now? (scaffold — keep the shape, fill with your specifics)

**Shape of a winning answer:** one line on the capability that just became true, one on the gap it exposes, one on why that gap is *yours* to close.

- **What just became true:** computer-use models (Anthropic CU, Gemini CU, and peers) can finally *click* — read a page and drive real UI reliably. Agents that were science projects 18 months ago now work in a demo.
- **The gap it exposes:** those agents still can't *survive* real environments — enterprise SSO, MFA, CAPTCHA, and logged-in state. Remote/headless agents fail the login; consumer AI browsers hide the control plane (no Playwright attach, weak audit) that builders need. A human-in-the-loop, local session is the missing piece.
- **Guiding prompts for Zann:** What did you personally watch break, on which app? What did you do by hand that a takeover→resume would have saved? Why is 2026 — not 2023 — the moment this is both buildable and wanted?

### Why you? (fill-in template — the part only you can write)

> I'm **[Zann]**. I hit this building **[what]** against **[which real logged-in apps]**. I kept having to **[the specific painful workaround]**. I've shipped **[evidence you move fast — e.g. this runtime in N weeks, live MCP + Playwright attach, weekly changelog]**. I'll obsess over **[co-browse reliability / identity / policy]** for years because **[reason]**.

Replace every bracket with something concrete and checkable. YC funds founder-market fit, not adjectives — swap each "[...]" for a fact, not a claim.

### Who are your competitors? Who might become competitors?

| Competitor | Difference |
|------------|------------|
| BrowserOS | Consumer OSS agentic browser |
| Comet / Dia / Atlas | Closed AI product browsers |
| Browserbase / Steel | Cloud fleets, multi-tenant |
| Playwright MCP alone | No shared human UI / policy chrome |
| browser-use / Stagehand | Frameworks — we host the session they attach to |

**Primary foil, stated head-on:** BrowserOS is a browser for end-users to automate their own browsing; Browgent is a runtime you attach agents and Playwright to, with a human in the loop. We honestly **tie** BrowserOS on OSS + local-first + model-agnostic, and **differ** on same-session attach, exportable audit, and takeover→resume. Comet / Dia / Atlas are the consumer-category reference, not the primary foil.

### How do or will you make money?

**One sentence:** the runtime stays open-source and local; we monetize the **audit / eval / policy surface** for teams — hosted trajectory history, shared policy packs, and eval dashboards — once builders depend on it. Open core; don't block early traction on pricing.

### Progress

Fill from product + real numbers:

```
• v{{version}} open-source co-browse runtime (Electron)
• Live MCP bridge + STDIO for Claude Code/Cursor
• Playwright CDP attach on same cookies
• Policy presets, recipes, eval-pack trajectory export
• Local metrics: __ launches, __ agent runs, __ MCP calls (Settings → export)
• Design partners: __ (names/quotes)
• Demo: [link]
```

Generate a machine packet: `npm run yc:packet` → `release/yc-traction-packet.json`  
In-app: **Settings → Privacy & data → Export YC traction JSON**

### How long have the founders known each other? / equity

*(Founder-only.)*

---

## Pre-submit checklist

### Product (done in repo)

- [x] Sharp wedge + competitor table  
- [x] MCP same-session attach  
- [x] Playwright docs + example  
- [x] Policy / takeover / export  
- [x] Recipes + hero demo automation  
- [x] Landing page  
- [x] Multi-OS dist scripts + release CI workflow  

### Founder (you)

- [ ] Application video recorded and uploaded  
- [ ] `npm run demo:hero` green on a clean machine  
- [ ] 3 design-partner conversations (ideally 1 quote)  
- [ ] Traction numbers filled (not zeros if possible)  
- [ ] Why you paragraph  
- [ ] Batch preference + full-time commitment confirmed  
- [ ] Releases published (at least macOS DMG)  

---

## Demo Day one-slide story

1. **Problem:** Agents can’t use real logged-in browsers safely.  
2. **Product:** Co-browse runtime — same tabs, policy, attach.  
3. **Proof:** Live demo (login → agent → takeover → MCP) + metrics.  
4. **Ask:** Capital + intros to agent/infra design partners.

---

## Commands

```bash
npm run demo:hero      # automated MCP co-browse path
npm run yc:packet      # traction JSON for application
npm run mcp:smoke
npm run dist:mac       # ship an installable
```
