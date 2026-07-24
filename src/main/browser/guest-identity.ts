/**
 * Guest-page browser identity — always on for every install.
 *
 * Electron’s default UA / client hints include “Electron”, which Google reCAPTCHA,
 * Akamai Bot Manager (GoDaddy, etc.), and similar products treat as automation.
 * Guest tabs must look like stock Chrome matching this build’s Chromium version.
 *
 * Applied for all users (dev + packaged DMG). Do not gate behind flags.
 */

import { app, type Session, type WebContents } from 'electron'
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
    const lang = locale.replace('_', '-')
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

function brandList(major: string): string {
  return `"Google Chrome";v="${major}", "Chromium";v="${major}", "Not.A/Brand";v="99"`
}

function brandFullList(full: string): string {
  return `"Google Chrome";v="${full}", "Chromium";v="${full}", "Not.A/Brand";v="10.0.1.4"`
}

function archClientHint(): string {
  return process.arch === 'arm64' ? '"arm"' : '"x86"'
}

function platformVersionHint(): string {
  switch (process.platform) {
    case 'darwin':
      return '"14.0.0"'
    case 'win32':
      return '"15.0.0"'
    default:
      return '"6.5.0"'
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
    setHeader(headers, 'sec-ch-ua', secChUa)
    setHeader(headers, 'sec-ch-ua-mobile', '?0')
    setHeader(headers, 'sec-ch-ua-platform', platform)
    setHeader(headers, 'sec-ch-ua-full-version', `"${full}"`)
    setHeader(headers, 'sec-ch-ua-full-version-list', secChUaFull)
    setHeader(headers, 'sec-ch-ua-platform-version', platformVersionHint())
    setHeader(headers, 'sec-ch-ua-arch', archClientHint())
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
 * Backup page-world patches if preload injection is delayed or CSP-blocked.
 * Idempotent with guest preload (`__browgentIdentityPatched`).
 * Includes Client Hints (userAgentData) so Google-style checks match stock Chrome.
 */
export function installGuestStealthPatches(wc: WebContents): void {
  if (wc.isDestroyed()) return

  const major = getChromeMajor()
  const full = getChromeVersion()
  const platform =
    process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux'
  const platformVersion =
    process.platform === 'darwin' ? '14.0.0' : process.platform === 'win32' ? '15.0.0' : '6.5.0'
  const architecture = process.arch === 'arm64' ? 'arm' : 'x86'

  // Always upgrade version-accurate Client Hints (preload may have set a placeholder).
  // Flag __browgentIdentityFull marks the full main-process patch.
  const script = `(() => {
    if (globalThis.__browgentIdentityFull) return;
    globalThis.__browgentIdentityFull = true;
    globalThis.__browgentIdentityPatched = true;
    const major = ${JSON.stringify(major)};
    const full = ${JSON.stringify(full)};
    const platform = ${JSON.stringify(platform)};
    const platformVersion = ${JSON.stringify(platformVersion)};
    const architecture = ${JSON.stringify(architecture)};
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
      if (!window.chrome) {
        window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){}, app: {} };
      } else if (window.chrome && typeof window.chrome === 'object') {
        if (!window.chrome.runtime) window.chrome.runtime = {};
      }
    } catch (_) {}
    try {
      const brands = [
        { brand: 'Google Chrome', version: major },
        { brand: 'Chromium', version: major },
        { brand: 'Not.A/Brand', version: '99' }
      ];
      const fullVersionList = [
        { brand: 'Google Chrome', version: full },
        { brand: 'Chromium', version: full },
        { brand: 'Not.A/Brand', version: '10.0.1.4' }
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
    } catch (_) {}
  })();`

  const run = (): void => {
    if (wc.isDestroyed()) return
    void wc.executeJavaScript(script, true).catch(() => {
      // page may not allow script (rare)
    })
  }

  // Run as early as possible and again on each navigation
  wc.on('dom-ready', run)
  wc.on('did-finish-load', run)
}
