# Design partners

## Who we want

**Beachhead (lead here):** developers building browser agents that keep failing on real **login / SSO / CAPTCHA** walls. Browgent gives those agents a local, logged-in session, a human who can take over mid-task and hand control back, and an exportable audit trail. Speak to this persona first.

**Also useful for** (secondary — don't lead with these):

| Fit | Examples |
|-----|----------|
| Automation / ops | HITL workflows that need an audit trail |
| Indie builders | Claude Code users driving logged-in web apps |
| Eval / safety | Labs that need trajectory export |

## What they get

- Direct support during pilot  
- Influence on policy presets + MCP tools  
- Early access to releases  
- Optional logo/quote for launch materials  

## What we need

- Weekly usage for ≥2 weeks **or** one serious workflow  
- Honest feedback (what broke)  
- Optional public quote if they would miss Browgent  

## Metrics

Settings → **Privacy & data**: ad/tracker filter + cookie banners; local metrics (launches, agent runs, MCP calls, demos, recipes — no page content).  
Export: **Export YC traction JSON** or `npm run yc:packet`.

Landing CTA: [website/index.html](../website/index.html) → “Design partner” issue.

---

## Outreach templates

### Cold DM / email

Subject: Co-browse runtime for your browser agents (design partner)

Hi {{name}} —

I’m building **Browgent**: a local co-browse runtime where humans and agents share real Chromium tabs (policy, takeover, MCP + Playwright on the same cookies). Not another chat browser — closer to a control plane for agent systems.

Looking for design partners who would:

1. Install and run one workflow (login → agent/MCP → takeover)  
2. Tell us what breaks  
3. Optionally give a short quote  

Happy to support you weekly for free during the pilot.

Repo: https://github.com/Errr0rr404/browgent · Builders: docs/builders.md

— {{you}}

### Follow-up (7 days)

Quick ping — did you get a chance to try the co-browse MCP path? Happy to jump on a 15‑min call and drive a recipe live.

### Quote ask

If Browgent disappeared tomorrow, would that annoy you? If yes, a one-sentence quote for our launch materials would mean a lot — you can edit or stay anonymous.

## Tracking (internal)

Private sheet: name · company · use case · first session · quote · blockers.
