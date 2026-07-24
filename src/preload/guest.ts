/**
 * Guest-page preload (isolated world, sandboxed, no IPC bridge).
 *
 * Injects identity patches into the *main* world as early as possible by
 * inserting a <script> into the DOM (executes in page context). Required so
 * Google / Akamai / similar checks do not see Electron automation signals.
 *
 * Registered on partition persist:browgent-pages for every guest tab.
 */

// Static early patch (no Node in sandbox). Full userAgentData is applied from
// main via installGuestStealthPatches with the real Chrome version.
const MAIN_WORLD_PATCH = `(() => {
  if (globalThis.__browgentIdentityPatched) return;
  globalThis.__browgentIdentityPatched = true;

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
    // Prefer undefined over true for automation probes that read the own-property
    if (navigator.webdriver === true) {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true
      });
    }
  } catch (_) {}

  try {
    // Placeholder brands until main injects version-accurate userAgentData
    if (!navigator.userAgentData) {
      const brands = [
        { brand: 'Google Chrome', version: '136' },
        { brand: 'Chromium', version: '136' },
        { brand: 'Not.A/Brand', version: '99' }
      ];
      Object.defineProperty(Navigator.prototype, 'userAgentData', {
        get: () => ({
          brands,
          mobile: false,
          platform: 'macOS',
          getHighEntropyValues: async () => ({
            brands,
            mobile: false,
            platform: 'macOS',
            platformVersion: '14.0.0',
            architecture: 'arm',
            bitness: '64',
            model: '',
            uaFullVersion: '136.0.0.0',
            fullVersionList: brands.map((b) =>
              b.brand === 'Not.A/Brand'
                ? { brand: b.brand, version: '10.0.1.4' }
                : { brand: b.brand, version: '136.0.0.0' }
            )
          }),
          toJSON: () => ({ brands, mobile: false, platform: 'macOS' })
        }),
        configurable: true
      });
    }
  } catch (_) {}
})();`

function injectMainWorld(): void {
  try {
    if (!document.documentElement) return
    const script = document.createElement('script')
    script.textContent = MAIN_WORLD_PATCH
    document.documentElement.appendChild(script)
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
