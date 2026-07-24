# Getting started

## Option A — Download

| Platform | How |
|----------|-----|
| **macOS** Apple Silicon | [Browgent-mac-arm64.dmg](https://github.com/Errr0rr404/browgent/releases/latest/download/Browgent-mac-arm64.dmg) — drag to Applications |
| **Windows / Linux** | Build with `npm run dist:win` / `dist:linux`, or check [Releases](https://github.com/Errr0rr404/browgent/releases) when published |

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
| `XAI_BASE_URL` | No | Grok API base (default `https://api.x.ai/v1`) |
| `OPENAI_API_KEY` / `OPENROUTER_API_KEY` / `GROQ_API_KEY` / `DEEPSEEK_API_KEY` | No | Provider keys (auto-detected) |
| `OLLAMA_BASE_URL` / `OLLAMA_HOST` | No | Local Ollama OpenAI-compatible endpoint |
| `SPACE_XAI_API_KEY` / `GROK_API_KEY` | No | Aliases for the Grok key |
| `BROWGENT_CDP_PORT` | No | Enable CDP on the given port. Off by default for normal `npm run dev`; positive port enables, `0` disables |
| `BROWGENT_CDP` | No | Shorthand toggle: `1`/`on` enables port 9222; `0`/`off`/`false` disables |
| `BROWGENT_DRIVER` | No | In-app driver: `dom` (default) or `cdp` |
| `BROWGENT_AGENT_ONLY` | No | Compact automation shell (`1` = on) |
| `BROWGENT_HEADLESS` | No | Hide window; drive via CDP (`1` = on) |
| `BROWGENT_CDP_URL` | No | Playwright example endpoint override |
| `BROWGENT_MCP` / `BROWGENT_MCP_PORT` | No | MCP bridge (default on, port **17342**; `0` disables) |
| `BROWGENT_MCP_TOKEN` | No | Override auto token (`userData/mcp-bridge.json`) — **required by clients** |
| `BROWGENT_ALLOW_PRIVATE_HOSTS` | No | Allow agent/MCP to open loopback/LAN (default blocked) |

**Auto-detect order:** Grok → OpenAI → OpenRouter → Groq → DeepSeek → Ollama (if host set) → custom `BROWGENT_*`.

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
6. Settings → Privacy → **Export YC traction JSON** (optional)

| Goal | What should happen |
|------|--------------------|
| `go to gh` | Opens GitHub (not a Google search) |
| **Run demo** | example.com → observe → extract → done |
| Mic button | Speech → agent instruction |
| Takeover / Resume | Human owns tabs mid-task |

## Build installers

```bash
npm run dist:mac     # DMG arm64 → release/
npm run dist:win     # NSIS x64
npm run dist:linux   # AppImage x64
```

Tag `v*` triggers multi-OS CI ([releasing.md](./releasing.md)).

## Next

- [Builders](./builders.md) · [MCP](./mcp.md) · [Architecture](./architecture.md) · [Agent guide](./agent-guide.md)
