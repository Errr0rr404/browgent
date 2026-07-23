export type ThemeId =
  | 'midnight'
  | 'terminal'
  | 'matrix'
  | 'nord'
  | 'solarized'
  | 'eink'
  | 'synthwave'
  | 'brutalist'

export type ThemeCategory = 'signature' | 'dev' | 'calm' | 'loud'

export interface ThemeDef {
  id: ThemeId
  name: string
  tagline: string
  category: ThemeCategory
  /** Swatch colors for the picker / settings cards */
  swatches: [string, string, string]
}

export const THEMES: ThemeDef[] = [
  {
    id: 'eink',
    name: 'E-Ink',
    tagline: 'Paper white, serif ink — the Browgent default',
    category: 'signature',
    swatches: ['#f4f3ee', '#191813', '#8b887c']
  },
  {
    id: 'midnight',
    name: 'Midnight',
    tagline: 'Arc-teal dark chrome',
    category: 'signature',
    swatches: ['#090a0d', '#3ee0c5', '#5b8cff']
  },
  {
    id: 'terminal',
    name: 'Terminal',
    tagline: 'Editor greens, mono everything',
    category: 'dev',
    swatches: ['#0d1117', '#3fb950', '#58a6ff']
  },
  {
    id: 'matrix',
    name: 'Matrix',
    tagline: 'Phosphor rain on CRT black',
    category: 'dev',
    swatches: ['#000401', '#00ff41', '#2e7a4c']
  },
  {
    id: 'nord',
    name: 'Nord',
    tagline: 'Arctic blues, quiet aurora',
    category: 'calm',
    swatches: ['#2e3440', '#88c0d0', '#b48ead']
  },
  {
    id: 'solarized',
    name: 'Solarized',
    tagline: 'Lab-calibrated cyan on deep sea',
    category: 'calm',
    swatches: ['#002b36', '#2aa198', '#b58900']
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    tagline: 'Sunset grid, chrome and neon',
    category: 'loud',
    swatches: ['#0d0722', '#ff6ec7', '#00e5ff']
  },
  {
    id: 'brutalist',
    name: 'Brutalist',
    tagline: 'Stark mono, hard black lines',
    category: 'loud',
    swatches: ['#ececec', '#000000', '#d00000']
  }
]

export const DEFAULT_THEME: ThemeId = 'eink'
export const THEME_STORAGE_KEY = 'browgent.theme'

/** Legacy theme ids → design-system replacements */
const LEGACY_THEME_MAP: Record<string, ThemeId> = {
  classic: 'eink',
  paper: 'eink',
  vintage: 'solarized',
  aurora: 'nord',
  noir: 'brutalist',
  sakura: 'synthwave',
  'neon-tokyo': 'synthwave',
  'art-deco': 'midnight',
  'deep-ocean': 'solarized'
}

export function isThemeId(v: string): v is ThemeId {
  return THEMES.some((t) => t.id === v)
}

export function resolveThemeId(v: string): ThemeId | null {
  if (isThemeId(v)) return v
  const migrated = LEGACY_THEME_MAP[v]
  return migrated ?? null
}

export function loadStoredTheme(): ThemeId {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (!v) return DEFAULT_THEME
    const resolved = resolveThemeId(v)
    if (resolved) {
      // Persist migration away from legacy ids
      if (v !== resolved) saveTheme(resolved)
      return resolved
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME
}

export function saveTheme(id: ThemeId): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

export function applyTheme(id: ThemeId): void {
  document.documentElement.setAttribute('data-theme', id)
  // E-Ink / Brutalist need light color-scheme for native controls
  const light = id === 'eink' || id === 'brutalist'
  document.documentElement.style.colorScheme = light ? 'light' : 'dark'
}
