# Changelog

## Unreleased

### Added
- Live **MCP bridge** (`:17342`, token auth) + STDIO adapter (`npm run mcp`)
- In-app recipes, **Run demo**, first-run welcome, policy presets
- Trajectory **eval pack** export; sample in `examples/`
- Privacy-safe metrics + **YC traction export** (`npm run yc:packet`)
- Automated hero path: `npm run demo:hero`
- Landing page: `website/index.html`
- Multi-OS release workflow: `.github/workflows/release.yml`
- Security: MCP token required, private-host block, sensitive-type confirm, download path checks
- Performance: single-emit assistant messages, observe/LLM slimming, CDP status cache, MCP tool queue
- **Privacy pack:** network ad/tracker filter, cookie-banner auto-handle, Settings + status-bar shield
- **Summarize page** toolbar action + ⌘⇧U (research-mode agent)
- **Page assets:** Downloads “save assets” + `list_assets` / `download_assets` tools
- **Autofill:** `fill_form` tool + profile recipes
- **QA asserts:** `assert_text` / `assert_url` / `assert_element` + [docs/qa.md](./docs/qa.md)

### Changed
- **Narrative sharpened for YC:** outcome-first README one-liner (agent in your real browser, one click from takeover); comparison table trimmed to 5 defensible, checkable rows with a **BrowserOS** column that concedes the OSS + local-first tie
- **Positioning:** BrowserOS named as the primary foil consistently across README + [docs/market.md](./docs/market.md) + [docs/yc-application.md](./docs/yc-application.md); beachhead ICP called out — developers whose browser agents keep failing on real login/SSO/CAPTCHA walls (other personas demoted to "also useful for")
- **Landing page:** replaced the empty video box with a self-contained CSS/SVG storyboard of the co-browse → login wall → takeover → resume → policy-confirm flow; one primary CTA above the fold; placeholder left for the real recorded demo
- **Onboarding:** first-run recipes now lead with the human-in-the-loop takeover recipe; in-app **Run demo** upgraded from an example.com scrape to a real multi-page web research task (browse + reason)
- **Docs / scripts:** repaired dead evidence links; `npm run yc:packet` reframed as usage instrumentation "ready to fill" (removed commit-count vanity metric, added `?? 0` fallbacks); demo output path corrected to `release/demo-last-run.json`
- Docs consolidated under [docs/README.md](./docs/README.md) (install/positioning/hero merged into getting-started / builders / yc-application)
- Recipe markdown reduced to [recipes/README.md](./recipes/README.md); prompts live in `src/shared/recipes.ts`
- Docs refreshed for privacy pack, summarize, assets, fill_form, and QA asserts
- Docs refreshed to match the current tree: stack/versions, CI (`typecheck` / `lint` / `test:unit` / build), env var names (including vision, token file, telemetry), release workflow (draft multi-OS on `v*` tags), and repo layout
- Removed unused theme-based agent pet skin stack (morphing FloatingAgentPet is the only companion UI)

## 0.2.0

- Local-first co-browse desktop agent browser (see [docs/release-notes/v0.2.0.md](./docs/release-notes/v0.2.0.md))
