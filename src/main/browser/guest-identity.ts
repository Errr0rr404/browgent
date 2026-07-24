/**
 * Guest-page browser identity — always on for every install.
 *
 * Electron’s default UA / client hints include “Electron” or Chromium-only brands,
 * which Google OAuth (“This browser or app may not be secure”), reCAPTCHA, and
 * Akamai treat as automation / non-Chrome. Guest tabs must look like stock Chrome
 * matching this build’s Chromium version.
 *
 * Applied for all users (dev + packaged DMG). Do not gate behind flags.
 */

import { app, type Session, type WebContents } from 'electron'
import { release } from 'os'
import { join } from 'path'

const GUEST_PRELOAD_ID = 'browgent-guest-identity'
const FALLBACK_ACCEPT_LANGUAGES = 'en-US,en;q=0.9'

let earlyApplied = false
let sessionApplied = false

export function getChromeVersion(): string {
  return process.versions.chrome || '136.0.0.0'
}

export function getChromeMajor(): string {
  const major = getChromeVersion().split('.')[0]
  return major && /^\d+$/.test(major) ? major : '136'
}

/** Stock Chrome UA for this platform — never includes Electron. */
export function buildChromeUserAgent(): string {
  const chrome = getChromeVersion()
  switch (process.platform) {
    case 'darwin':
      // Chrome still freezes the UA token at 10_15_7 while Client Hints carry the real OS.
      return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`
    case 'win32':
      return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`
    default:
      return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`
  }
}

/** True if a UA string would get blocked as Electron automation. */
export function userAgentLooksLikeElectron(ua: string): boolean {
  return /Electron\//i.test(ua) || /\bElectron\b/i.test(ua)
}

function acceptLanguages(): string {
  try {
    const locale = app.getLocale?.() || 'en-US'
    // Global replace: locales like "zh_Hans_CN" have more than one underscore.
    const lang = locale.replace(/_/g, '-')
    const base = lang.split('-')[0] || 'en'
    if (base.toLowerCase() === lang.toLowerCase()) {
      return lang === 'en' ? 'en-US,en;q=0.9' : `${lang},en;q=0.8`
    }
    return `${lang},${base};q=0.9,en;q=0.8`
  } catch {
    return FALLBACK_ACCEPT_LANGUAGES
  }
}

function platformClientHint(): string {
  switch (process.platform) {
    case 'darwin':
      return '"macOS"'
    case 'win32':
      return '"Windows"'
    default:
      return '"Linux"'
  }
}

/**
 * Realistic GREASE-style brand list (Chrome puts a “Not.A/Brand” grease token first).
 * Order matters for some Google checks.
 */
function brandList(major: string): string {
  return `"Not.A/Brand";v="99", "Google Chrome";v="${major}", "Chromium";v="${major}"`
}

function brandFullList(full: string): string {
  return `"Not.A/Brand";v="10.0.1.4", "Google Chrome";v="${full}", "Chromium";v="${full}"`
}

function archClientHint(): string {
  return process.arch === 'arm64' ? '"arm"' : '"x86"'
}

/**
 * Known Darwin kernel major → macOS marketing major for Client-Hints
 * `sec-ch-ua-platform-version`. Apple's year-based renumber breaks the old
 * `darwin - 9` arithmetic at Darwin 25 (macOS 26 "Tahoe", NOT "16").
 */
const DARWIN_TO_MACOS: Record<number, number> = {
  21: 12, // Monterey
  22: 13, // Ventura
  23: 14, // Sonoma
  24: 15, // Sequoia
  25: 26 // macOS 26 (Tahoe) — first year-based release
}

/** Best-effort real OS version for Client Hints (matches stock Chrome better than a hardcode). */
function platformVersionHint(): string {
  try {
    const rel = release() // e.g. 23.6.0 on macOS, 10.0.22631 on Windows
    if (process.platform === 'darwin') {
      const darwinMajor = Number(rel.split('.')[0])
      if (Number.isFinite(darwinMajor)) {
        // Unknown-future kernels follow the post-25 offset (Darwin 25 → macOS 26);
        // very old (pre-21) kernels fall back to a sane modern default.
        const macos =
          DARWIN_TO_MACOS[darwinMajor] ?? (darwinMajor > 25 ? darwinMajor + 1 : 14)
        return `"${macos}.0.0"`
      }
      return '"14.0.0"'
    }
    if (process.platform === 'win32') {
      // os.release() reports 10.0.<build> for BOTH Win10 and Win11. Chrome derives
      // the platform version from the build number: Win11 (build ≥ 22000) → "15.0.0",
      // Win10 → "10.0.0".
      const build = Number(rel.split('.')[2])
      if (Number.isFinite(build)) return build >= 22000 ? '"15.0.0"' : '"10.0.0"'
      return '"10.0.0"'
    }
    return `"${rel.split('.').slice(0, 3).join('.')}"`
  } catch {
    switch (process.platform) {
      case 'darwin':
        return '"14.0.0"'
      case 'win32':
        return '"15.0.0"'
      default:
        return '"6.5.0"'
    }
  }
}

/**
 * Command-line + app-wide UA fallback. Must run before app.ready.
 * Safe to call once; subsequent calls are no-ops.
 */
export function applyGuestIdentityEarly(): void {
  if (earlyApplied) return
  earlyApplied = true

  // Prefer not advertising AutomationControlled (navigator.webdriver / related signals)
  app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')
  const ua = buildChromeUserAgent()
  app.userAgentFallback = ua

  if (userAgentLooksLikeElectron(ua)) {
    console.error(
      '[browgent] guest identity: built UA still looks like Electron — check buildChromeUserAgent()'
    )
  }
}

function setHeader(headers: Record<string, string | string[]>, name: string, value: string): void {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) {
      delete headers[key]
    }
  }
  headers[name] = value
}

function hasHeader(headers: Record<string, string | string[]>, name: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase())
}

function guestPreloadPath(): string {
  // electron-vite: out/main/index.js → out/preload/guest.js
  return join(__dirname, '../preload/guest.js')
}

/**
 * Session-level identity for guest page tabs (partition persist:browgent-pages).
 * Call after app.ready with the guest Session. Always-on for every user.
 */
export function applyGuestPageSessionIdentity(pageSession: Session): void {
  if (sessionApplied) return
  sessionApplied = true

  const ua = buildChromeUserAgent()
  const major = getChromeMajor()
  const full = getChromeVersion()
  const secChUa = brandList(major)
  const secChUaFull = brandFullList(full)
  const platform = platformClientHint()
  const langs = acceptLanguages()
  const platformVersion = platformVersionHint()
  const arch = archClientHint()

  pageSession.setUserAgent(ua, langs)

  // Early main-world patches for every frame in this session
  try {
    pageSession.registerPreloadScript({
      id: GUEST_PRELOAD_ID,
      type: 'frame',
      filePath: guestPreloadPath()
    })
  } catch (err) {
    console.warn('[browgent] guest identity: failed to register guest preload', err)
  }

  pageSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers: Record<string, string | string[]> = { ...details.requestHeaders }

    setHeader(headers, 'User-Agent', ua)
    // Always force Chrome brands — never leave Electron’s Chromium-only sec-ch-ua
    setHeader(headers, 'sec-ch-ua', secChUa)
    setHeader(headers, 'sec-ch-ua-mobile', '?0')
    setHeader(headers, 'sec-ch-ua-platform', platform)
    setHeader(headers, 'sec-ch-ua-full-version', `"${full}"`)
    setHeader(headers, 'sec-ch-ua-full-version-list', secChUaFull)
    setHeader(headers, 'sec-ch-ua-platform-version', platformVersion)
    setHeader(headers, 'sec-ch-ua-arch', arch)
    setHeader(headers, 'sec-ch-ua-bitness', '"64"')
    setHeader(headers, 'sec-ch-ua-model', '""')

    if (!hasHeader(headers, 'Accept-Language')) {
      setHeader(headers, 'Accept-Language', langs)
    }

    // Last line of defense if anything reintroduced Electron into UA
    const uaKey = Object.keys(headers).find((k) => k.toLowerCase() === 'user-agent')
    if (uaKey && typeof headers[uaKey] === 'string' && userAgentLooksLikeElectron(headers[uaKey] as string)) {
      headers[uaKey] = ua
    }

    callback({ requestHeaders: headers })
  })

  // Self-check so a regression fails loudly in logs (dev + packaged)
  const applied = pageSession.getUserAgent()
  if (userAgentLooksLikeElectron(applied)) {
    console.error(
      `[browgent] guest identity FAILED: session UA still contains Electron:\n  ${applied}\n` +
        'Sites like Google and GoDaddy will block users. Fix guest-identity.ts before shipping.'
    )
  } else {
    console.info(`[browgent] guest identity: Chrome/${getChromeMajor()} (no Electron UA)`)
  }
}

/** Per-WebContents UA (belt-and-suspenders with session default). */
export function applyWebContentsUserAgent(wc: WebContents): void {
  if (wc.isDestroyed()) return
  try {
    wc.setUserAgent(buildChromeUserAgent())
  } catch {
    // ignore — destroyed mid-call
  }
}

/**
 * Main-world identity patches for Google OAuth / reCAPTCHA / Akamai.
 * ALWAYS overrides userAgentData — Electron’s native brands omit “Google Chrome”
 * and Google Sign-In treats that as “browser may not be secure”.
 *
 * Idempotent with guest preload (`__browgentIdentityFull`).
 */
export function installGuestStealthPatches(wc: WebContents): void {
  if (wc.isDestroyed()) return

  const major = getChromeMajor()
  const full = getChromeVersion()
  const platform =
    process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux'
  const platformVersion = platformVersionHint().replace(/"/g, '')
  const architecture = process.arch === 'arm64' ? 'arm' : 'x86'
  const ua = buildChromeUserAgent()

  const script = `(() => {
    // Re-apply on every navigation; full patch may already be present
    const major = ${JSON.stringify(major)};
    const full = ${JSON.stringify(full)};
    const platform = ${JSON.stringify(platform)};
    const platformVersion = ${JSON.stringify(platformVersion)};
    const architecture = ${JSON.stringify(architecture)};
    const chromeUa = ${JSON.stringify(ua)};

    try {
      Object.defineProperty(Navigator.prototype, 'webdriver', {
        get: () => undefined,
        configurable: true
      });
    } catch (_) {}
    try {
      if (navigator.webdriver === true) {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
          configurable: true
        });
      }
    } catch (_) {}

    try {
      // Force UA string if anything rewrote it
      if (typeof navigator.userAgent === 'string' && /Electron/i.test(navigator.userAgent)) {
        Object.defineProperty(Navigator.prototype, 'userAgent', {
          get: () => chromeUa,
          configurable: true
        });
      }
    } catch (_) {}

    try {
      if (!window.chrome || typeof window.chrome !== 'object') {
        window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){}, app: {} };
      } else {
        if (!window.chrome.runtime) window.chrome.runtime = {};
        if (typeof window.chrome.loadTimes !== 'function') {
          window.chrome.loadTimes = function(){ return {}; };
        }
        if (typeof window.chrome.csi !== 'function') {
          window.chrome.csi = function(){ return {}; };
        }
        if (!window.chrome.app) window.chrome.app = {};
      }
    } catch (_) {}

    // CRITICAL: always override Client Hints. Electron’s native brands are
    // Chromium-only (no “Google Chrome”) → Google OAuth “browser may not be secure”.
    try {
      const brands = [
        { brand: 'Not.A/Brand', version: '99' },
        { brand: 'Google Chrome', version: major },
        { brand: 'Chromium', version: major }
      ];
      const fullVersionList = [
        { brand: 'Not.A/Brand', version: '10.0.1.4' },
        { brand: 'Google Chrome', version: full },
        { brand: 'Chromium', version: full }
      ];
      const uad = {
        brands,
        mobile: false,
        platform,
        getHighEntropyValues: async (hints) => {
          const out = {
            brands,
            mobile: false,
            platform,
            platformVersion,
            architecture,
            bitness: '64',
            model: '',
            uaFullVersion: full,
            fullVersionList
          };
          if (!Array.isArray(hints)) return out;
          const filtered = { brands, mobile: false, platform };
          for (const h of hints) {
            if (h in out) filtered[h] = out[h];
          }
          return filtered;
        },
        toJSON: () => ({ brands, mobile: false, platform })
      };
      Object.defineProperty(Navigator.prototype, 'userAgentData', {
        get: () => uad,
        configurable: true
      });
      try {
        Object.defineProperty(navigator, 'userAgentData', {
          get: () => uad,
          configurable: true
        });
      } catch (_) {}
    } catch (_) {}

    globalThis.__browgentIdentityFull = true;
    globalThis.__browgentIdentityPatched = true;
  })();`

  const run = (): void => {
    if (wc.isDestroyed()) return
    void wc.executeJavaScript(script, true).catch(() => {
      // page may not allow script (rare)
    })
  }

  // As early as possible + every navigation (Google’s OAuth page checks on load)
  wc.on('dom-ready', run)
  wc.on('did-finish-load', run)
  wc.on('did-navigate-in-page', run)
  // First paint of a brand-new tab
  run()
}
