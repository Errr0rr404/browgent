# Getting started

## Option A — Download (macOS)

1. Get the latest DMG:  
   **[Browgent-mac-arm64.dmg](https://github.com/Errr0rr404/browgent/releases/latest/download/Browgent-mac-arm64.dmg)**
2. Open the DMG and drag **Browgent** to Applications.
3. First launch: right-click → **Open** (or System Settings → Privacy & Security → Open Anyway). The app is unsigned open-source software.
4. Optional Grok brain: create a `.env` next to the app is **not** used for packaged builds. For API keys in the packaged app, set env vars in your shell before launch, or run from source (Option B).

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
| `XAI_API_KEY` | No | xAI key for Grok multi-step tool-calling |
| `BROWGENT_MODEL` | No | Model id (default `grok-4.5`) |
| `XAI_BASE_URL` | No | API base (default `https://api.x.ai/v1`) |
| `SPACE_XAI_API_KEY` / `GROK_API_KEY` | No | Aliases for the same key |

Without a key, Browgent uses a **heuristic planner** (site aliases, observe, click/type patterns). Still useful for demos and offline work.

Get a key: [console.x.ai](https://console.x.ai).

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
