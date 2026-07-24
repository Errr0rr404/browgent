/** Browser import + detection types (main ↔ renderer). */

export type BrowserId =
  | 'chrome'
  | 'chrome-beta'
  | 'chrome-canary'
  | 'edge'
  | 'brave'
  | 'arc'
  | 'chromium'
  | 'vivaldi'
  | 'opera'
  | 'firefox'
  | 'safari'

export const BROWSER_IDS: readonly BrowserId[] = [
  'chrome',
  'chrome-beta',
  'chrome-canary',
  'edge',
  'brave',
  'arc',
  'chromium',
  'vivaldi',
  'opera',
  'firefox',
  'safari'
] as const

export function isBrowserId(v: unknown): v is BrowserId {
  return typeof v === 'string' && (BROWSER_IDS as readonly string[]).includes(v)
}

export type ImportKind = 'history' | 'bookmarks' | 'passwords'

export interface DetectedBrowser {
  id: BrowserId
  name: string
  installed: boolean
  /** Profile path used for import (Default / primary) */
  profilePath: string | null
  supports: {
    history: boolean
    bookmarks: boolean
    passwords: boolean
  }
  notes?: string
}

export interface ImportOptions {
  browserId: BrowserId
  history?: boolean
  bookmarks?: boolean
  passwords?: boolean
  /** Max history rows to import (default 2000) */
  historyLimit?: number
}

export interface ImportResult {
  browserId: BrowserId
  browserName: string
  historyImported: number
  bookmarksImported: number
  passwordsImported: number
  passwordsSkipped: number
  warnings: string[]
  errors: string[]
  durationMs: number
}
