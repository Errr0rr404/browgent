import type { PetSkinProps } from './types'

/** Shared face helpers — eyes + mood expression */
function Eyes({
  mood,
  cx = 12,
  cy = 11,
  color = 'currentColor',
  r = 1.35
}: {
  mood: PetSkinProps['mood']
  cx?: number
  cy?: number
  color?: string
  r?: number
}): React.JSX.Element {
  const open = mood !== 'busy'
  const gap = 3.2
  return (
    <g className={`pet-eyes pet-eyes--${mood}`} fill={color}>
      {open ? (
        <>
          <circle cx={cx - gap} cy={cy} r={r} />
          <circle cx={cx + gap} cy={cy} r={r} />
        </>
      ) : (
        <>
          <path
            d={`M${cx - gap - 1.4} ${cy} h2.8`}
            stroke={color}
            strokeWidth={1.4}
            strokeLinecap="round"
            fill="none"
          />
          <path
            d={`M${cx + gap - 1.4} ${cy} h2.8`}
            stroke={color}
            strokeWidth={1.4}
            strokeLinecap="round"
            fill="none"
          />
        </>
      )}
      {mood === 'attention' && (
        <circle className="pet-alert-dot" cx={cx + 7.5} cy={cy - 6} r={1.6} fill="var(--danger, #e55)" />
      )}
    </g>
  )
}

function Frame({
  size,
  className,
  children
}: {
  size: number
  className: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <svg
      className={`pet-skin ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      {children}
    </svg>
  )
}

/** E-Ink — soft ink blot */
export function EinkPet({ mood, size }: PetSkinProps): React.JSX.Element {
  return (
    <Frame size={size} className="pet-skin--eink">
      <ellipse className="pet-body" cx="12" cy="13.5" rx="8.2" ry="7.2" fill="#191813" opacity={0.92} />
      <ellipse cx="12" cy="12.2" rx="6.5" ry="5.6" fill="#2a2820" />
      <Eyes mood={mood} color="#f4f3ee" cy={11.2} />
      <path
        className="pet-mouth"
        d={mood === 'attention' ? 'M10 14.2 Q12 16 14 14.2' : 'M10.5 14.4 Q12 15.2 13.5 14.4'}
        stroke="#f4f3ee"
        strokeWidth={1.1}
        strokeLinecap="round"
        fill="none"
        opacity={0.85}
      />
    </Frame>
  )
}

/** Midnight — teal orb familiar */
export function MidnightPet({ mood, size }: PetSkinProps): React.JSX.Element {
  return (
    <Frame size={size} className="pet-skin--midnight">
      <circle className="pet-glow" cx="12" cy="12" r="10" fill="rgba(62,224,197,0.18)" />
      <circle className="pet-body" cx="12" cy="12" r="8" fill="#151922" stroke="#3ee0c5" strokeWidth={1.4} />
      <circle cx="14.5" cy="14" r="3.2" fill="#3ee0c5" opacity={0.9} />
      <Eyes mood={mood} color="#f2f4f8" cy={10.5} />
    </Frame>
  )
}

/** Terminal — cursor block */
export function TerminalPet({ mood, size }: PetSkinProps): React.JSX.Element {
  return (
    <Frame size={size} className="pet-skin--terminal">
      <rect
        className="pet-body"
        x="4"
        y="5"
        width="16"
        height="14"
        rx="2"
        fill="#0d1117"
        stroke="#3fb950"
        strokeWidth={1.5}
      />
      <Eyes mood={mood} color="#3fb950" cy={11} r={1.2} />
      <rect
        className="pet-cursor"
        x="9"
        y="15"
        width="6"
        height="1.6"
        rx="0.4"
        fill="#3fb950"
        opacity={mood === 'busy' ? 1 : 0.7}
      />
    </Frame>
  )
}

/** Matrix — glyph node */
export function MatrixPet({ mood, size }: PetSkinProps): React.JSX.Element {
  return (
    <Frame size={size} className="pet-skin--matrix">
      <circle className="pet-body" cx="12" cy="12" r="8.5" fill="#001a08" stroke="#00ff41" strokeWidth={1.2} />
      <text
        x="12"
        y="10.2"
        textAnchor="middle"
        fill="#00ff41"
        fontSize="5.5"
        fontFamily="ui-monospace, monospace"
        opacity={0.85}
      >
        01
      </text>
      <Eyes mood={mood} color="#00ff41" cy={13.5} r={1.1} />
      {mood === 'busy' && (
        <circle className="pet-rain" cx="18" cy="6" r="1" fill="#00ff41" opacity={0.7} />
      )}
    </Frame>
  )
}

/** Nord — arctic rounded fox-like */
export function NordPet({ mood, size }: PetSkinProps): React.JSX.Element {
  return (
    <Frame size={size} className="pet-skin--nord">
      <ellipse className="pet-body" cx="12" cy="13" rx="8" ry="7" fill="#3b4252" />
      <path d="M6 9 L8.5 4.5 L11 9 Z" fill="#4c566a" />
      <path d="M13 9 L15.5 4.5 L18 9 Z" fill="#4c566a" />
      <ellipse cx="12" cy="13" rx="6" ry="5.2" fill="#434c5e" />
      <Eyes mood={mood} color="#eceff4" cy={12} />
      <ellipse cx="12" cy="15.5" rx="2" ry="1.2" fill="#88c0d0" opacity={0.7} />
    </Frame>
  )
}

/** Solarized — sun disk */
export function SolarizedPet({ mood, size }: PetSkinProps): React.JSX.Element {
  return (
    <Frame size={size} className="pet-skin--solarized">
      <circle className="pet-body" cx="12" cy="12" r="7.5" fill="#073642" stroke="#2aa198" strokeWidth={1.3} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const a = (deg * Math.PI) / 180
        const x1 = 12 + Math.cos(a) * 8.4
        const y1 = 12 + Math.sin(a) * 8.4
        const x2 = 12 + Math.cos(a) * 10.2
        const y2 = 12 + Math.sin(a) * 10.2
        return (
          <line
            key={deg}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#b58900"
            strokeWidth={1.2}
            strokeLinecap="round"
            opacity={0.85}
          />
        )
      })}
      <Eyes mood={mood} color="#eee8d5" cy={11.5} />
    </Frame>
  )
}

/** Synthwave — neon cat */
export function SynthwavePet({ mood, size }: PetSkinProps): React.JSX.Element {
  return (
    <Frame size={size} className="pet-skin--synthwave">
      <circle className="pet-glow" cx="12" cy="13" r="9.5" fill="rgba(255,110,199,0.15)" />
      <path d="M5 10 L7.5 4 L10.5 10 Z" fill="#ff6ec7" />
      <path d="M13.5 10 L16.5 4 L19 10 Z" fill="#00e5ff" />
      <ellipse className="pet-body" cx="12" cy="13.5" rx="8" ry="7" fill="#1e123f" stroke="#ff6ec7" strokeWidth={1.2} />
      <Eyes mood={mood} color="#00e5ff" cy={12.2} />
      <path d="M10 16 Q12 17.5 14 16" stroke="#ff6ec7" strokeWidth={1.1} fill="none" strokeLinecap="round" />
    </Frame>
  )
}

/** Brutalist — stamp square */
export function BrutalistPet({ mood, size }: PetSkinProps): React.JSX.Element {
  return (
    <Frame size={size} className="pet-skin--brutalist">
      <rect
        className="pet-body"
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        fill="#ececec"
        stroke="#000"
        strokeWidth={2}
      />
      <Eyes mood={mood} color="#000" cy={11} r={1.5} />
      <rect x="8" y="15" width="8" height="2" fill="#000" />
      {mood === 'attention' && <rect x="18" y="3" width="3" height="3" fill="#d00000" />}
    </Frame>
  )
}
