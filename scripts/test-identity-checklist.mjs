/**
 * Lightweight identity-related smoke when Browgent + MCP are running.
 * Does not open DevTools; validates agent can navigate and report URL.
 */
const base = (process.env.BROWGENT_MCP_URL || 'http://127.0.0.1:17342').replace(/\/$/, '')

async function call(name, args = {}) {
  const res = await fetch(`${base}/v1/tools/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ name, arguments: args })
  })
  const data = await res.json()
  return { status: res.status, data }
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg)
  console.log('ok:', msg)
}

async function main() {
  const health = await fetch(`${base}/health`)
  ok(health.ok, 'MCP bridge up')

  const nav = await call('navigate', { url: 'https://example.com' })
  ok(nav.status === 200 || nav.status === 422, 'navigate responded')
  if (!nav.data.ok) {
    console.warn('navigate note:', nav.data.error || nav.data.summary)
  }

  const url = await call('get_url', {})
  ok(url.data.ok, 'get_url ok')
  const u = String(url.data.data?.url || '')
  ok(/example\.com/i.test(u), `url looks like example.com (${u})`)

  console.log('\nIdentity network path OK. Complete manual DevTools checks in docs/guest-identity-checklist.md')
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  console.error('Start Browgent (npm run dev) then re-run.')
  process.exit(1)
})
