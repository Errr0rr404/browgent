/**
 * Local privacy prefs + block stats (userData).
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  DEFAULT_PRIVACY_PREFS,
  sanitizePrivacyPrefs,
  type PrivacyPrefs,
  type PrivacyStats,
  type PrivacyStateSnapshot
} from '../../shared/privacy-prefs'

interface StoreFile {
  prefs: PrivacyPrefs
  stats: PrivacyStats
}

function emptyStats(): PrivacyStats {
  return {
    blockedTotal: 0,
    blockedSession: 0,
    lastBlockedHost: null,
    updatedAt: Date.now()
  }
}

export class PrivacyStore {
  private path: string
  private prefs: PrivacyPrefs = { ...DEFAULT_PRIVACY_PREFS, allowHosts: [] }
  private stats: PrivacyStats = emptyStats()
  private onChange: ((snap: PrivacyStateSnapshot) => void) | null = null

  constructor(filePath?: string) {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.path = filePath ?? join(dir, 'privacy-prefs.json')
    this.load()
    // Session counter always starts at 0 for this process
    this.stats.blockedSession = 0
  }

  setOnChange(cb: (snap: PrivacyStateSnapshot) => void): void {
    this.onChange = cb
  }

  private load(): void {
    try {
      if (!existsSync(this.path)) return
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<StoreFile>
      this.prefs = sanitizePrivacyPrefs(raw.prefs ?? raw)
      if (raw.stats && typeof raw.stats === 'object') {
        const s = raw.stats
        this.stats = {
          blockedTotal: typeof s.blockedTotal === 'number' && s.blockedTotal >= 0 ? Math.floor(s.blockedTotal) : 0,
          blockedSession: 0,
          lastBlockedHost:
            typeof s.lastBlockedHost === 'string' ? s.lastBlockedHost.slice(0, 253) : null,
          updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : Date.now()
        }
      }
    } catch (e) {
      console.warn('[privacy] load failed', e)
    }
  }

  private save(): void {
    try {
      const payload: StoreFile = { prefs: this.prefs, stats: this.stats }
      const tmp = `${this.path}.tmp`
      writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 })
      renameSync(tmp, this.path)
    } catch (e) {
      console.warn('[privacy] save failed', e)
    }
  }

  private emit(): void {
    this.onChange?.(this.snapshot())
  }

  get(): PrivacyPrefs {
    return {
      ...this.prefs,
      allowHosts: [...this.prefs.allowHosts]
    }
  }

  getStats(): PrivacyStats {
    return { ...this.stats }
  }

  snapshot(): PrivacyStateSnapshot {
    return { prefs: this.get(), stats: this.getStats() }
  }

  set(partial: Partial<PrivacyPrefs>): PrivacyPrefs {
    const merged = sanitizePrivacyPrefs({ ...this.prefs, ...partial, version: 1 })
    this.prefs = merged
    this.save()
    this.emit()
    return this.get()
  }

  recordBlock(hostname: string): void {
    const host = (hostname || '').toLowerCase().slice(0, 253)
    this.stats.blockedTotal += 1
    this.stats.blockedSession += 1
    this.stats.lastBlockedHost = host || null
    this.stats.updatedAt = Date.now()
    // Debounced persistence + IPC so ad-heavy pages do not flood the renderer
    this.scheduleSave()
    this.scheduleEmit()
  }

  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private emitTimer: ReturnType<typeof setTimeout> | null = null
  private scheduleSave(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.save()
    }, 800)
  }

  private scheduleEmit(): void {
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      this.emit()
    }, 350)
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    if (this.emitTimer) {
      clearTimeout(this.emitTimer)
      this.emitTimer = null
      this.emit()
    }
    this.save()
  }
}

let singleton: PrivacyStore | null = null

export function getPrivacyStore(): PrivacyStore {
  if (!singleton) singleton = new PrivacyStore()
  return singleton
}
