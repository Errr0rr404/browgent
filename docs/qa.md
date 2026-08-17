# QA with Browgent

Use Browgent as a **local co-browse QA harness**: you log in, the agent exercises the app, asserts outcomes, and exports a trajectory.

## Interactive agent QA

1. Open your app in a guest tab (log in yourself if needed — **Takeover** / Resume).
2. Agent panel → recipe **QA assert smoke** or **QA smoke**.
3. Tools the agent can use:
   - `assert_url` — `includes` / `equals` / `host`
   - `assert_text` — substring in page text
   - `assert_element` — `ref` or `nameIncludes`
   - `observe` / `extract_text` / navigate & click (act mode)
4. **Export trajectory** for a step-by-step pass/fail log.

## Form fill

- Recipe **Fill with profile** uses `fill_form` + User Hub (`Settings → User Hub`).
- Passwords still go through the vault + confirm (`get_credentials`).

## Page summary

- Toolbar **Summarize** (⌘⇧U) or recipe **Research summary** — research mode, read-only.

## Assets

- Downloads panel → **Save page assets** (images icon), or agent tools `list_assets` / `download_assets`.

## Playwright attach

Same desktop session over CDP — see [playwright.md](./playwright.md).

```bash
BROWGENT_CDP_PORT=9222 npm run dev
npm run playwright:example
```

## MCP

```bash
# Browgent running
npm run mcp
```

Claude Code / Cursor can drive the same tabs; use assert tools from the shared tool surface.

## Privacy while testing

Ads/trackers/cookie banners: **Settings → Privacy & data**. Allowlist your app’s hosts if a CDN is misclassified.

## Repo smokes (no app required)

```bash
npm run test:unit     # tool JSON Schema + privacy host-match + policy/SSRF gates
npm run typecheck
npm run lint
```

With the app running: `npm run mcp:smoke` and `npm run test:identity`.
