# Getting started

## Option A — Download

| Platform | How |
|----------|-----|
| **macOS** Apple Silicon | [Browgent-mac-arm64.dmg](https://github.com/Errr0rr404/browgent/releases/latest/download/Browgent-mac-arm64.dmg) — drag to Applications |
| **Windows / Linux** | Build with `npm run dist:win` / `dist:linux`. Tag CI also produces NSIS / AppImage as a **draft** release; they are not on the published latest (v0.2.0) assets |

### macOS Gatekeeper (unsigned OSS)

1. Open DMG → Applications  
2. First launch: **right-click → Open** (or Privacy & Security → Open Anyway)  
3. Signed builds (when `CSC_IDENTITY` is set in CI) skip most of this  

### Windows / Linux

- Windows: run NSIS installer; SmartScreen may need **More info → Run anyway** if unsigned  
- Linux: `chmod +x Browgent-linux-x64.AppImage && ./Browgent-linux-x64.AppImage`

Packaged builds do **not** read a `.env` next to the installer. Set env vars in the shell, put `.env` in the app userData folder, or run from source. **Grok is the default** (`XAI_API_KEY`); any OpenAI-compatible provider works via `BROWGENT_PROVIDER` / `BROWGENT_API_KEY` / `BROWGENT_BASE_URL`.

## Option B — From source

**Requirements:** Node.js **≥ 22.12.0** (locked Electron tooling requires it), npm, macOS / Windows / Linux. `setup.sh` uses `npm ci` when a lockfile is present.

```bash
git clone https://github.com/Errr0rr404/browgent.git
cd browgent
./setup.sh          # npm ci/install + .env + typecheck
npm run dev
```

Manual equivalent:

```bash
npm ci              # or `npm install` if package-lock.json is absent
cp .env.example .env
npm run typecheck
npm run dev
```

### Environment variables

Copy `.env.example` to `.env` (never commit `.env`).

| Variable | Required | Description |
|----------|----------|-------------|
| `XAI_API_KEY` | No | **Default brain** — xAI Grok ([console.x.ai](https://console.x.ai)) |
| `BROWGENT_MODEL` | No | Model id (default `grok-4.5` for Grok) |
| `BROWGENT_PROVIDER` | No | `auto` · `grok` · `openai` · `openrouter` · `groq` · `deepseek` · `ollama` · `custom` |
| `BROWGENT_API_KEY` | No | Generic API key (any OpenAI-compatible provider) |
| `BROWGENT_BASE_URL` | No | Generic base URL (…`/v1`) |
| `BROWGENT_VISION` | No | Send viewport screenshots to multimodal models (`1` / `on`) |
| `BROWGENT_MAX_TOKENS` | No | Cap completion length (positive integer; unset = provider default) |
| `XAI_BASE_URL` | No | Grok API base (default `https://api.x.ai/v1`) |
| `OPENAI_API_KEY` / `OPENROUTER_API_KEY` / `GROQ_API_KEY` / `DEEPSEEK_API_KEY` | No | Provider keys (auto-detected) |
| `OPENAI_BASE_URL` / `OPENROUTER_BASE_URL` / `GROQ_BASE_URL` / `DEEPSEEK_BASE_URL` | No | Per-provider base URL overrides |
| `OLLAMA_BASE_URL` / `OLLAMA_HOST` / `OLLAMA_API_KEY` | No | Local Ollama OpenAI-compatible endpoint (key optional) |
| `SPACE_XAI_API_KEY` / `GROK_API_KEY` | No | Aliases for the Grok key |
| `BROWGENT_CDP_PORT` | No | Enable CDP on the given port. Off by default for normal `npm run dev`; positive port enables, `0` disables |
| `BROWGENT_CDP` | No | Shorthand toggle: `1`/`on` enables port 9222; `0`/`off`/`false` disables |
| `BROWGENT_DRIVER` | No | In-app driver: `dom` (default) or `cdp` |
| `BROWGENT_AGENT_ONLY` | No | Compact automation shell (`1` = on; implies CDP unless disabled) |
| `BROWGENT_HEADLESS` | No | Hide window; drive via CDP (`1` = on; implies CDP unless disabled) |
| `BROWGENT_CDP_URL` | No | Playwright **example script** endpoint override only |
| `BROWGENT_MCP` / `BROWGENT_MCP_PORT` | No | MCP bridge (default on, port **17342**; `0` disables) |
| `BROWGENT_MCP_TOKEN` | No | Override auto token (`userData/mcp-bridge.json`) — **required by `/v1/*` clients** |
| `BROWGENT_MCP_TOKEN_FILE` | No | Path to a JSON file with a `token` field (STDIO adapter / smokes) |
| `BROWGENT_MCP_URL` | No | STDIO adapter / smoke scripts target (default `http://127.0.0.1:17342`) |
| `BROWGENT_ALLOW_PRIVATE_HOSTS` | No | Allow agent/MCP to open loopback/LAN (default blocked) |
| `BROWGENT_TELEMETRY_URL` | No | Optional remote metrics flush; only used when the user also opts in in Settings |

Legacy aliases (same meaning): `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_VISION`, `LLM_MAX_TOKENS`.

**Auto-detect order:** Grok → OpenAI → OpenRouter → Groq → DeepSeek → Ollama (if host set) → custom `BROWGENT_*`. Native `BROWGENT_PROVIDER=anthropic` is **not** supported — use OpenRouter (`anthropic/…`) or an OpenAI-compatible proxy via `BROWGENT_BASE_URL`.

CLI mirrors: `--cdp-port`, `--cdp`, `--driver`, `--agent-only`, `--headless`, `--mcp-port`, `--mcp`.

Without any key, Browgent uses a **heuristic planner** (site aliases, observe, click/type patterns). Still useful for demos and offline work.

```bash
# Default — Grok
XAI_API_KEY=xai-...

# OpenAI
BROWGENT_PROVIDER=openai
OPENAI_API_KEY=sk-...
BROWGENT_MODEL=gpt-4o

# OpenRouter → Claude / Gemini / etc.
BROWGENT_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
BROWGENT_MODEL=anthropic/claude-sonnet-4

# Local Ollama
BROWGENT_PROVIDER=ollama
BROWGENT_MODEL=llama3.2
```

Playwright attach: see [playwright.md](./playwright.md) and `examples/playwright-connect.mjs`. `BROWGENT_CDP_URL` only overrides the example script; the app uses `BROWGENT_CDP_PORT`.

## After install (&lt;10 minutes)

1. Welcome modal → **Run demo** or a recipe  
2. Agent panel (⌘J) → **Run demo** / recipe chips  
3. Status bar: `mcp · :17342` → wire Claude Code ([mcp.md](./mcp.md))  
4. Policy tab → Strict / Builder / Open  
5. Trajectory → **Export eval JSON**  
6. Settings (⌘,) → **Import** (one-click from Chrome/Arc/Edge/…) and **User Hub** (profile + password vault)
7. Settings → **Brain** shows the resolved provider/model (keys stay in `.env`, never in the UI)
8. Settings → **Search & new tab** — omnibox engine (Google / DuckDuckGo / Brave / Kagi). Agent `search` still uses DuckDuckGo to avoid reCAPTCHA during automation
9. Settings → **Privacy & data** → ad/tracker filter + cookie banners; optional **Export YC traction JSON**
10. Toolbar **Summarize** (⌘⇧U) or Downloads → save page assets

| Goal | What should happen |
|------|--------------------|
| `go to gh` | Opens GitHub (not a Google search) |
| **Run demo** | Public research task → browses a few real pages → reasons → done summary |
| Mic button | Speech → agent instruction |
| Takeover / Resume | Human owns tabs mid-task |
| Summarize / shield | Page summary recipe; status bar shows blocked request count |

## Build installers

```bash
npm run dist:mac     # DMG arm64 → release/
npm run dist:win     # NSIS x64
npm run dist:linux   # AppImage x64
```

Tag `v*` triggers multi-OS CI and a **draft** GitHub Release ([releasing.md](./releasing.md)). Published **latest** today is the macOS arm64 DMG.

## Verify from source

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run build
```

With the app running: `npm run mcp:smoke`. With CDP enabled: `npm run playwright:example`.

## Next

- [Builders](./builders.md) · [MCP](./mcp.md) · [Architecture](./architecture.md) · [Agent guide](./agent-guide.md)
