# YC application packet (Browgent)

Companion: [builders.md](./builders.md) · [design-partners.md](./design-partners.md) · `npm run yc:packet` · `npm run demo:hero`

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

### Why did you pick this idea?

Knowledge work still lives in the browser. Models can click, but remote agents fail real logins and consumer AI browsers hide the control plane builders need. We felt this building automation against real SSO apps.

### Who are your competitors? Who might become competitors?

| Competitor | Difference |
|------------|------------|
| BrowserOS | Consumer OSS agentic browser |
| Comet / Dia / Atlas | Closed AI product browsers |
| Browserbase / Steel | Cloud fleets, multi-tenant |
| Playwright MCP alone | No shared human UI / policy chrome |
| browser-use / Stagehand | Frameworks — we host the session they attach to |

### How do or will you make money?

Open core: free local runtime; later team seats / hosted control plane / enterprise policy packs. Do not block early traction on pricing.

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
In-app: **Settings → Privacy → Export YC traction JSON**

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
