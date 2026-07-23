/**
 * Guest-page preload (isolated world, sandboxed, no IPC bridge).
 *
 * Injects identity patches into the *main* world as early as possible by
 * inserting a <script> into the DOM (executes in page context). Required so
 * Google / Akamai / similar checks do not see Electron automation signals.
 *
 * Registered on partition persist:browgent-pages for every guest tab.
 */

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
      w.chrome = { runtime: {} };
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
