/**
 * User Hub — local profile for form fill / agent suggestions.
 * Never synced; stored under userData.
 */

export interface UserAddress {
  line1: string
  line2: string
  city: string
  region: string
  postalCode: string
  country: string
  label?: string
}

export interface UserProfile {
  version: 1
  updatedAt: number
  fullName: string
  firstName: string
  lastName: string
  email: string
  emailAlt: string
  phone: string
  phoneAlt: string
  company: string
  jobTitle: string
  website: string
  birthday: string
  address: UserAddress
  /** Free-form key/value for agent {{custom.key}} style fill */
  custom: Record<string, string>
  /** When true, agent may use profile for form fill without re-asking every field */
  agentMayUse: boolean
}

export function emptyUserProfile(): UserProfile {
  return {
    version: 1,
    updatedAt: Date.now(),
    fullName: '',
    firstName: '',
    lastName: '',
    email: '',
    emailAlt: '',
    phone: '',
    phoneAlt: '',
    company: '',
    jobTitle: '',
    website: '',
    birthday: '',
    address: {
      line1: '',
      line2: '',
      city: '',
      region: '',
      postalCode: '',
      country: '',
      label: 'Home'
    },
    custom: {},
    agentMayUse: true
  }
}

/** Flat map for LLM / agent (non-empty fields only). */
export function profileToAgentMap(p: UserProfile): Record<string, string> {
  if (!p.agentMayUse) return {}
  const out: Record<string, string> = {}
  const put = (k: string, v: string): void => {
    const t = (v || '').trim()
    if (t) out[k] = t
  }
  put('fullName', p.fullName)
  put('firstName', p.firstName)
  put('lastName', p.lastName)
  put('email', p.email)
  put('emailAlt', p.emailAlt)
  put('phone', p.phone)
  put('phoneAlt', p.phoneAlt)
  put('company', p.company)
  put('jobTitle', p.jobTitle)
  put('website', p.website)
  put('birthday', p.birthday)
  put('addressLine1', p.address.line1)
  put('addressLine2', p.address.line2)
  put('city', p.address.city)
  put('region', p.address.region)
  put('postalCode', p.address.postalCode)
  put('country', p.address.country)
  for (const [k, v] of Object.entries(p.custom || {})) {
    put(`custom.${k}`, v)
  }
  return out
}

export interface VaultCredentialMeta {
  id: string
  origin: string
  username: string
  /** Never include password in list payloads to the renderer */
  hasPassword: boolean
  updatedAt: number
  source?: string
}
