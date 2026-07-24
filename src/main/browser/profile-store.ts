/**
 * User Hub profile — local JSON under userData.
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { emptyUserProfile, type UserProfile } from '../../shared/profile'

export class ProfileStore {
  private path: string
  private profile: UserProfile

  constructor(filePath?: string) {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.path = filePath ?? join(dir, 'user-hub.json')
    this.profile = this.load()
  }

  private load(): UserProfile {
    try {
      if (!existsSync(this.path)) return emptyUserProfile()
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<UserProfile>
      return sanitizeProfile(raw)
    } catch {
      return emptyUserProfile()
    }
  }

  get(): UserProfile {
    return structuredClone(this.profile)
  }

  set(partial: Partial<UserProfile>): UserProfile {
    const next = sanitizeProfile({
      ...this.profile,
      ...partial,
      address: {
        ...this.profile.address,
        ...(partial.address || {})
      },
      // Full replace when client sends custom (allows deletions from User Hub UI)
      custom: partial.custom !== undefined ? { ...partial.custom } : this.profile.custom,
      version: 1,
      updatedAt: Date.now()
    })
    this.profile = next
    this.save()
    return this.get()
  }

  private save(): void {
    try {
      const tmp = `${this.path}.tmp`
      writeFileSync(tmp, JSON.stringify(this.profile, null, 2), { mode: 0o600 })
      renameSync(tmp, this.path)
    } catch (e) {
      console.warn('[profile] save failed', e)
    }
  }
}

function sanitizeProfile(raw: Partial<UserProfile>): UserProfile {
  const base = emptyUserProfile()
  const str = (v: unknown, max = 500): string =>
    typeof v === 'string' ? v.trim().slice(0, max) : ''
  const addr = raw.address && typeof raw.address === 'object' ? raw.address : base.address
  const custom: Record<string, string> = {}
  if (raw.custom && typeof raw.custom === 'object') {
    for (const [k, v] of Object.entries(raw.custom)) {
      if (typeof k === 'string' && typeof v === 'string' && k.length < 64) {
        custom[k.slice(0, 64)] = v.trim().slice(0, 500)
      }
    }
  }
  return {
    version: 1,
    updatedAt: Number(raw.updatedAt) || Date.now(),
    fullName: str(raw.fullName),
    firstName: str(raw.firstName),
    lastName: str(raw.lastName),
    email: str(raw.email, 320),
    emailAlt: str(raw.emailAlt, 320),
    phone: str(raw.phone, 40),
    phoneAlt: str(raw.phoneAlt, 40),
    company: str(raw.company),
    jobTitle: str(raw.jobTitle),
    website: str(raw.website, 500),
    birthday: str(raw.birthday, 32),
    address: {
      line1: str(addr.line1),
      line2: str(addr.line2),
      city: str(addr.city),
      region: str(addr.region),
      postalCode: str(addr.postalCode, 32),
      country: str(addr.country, 80),
      label: str(addr.label, 40) || 'Home'
    },
    custom,
    agentMayUse: raw.agentMayUse !== false
  }
}

let profileSingleton: ProfileStore | null = null

export function getProfileStore(): ProfileStore {
  if (!profileSingleton) profileSingleton = new ProfileStore()
  return profileSingleton
}
