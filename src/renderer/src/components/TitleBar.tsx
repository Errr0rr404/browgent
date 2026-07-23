import { Minus, Square, X } from 'lucide-react'

interface Props {
  platform: string
}

/** Windows/Linux only — macOS uses system traffic lights on the first chrome row. */
export function TitleBar({ platform }: Props): React.JSX.Element | null {
  if (platform === 'darwin') return null

  return (
    <div
      className="titlebar titlebar-controls-only"
      onDoubleClick={() => {
        void window.browgent.maximize()
      }}
    >
      <div className="titlebar-spacer" />
      <div className="window-controls">
        <button type="button" aria-label="Minimize" onClick={() => void window.browgent.minimize()}>
          <Minus size={14} strokeWidth={1.75} />
        </button>
        <button type="button" aria-label="Maximize" onClick={() => void window.browgent.maximize()}>
          <Square size={12} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="danger"
          aria-label="Close"
          onClick={() => void window.browgent.close()}
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}
