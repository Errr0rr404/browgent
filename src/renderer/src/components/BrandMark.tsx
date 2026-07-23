interface Props {
  size?: number
  className?: string
  strokeWidth?: number
}

/** Shared browgent mark — rounded square + accent-2 orb (design system). */
export function BrandMark({
  size = 18,
  className,
  strokeWidth = 2
}: Props): React.JSX.Element {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="5.5"
        stroke="var(--accent)"
        strokeWidth={strokeWidth}
      />
      <circle cx="14.4" cy="14.4" r="3" fill="var(--accent-2)" />
    </svg>
  )
}
