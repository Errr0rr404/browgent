import { useId } from 'react'
import type { PetMood } from './types'

/** Companion visual forms the floating pet can morph between. */
export const PET_FORM_IDS = ['mark', 'invader', 'cloud'] as const
export type PetFormId = (typeof PET_FORM_IDS)[number]

/** Pref value: lock a form, or auto-cycle through all. */
export type PetFormPref = PetFormId | 'cycle'

export const PET_FORM_LABELS: Record<PetFormPref, string> = {
  cycle: 'Morph cycle',
  mark: 'Browgent mark',
  invader: 'Pixel invader',
  cloud: 'Cloud bot'
}

/** Soft tint for the glass plate behind each form */
export const PET_FORM_TINT: Record<PetFormId, string> = {
  mark: 'color-mix(in srgb, var(--accent-2) 18%, transparent)',
  invader: 'color-mix(in srgb, #1a1a1a 14%, transparent)',
  cloud: 'color-mix(in srgb, #3d7cf0 22%, transparent)'
}

export function isPetFormPref(v: string): v is PetFormPref {
  // Legacy 'claw' pref maps away via normalizePetFormPref
  return v === 'cycle' || (PET_FORM_IDS as readonly string[]).includes(v)
}

/** Coerce stored prefs (incl. removed forms like claw) to a valid value. */
export function normalizePetFormPref(v: unknown): PetFormPref {
  if (typeof v !== 'string') return 'cycle'
  if (v === 'claw') return 'cycle'
  return isPetFormPref(v) ? v : 'cycle'
}

export function nextPetForm(current: PetFormId): PetFormId {
  const i = PET_FORM_IDS.indexOf(current)
  return PET_FORM_IDS[(i + 1) % PET_FORM_IDS.length] ?? 'mark'
}

interface FormSvgProps {
  mood: PetMood
  className?: string
}

function AlertDot({ cx, cy }: { cx: number; cy: number }): React.JSX.Element {
  return (
    <g className="pet-form-alert">
      <circle cx={cx} cy={cy} r="2.1" fill="var(--danger, #e04545)" />
      <circle cx={cx + 0.35} cy={cy - 0.4} r="0.55" fill="#fff" opacity={0.55} />
    </g>
  )
}

/** Browgent brand mark — filled soft tile + glowing wandering orb. */
export function MarkForm({ mood, className }: FormSvgProps): React.JSX.Element {
  const uid = useId().replace(/:/g, '')
  return (
    <svg
      className={`pet-form pet-form--mark ${className ?? ''}`}
      viewBox="0 0 24 24"
      width="56"
      height="56"
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={`${uid}-tile`} x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--bg-elevated, #fff)" stopOpacity="0.95" />
          <stop offset="1" stopColor="var(--bg-hover, #eee)" stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id={`${uid}-orb`} cx="40%" cy="35%" r="65%">
          <stop stopColor="var(--accent-2)" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.85" />
        </radialGradient>
        <filter id={`${uid}-glow`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.1" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect
        className="pet-form-frame"
        x="3.25"
        y="3.25"
        width="17.5"
        height="17.5"
        rx="5.75"
        fill={`url(#${uid}-tile)`}
        stroke="var(--accent)"
        strokeWidth={1.65}
      />
      <rect
        x="4.6"
        y="4.5"
        width="8"
        height="5"
        rx="2.5"
        fill="var(--accent)"
        opacity={0.06}
      />
      <g className={`pet-form-orb pet-form-orb--${mood}`} filter={`url(#${uid}-glow)`}>
        <circle cx="14.4" cy="14.4" r="3.15" fill={`url(#${uid}-orb)`} />
        <circle cx="13.5" cy="13.5" r="1.05" fill="#fff" opacity={0.45} />
      </g>
      {mood === 'attention' && <AlertDot cx={19.2} cy={5.2} />}
    </svg>
  )
}

/** Space-invader / pixel crab — crisp arcade familiar with bounce legs. */
export function InvaderForm({ mood, className }: FormSvgProps): React.JSX.Element {
  const uid = useId().replace(/:/g, '')
  const eyeOpen = mood !== 'busy'
  return (
    <svg
      className={`pet-form pet-form--invader ${className ?? ''}`}
      viewBox="0 0 24 24"
      width="56"
      height="56"
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={`${uid}-body`} x1="6" y1="4" x2="18" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <g className="pet-form-invader" fill={`url(#${uid}-body)`}>
        {/* antennae */}
        <rect className="pet-inv-ant pet-inv-ant--l" x="5.5" y="3.2" width="2" height="3.2" rx="0.45" />
        <rect className="pet-inv-ant pet-inv-ant--r" x="16.5" y="3.2" width="2" height="3.2" rx="0.45" />
        <rect x="4.6" y="2.4" width="2.1" height="2.1" rx="0.4" />
        <rect x="17.3" y="2.4" width="2.1" height="2.1" rx="0.4" />
        {/* body block */}
        <path d="M7.2 6.6h9.6v2.1H7.2V6.6zM4.8 8.7h14.4v6.4H4.8V8.7z" />
        {/* arms */}
        <rect x="3.2" y="10.2" width="2.2" height="3.6" rx="0.4" />
        <rect x="18.6" y="10.2" width="2.2" height="3.6" rx="0.4" />
        {/* side feet nubs */}
        <rect x="5.8" y="15.1" width="3.1" height="2.2" rx="0.35" />
        <rect x="15.1" y="15.1" width="3.1" height="2.2" rx="0.35" />
        {/* legs */}
        <g className="pet-inv-legs">
          <rect className="pet-inv-leg" x="7.2" y="17.2" width="2.1" height="3.4" rx="0.4" />
          <rect className="pet-inv-leg" x="11" y="17.2" width="2.1" height="3.4" rx="0.4" />
          <rect className="pet-inv-leg" x="14.7" y="17.2" width="2.1" height="3.4" rx="0.4" />
        </g>
      </g>
      {/* eyes */}
      {eyeOpen ? (
        <>
          <rect x="8" y="10.2" width="2.5" height="2.7" rx="0.4" fill="var(--bg-elevated, #fff)" />
          <rect x="13.5" y="10.2" width="2.5" height="2.7" rx="0.4" fill="var(--bg-elevated, #fff)" />
          <rect x="8.7" y="11" width="1.1" height="1.3" rx="0.2" fill="var(--accent)" opacity={0.85} />
          <rect x="14.2" y="11" width="1.1" height="1.3" rx="0.2" fill="var(--accent)" opacity={0.85} />
        </>
      ) : (
        <>
          <rect x="8" y="11.2" width="2.5" height="1.1" rx="0.35" fill="var(--bg-elevated, #fff)" />
          <rect x="13.5" y="11.2" width="2.5" height="1.1" rx="0.35" fill="var(--bg-elevated, #fff)" />
        </>
      )}
      {mood === 'attention' && <AlertDot cx={19.4} cy={5} />}
    </svg>
  )
}

/** Soft cloud bot with glowing terminal face. */
export function CloudForm({ mood, className }: FormSvgProps): React.JSX.Element {
  const uid = useId().replace(/:/g, '')
  return (
    <svg
      className={`pet-form pet-form--cloud ${className ?? ''}`}
      viewBox="0 0 24 24"
      width="56"
      height="56"
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={`${uid}-cloud`} x1="3" y1="4" x2="21" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8ec0ff" />
          <stop offset="0.4" stopColor="#4d8ef5" />
          <stop offset="1" stopColor="#2a5fd0" />
        </linearGradient>
        <linearGradient id={`${uid}-shine`} x1="7" y1="7" x2="14" y2="13" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id={`${uid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.25" />
        </filter>
      </defs>

      <g className="pet-cloud-body" filter={`url(#${uid}-soft)`}>
        <circle cx="7.8" cy="11.2" r="4.35" fill={`url(#${uid}-cloud)`} />
        <circle cx="16.2" cy="10.7" r="4.55" fill={`url(#${uid}-cloud)`} />
        <circle cx="12" cy="8.8" r="5" fill={`url(#${uid}-cloud)`} />
        <ellipse cx="12" cy="14.3" rx="7.7" ry="5.35" fill={`url(#${uid}-cloud)`} />
      </g>
      <ellipse cx="9.5" cy="9.6" rx="2.6" ry="1.6" fill={`url(#${uid}-shine)`} />

      {/* face plate */}
      <rect x="7.2" y="10.3" width="9.6" height="6.6" rx="2.4" fill="#0f1a2e" />
      <rect
        x="7.85"
        y="10.9"
        width="8.3"
        height="5.4"
        rx="1.9"
        fill="#162848"
        stroke="#2a4a7a"
        strokeWidth="0.4"
      />
      {/* scanline */}
      <rect className="pet-cloud-scan" x="8.2" y="11.3" width="7.6" height="0.55" rx="0.2" fill="#3d7cf0" opacity={0.25} />

      {/* >_ */}
      <g
        fill="none"
        stroke="#6dffa8"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="drop-shadow(0 0 2px rgba(109,255,168,0.45))"
      >
        <path d="M9.2 12.5 L11.15 13.75 L9.2 15" />
        <path
          className={mood === 'busy' ? 'pet-form-cursor-blink' : undefined}
          d="M12.5 15.05 h2.55"
          opacity={mood === 'busy' ? 1 : 0.9}
        />
      </g>
      {mood === 'attention' && <AlertDot cx={18.6} cy={6.4} />}
    </svg>
  )
}

export const PET_FORM_COMPONENTS: Record<
  PetFormId,
  (props: FormSvgProps) => React.JSX.Element
> = {
  mark: MarkForm,
  invader: InvaderForm,
  cloud: CloudForm
}
