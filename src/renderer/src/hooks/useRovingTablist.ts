import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject
} from 'react'

interface Options<T> {
  items: T[]
  activeIndex?: number
  orientation?: 'horizontal' | 'vertical' | 'both'
  onActivate: (item: T, index: number) => void
  onClose?: (item: T, index: number) => void
  containerRef: RefObject<HTMLElement | null>
}

interface RovingApi<T> {
  tabPropsFor: (item: T, index: number) => {
    tabIndex: number
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => void
    onFocus: () => void
    onClick: () => void
  }
  setFocusedIndex: (index: number) => void
  focusedIndex: number
}

export function useRovingTablist<T>(opts: Options<T>): RovingApi<T> {
  const [focused, setFocused] = useState<number>(
    opts.activeIndex !== undefined ? opts.activeIndex : 0
  )
  const lastSeenActiveRef = useRef<number | undefined>(opts.activeIndex)
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    const target = opts.activeIndex
    if (target === undefined) return
    if (target === lastSeenActiveRef.current) return
    lastSeenActiveRef.current = target
    setFocused(target)
  }, [opts.activeIndex])

  useEffect(() => {
    if (opts.items.length === 0) {
      if (focused !== 0) setFocused(0)
      return
    }
    if (focused >= opts.items.length) {
      setFocused(Math.max(0, opts.items.length - 1))
    } else if (focused < 0) {
      setFocused(0)
    }
  }, [opts.items.length, focused])

  const focusTabAt = useCallback(
    (i: number) => {
      const root = optsRef.current.containerRef.current
      if (!root) return
      const tabs = root.querySelectorAll<HTMLElement>('[role="tab"]')
      tabs[i]?.focus()
    },
    []
  )

  const setFocusedIndex = useCallback((i: number) => {
    const items = optsRef.current.items
    if (i < 0 || i >= items.length) return
    setFocused(i)
    focusTabAt(i)
  }, [focusTabAt])

  const tabPropsFor = (item: T, index: number) => {
    const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
      const o = optsRef.current.orientation ?? 'horizontal'
      const items = optsRef.current.items
      const onActivate = optsRef.current.onActivate
      const onClose = optsRef.current.onClose
      const n = items.length
      if (n === 0) return

      const isLR = e.key === 'ArrowLeft' || e.key === 'ArrowRight'
      const isUD = e.key === 'ArrowUp' || e.key === 'ArrowDown'

      if (e.key === 'Home') {
        e.preventDefault()
        setFocusedIndex(0)
        onActivate(items[0], 0)
        return
      }
      if (e.key === 'End') {
        e.preventDefault()
        const last = n - 1
        setFocusedIndex(last)
        onActivate(items[last], last)
        return
      }
      const isArrow =
        o === 'both' ? isLR || isUD : o === 'vertical' ? isUD : isLR
      if (isArrow) {
        e.preventDefault()
        const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1
        const next = (index + dir + n) % n
        setFocusedIndex(next)
        onActivate(items[next], next)
        return
      }
      if (
        onClose &&
        (e.key === 'Delete' || e.key === 'Backspace') &&
        e.target === e.currentTarget
      ) {
        e.preventDefault()
        const survivorIndex = index < n - 1 ? index : n - 2
        onClose(items[index], index)
        if (n - 1 <= 0) return
        window.requestAnimationFrame(() => {
          const root = optsRef.current.containerRef.current
          if (!root) return
          const tabs = root.querySelectorAll<HTMLElement>('[role="tab"]')
          const target = tabs[Math.max(0, Math.min(survivorIndex, tabs.length - 1))]
          if (target) {
            target.focus()
            const newItems = optsRef.current.items
            const i = Math.max(0, Math.min(survivorIndex, newItems.length - 1))
            optsRef.current.onActivate(newItems[i], i)
          }
        })
      }
    }

    return {
      tabIndex: focused === index ? 0 : -1,
      onKeyDown: handleKeyDown,
      onFocus: () => setFocused(index),
      onClick: () => {
        setFocused(index)
        optsRef.current.onActivate(item, index)
      }
    }
  }

  return {
    tabPropsFor,
    setFocusedIndex,
    focusedIndex: focused
  }
}
