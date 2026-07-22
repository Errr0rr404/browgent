import { useEffect, useRef, type RefObject } from 'react'

/**
 * Measure the content hole + chrome and report exact pixel insets
 * so WebContentsView aligns with the UI (not hard-coded heights).
 */
export function useChromeMetrics(
  contentRef: RefObject<HTMLElement | null>,
  agentPanelOpen: boolean,
  /** Extra layout deps (sidebar open, etc.) so we remeasure after chrome toggles */
  layoutKey?: string | number | boolean
): void {
  const last = useRef('')

  useEffect(() => {
    if (!window.browgent) return

    const publish = (): void => {
      const hole = contentRef.current
      if (!hole) return

      const rect = hole.getBoundingClientRect()
      // Electron getContentSize is in CSS/logical pixels on most platforms;
      // getBoundingClientRect is also CSS pixels — use CSS pixels.

      const metrics = {
        top: Math.max(0, Math.round(rect.top)),
        left: Math.max(0, Math.round(rect.left)),
        right: Math.max(0, Math.round(window.innerWidth - rect.right)),
        bottom: Math.max(0, Math.round(window.innerHeight - rect.bottom)),
        agentPanelOpen
      }

      const key = JSON.stringify(metrics)
      if (key === last.current) return
      last.current = key
      void window.browgent.setChromeMetrics(metrics)
    }

    publish()

    const ro = new ResizeObserver(() => publish())
    if (contentRef.current) ro.observe(contentRef.current)
    // Also observe body for sidebar/panel transitions that resize the hole
    const body = contentRef.current?.parentElement
    if (body) ro.observe(body)
    window.addEventListener('resize', publish)

    // Re-measure after layout settles (fonts, panel animation)
    const t1 = window.setTimeout(publish, 50)
    const t2 = window.setTimeout(publish, 200)
    const t3 = window.setTimeout(publish, 400)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', publish)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
    }
  }, [contentRef, agentPanelOpen, layoutKey])
}
