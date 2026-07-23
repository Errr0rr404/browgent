/** Modifier key glyph for the current platform (⌘ on macOS, Ctrl elsewhere). */
export function platformModKey(): string {
  const p = window.browgent?.platform
  if (p === 'darwin') return '⌘'
  if (p === 'win32' || p === 'linux') return 'Ctrl'
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)) {
    return '⌘'
  }
  return 'Ctrl'
}

/** CSS class token for platform-specific chrome (win32 → win). */
export function platformCssToken(platformRaw?: string): 'darwin' | 'win' | 'linux' {
  const p = platformRaw ?? window.browgent?.platform ?? 'darwin'
  if (p === 'win32') return 'win'
  if (p === 'darwin') return 'darwin'
  return 'linux'
}
