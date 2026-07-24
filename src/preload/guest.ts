/**
 * Guest-page preload (isolated world, sandboxed, no IPC bridge).
 *
 * Injects identity patches into the *main* world as early as possible by
 * inserting a <script> into the DOM (executes in page context). Required so
 * Google / Akamai / similar checks do not see Electron automation signals.
 *
 * ALWAYS force Google Chrome Client Hints — Electron’s native userAgentData
 * omits “Google Chrome”, which triggers:
 *   “This browser or app may not be secure”
 * on accounts.google.com. Main process later upgrades versions via
 * installGuestStealthPatches.
 *
 * Registered on partition persist:browgent-pages for every guest tab.
 */

// Static early patch (no Node in sandbox). Version placeholders are upgraded
// from main with the real Chromium version as soon as the page is ready.
const MAIN_WORLD_PATCH = `(() => {
  // Always re-assert Chrome brands; do not bail if a partial native UAD exists.
  try {
    Object.defineProperty(Navigator.prototype, 'webdriver', {
      get: () => undefined,
      configurable: true
    });
  } catch (_) {}

  try {
    const w = window;
    if (!w.chrome) {
      w.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){}, app: {} };
    } else if (typeof w.chrome === 'object' && w.chrome && !('runtime' in w.chrome)) {
      w.chrome.runtime = {};
    }
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
    // GREASE-style brand order matches stock Chrome headers we send from main.
    // Version is a best-effort placeholder; main upgrades to process.versions.chrome.
    const major = '136';
    const full = '136.0.0.0';
    const platform =
      /Mac/i.test(navigator.platform) ? 'macOS' :
      /Win/i.test(navigator.platform) ? 'Windows' : 'Linux';
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
    // Infer arch from platform/UA — do not hardcode arm (breaks Intel Mac / x64 Linux).
    const arch =
      /arm|aarch64/i.test(navigator.platform || '') ||
      /arm|aarch64/i.test(navigator.userAgent || '')
        ? 'arm'
        : 'x86';
    const uad = {
      brands,
      mobile: false,
      platform,
      getHighEntropyValues: async (hints) => {
        const out = {
          brands,
          mobile: false,
          platform,
          platformVersion: platform === 'macOS' ? '14.0.0' : platform === 'Windows' ? '15.0.0' : '6.5.0',
          architecture: arch,
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

  globalThis.__browgentIdentityPatched = true;
})();`

function injectMainWorld(): void {
  try {
    if (!document.documentElement) return
    const script = document.createElement('script')
    script.textContent = MAIN_WORLD_PATCH
    // Prefer insert before any existing children so we run ahead of page scripts
    const root = document.documentElement
    if (root.firstChild) root.insertBefore(script, root.firstChild)
    else root.appendChild(script)
    script.remove()
  } catch {
    // ignore — CSP-blocked pages still get UA/client-hint protection from main
  }
}

function scheduleInject(): void {
  if (document.documentElement) {
    injectMainWorld()
    return
  }
  const observer = new MutationObserver(() => {
    if (document.documentElement) {
      injectMainWorld()
      observer.disconnect()
    }
  })
  try {
    observer.observe(document, { childList: true, subtree: true })
  } catch {
    // document may be unavailable in rare frame types
  }
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      injectMainWorld()
      observer.disconnect()
    },
    { once: true }
  )
}

scheduleInject()
