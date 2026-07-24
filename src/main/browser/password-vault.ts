/**
 * Local credential vault — encrypted at rest with Electron safeStorage when available.
 * Renderer only receives metadata (origin + username), never plaintext passwords.
 */
import { app, safeStorage } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { VaultCredentialMeta } from '../../shared/profile'

interface VaultRecord {
  id: string
  origin: string
  username: string
  /** base64 ciphertext or plaintext fallback marker */
  passwordEnc: string
  enc: 'safeStorage' | 'plain'
  updatedAt: number
  source?: string
}

interface VaultFile {
  version: 1
  records: VaultRecord[]
}

export class PasswordVault {
  private path: string
  private records: VaultRecord[] = []

  constructor(filePath?: string) {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.path = filePath ?? join(dir, 'credential-vault.json')
    this.load()
  }

  private load(): void {
    try {
      if (!existsSync(this.path)) return
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as VaultFile
      if (raw?.version === 1 && Array.isArray(raw.records)) {
        this.records = raw.records.filter((r) => r?.id && r.origin)
      }
    } catch (e) {
      console.warn('[vault] load failed', e)
    }
  }

  private save(): void {
    try {
      const payload: VaultFile = { version: 1, records: this.records }
      const tmp = `${this.path}.tmp`
      writeFileSync(tmp, JSON.stringify(payload), { mode: 0o600 })
      renameSync(tmp, this.path)
    } catch (e) {
      console.warn('[vault] save failed', e)
    }
  }

  private encrypt(plain: string): { passwordEnc: string; enc: 'safeStorage' | 'plain' } {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const buf = safeStorage.encryptString(plain)
        return { passwordEnc: buf.toString('base64'), enc: 'safeStorage' }
      }
    } catch {
      /* fall through */
    }
    // Fallback: still local file mode 0600 — warn once via enc flag
    return { passwordEnc: Buffer.from(plain, 'utf8').toString('base64'), enc: 'plain' }
  }

  private decrypt(rec: VaultRecord): string | null {
    try {
      if (rec.enc === 'safeStorage') {
        // Never fall through to base64-as-utf8 — that would return ciphertext garbage.
        if (!safeStorage.isEncryptionAvailable()) return null
        return safeStorage.decryptString(Buffer.from(rec.passwordEnc, 'base64'))
      }
      if (rec.enc === 'plain') {
        return Buffer.from(rec.passwordEnc, 'base64').toString('utf8')
      }
      return null
    } catch {
      return null
    }
  }

  /** True when at least one record is stored without OS encryption. */
  hasPlaintextRecords(): boolean {
    return this.records.some((r) => r.enc === 'plain')
  }

  encryptionAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  listMeta(): VaultCredentialMeta[] {
    return this.records
      .map((r) => ({
        id: r.id,
        origin: r.origin,
        username: r.username,
        hasPassword: Boolean(r.passwordEnc),
        updatedAt: r.updatedAt,
        source: r.source
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /** Upsert by origin+username. Pass `{ deferSave: true }` for batch imports. */
  upsert(
    input: {
      origin: string
      username: string
      password: string
      source?: string
    },
    opts?: { deferSave?: boolean }
  ): string {
    const origin = normalizeOrigin(input.origin)
    const username = String(input.username || '').slice(0, 500)
    const password = String(input.password || '')
    if (!origin || !password) return ''

    const existing = this.records.find(
      (r) => r.origin === origin && r.username === username
    )
    const enc = this.encrypt(password)
    if (existing) {
      existing.passwordEnc = enc.passwordEnc
      existing.enc = enc.enc
      existing.updatedAt = Date.now()
      if (input.source) existing.source = input.source
      if (!opts?.deferSave) this.save()
      return existing.id
    }
    const id = randomUUID()
    this.records.push({
      id,
      origin,
      username,
      passwordEnc: enc.passwordEnc,
      enc: enc.enc,
      updatedAt: Date.now(),
      source: input.source
    })
    // Cap vault size
    if (this.records.length > 2000) {
      this.records.sort((a, b) => b.updatedAt - a.updatedAt)
      this.records = this.records.slice(0, 2000)
    }
    if (!opts?.deferSave) this.save()
    return id
  }

  /** Persist after a batch of deferred upserts. */
  flush(): void {
    this.save()
  }

  getPassword(id: string): { origin: string; username: string; password: string } | null {
    const rec = this.records.find((r) => r.id === id)
    if (!rec) return null
    const password = this.decrypt(rec)
    if (password == null) return null
    return { origin: rec.origin, username: rec.username, password }
  }

  /**
   * Best match for a page URL.
   * Match exact host, or page host is a subdomain of the stored host.
   * Never return a more-specific stored host (e.g. login.bank.com) for bank.com —
   * that would hand the wrong account after a vague confirm.
   */
  findForUrl(pageUrl: string): {
    id: string
    username: string
    password: string
    origin: string
  } | null {
    const host = hostOf(pageUrl)
    if (!host) return null
    const candidates = this.records.filter((r) => {
      const h = hostOf(r.origin)
      if (!h) return false
      // Reject single-label / empty hosts except exact equality (avoids suffix traps)
      if (h !== host && !h.includes('.')) return false
      return h === host || host.endsWith(`.${h}`)
    })
    if (!candidates.length) return null
    // Prefer exact host, then most recently updated
    candidates.sort((a, b) => {
      const aExact = hostOf(a.origin) === host ? 1 : 0
      const bExact = hostOf(b.origin) === host ? 1 : 0
      if (aExact !== bExact) return bExact - aExact
      return b.updatedAt - a.updatedAt
    })
    const rec = candidates[0]
    const password = this.decrypt(rec)
    if (password == null) return null
    return { id: rec.id, username: rec.username, password, origin: rec.origin }
  }

  /** Metadata-only lookup (no decrypt) for confirm UX before releasing secrets. */
  findMetaForUrl(pageUrl: string): { id: string; username: string; origin: string } | null {
    const host = hostOf(pageUrl)
    if (!host) return null
    const candidates = this.records.filter((r) => {
      const h = hostOf(r.origin)
      if (!h) return false
      if (h !== host && !h.includes('.')) return false
      return h === host || host.endsWith(`.${h}`)
    })
    if (!candidates.length) return null
    candidates.sort((a, b) => {
      const aExact = hostOf(a.origin) === host ? 1 : 0
      const bExact = hostOf(b.origin) === host ? 1 : 0
      if (aExact !== bExact) return bExact - aExact
      return b.updatedAt - a.updatedAt
    })
    const rec = candidates[0]
    return { id: rec.id, username: rec.username, origin: rec.origin }
  }

  remove(id: string): boolean {
    const n = this.records.length
    this.records = this.records.filter((r) => r.id !== id)
    if (this.records.length === n) return false
    this.save()
    return true
  }

  clear(): void {
    this.records = []
    this.save()
  }

  count(): number {
    return this.records.length
  }
}

function normalizeOrigin(url: string): string {
  try {
    const u = new URL(url.includes('://') ? url : `https://${url}`)
    return `${u.protocol}//${u.host}`
  } catch {
    return url.trim().slice(0, 500)
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).hostname.toLowerCase()
  } catch {
    return ''
  }
}

let vaultSingleton: PasswordVault | null = null

export function getPasswordVault(): PasswordVault {
  if (!vaultSingleton) vaultSingleton = new PasswordVault()
  return vaultSingleton
}
