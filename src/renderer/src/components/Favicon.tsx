import { useState } from 'react'
import { Globe } from 'lucide-react'

interface Props {
  src?: string
  title: string
  size?: number
  className?: string
  small?: boolean
}

export function Favicon({ src, title, size = 14, className, small }: Props): React.JSX.Element {
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
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
      src={src}
      alt=""
      width={size}
      height={size}
      draggable={false}
      onError={() => setBroken(true)}
      title={title}
    />
  )
}
