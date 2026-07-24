# Builders: Claude Code + Browgent + Playwright

**Audience:** partners, HN, anyone who has never opened Browgent.

## Positioning

**One-liner:** Local co-browse runtime — humans and agents share real Chromium tabs with policy, takeover, trajectories, and MCP/Playwright attach. Cookies stay on disk.

| Not this | Instead |
|----------|---------|
| BrowserOS (agentic *browser*) | **Runtime / control plane** for builders + HITL |
| Comet / Dia / Atlas | Open, attachable, policy-auditable co-browse |
| Browserbase / cloud fleets | **Local-first** same-session tabs |
| Playwright MCP alone | Shared human UI + policy chrome on the same session |

| Is | Proof |
|----|--------|
| True co-browse | Same tab tree, ownership, takeover → resume |
| Local identity | `persist:browgent-pages`, Chrome-like guest UA |
| Builder attach | STDIO MCP + CDP on the **same** session |
| Safety + audit | Policy presets, confirm gates, eval-pack export |

## 5-minute path

### A. Desktop agent

```bash
git clone https://github.com/Errr0rr404/browgent.git && cd browgent
./setup.sh
npm run dev
```

1. Welcome → **Run demo** or a recipe chip  
2. Modes: **Act / Research / Watch** · Policy: **Builder** or **Strict**  
3. **Takeover** on login/CAPTCHA → **Resume**  
4. Trajectory → **Export eval JSON**  

Optional brain: `.env` with `XAI_API_KEY` (or any OpenAI-compatible provider). Without a key, heuristic mode still works.

### B. MCP (same session)

Status bar shows `mcp · :17342`. Token is required (auto: `userData/mcp-bridge.json`).

```bash
npm run mcp:smoke
npm run mcp
```

```json
{
  "mcpServers": {
    "browgent": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/absolute/path/to/browgent",
      "env": {
        "BROWGENT_MCP_URL": "http://127.0.0.1:17342",
        "BROWGENT_MCP_TOKEN": "<from userData/mcp-bridge.json>"
      }
    }
  }
}
```

Or **Settings → Privacy → Copy MCP config**. Full detail: [mcp.md](./mcp.md).

### C. Playwright (same cookies)

```bash
BROWGENT_CDP_PORT=9222 npm run dev
npm i -D playwright && npx playwright install chromium
npm run playwright:example
```

Keep in-app driver on **dom** while Playwright is attached. Detail: [playwright.md](./playwright.md).

## Hero demo (recording)

**In-app:** Agent → **Run demo** (example.com, no login).  
**Automated B-roll:** with app running, `npm run demo:hero` → `examples/demo-last-run.json`.

Full take for video (login + takeover):

1. Open Browgent, policy **Builder** or **Strict**  
2. Human logs into a real site (SSO local)  
3. Agent/MCP runs a multi-step task  
4. Policy confirm or **Takeover** for CAPTCHA/login  
5. **Resume** → **Export trajectory**  
6. Optional: show MCP `list_tabs` / `observe` in a terminal  

## Security

- MCP and CDP bind **127.0.0.1 only**; MCP requires a **token**  
- Private/metadata hosts blocked for agent nav by default (`BROWGENT_ALLOW_PRIVATE_HOSTS=1` to override)  
- Disable when idle: `BROWGENT_MCP=0` / `BROWGENT_CDP=0`
