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
- Docs consolidated under [docs/README.md](./docs/README.md) (install/positioning/hero merged into getting-started / builders / yc-application)
- Recipe markdown reduced to [recipes/README.md](./recipes/README.md); prompts live in `src/shared/recipes.ts`

## 0.2.0

- Local-first co-browse desktop agent browser (see [docs/release-notes/v0.2.0.md](./docs/release-notes/v0.2.0.md))
