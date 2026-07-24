/**
 * Security regression tests for the policy engine + URL normalization.
 * Imports the REAL source (via tsx) and pins the fixes for the SSRF bypass,
 * the host block-list bypass, the fc/fd false-positive, scheme evasion, and
 * unsafe scheme passthrough. Run: tsx scripts/test-policy-security.mjs
 */
import {
  isHostAllowed,
  isPrivateOrMetadataHost,
  canonicalHost,
  looksLikeForbiddenScheme,
  DEFAULT_POLICY
} from '../src/shared/policies'
import { resolveNavigableTarget } from '../src/shared/sites'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

const policy = (over = {}) => ({ ...DEFAULT_POLICY, ...over })
const hostOf = (u) => new URL(u).hostname

// ── SSRF: IPv4-mapped IPv6 must be unwrapped and blocked ──────────────────
assert(isPrivateOrMetadataHost('::ffff:169.254.169.254') === true, 'mapped-IPv6 metadata (textual) blocked')
assert(isPrivateOrMetadataHost('::ffff:127.0.0.1') === true, 'mapped-IPv6 loopback (textual) blocked')
assert(
  isPrivateOrMetadataHost(hostOf('http://[::ffff:169.254.169.254]/')) === true,
  'mapped-IPv6 metadata (as parsed by new URL()) blocked'
)
assert(isPrivateOrMetadataHost('169.254.169.254') === true, 'AWS metadata IPv4 blocked')
assert(isPrivateOrMetadataHost('127.0.0.1') === true, 'loopback blocked')
assert(isPrivateOrMetadataHost('10.1.2.3') === true, 'RFC1918 10/8 blocked')
assert(isPrivateOrMetadataHost('example.com') === false, 'public host allowed')
assert(
  isHostAllowed(hostOf('http://[::ffff:169.254.169.254]/'), policy()) === false,
  'isHostAllowed rejects mapped-IPv6 metadata under default policy'
)

// ── fc/fd/fe80 IPv6 check must not false-block real domains ───────────────
assert(isPrivateOrMetadataHost('fdic.gov') === false, 'fdic.gov not blocked')
assert(isPrivateOrMetadataHost('fda.gov') === false, 'fda.gov not blocked')
assert(isPrivateOrMetadataHost('fcc.gov') === false, 'fcc.gov not blocked')
assert(isPrivateOrMetadataHost('fc00::1') === true, 'real IPv6 unique-local still blocked')

// ── Host block-list: trailing dot / case can't bypass; no suffix trap ─────
assert(canonicalHost('  GOOGLE.COM.. ') === 'google.com', 'canonicalHost trims/lowercases/strips trailing dots')
assert(
  isHostAllowed('google.com.', policy({ blockHosts: ['google.com'] })) === false,
  'trailing-dot host cannot bypass a block entry'
)
assert(
  isHostAllowed('google.com', policy({ blockHosts: ['Google.com'] })) === false,
  'mixed-case block entry still blocks'
)
assert(
  isHostAllowed('sub.google.com', policy({ blockHosts: ['google.com'] })) === false,
  'subdomain of a blocked host is blocked'
)
assert(
  isHostAllowed('evil-google.com', policy({ blockHosts: ['google.com'] })) === true,
  'lookalike host is NOT blocked (dot-anchored suffix, no trap)'
)

// ── Allowlist mode ────────────────────────────────────────────────────────
assert(isHostAllowed('cdn.example.com', policy({ allowHosts: ['example.com'] })) === true, 'allowlisted suffix permitted')
assert(isHostAllowed('evil.com', policy({ allowHosts: ['example.com'] })) === false, 'non-allowlisted host denied')

// ── Forbidden-scheme detection incl. tab/newline evasion ──────────────────
assert(looksLikeForbiddenScheme('javascript:alert(1)') === true, 'javascript: detected')
assert(looksLikeForbiddenScheme('java\tscript:alert(1)') === true, 'tab-obfuscated javascript: detected')
assert(looksLikeForbiddenScheme('file:///etc/passwd') === true, 'file: detected')
assert(looksLikeForbiddenScheme('data:text/html,x') === true, 'data: detected')
assert(looksLikeForbiddenScheme('https://example.com') === false, 'https is not forbidden')
assert(looksLikeForbiddenScheme('about:blank') === false, 'about:blank allowed')

// ── resolveNavigableTarget must never return a dangerous scheme verbatim ──
for (const bad of ['file:///etc/passwd', 'data:text/html,<script>1</script>', 'javascript:alert(1)', 'about:settings']) {
  const out = String(resolveNavigableTarget(bad))
  assert(
    !/^(file:|data:|javascript:|blob:|about:(?!blank))/i.test(out),
    `resolveNavigableTarget neutralizes "${bad}" -> "${out}"`
  )
}
assert(/^https?:\/\//.test(resolveNavigableTarget('https://example.com')), 'https passthrough preserved')

if (failed) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nAll policy-security checks passed')
