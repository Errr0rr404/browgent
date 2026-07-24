/**
 * Local browsing history — persist visits for the History chrome page.
 * Caps size and de-dupes by URL (updates visitCount / lastVisit).
 */
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { HistoryEntry } from '../../shared/types'

const MAX_ENTRIES = 5000
const SAVE_DEBOUNCE_MS = 400

function isRecordableUrl(url: string): boolean {
  const u = (url || '').trim().toLowerCase()
  if (!u || u === 'about:blank' || u.startsWith('about:')) return false
  if (u.startsWith('chrome:') || u.startsWith('devtools:') || u.startsWith('browgent:')) {
    return false
  }
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export class HistoryStore {
  private entries = new Map<string, HistoryEntry>()
  private order: string[] = []
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private path: string

  constructor(filePath?: string) {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.path = filePath ?? join(dir, 'history.json')
    this.load()
  }

  private load(): void {
    try {
      if (!existsSync(this.path)) return
      const raw = readFileSync(this.path, 'utf8')
      const data = JSON.parse(raw) as { entries?: HistoryEntry[] }
      if (!Array.isArray(data.entries)) return
      for (const e of data.entries) {
        if (!e?.url || !e.id) continue
        if (this.entries.has(e.url)) {
          // De-dupe corrupted history.json: keep the more recent visit
          const prev = this.entries.get(e.url)!
          const visitCount = Math.max(1, Number(e.visitCount) || 1)
          const lastVisit = Number(e.lastVisit) || Date.now()
          this.entries.set(e.url, {
            id: prev.id,
            url: e.url,
            title: e.title || prev.title || e.url,
            favicon: e.favicon ?? prev.favicon,
            visitCount: Math.max(prev.visitCount, visitCount),
            lastVisit: Math.max(prev.lastVisit, lastVisit)
          })
          continue
        }
        this.entries.set(e.url, {
          id: e.id,
          url: e.url,
          title: e.title || e.url,
          favicon: e.favicon,
          visitCount: Math.max(1, Number(e.visitCount) || 1),
          lastVisit: Number(e.lastVisit) || Date.now()
        })
        this.order.push(e.url)
      }
      this.order.sort(
        (a, b) => (this.entries.get(b)?.lastVisit ?? 0) - (this.entries.get(a)?.lastVisit ?? 0)
      )
    } catch (err) {
      console.warn('[browgent] history load failed', err)
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flush(), SAVE_DEBOUNCE_MS)
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    try {
      const entries = this.order
        .map((url) => this.entries.get(url))
        .filter((e): e is HistoryEntry => Boolean(e))
        .slice(0, MAX_ENTRIES)
      // Atomic write (tmp + rename) so a crash mid-write can't corrupt history.json.
      const tmp = `${this.path}.tmp`
      writeFileSync(tmp, JSON.stringify({ entries }, null, 0), 'utf8')
      renameSync(tmp, this.path)
    } catch (err) {
      console.warn('[browgent] history save failed', err)
    }
  }

  record(input: { url: string; title?: string; favicon?: string }): void {
    if (!isRecordableUrl(input.url)) return
    const url = input.url
    const existing = this.entries.get(url)
    const now = Date.now()
    const rawTitle = input.title?.trim()
    // Ignore placeholder titles so mid-navigation "Loading…" does not clobber real meta
    const title =
      rawTitle && rawTitle !== 'Loading…' && rawTitle !== 'Loading...' && rawTitle !== 'New Tab'
        ? rawTitle
        : undefined
    if (existing) {
      existing.visitCount += 1
      existing.lastVisit = now
      if (title) existing.title = title
      if (input.favicon) existing.favicon = input.favicon
      this.order = [url, ...this.order.filter((u) => u !== url)]
    } else {
      const entry: HistoryEntry = {
        id: randomUUID(),
        url,
        title: title || url,
        favicon: input.favicon,
        visitCount: 1,
        lastVisit: now
      }
      this.entries.set(url, entry)
      this.order = [url, ...this.order]
    }
    while (this.order.length > MAX_ENTRIES) {
      const drop = this.order.pop()
      if (drop) this.entries.delete(drop)
    }
    this.scheduleSave()
  }

  /** Bulk import from another browser (does not double-count when URL exists — merges max). */
  importEntry(input: {
    url: string
    title?: string
    visitCount?: number
    lastVisit?: number
    favicon?: string
  }): void {
    if (!isRecordableUrl(input.url)) return
    const url = input.url
    const visitCount = Math.max(1, Number(input.visitCount) || 1)
    const lastVisit = Number(input.lastVisit) || Date.now()
    const title = (input.title || '').trim() || url
    const existing = this.entries.get(url)
    if (existing) {
      existing.visitCount = Math.max(existing.visitCount, visitCount)
      existing.lastVisit = Math.max(existing.lastVisit, lastVisit)
      if (title && title !== url) existing.title = title
      if (input.favicon) existing.favicon = input.favicon
      this.order = [url, ...this.order.filter((u) => u !== url)]
    } else {
      this.entries.set(url, {
        id: randomUUID(),
        url,
        title,
        favicon: input.favicon,
        visitCount,
        lastVisit
      })
      this.order = [url, ...this.order]
    }
    while (this.order.length > MAX_ENTRIES) {
      const drop = this.order.pop()
      if (drop) this.entries.delete(drop)
    }
    this.scheduleSave()
  }

  /** Update title/favicon for a URL without counting a new visit. */
  touchMeta(url: string, title?: string, favicon?: string): void {
    const e = this.entries.get(url)
    if (!e) return
    const t = title?.trim()
    if (t && t !== 'Loading…' && t !== 'Loading...' && t !== 'New Tab') e.title = t
    if (favicon) e.favicon = favicon
    this.scheduleSave()
  }

  list(limit = 200): HistoryEntry[] {
    const n = Math.min(Math.max(1, limit), MAX_ENTRIES)
    return this.order
      .slice(0, n)
      .map((url) => this.entries.get(url))
      .filter((e): e is HistoryEntry => Boolean(e))
  }

  search(query: string, limit = 200): HistoryEntry[] {
    const q = query.trim().toLowerCase()
    if (!q) return this.list(limit)
    const n = Math.min(Math.max(1, limit), MAX_ENTRIES)
    const out: HistoryEntry[] = []
    for (const url of this.order) {
      const e = this.entries.get(url)
      if (!e) continue
      const hay = `${e.title} ${e.url}`.toLowerCase()
      if (hay.includes(q)) {
        out.push(e)
        if (out.length >= n) break
      }
    }
    return out
  }

  delete(id: string): boolean {
    for (const [url, e] of this.entries) {
      if (e.id === id) {
        this.entries.delete(url)
        this.order = this.order.filter((u) => u !== url)
        this.scheduleSave()
        return true
      }
    }
    return false
  }

  clear(): void {
    this.entries.clear()
    this.order = []
    this.scheduleSave()
  }

  /** Call after bulk import so newest visits appear first. */
  reindexByRecency(): void {
    this.order.sort(
      (a, b) => (this.entries.get(b)?.lastVisit ?? 0) - (this.entries.get(a)?.lastVisit ?? 0)
    )
    this.scheduleSave()
  }
}
