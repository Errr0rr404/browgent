/**
 * Best-effort cookie consent banner handling via DOM click heuristics.
 */
import type { WebContents } from 'electron'
import type { CookieBannerMode } from '../../shared/privacy-prefs'

export interface CookieBannerResult {
  clicked: boolean
  label?: string
  mode: CookieBannerMode
}

const handledKeys = new Set<string>()

function buildScript(mode: 'reject' | 'accept'): string {
  // MODE is compile-time substituted; patterns stay in guest world only.
  return `(() => {
  const mode = ${JSON.stringify(mode)};
  const REJECT = [/reject\\s*all/i, /decline\\s*all/i, /necessary\\s*only/i, /only\\s*necessary/i,
    /refuse/i, /deny\\s*all/i, /disagree/i, /reject\\s*non/i, /reject\\s*optional/i,
    /do\\s*not\\s*accept/i, /no[, ]*thanks/i];
  const ACCEPT = [/accept\\s*all/i, /allow\\s*all/i, /^agree$/i, /i\\s*agree/i, /got\\s*it/i,
    /accept\\s*cookies/i, /allow\\s*cookies/i];
  const patterns = mode === 'reject' ? REJECT : ACCEPT;
  const sel = 'button, [role="button"], input[type="button"], input[type="submit"], a[href="#"], a.button';
  const candidates = Array.from(document.querySelectorAll(sel));
  for (const el of candidates) {
    if (!(el instanceof HTMLElement)) continue;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
    const t = (
      el.innerText ||
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      (el instanceof HTMLInputElement ? el.value : '') ||
      ''
    ).replace(/\\s+/g, ' ').trim();
    if (!t || t.length > 80) continue;
    if (patterns.some((re) => re.test(t))) {
      try { el.click(); } catch (e) { return JSON.stringify({ clicked: false }); }
      return JSON.stringify({ clicked: true, label: t.slice(0, 80) });
    }
  }
  return JSON.stringify({ clicked: false });
})()`
}

export async function maybeHandleCookieBanner(
  wc: WebContents,
  mode: CookieBannerMode,
  navKey: string
): Promise<CookieBannerResult> {
  if (mode === 'off') return { clicked: false, mode }
  if (wc.isDestroyed()) return { clicked: false, mode }
  if (handledKeys.has(navKey)) return { clicked: false, mode }
  handledKeys.add(navKey)
  // Bound set growth
  if (handledKeys.size > 500) {
    const first = handledKeys.values().next().value
    if (first) handledKeys.delete(first)
  }

  await new Promise((r) => setTimeout(r, 600))
  if (wc.isDestroyed()) return { clicked: false, mode }

  try {
    const raw = await wc.executeJavaScript(buildScript(mode), true)
    let parsed: { clicked?: boolean; label?: string } = {}
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw) as { clicked?: boolean; label?: string }
      } catch {
        parsed = {}
      }
    } else if (raw && typeof raw === 'object') {
      parsed = raw as { clicked?: boolean; label?: string }
    }
    return {
      clicked: !!parsed.clicked,
      label: typeof parsed.label === 'string' ? parsed.label : undefined,
      mode
    }
  } catch {
    return { clicked: false, mode }
  }
}

export function clearCookieBannerCache(): void {
  handledKeys.clear()
}
