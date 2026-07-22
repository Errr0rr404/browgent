import { Minus, Square, X } from 'lucide-react'

interface Props {
  platform: string
}

export function TitleBar({ platform }: Props): React.JSX.Element {
  const showWinControls = platform !== 'darwin'

  return (
    <div
      className="titlebar"
      onDoubleClick={() => {
        // Windows/Linux: double-click title bar to maximize (macOS uses system traffic lights)
        if (platform !== 'darwin') void window.browgent.maximize()
      }}
    >
      <div className="titlebar-brand">
        <div className="brand-mark" aria-hidden />
        <span className="brand-name">Browgent</span>
        <span className="brand-tag">agent</span>
      </div>
      <div className="titlebar-spacer" />
      {showWinControls && (
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
      )}
    </div>
  )
}
