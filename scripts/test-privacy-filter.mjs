/**
 * Unit smoke for privacy host-match helpers (no Electron).
 * Run: node scripts/test-privacy-filter.mjs
 */

function hostMatchesSuffix(hostname, suffix) {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  const s = suffix.toLowerCase().replace(/^\./, '').replace(/\.$/, '')
  if (!h || !s) return false
  return h === s || h.endsWith('.' + s)
}

function isHostAllowlisted(hostname, allowHosts) {
  return allowHosts.some((a) => {
    const t = a.trim()
    return t.length > 0 && hostMatchesSuffix(hostname, t)
  })
}

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

assert(hostMatchesSuffix('ad.doubleclick.net', 'doubleclick.net') === true, 'suffix match')
assert(hostMatchesSuffix('doubleclick.net', 'doubleclick.net') === true, 'exact host')
assert(hostMatchesSuffix('example.com', 'doubleclick.net') === false, 'no false positive')
assert(hostMatchesSuffix('notdoubleclick.net', 'doubleclick.net') === false, 'no suffix trap')
assert(isHostAllowlisted('cdn.myapp.com', ['myapp.com']) === true, 'allowlist')
assert(isHostAllowlisted('evil.com', ['myapp.com']) === false, 'allowlist miss')
assert(hostMatchesSuffix('', 'x') === false, 'empty host')
assert(hostMatchesSuffix('a.com', '') === false, 'empty suffix')

if (failed) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nAll privacy-filter unit checks passed')
