import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_THEME,
  type ThemeId,
  applyTheme,
  loadStoredTheme,
  saveTheme
} from '../themes/themes'

export function useTheme(): {
  theme: ThemeId
  setTheme: (id: ThemeId) => void
} {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    if (typeof document === 'undefined') return DEFAULT_THEME
    const id = loadStoredTheme()
    applyTheme(id) // apply synchronously before first paint (avoids a theme flash)
    return id
  })

  // The lazy initializer already applied the stored theme before paint, so skip the
  // effect's first run to avoid applying the same theme twice on mount. Later theme
  // changes still flow through this effect.
  const didInitialApply = useRef(true)
  useEffect(() => {
    if (didInitialApply.current) {
      didInitialApply.current = false
      return
    }
    applyTheme(theme)
  }, [theme])

  const setTheme = useCallback((id: ThemeId) => {
    saveTheme(id)
    applyTheme(id)
    setThemeState(id)
  }, [])

  return { theme, setTheme }
}
