# Getting started

## Option A — Download (macOS)

1. Get the latest DMG:  
   **[Browgent-mac-arm64.dmg](https://github.com/Errr0rr404/browgent/releases/latest/download/Browgent-mac-arm64.dmg)**
2. Open the DMG and drag **Browgent** to Applications.
3. First launch: right-click → **Open** (or System Settings → Privacy & Security → Open Anyway). The app is unsigned open-source software.
4. Optional LLM brain: packaged builds do **not** read a `.env` next to the DMG. Set env vars in your shell before launch, put a `.env` in the app userData folder, or run from source (Option B). **Grok is the default** (`XAI_API_KEY`); any OpenAI-compatible provider works via `BROWGENT_PROVIDER` / `BROWGENT_API_KEY` / `BROWGENT_BASE_URL`.

> **Apple Silicon only** for the published DMG right now. Intel Mac or Windows/Linux: build from source or watch [Releases](https://github.com/Errr0rr404/browgent/releases) for more artifacts.

## Option B — From source

**Requirements:** Node.js 20+, npm, macOS / Windows / Linux.

```bash
git clone https://github.com/Errr0rr404/browgent.git
cd browgent
./setup.sh          # npm install + .env + typecheck
npm run dev
```

Manual equivalent:

```bash
npm install
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
| `BROWGENT_CDP_PORT` | No | CDP port (default **9222**; `0` = off) |
| `BROWGENT_DRIVER` | No | In-app driver: `dom` (default) or `cdp` |
| `BROWGENT_AGENT_ONLY` | No | Compact automation shell (`1` = on) |
| `BROWGENT_HEADLESS` | No | Hide window; drive via CDP (`1` = on) |

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

Playwright attach: see [playwright.md](./playwright.md) and `examples/playwright-connect.mjs`.

## First things to try

In the **Agent** panel (⌘J):

| Goal | What should happen |
|------|--------------------|
| `go to gh` | Opens GitHub (not a Google search) |
| `go to facebook and sign up` | Navigates to Facebook, seeks Sign up |
| `summarize this page` | Observe + extract on the active tab |
| Mic button | System speech recognition → agent instruction |

Also try:

- **Theme** in the toolbar (10 chrome themes)
- **Trajectory** tab → **Export** JSON
- **Policy** → confirm sensitive clicks / new hosts
- **Takeover** / **Resume** for logins and CAPTCHAs

## Build a local package

```bash
npm run dist:mac    # → release/Browgent-mac-arm64.dmg
```

See [Releasing](./releasing.md) for GitHub Release uploads.

## Next

- [Architecture](./architecture.md)
- [Agent guide](./agent-guide.md)
- [Shortcuts](./shortcuts.md)
