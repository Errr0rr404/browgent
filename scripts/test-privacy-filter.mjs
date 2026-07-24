/**
 * Unit smoke for the privacy host-match helpers — imports the REAL source
 * (src/shared/privacy-prefs.ts) via tsx so a regression here actually fails.
 * Run: tsx scripts/test-privacy-filter.mjs   (or: npm run test:unit)
 */
import { hostMatchesSuffix, isHostAllowlisted } from '../src/shared/privacy-prefs'

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
assert(hostMatchesSuffix('AD.DoubleClick.net', 'doubleclick.net') === true, 'case-insensitive')
assert(hostMatchesSuffix('ad.doubleclick.net.', 'doubleclick.net') === true, 'trailing dot tolerated')
assert(isHostAllowlisted('cdn.myapp.com', ['myapp.com']) === true, 'allowlist')
assert(isHostAllowlisted('evil.com', ['myapp.com']) === false, 'allowlist miss')
assert(hostMatchesSuffix('', 'x') === false, 'empty host')
assert(hostMatchesSuffix('a.com', '') === false, 'empty suffix')

if (failed) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nAll privacy-filter unit checks passed')
