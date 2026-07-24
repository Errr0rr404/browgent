/** Privacy preferences — ads/trackers/cookie banners (local-only). */

export type CookieBannerMode = 'off' | 'reject' | 'accept'

export interface PrivacyPrefs {
  version: 1
  blockAds: boolean
  blockTrackers: boolean
  cookieBannerMode: CookieBannerMode
  /** Host suffixes the filter must never block (e.g. "cdn.myapp.com") */
  allowHosts: string[]
  /** When true, StatusBar may show block counts */
  showShieldBadge: boolean
}

export const DEFAULT_PRIVACY_PREFS: PrivacyPrefs = {
  version: 1,
  blockAds: true,
  blockTrackers: true,
  cookieBannerMode: 'reject',
  allowHosts: [],
  showShieldBadge: true
}

export interface PrivacyStats {
  blockedTotal: number
  blockedSession: number
  lastBlockedHost: string | null
  updatedAt: number
}

export interface PrivacyStateSnapshot {
  prefs: PrivacyPrefs
  stats: PrivacyStats
}

export const COOKIE_BANNER_MODES: readonly CookieBannerMode[] = ['off', 'reject', 'accept']

/** Host suffix match: "doubleclick.net" matches "ad.doubleclick.net" */
export function hostMatchesSuffix(hostname: string, suffix: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  const s = suffix.toLowerCase().replace(/^\./, '').replace(/\.$/, '')
  if (!h || !s) return false
  return h === s || h.endsWith('.' + s)
}

export function isHostAllowlisted(hostname: string, allowHosts: string[]): boolean {
  return allowHosts.some((a) => {
    const t = a.trim()
    return t.length > 0 && hostMatchesSuffix(hostname, t)
  })
}

export function isCookieBannerMode(v: unknown): v is CookieBannerMode {
  return typeof v === 'string' && (COOKIE_BANNER_MODES as readonly string[]).includes(v)
}

/** Normalize partial prefs from IPC / file. */
export function sanitizePrivacyPrefs(raw: unknown): PrivacyPrefs {
  const base = { ...DEFAULT_PRIVACY_PREFS }
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>
  if (typeof o.blockAds === 'boolean') base.blockAds = o.blockAds
  if (typeof o.blockTrackers === 'boolean') base.blockTrackers = o.blockTrackers
  if (isCookieBannerMode(o.cookieBannerMode)) base.cookieBannerMode = o.cookieBannerMode
  if (typeof o.showShieldBadge === 'boolean') base.showShieldBadge = o.showShieldBadge
  if (Array.isArray(o.allowHosts)) {
    base.allowHosts = [
      ...new Set(
        o.allowHosts
          .filter((h): h is string => typeof h === 'string')
          .map((h) => h.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 200)
      )
    ]
  }
  base.version = 1
  return base
}
