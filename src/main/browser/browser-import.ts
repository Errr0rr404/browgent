/**
 * One-click import of history / bookmarks / passwords from detected browsers.
 * Local disk only — never leaves the machine.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { isAbsolute, join } from 'path'
import type { ImportOptions, ImportResult } from '../../shared/import-types'
import { detectInstalledBrowsers, getBrowserSpec } from './browser-detect'
import { chromeTimeToUnixMs, openCopiedSqlite, queryAll } from './sqlite-read'
import { decryptChromiumPassword } from './chromium-crypto'
import type { HistoryStore } from './history-store'
import { getPasswordVault } from './password-vault'

export interface BookmarkImportItem {
  title: string
  url: string
}

export interface BrowserImportDeps {
  history: HistoryStore
  /** Called with flat bookmark list to merge into renderer store via IPC result */
  onBookmarks?: (items: BookmarkImportItem[]) => void
}

export function listDetectedBrowsers() {
  return detectInstalledBrowsers()
}

export async function importFromBrowser(
  opts: ImportOptions,
  deps: BrowserImportDeps
): Promise<ImportResult> {
  const started = Date.now()
  const detected = detectInstalledBrowsers().find((b) => b.id === opts.browserId)
  const warnings: string[] = []
  const errors: string[] = []
  let historyImported = 0
  let bookmarksImported = 0
  let passwordsImported = 0
  let passwordsSkipped = 0

  if (!detected?.installed) {
    return {
      browserId: opts.browserId,
      browserName: opts.browserId,
      historyImported: 0,
      bookmarksImported: 0,
      passwordsImported: 0,
      passwordsSkipped: 0,
      warnings,
      errors: ['Browser not detected on this machine'],
      durationMs: Date.now() - started
    }
  }

  const profile = detected.profilePath
  const wantHistory = opts.history !== false
  const wantBookmarks = opts.bookmarks !== false
  const wantPasswords = opts.passwords === true
  const historyLimit = Math.min(5000, Math.max(100, opts.historyLimit ?? 2000))

  const chromium = getBrowserSpec(opts.browserId)?.chromium

  if (chromium && profile) {
    if (wantHistory) {
      try {
        historyImported = await importChromiumHistory(profile, deps.history, historyLimit)
      } catch (e) {
        errors.push(`History: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (wantBookmarks) {
      try {
        const items = importChromiumBookmarks(profile)
        bookmarksImported = items.length
        deps.onBookmarks?.(items)
      } catch (e) {
        errors.push(`Bookmarks: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (wantPasswords) {
      try {
        const r = await importChromiumPasswords(opts.browserId, profile)
        passwordsImported = r.imported
        passwordsSkipped = r.skipped
        if (r.warning) warnings.push(r.warning)
      } catch (e) {
        errors.push(`Passwords: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  } else if (opts.browserId === 'firefox' && profile) {
    if (wantHistory || wantBookmarks) {
      try {
        const r = await importFirefoxPlaces(profile, deps, {
          history: wantHistory,
          bookmarks: wantBookmarks,
          historyLimit
        })
        historyImported = r.history
        bookmarksImported = r.bookmarks
      } catch (e) {
        errors.push(`Firefox: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (wantPasswords) {
      warnings.push('Firefox password import is not supported yet (NSS encryption).')
    }
  } else if (opts.browserId === 'safari') {
    if (wantHistory) {
      try {
        historyImported = await importSafariHistory(deps.history, historyLimit)
      } catch (e) {
        errors.push(`Safari history: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (wantBookmarks) {
      warnings.push('Safari bookmarks import is limited; prefer Chromium browsers for full import.')
    }
    if (wantPasswords) {
      warnings.push('Safari passwords remain in macOS Keychain (not imported).')
    }
  } else {
    errors.push('No importable profile found — close the other browser and try again.')
  }

  if (wantHistory && historyImported === 0 && !errors.some((e) => /history/i.test(e))) {
    warnings.push(
      'No history rows imported — fully quit the source browser and try again (SQLite may be locked or empty).'
    )
  }
  if (wantBookmarks && bookmarksImported === 0 && chromium && !errors.some((e) => /bookmark/i.test(e))) {
    warnings.push('No bookmarks found in that profile.')
  }

  return {
    browserId: opts.browserId,
    browserName: detected.name,
    historyImported,
    bookmarksImported,
    passwordsImported,
    passwordsSkipped,
    warnings,
    errors,
    durationMs: Date.now() - started
  }
}

async function importChromiumHistory(
  profilePath: string,
  history: HistoryStore,
  limit: number
): Promise<number> {
  const dbPath = join(profilePath, 'History')
  const opened = await openCopiedSqlite(dbPath)
  if (!opened) return 0
  try {
    const rows = queryAll(
      opened.db,
      `SELECT url, title, visit_count, last_visit_time FROM urls
       WHERE url LIKE 'http%'
       ORDER BY last_visit_time DESC
       LIMIT ${Math.floor(limit)}`
    )
    let n = 0
    for (const row of rows) {
      const url = String(row.url || '')
      if (!url.startsWith('http')) continue
      const title = String(row.title || url)
      const visitCount = Math.max(1, Number(row.visit_count) || 1)
      const lastVisit = chromeTimeToUnixMs(Number(row.last_visit_time) || 0)
      history.importEntry({ url, title, visitCount, lastVisit })
      n++
    }
    history.reindexByRecency()
    history.flush()
    return n
  } finally {
    opened.cleanup()
  }
}

function importChromiumBookmarks(profilePath: string): BookmarkImportItem[] {
  const file = join(profilePath, 'Bookmarks')
  if (!existsSync(file)) return []
  const raw = JSON.parse(readFileSync(file, 'utf8')) as {
    roots?: Record<string, ChromiumBookmarkNode>
  }
  const out: BookmarkImportItem[] = []
  const roots = raw.roots || {}
  for (const key of Object.keys(roots)) {
    walkBookmarks(roots[key], out)
  }
  // de-dupe by url
  const seen = new Set<string>()
  return out.filter((b) => {
    if (seen.has(b.url)) return false
    seen.add(b.url)
    return true
  })
}

interface ChromiumBookmarkNode {
  type?: string
  name?: string
  url?: string
  children?: ChromiumBookmarkNode[]
}

function walkBookmarks(node: ChromiumBookmarkNode | undefined, out: BookmarkImportItem[]): void {
  if (!node) return
  if (node.type === 'url' && node.url && node.url.startsWith('http')) {
    out.push({
      title: (node.name || node.url).slice(0, 300),
      url: node.url.slice(0, 4096)
    })
  }
  if (Array.isArray(node.children)) {
    for (const c of node.children) walkBookmarks(c, out)
  }
}

async function importChromiumPasswords(
  browserId: ImportOptions['browserId'],
  profilePath: string
): Promise<{ imported: number; skipped: number; warning?: string }> {
  const vault = getPasswordVault()
  if (!vault.encryptionAvailable()) {
    return {
      imported: 0,
      skipped: 0,
      warning:
        'OS secure storage is unavailable — password import is disabled so secrets are not stored as plaintext. Import history/bookmarks instead, or unlock your login keychain and retry.'
    }
  }

  const dbPath = join(profilePath, 'Login Data')
  const opened = await openCopiedSqlite(dbPath)
  if (!opened) return { imported: 0, skipped: 0, warning: 'Login Data not readable (is the browser open?)' }

  let imported = 0
  let skipped = 0
  let decryptFails = 0

  try {
    const rows = queryAll(
      opened.db,
      `SELECT origin_url, username_value, password_value FROM logins LIMIT 2000`
    )
    for (const row of rows) {
      const origin = String(row.origin_url || '')
      const username = String(row.username_value || '')
      const pwVal = row.password_value
      if (!origin) {
        skipped++
        continue
      }
      let buf: Buffer | null = null
      if (pwVal instanceof Uint8Array) buf = Buffer.from(pwVal)
      else if (typeof pwVal === 'string') buf = Buffer.from(pwVal, 'binary')
      else if (Buffer.isBuffer(pwVal)) buf = pwVal

      const password = buf ? decryptChromiumPassword(browserId, buf) : null
      if (!password) {
        decryptFails++
        skipped++
        continue
      }
      vault.upsert(
        {
          origin,
          username,
          password,
          source: `import:${browserId}`
        },
        { deferSave: true }
      )
      imported++
    }
    if (imported > 0) vault.flush()
  } finally {
    opened.cleanup()
  }

  let warning: string | undefined
  if (decryptFails > 0 && imported === 0) {
    warning =
      process.platform === 'darwin'
        ? 'Could not decrypt passwords — allow Keychain access when prompted, or unlock your login keychain.'
        : process.platform === 'win32'
          ? 'Windows password decryption is not available yet — import history/bookmarks, or use CSV later.'
          : 'Password decryption failed on this platform — history/bookmarks still import.'
  } else if (decryptFails > 0) {
    warning = `Imported ${imported} passwords; ${decryptFails} could not be decrypted.`
  }
  return { imported, skipped, warning }
}

async function importFirefoxPlaces(
  profilesRoot: string,
  deps: BrowserImportDeps,
  opts: { history: boolean; bookmarks: boolean; historyLimit: number }
): Promise<{ history: number; bookmarks: number }> {
  let placesPath: string | null = null
  try {
    if (existsSync(join(profilesRoot, 'places.sqlite'))) {
      placesPath = join(profilesRoot, 'places.sqlite')
    } else {
      placesPath = resolveFirefoxPlacesPath(profilesRoot)
    }
  } catch {
    return { history: 0, bookmarks: 0 }
  }
  if (!placesPath) return { history: 0, bookmarks: 0 }

  const opened = await openCopiedSqlite(placesPath)
  if (!opened) return { history: 0, bookmarks: 0 }

  let history = 0
  let bookmarks = 0
  try {
    if (opts.history) {
      const rows = queryAll(
        opened.db,
        `SELECT url, title, visit_count, last_visit_date FROM moz_places
         WHERE url LIKE 'http%'
         ORDER BY last_visit_date DESC
         LIMIT ${Math.floor(opts.historyLimit)}`
      )
      for (const row of rows) {
        const url = String(row.url || '')
        if (!url.startsWith('http')) continue
        const lastVisit = Math.floor(Number(row.last_visit_date || 0) / 1000) || Date.now()
        deps.history.importEntry({
          url,
          title: String(row.title || url),
          visitCount: Math.max(1, Number(row.visit_count) || 1),
          lastVisit
        })
        history++
      }
      deps.history.reindexByRecency()
      deps.history.flush()
    }
    if (opts.bookmarks) {
      const rows = queryAll(
        opened.db,
        `SELECT p.url as url, b.title as title
         FROM moz_bookmarks b
         JOIN moz_places p ON b.fk = p.id
         WHERE p.url LIKE 'http%' AND b.type = 1
         LIMIT 2000`
      )
      const items: BookmarkImportItem[] = []
      const seen = new Set<string>()
      for (const row of rows) {
        const url = String(row.url || '')
        if (!url.startsWith('http') || seen.has(url)) continue
        seen.add(url)
        items.push({
          title: String(row.title || url).slice(0, 300),
          url: url.slice(0, 4096)
        })
      }
      bookmarks = items.length
      deps.onBookmarks?.(items)
    }
  } finally {
    opened.cleanup()
  }
  return { history, bookmarks }
}

async function importSafariHistory(history: HistoryStore, limit: number): Promise<number> {
  if (process.platform !== 'darwin') return 0
  const dbPath = join(homedir(), 'Library/Safari/History.db')
  const opened = await openCopiedSqlite(dbPath)
  if (!opened) return 0
  try {
    let list: Record<string, unknown>[] = []
    try {
      list = queryAll(
        opened.db,
        `SELECT hu.url as url, hi.visit_time as visit_time
         FROM history_items hu
         JOIN history_visits hi ON hi.history_item = hu.id
         WHERE hu.url LIKE 'http%'
         ORDER BY hi.visit_time DESC
         LIMIT ${Math.floor(limit)}`
      )
    } catch {
      try {
        list = queryAll(
          opened.db,
          `SELECT url FROM history_items WHERE url LIKE 'http%' LIMIT ${Math.floor(limit)}`
        )
      } catch {
        list = []
      }
    }

    let n = 0
    for (const row of list) {
      const url = String(row.url || '')
      if (!url.startsWith('http')) continue
      // Safari Cocoa epoch: seconds since 2001-01-01
      let lastVisit = Date.now()
      if (row.visit_time != null) {
        lastVisit = Math.floor(Number(row.visit_time) * 1000 + 978_307_200_000)
      }
      history.importEntry({
        url,
        title: url,
        visitCount: 1,
        lastVisit
      })
      n++
    }
    history.reindexByRecency()
    history.flush()
    return n
  } catch {
    return 0
  } finally {
    opened.cleanup()
  }
}

/**
 * Prefer profiles.ini Default=1 / Install* Default=, then most recently modified places.sqlite.
 */
function resolveFirefoxPlacesPath(profilesRoot: string): string | null {
  const iniPath = join(profilesRoot, 'profiles.ini')
  if (existsSync(iniPath)) {
    try {
      const text = readFileSync(iniPath, 'utf8')
      const sections = text.split(/\n(?=\[)/)
      let defaultPath: string | null = null
      let installDefault: string | null = null
      for (const section of sections) {
        const isProfile = /^\[Profile\d+\]/i.test(section)
        const isInstall = /^\[Install/i.test(section)
        const pathMatch = section.match(/^Path=(.+)$/m)
        const isDefault = /^Default=1\s*$/m.test(section)
        const installDef = section.match(/^Default=(.+)$/m)
        if (isProfile && pathMatch && isDefault) {
          defaultPath = pathMatch[1].trim()
        }
        if (isInstall && installDef) {
          installDefault = installDef[1].trim()
        }
      }
      const preferred = installDefault || defaultPath
      if (preferred) {
        const candidate = isAbsolute(preferred) ? preferred : join(profilesRoot, preferred)
        const places = join(candidate, 'places.sqlite')
        if (existsSync(places)) return places
      }
    } catch {
      /* fall through */
    }
  }

  // Fallback: most recently modified places.sqlite under any profile dir
  let best: { path: string; mtime: number } | null = null
  try {
    for (const name of readdirSync(profilesRoot)) {
      const p = join(profilesRoot, name, 'places.sqlite')
      if (!existsSync(p)) continue
      try {
        const mtime = statSync(p).mtimeMs
        if (!best || mtime > best.mtime) best = { path: p, mtime }
      } catch {
        if (!best) best = { path: p, mtime: 0 }
      }
    }
  } catch {
    return null
  }
  return best?.path ?? null
}
