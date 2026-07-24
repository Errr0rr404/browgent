/**
 * Map User Hub profile + free-form fields onto page inputs (agent fill_form).
 */
import type { ObserveElement, ObserveSnapshot } from '../../shared/types'
import type { UserProfile } from '../../shared/profile'
import { profileToAgentMap } from '../../shared/profile'

export interface FillPlanItem {
  ref: string
  value: string
  reason: string
  isSelect: boolean
}

const SYNONYMS: Array<{ keys: string[]; patterns: RegExp[] }> = [
  {
    keys: ['email', 'emailAlt'],
    patterns: [/\be-?mail\b/i, /email\s*address/i]
  },
  // Prefer specific name fields before broad "name"
  {
    keys: ['firstName'],
    patterns: [/\bfirst\s*name\b/i, /\bgiven\s*name\b/i, /\bfname\b/i, /autocomplete["\s:=]*given-name/i]
  },
  {
    keys: ['lastName'],
    patterns: [/\blast\s*name\b/i, /\bsurname\b/i, /\bfamily\s*name\b/i, /\blname\b/i, /family-name/i]
  },
  {
    keys: ['fullName', 'firstName'],
    patterns: [/\bfull\s*name\b/i, /\byour\s*name\b/i, /customer\s*name/i, /\bcustname\b/i, /\bname\b/i]
  },
  {
    keys: ['phone', 'phoneAlt'],
    patterns: [/\bphone\b/i, /\btel\b/i, /\bmobile\b/i, /\bcell\b/i, /telephone/i]
  },
  {
    keys: ['company'],
    patterns: [/\bcompany\b/i, /\borgani[sz]ation\b/i, /\borg\b/i, /employer/i]
  },
  {
    keys: ['jobTitle'],
    patterns: [/\bjob\s*title\b/i, /\borganization-title\b/i, /\brole\b/i]
  },
  {
    keys: ['website'],
    patterns: [/\bwebsite\b/i, /\burl\b/i, /homepage/i]
  },
  {
    keys: ['addressLine1', 'line1'],
    patterns: [/\baddress\b/i, /street/i, /address\s*1/i, /line\s*1/i]
  },
  {
    keys: ['addressLine2', 'line2'],
    patterns: [/address\s*2/i, /line\s*2/i, /apt/i, /suite/i]
  },
  {
    keys: ['city'],
    patterns: [/\bcity\b/i, /town/i]
  },
  {
    keys: ['region'],
    patterns: [/\bstate\b/i, /\bregion\b/i, /province/i]
  },
  {
    keys: ['postalCode'],
    patterns: [/postal/i, /zip/i, /post\s*code/i]
  },
  {
    keys: ['country'],
    patterns: [/\bcountry\b/i]
  },
  {
    keys: ['birthday'],
    patterns: [/birth/i, /dob/i]
  }
]

function haystack(el: ObserveElement): string {
  return [
    el.name,
    el.placeholder,
    el.nameAttr,
    el.autocomplete,
    el.tag,
    el.role,
    el.ref,
    el.value
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function isFillable(el: ObserveElement): boolean {
  const role = (el.role || '').toLowerCase()
  const tag = (el.tag || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (['textbox', 'searchbox', 'combobox', 'spinbutton'].includes(role)) return true
  return false
}

function isPasswordish(el: ObserveElement): boolean {
  const h = haystack(el)
  return /\bpassword\b/i.test(h) || /\bpasswd\b/i.test(h) || el.role === 'password'
}

function isSelect(el: ObserveElement): boolean {
  return (el.tag || '').toLowerCase() === 'select' || (el.role || '').toLowerCase() === 'combobox'
}

function lookupMap(
  map: Record<string, string>,
  keys: string[]
): string | null {
  for (const k of keys) {
    const v = map[k]
    if (v && v.trim()) return v.trim()
  }
  // nested address keys flattened as address.line1 etc. already in profileToAgentMap
  return null
}

/**
 * Build a fill plan from observation + profile map + explicit fields.
 * Explicit `fields` win over profile when both match.
 */
export function planFormFill(
  snap: ObserveSnapshot,
  profile: UserProfile | null,
  fields: Record<string, string> | undefined,
  useProfile: boolean
): FillPlanItem[] {
  const profileMap =
    useProfile && profile && profile.agentMayUse ? profileToAgentMap(profile) : {}
  const explicit: Record<string, string> = {}
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      if (typeof k === 'string' && typeof v === 'string' && v.trim()) {
        explicit[k.toLowerCase()] = v.trim()
      }
    }
  }

  const plan: FillPlanItem[] = []
  const usedRefs = new Set<string>()

  for (const el of snap.elements) {
    if (!isFillable(el) || isPasswordish(el) || usedRefs.has(el.ref)) continue
    const h = haystack(el)

    // Explicit field keys: substring match on haystack or key
    let value: string | null = null
    let reason = ''
    for (const [key, val] of Object.entries(explicit)) {
      if (h.includes(key) || key.includes(h.slice(0, 40))) {
        value = val
        reason = `fields.${key}`
        break
      }
    }

    if (!value && useProfile) {
      for (const syn of SYNONYMS) {
        if (syn.patterns.some((re) => re.test(h))) {
          const v = lookupMap(profileMap, syn.keys)
          if (v) {
            value = v
            reason = `profile.${syn.keys[0]}`
            break
          }
        }
      }
    }

    // autocomplete-ish tokens in name
    if (!value && useProfile) {
      for (const [pk, pv] of Object.entries(profileMap)) {
        const token = pk.replace(/^addressLine/, 'address').replace(/^custom\./, '').toLowerCase()
        if (token.length >= 3 && h.includes(token)) {
          value = pv
          reason = `profile.${pk}`
          break
        }
      }
    }

    if (!value) continue
    usedRefs.add(el.ref)
    plan.push({
      ref: el.ref,
      value,
      reason,
      isSelect: isSelect(el)
    })
  }

  return plan
}
