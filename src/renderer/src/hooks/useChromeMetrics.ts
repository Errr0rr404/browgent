import { useEffect, useRef, type RefObject } from 'react'

/**
 * Measure the content hole + chrome and report exact pixel insets
 * so WebContentsView aligns with the UI (not hard-coded heights).
 */
export function useChromeMetrics(
  contentRef: RefObject<HTMLElement | null>,
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
        bottom: Math.max(0, Math.round(window.innerHeight - rect.bottom))
      }

      const key = JSON.stringify(metrics)
      if (key === last.current) return
      last.current = key
      window.browgent.setChromeMetrics(metrics).catch(() => {
        /* ignore */
      })
    }

    const ro = new ResizeObserver(() => publish())
    const targets: Element[] = []
    if (contentRef.current) {
      ro.observe(contentRef.current)
      targets.push(contentRef.current)
      let p: HTMLElement | null = contentRef.current.parentElement
      while (p && targets.length < 6) {
        ro.observe(p)
        targets.push(p)
        p = p.parentElement
      }
    }
    window.addEventListener('resize', publish)

    const onFontsReady = (): void => publish()
    if (document.fonts && 'ready' in document.fonts) {
      document.fonts.ready.then(onFontsReady).catch(() => {
        /* ignore */
      })
    }

    const t1 = window.setTimeout(publish, 0)
    const t2 = window.setTimeout(publish, 50)
    const t3 = window.setTimeout(publish, 200)
    const t4 = window.setTimeout(publish, 400)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', publish)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
      window.clearTimeout(t4)
    }
  }, [contentRef, layoutKey])
}
