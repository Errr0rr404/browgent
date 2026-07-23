import { useCallback, useEffect, useState } from 'react'
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
    applyTheme(id)
    return id
  })

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setTheme = useCallback((id: ThemeId) => {
    saveTheme(id)
    applyTheme(id)
    setThemeState(id)
  }, [])

  return { theme, setTheme }
}
