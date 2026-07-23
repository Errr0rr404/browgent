/** True when the tab is a blank / New Tab surface (chrome paints NTP). */
export function isBlankUrl(url?: string | null): boolean {
  if (!url) return true
  const u = url.trim().toLowerCase()
  return u === 'about:blank' || u === 'about:blank/' || u === 'about:newtab'
}

/** Label for tab strips / sidebar when title is empty or blank. */
export function tabDisplayTitle(title?: string | null, url?: string | null): string {
  if (isBlankUrl(url)) return 'New Tab'
  const t = title?.trim()
  return t || 'New Tab'
}

/** Display string for the omnibox when not editing. */
export function omniboxDisplayUrl(
  url: string | undefined,
  options?: { settingsOpen?: boolean; historyOpen?: boolean }
): string {
  if (options?.settingsOpen) return 'browgent://settings'
  if (options?.historyOpen) return 'browgent://history'
  if (!url || isBlankUrl(url)) return ''
  return url
}
