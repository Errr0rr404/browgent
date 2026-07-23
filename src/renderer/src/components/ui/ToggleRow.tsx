interface SwitchProps {
  on: boolean
  label: string
  onToggle: () => void
}

export function Switch({ on, label, onToggle }: SwitchProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={`settings-switch${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
    >
      <span className="settings-switch-knob" />
    </button>
  )
}

interface ToggleRowProps {
  label: string
  sub: string
  on: boolean
  onToggle: () => void
  last?: boolean
}

export function ToggleRow({
  label,
  sub,
  on,
  onToggle,
  last
}: ToggleRowProps): React.JSX.Element {
  return (
    <div className={`settings-toggle-row${last ? ' settings-toggle-row-last' : ''}`}>
      <span className="settings-toggle-text">
        <span className="settings-toggle-label">{label}</span>
        <span className="settings-toggle-sub">{sub}</span>
      </span>
      <Switch on={on} label={label} onToggle={onToggle} />
    </div>
  )
}
