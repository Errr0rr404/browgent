import { useEffect, useMemo, useState } from 'react'
import { Globe } from 'lucide-react'

interface Props {
  src?: string
  title: string
  size?: number
  className?: string
  small?: boolean
}

/** Many sites don't serve /favicon.ico — fall back to a host-keyed icon service before giving up. */
function fallbackFaviconUrl(src: string): string | null {
  try {
    const host = new URL(src).hostname
    return host ? `https://icons.duckduckgo.com/ip3/${host}.ico` : null
  } catch {
    return null
  }
}

export function Favicon({ src, title, size = 14, className, small }: Props): React.JSX.Element {
  const [attempt, setAttempt] = useState(0)
  const fallback = useMemo(() => (src ? fallbackFaviconUrl(src) : null), [src])

  useEffect(() => {
    setAttempt(0)
  }, [src])

  const effectiveSrc = attempt === 0 ? src : attempt === 1 ? (fallback ?? undefined) : undefined

  if (!effectiveSrc) {
    if (className === 'tab-favicon') {
      return (
        <span className="tab-favicon placeholder" aria-hidden title={title}>
          <Globe size={Math.max(11, size)} strokeWidth={1.75} />
        </span>
      )
    }
    if (small) {
      return (
        <span
          className={`arc-favicon-fallback sm${className ? ` ${className}` : ''}`}
          aria-hidden
          title={title}
        >
          <Globe size={Math.max(11, size - 3)} strokeWidth={1.75} />
        </span>
      )
    }
    return (
      <span
        className={`arc-favicon-fallback${className ? ` ${className}` : ''}`}
        aria-hidden
        title={title}
        style={{ width: size, height: size }}
      >
        <Globe size={Math.max(11, size - 4)} strokeWidth={1.75} />
      </span>
    )
  }
  return (
    <img
      className={className ?? 'arc-favicon'}
      src={effectiveSrc}
      alt=""
      width={size}
      height={size}
      draggable={false}
      onError={() => setAttempt((a) => (a === 0 && fallback ? 1 : 2))}
      title={title}
    />
  )
}
