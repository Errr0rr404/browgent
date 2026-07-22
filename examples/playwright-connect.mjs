/**
 * Attach Playwright to a running Browgent window (dual-mode CDP path).
 *
 * 1. Start Browgent with CDP (default port 9222):
 *      npm run dev
 *    or lightweight automation shell:
 *      BROWGENT_AGENT_ONLY=1 BROWGENT_HEADLESS=1 npm run dev
 *
 * 2. Install Playwright once (not a runtime dep of Browgent):
 *      npm i -D playwright && npx playwright install chromium
 *
 * 3. Run:
 *      node examples/playwright-connect.mjs
 *      BROWGENT_CDP_URL=http://127.0.0.1:9222 node examples/playwright-connect.mjs
 */

import { chromium } from 'playwright'

const browserURL = process.env.BROWGENT_CDP_URL || 'http://127.0.0.1:9222'

async function main() {
  console.log(`Connecting to Browgent CDP at ${browserURL} …`)
  const browser = await chromium.connectOverCDP(browserURL)

  const contexts = browser.contexts()
  if (!contexts.length) {
    throw new Error('No browser contexts — is Browgent running with CDP enabled?')
  }

  // Prefer a real page tab (guest content), not empty placeholders
  let page = contexts.flatMap((c) => c.pages()).find((p) => {
    const u = p.url()
    return u && u !== 'about:blank' && !u.startsWith('chrome://') && !u.startsWith('devtools://')
  })

  if (!page) {
    page = contexts[0].pages()[0] ?? (await contexts[0].newPage())
  }

  console.log('Attached to page:', page.url() || '(blank)')
  await page.goto('https://example.com', { waitUntil: 'domcontentloaded' })
  const title = await page.title()
  console.log('Title:', title)

  // You still share Browgent's session cookies (persist:browgent-pages) for same-origin work
  const cookies = await contexts[0].cookies()
  console.log(`Cookies in context: ${cookies.length}`)

  // Leave Browgent running — do not browser.close() the remote connection aggressively
  // if you want the desktop session to stay up. Disconnect only:
  browser.close()
  console.log('Disconnected (Browgent keeps running).')
}

main().catch((err) => {
  console.error(err)
  console.error(`
Tips:
  • Ensure Browgent is running (npm run dev)
  • CDP defaults to http://127.0.0.1:9222 (BROWGENT_CDP_PORT)
  • Disable with BROWGENT_CDP=0 if you do not want remote debugging
`)
  process.exit(1)
})
