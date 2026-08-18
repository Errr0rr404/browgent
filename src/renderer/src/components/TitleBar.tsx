import { useEffect, useState } from 'react'
import { Minus, Square, SquareStack, X } from 'lucide-react'

interface Props {
  platform: string
}

/** Windows/Linux only — macOS uses system traffic lights on the first chrome row. */
export function TitleBar({ platform }: Props): React.JSX.Element | null {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!window.browgent?.isMaximized) return
    void window.browgent.isMaximized().then(setMaximized).catch(() => {
      /* ignore */
    })
    return window.browgent.onMaximizedChanged?.(setMaximized)
  }, [])

  if (platform === 'darwin') return null

  const toggleMaximize = (): void => {
    void window.browgent.maximize()
  }

  return (
    <div className="titlebar titlebar-controls-only" onDoubleClick={toggleMaximize}>
      <div className="titlebar-spacer" />
      <div className="window-controls">
        <button type="button" aria-label="Minimize" onClick={() => void window.browgent.minimize()}>
          <Minus size={14} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label={maximized ? 'Restore' : 'Maximize'}
          title={maximized ? 'Restore' : 'Maximize'}
          onClick={toggleMaximize}
        >
          {maximized ? (
            <SquareStack size={12} strokeWidth={1.75} />
          ) : (
            <Square size={12} strokeWidth={1.75} />
          )}
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
