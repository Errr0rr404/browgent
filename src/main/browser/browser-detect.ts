/**
 * Detect installed browsers and their default profile paths (local disk only).
 */
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { BrowserId, DetectedBrowser } from '../../shared/import-types'

interface BrowserSpec {
  id: BrowserId
  name: string
  /** Relative to home on each platform */
  profiles: Partial<Record<NodeJS.Platform, string[]>>
  /** App presence markers (any exists → installed) */
  apps: Partial<Record<NodeJS.Platform, string[]>>
  chromium: boolean
  passwords: boolean
  notes?: string
}

const SPECS: BrowserSpec[] = [
  {
    id: 'chrome',
    name: 'Google Chrome',
    chromium: true,
    passwords: true,
    apps: {
      darwin: ['/Applications/Google Chrome.app'],
      win32: [],
      linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']
    },
    profiles: {
      darwin: ['Library/Application Support/Google/Chrome/Default'],
      win32: ['AppData/Local/Google/Chrome/User Data/Default'],
      linux: ['.config/google-chrome/Default']
    }
  },
  {
    id: 'chrome-beta',
    name: 'Chrome Beta',
    chromium: true,
    passwords: true,
    apps: {
      darwin: ['/Applications/Google Chrome Beta.app'],
      win32: [],
      linux: ['/usr/bin/google-chrome-beta']
    },
    profiles: {
      darwin: ['Library/Application Support/Google/Chrome Beta/Default'],
      win32: ['AppData/Local/Google/Chrome Beta/User Data/Default'],
      linux: ['.config/google-chrome-beta/Default']
    }
  },
  {
    id: 'edge',
    name: 'Microsoft Edge',
    chromium: true,
    passwords: true,
    apps: {
      darwin: ['/Applications/Microsoft Edge.app'],
      win32: [],
      linux: ['/usr/bin/microsoft-edge']
    },
    profiles: {
      darwin: ['Library/Application Support/Microsoft Edge/Default'],
      win32: ['AppData/Local/Microsoft/Edge/User Data/Default'],
      linux: ['.config/microsoft-edge/Default']
    }
  },
  {
    id: 'brave',
    name: 'Brave',
    chromium: true,
    passwords: true,
    apps: {
      darwin: ['/Applications/Brave Browser.app'],
      win32: [],
      linux: ['/usr/bin/brave-browser', '/usr/bin/brave']
    },
    profiles: {
      darwin: ['Library/Application Support/BraveSoftware/Brave-Browser/Default'],
      win32: ['AppData/Local/BraveSoftware/Brave-Browser/User Data/Default'],
      linux: ['.config/BraveSoftware/Brave-Browser/Default']
    }
  },
  {
    id: 'arc',
    name: 'Arc',
    chromium: true,
    passwords: true,
    apps: {
      darwin: ['/Applications/Arc.app'],
      win32: [],
      linux: []
    },
    profiles: {
      darwin: ['Library/Application Support/Arc/User Data/Default'],
      win32: ['AppData/Local/Packages/TheBrowserCompany.Arc_*/LocalCache/Local/Arc/User Data/Default'],
      linux: []
    }
  },
  {
    id: 'vivaldi',
    name: 'Vivaldi',
    chromium: true,
    passwords: true,
    apps: {
      darwin: ['/Applications/Vivaldi.app'],
      win32: [],
      linux: ['/usr/bin/vivaldi']
    },
    profiles: {
      darwin: ['Library/Application Support/Vivaldi/Default'],
      win32: ['AppData/Local/Vivaldi/User Data/Default'],
      linux: ['.config/vivaldi/Default']
    }
  },
  {
    id: 'opera',
    name: 'Opera',
    chromium: true,
    passwords: true,
    apps: {
      darwin: ['/Applications/Opera.app'],
      win32: [],
      linux: ['/usr/bin/opera']
    },
    profiles: {
      darwin: ['Library/Application Support/com.operasoftware.Opera'],
      win32: ['AppData/Roaming/Opera Software/Opera Stable'],
      linux: ['.config/opera']
    }
  },
  {
    id: 'chromium',
    name: 'Chromium',
    chromium: true,
    passwords: true,
    apps: {
      darwin: ['/Applications/Chromium.app'],
      win32: [],
      linux: ['/usr/bin/chromium', '/usr/bin/chromium-browser']
    },
    profiles: {
      darwin: ['Library/Application Support/Chromium/Default'],
      win32: ['AppData/Local/Chromium/User Data/Default'],
      linux: ['.config/chromium/Default']
    }
  },
  {
    id: 'firefox',
    name: 'Firefox',
    chromium: false,
    passwords: false,
    notes: 'History and bookmarks from places.sqlite. Passwords use NSS (not yet).',
    apps: {
      darwin: ['/Applications/Firefox.app'],
      win32: [],
      linux: ['/usr/bin/firefox']
    },
    profiles: {
      darwin: ['Library/Application Support/Firefox/Profiles'],
      win32: ['AppData/Roaming/Mozilla/Firefox/Profiles'],
      linux: ['.mozilla/firefox']
    }
  },
  {
    id: 'safari',
    name: 'Safari',
    chromium: false,
    passwords: false,
    notes:
      'macOS only. History may need Full Disk Access for Browgent. Bookmarks/passwords stay in Safari/Keychain.',
    apps: {
      darwin: ['/Applications/Safari.app', '/System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app'],
      win32: [],
      linux: []
    },
    profiles: {
      darwin: ['Library/Safari'],
      win32: [],
      linux: []
    }
  }
]

function resolveExisting(relPaths: string[]): string | null {
  const home = homedir()
  for (const rel of relPaths) {
    // Simple glob-ish: skip wildcards for now
    if (rel.includes('*')) continue
    const full = join(home, rel)
    if (existsSync(full)) return full
  }
  return null
}

function anyExists(paths: string[]): boolean {
  return paths.some((p) => existsSync(p))
}

export function detectInstalledBrowsers(): DetectedBrowser[] {
  const platform = process.platform as NodeJS.Platform
  const out: DetectedBrowser[] = []

  for (const spec of SPECS) {
    const appMarkers = spec.apps[platform] ?? []
    const profileRels = spec.profiles[platform] ?? []
    const profilePath = resolveExisting(profileRels)
    const installed =
      anyExists(appMarkers) ||
      profilePath != null ||
      // Windows: rely on profile path under %LOCALAPPDATA% via home
      (platform === 'win32' && profilePath != null)

    if (!installed && platform !== 'darwin' && platform !== 'linux' && platform !== 'win32') {
      continue
    }

    // Only list browsers that appear installed
    if (!installed) continue

    const chromium = spec.chromium
    out.push({
      id: spec.id,
      name: spec.name,
      installed: true,
      profilePath,
      supports: {
        history: chromium || spec.id === 'firefox' || spec.id === 'safari',
        // Safari bookmarks stay in a proprietary plist — not imported yet
        bookmarks: chromium || spec.id === 'firefox',
        passwords: chromium && spec.passwords
      },
      notes: spec.notes
    })
  }

  // Sort: Chrome family first
  const order: BrowserId[] = [
    'chrome',
    'arc',
    'edge',
    'brave',
    'chrome-beta',
    'vivaldi',
    'opera',
    'chromium',
    'firefox',
    'safari'
  ]
  out.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
  return out
}

export function getBrowserSpec(id: BrowserId): BrowserSpec | undefined {
  return SPECS.find((s) => s.id === id)
}

/** Safe Storage service names for Chromium password decryption */
export function chromiumKeychainAccount(id: BrowserId): { service: string; account: string } | null {
  switch (id) {
    case 'chrome':
    case 'chrome-beta':
    case 'chrome-canary':
      return { service: 'Chrome Safe Storage', account: 'Chrome' }
    case 'edge':
      return { service: 'Microsoft Edge Safe Storage', account: 'Microsoft Edge' }
    case 'brave':
      return { service: 'Brave Safe Storage', account: 'Brave' }
    case 'arc':
      return { service: 'Arc Safe Storage', account: 'Arc' }
    case 'chromium':
      return { service: 'Chromium Safe Storage', account: 'Chromium' }
    case 'vivaldi':
      return { service: 'Vivaldi Safe Storage', account: 'Vivaldi' }
    case 'opera':
      return { service: 'Opera Safe Storage', account: 'Opera' }
    default:
      return null
  }
}
