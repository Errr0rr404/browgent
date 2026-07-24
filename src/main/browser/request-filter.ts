/**
 * Network-level ad/tracker blocking on the guest page session.
 */
import type { Session } from 'electron'
import { COMPACT_BLOCKLIST } from '../../shared/blocklists/compact-hosts'
import {
  hostMatchesSuffix,
  isHostAllowlisted
} from '../../shared/privacy-prefs'
import type { PrivacyStore } from './privacy-store'

function matchesHostList(hostname: string, list: string[]): boolean {
  return list.some((entry) => {
    const e = entry.trim().toLowerCase()
    if (!e || e.includes('/')) return false
    return hostMatchesSuffix(hostname, e)
  })
}

function matchesPathRule(url: URL, rules: string[]): boolean {
  const full = `${url.hostname}${url.pathname}`.toLowerCase()
  const href = url.href.toLowerCase()
  return rules.some((r) => {
    const rule = r.trim().toLowerCase()
    if (!rule) return false
    return full.includes(rule) || href.includes(rule)
  })
}

export function wireRequestFilter(
  sess: Session,
  store: PrivacyStore
): { dispose: () => void } {
  const list = COMPACT_BLOCKLIST
  const filter = { urls: ['http://*/*', 'https://*/*'] as string[] }

  const handler = (
    details: Electron.OnBeforeRequestListenerDetails,
    callback: (response: Electron.CallbackResponse) => void
  ): void => {
    try {
      const prefs = store.get()
      if (!prefs.blockAds && !prefs.blockTrackers) {
        callback({})
        return
      }
      let url: URL
      try {
        url = new URL(details.url)
      } catch {
        callback({})
        return
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        callback({})
        return
      }
      if (isHostAllowlisted(url.hostname, prefs.allowHosts)) {
        callback({})
        return
      }

      let hit = false
      if (prefs.blockAds && matchesHostList(url.hostname, list.ads)) hit = true
      if (!hit && prefs.blockTrackers && matchesHostList(url.hostname, list.trackers)) hit = true
      // Path rules (e.g. facebook.com/tr) count as trackers when tracker block is on;
      // also as ads if only ads on (treat as tracking pixel).
      if (!hit && (prefs.blockTrackers || prefs.blockAds) && list.pathRules?.length) {
        if (matchesPathRule(url, list.pathRules)) hit = true
      }

      if (hit) {
        store.recordBlock(url.hostname)
        callback({ cancel: true })
        return
      }
      callback({})
    } catch {
      callback({})
    }
  }

  sess.webRequest.onBeforeRequest(filter, handler)

  return {
    dispose: () => {
      try {
        sess.webRequest.onBeforeRequest(null as unknown as never)
      } catch {
        /* ignore */
      }
    }
  }
}
