export type ThemeId =
  | 'midnight'
  | 'classic'
  | 'paper'
  | 'vintage'
  | 'aurora'
  | 'noir'
  | 'sakura'
  | 'neon-tokyo'
  | 'art-deco'
  | 'deep-ocean'

export interface ThemeDef {
  id: ThemeId
  name: string
  tagline: string
  category: 'modern' | 'classic' | 'vintage' | 'paper' | 'surprise'
  /** Swatch colors for the picker */
  swatches: [string, string, string]
}

export const THEMES: ThemeDef[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    tagline: 'Arc-inspired dark teal — the Browgent default',
    category: 'modern',
    swatches: ['#090a0d', '#3ee0c5', '#5b8cff']
  },
  {
    id: 'classic',
    name: 'Classic Chrome',
    tagline: 'Early-2010s browser chrome: cool gray & blue',
    category: 'classic',
    swatches: ['#e8eaed', '#1a73e8', '#5f6368']
  },
  {
    id: 'paper',
    name: 'Paper Desk',
    tagline: 'Warm parchment, ink, and soft desk light',
    category: 'paper',
    swatches: ['#f4efe4', '#2c2416', '#c4a574']
  },
  {
    id: 'vintage',
    name: 'Vintage Amber',
    tagline: 'Sepia terminal glow from a late-night lab',
    category: 'vintage',
    swatches: ['#1a1410', '#e8a54b', '#8b6914']
  },
  {
    id: 'aurora',
    name: 'Aurora',
    tagline: 'Northern-lights gradients on deep polar night',
    category: 'modern',
    swatches: ['#0a0f1a', '#5eead4', '#c084fc']
  },
  {
    id: 'noir',
    name: 'Film Noir',
    tagline: 'High-contrast black & white with a blood accent',
    category: 'classic',
    swatches: ['#0a0a0a', '#f5f5f5', '#c41e3a']
  },
  {
    id: 'sakura',
    name: 'Sakura Dusk',
    tagline: 'Petal pink on indigo — spring night surprise',
    category: 'surprise',
    swatches: ['#1a1020', '#f9a8d4', '#818cf8']
  },
  {
    id: 'neon-tokyo',
    name: 'Neon Tokyo',
    tagline: 'Rain-soaked alley: magenta, cyan, wet asphalt',
    category: 'surprise',
    swatches: ['#0c0614', '#ff2bd6', '#00f0ff']
  },
  {
    id: 'art-deco',
    name: 'Art Deco',
    tagline: 'Gatsby gold on midnight navy',
    category: 'vintage',
    swatches: ['#0c1222', '#d4af37', '#1e3a5f']
  },
  {
    id: 'deep-ocean',
    name: 'Deep Ocean',
    tagline: 'Abyssal blue with bioluminescent mint',
    category: 'surprise',
    swatches: ['#020b14', '#2dd4bf', '#0369a1']
  }
]

export const DEFAULT_THEME: ThemeId = 'midnight'
export const THEME_STORAGE_KEY = 'browgent.theme'

export function isThemeId(v: string): v is ThemeId {
  return THEMES.some((t) => t.id === v)
}

export function loadStoredTheme(): ThemeId {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (v && isThemeId(v)) return v
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
  // Classic/paper need light color-scheme for native controls
  const light = id === 'classic' || id === 'paper'
  document.documentElement.style.colorScheme = light ? 'light' : 'dark'
}
