import { app, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { HOME_URL, PAGE_PARTITION, TabManager } from './browser/tab-manager'
import { PetOverlay, type PetMood } from './browser/pet-overlay'
import { HistoryStore } from './browser/history-store'
import { DownloadManager } from './browser/download-manager'
import { AgentSession } from './agent/session'
import { loadEnvFile } from './agent/env'
import { getMcpStatus, mcpBridge } from './mcp/server'
import {
  buildTractionPacket,
  getMetrics,
  recordAgentRun,
  recordDemoRun,
  recordLaunch,
  recordRecipeRun,
  recordTrajectoryExport,
  setTelemetryOptIn
} from './metrics/store'
import { listDetectedBrowsers, importFromBrowser } from './browser/browser-import'
import { getPasswordVault } from './browser/password-vault'
import { getProfileStore } from './browser/profile-store'
import { getPrivacyStore } from './browser/privacy-store'
import { wireRequestFilter } from './browser/request-filter'
import { isBrowserId, type ImportOptions } from '../shared/import-types'
import type { UserProfile } from '../shared/profile'
import {
  isCookieBannerMode,
  sanitizePrivacyPrefs,
  type PrivacyPrefs
} from '../shared/privacy-prefs'
import { applyCdpCommandLine, getCdpStatus } from './browser/cdp-endpoint'
import { applyGuestIdentityEarly, applyGuestPageSessionIdentity } from './browser/guest-identity'
import { getRuntimeFlags } from './browser/runtime-flags'
import {
  IPC,
  type BrowserChromeMetrics,
  type FindInPageOptions,
  type NavigatePayload,
  type TabId
} from '../shared/types'
import type { AgentMode, AgentPolicy } from '../shared/policies'

const TAB_ID_MAX = 64
const URL_MAX = 4096
const PROMPT_MAX = 20000
const HOST_MAX = 253
const PATTERN_MAX = 64
const MAX_HOSTS = 200
const MAX_PATTERNS = 100
const METRIC_MIN = 0
const METRIC_MAX = 10000
const MAX_STEPS_MIN = 1
const MAX_STEPS_MAX = 1000

function reject(field: string, detail: string): never {
  throw new Error(`Invalid IPC arg: ${field} ${detail}`)
}

function ensureString(v: unknown, field: string, max: number): string {
  if (typeof v !== 'string') reject(field, 'must be a string')
  if ((v as string).length > max) reject(field, `exceeds max length ${max}`)
  return v as string
}

function ensureOptionalString(v: unknown, field: string, max: number): string | undefined {
  if (v === undefined || v === null) return undefined
  return ensureString(v, field, max)
}

function ensureTabId(v: unknown, field: string): TabId {
  return ensureString(v, field, TAB_ID_MAX)
}

function ensureOptionalTabId(v: unknown, field: string): TabId | undefined {
  if (v === undefined || v === null) return undefined
  return ensureTabId(v, field)
}

function ensureBoolean(v: unknown, field: string): boolean {
  if (typeof v !== 'boolean') reject(field, 'must be boolean')
  return v
}

function ensureFiniteNumber(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) reject(field, 'must be a finite number')
  return v
}

function ensureBoundedNumber(v: unknown, field: string, min: number, max: number): number {
  const n = ensureFiniteNumber(v, field)
  if (n < min || n > max) reject(field, `must be in [${min}, ${max}]`)
  return n
}

function ensureEnum<T extends string>(v: unknown, values: readonly T[], field: string): T {
  if (typeof v !== 'string' || !(values as readonly string[]).includes(v)) {
    reject(field, `must be one of ${values.join('|')}`)
  }
  return v as T
}

function ensureStringArray(v: unknown, field: string, maxItems: number, maxItem: number): string[] {
  if (!Array.isArray(v)) reject(field, 'must be an array')
  if ((v as unknown[]).length > maxItems) reject(field, `exceeds max items ${maxItems}`)
  return (v as unknown[]).map((item, i) => ensureString(item, `${field}[${i}]`, maxItem))
}

function ensureChromeMetrics(v: unknown): BrowserChromeMetrics {
  if (!v || typeof v !== 'object') reject('chromeMetrics', 'must be an object')
  const m = v as Record<string, unknown>
  return {
    top: ensureBoundedNumber(m['top'], 'chromeMetrics.top', METRIC_MIN, METRIC_MAX),
    right: ensureBoundedNumber(m['right'], 'chromeMetrics.right', METRIC_MIN, METRIC_MAX),
    bottom: ensureBoundedNumber(m['bottom'], 'chromeMetrics.bottom', METRIC_MIN, METRIC_MAX),
    left: ensureBoundedNumber(m['left'], 'chromeMetrics.left', METRIC_MIN, METRIC_MAX)
  }
}

function ensureNavigatePayload(v: unknown): NavigatePayload {
  if (!v || typeof v !== 'object') reject('navigate', 'must be an object')
  const p = v as Record<string, unknown>
  const payload: NavigatePayload = {
    input: ensureString(p['input'], 'navigate.input', URL_MAX)
  }
  if (p['tabId'] !== undefined && p['tabId'] !== null) {
    payload.tabId = ensureTabId(p['tabId'], 'navigate.tabId')
  }
  return payload
}

const AGENT_MODES: readonly AgentMode[] = ['act', 'research', 'watch']
const DRIVER_MODES = ['dom', 'cdp'] as const

function ensureAgentMode(v: unknown): AgentMode {
  return ensureEnum(v, AGENT_MODES, 'agent.mode')
}

function ensureDriverMode(v: unknown): 'dom' | 'cdp' {
  return ensureEnum(v, DRIVER_MODES, 'driver.mode')
}

function ensureAgentPolicy(v: unknown): Partial<AgentPolicy> {
  if (!v || typeof v !== 'object') reject('policy', 'must be an object')
  const p = v as Record<string, unknown>
  const out: Partial<AgentPolicy> = {}

  if ('allowHosts' in p) {
    out.allowHosts = ensureStringArray(p['allowHosts'], 'policy.allowHosts', MAX_HOSTS, HOST_MAX)
  }
  if ('blockHosts' in p) {
    out.blockHosts = ensureStringArray(p['blockHosts'], 'policy.blockHosts', MAX_HOSTS, HOST_MAX)
  }
  if ('maxSteps' in p) {
    out.maxSteps = ensureBoundedNumber(p['maxSteps'], 'policy.maxSteps', MAX_STEPS_MIN, MAX_STEPS_MAX)
  }
  if ('confirmCrossHost' in p) out.confirmCrossHost = ensureBoolean(p['confirmCrossHost'], 'policy.confirmCrossHost')
  if ('confirmSensitiveClicks' in p) {
    out.confirmSensitiveClicks = ensureBoolean(p['confirmSensitiveClicks'], 'policy.confirmSensitiveClicks')
  }
  if ('sensitiveClickPatterns' in p) {
    out.sensitiveClickPatterns = ensureStringArray(p['sensitiveClickPatterns'], 'policy.sensitiveClickPatterns', MAX_PATTERNS, PATTERN_MAX)
  }
  if ('pauseOnAskHuman' in p) out.pauseOnAskHuman = ensureBoolean(p['pauseOnAskHuman'], 'policy.pauseOnAskHuman')
  if ('researchOnly' in p) out.researchOnly = ensureBoolean(p['researchOnly'], 'policy.researchOnly')
  return out
}

// Stable userData path (mcp-bridge.json, history) across dev + packaged builds
try {
  app.setName('browgent')
} catch {
  // ignore
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

// Env must load before CDP flags + command-line switches (pre-ready).
loadEnvFile()
const runtime = getRuntimeFlags()
// Guest identity (Chrome UA, no AutomationControlled) before Chromium boots.
applyGuestIdentityEarly()
const cdpBoot = applyCdpCommandLine()
if (cdpBoot.enabled) {
  console.info(`[browgent] CDP enabled on port ${cdpBoot.port} → http://127.0.0.1:${cdpBoot.port}`)
}
console.info(
  `[browgent] driver=${runtime.driverMode}` +
    (runtime.agentOnly ? ' agent-only' : '') +
    (runtime.headless ? ' headless' : '')
)

let mainWindow: BrowserWindow | null = null
let tabs: TabManager | null = null
let agent: AgentSession | null = null
let petOverlay: PetOverlay | null = null
let historyStore: HistoryStore | null = null
let downloadManager: DownloadManager | null = null
let ipcRegistered = false
let initialTabCreated = false

const isDev = !app.isPackaged

function createWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus()
    return
  }

  initialTabCreated = false
  const flags = getRuntimeFlags()
  const compact = flags.agentOnly

  mainWindow = new BrowserWindow({
    width: compact ? 1100 : 1480,
    height: compact ? 720 : 940,
    minWidth: compact ? 800 : 1024,
    minHeight: compact ? 560 : 680,
    show: false,
    title: 'Browgent',
    backgroundColor: '#f4f3ee',
    titleBarStyle: 'hiddenInset',
    // First chrome row is tabbar (~38px) or toolbar when sidebar is open (~50px)
    trafficLightPosition: { x: 16, y: 14 },
    roundedCorners: true,
    ...(process.platform === 'darwin' ? {} : { frame: false }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  tabs = new TabManager(mainWindow, (state) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.TABS_STATE, state)
    }
  })

  if (!historyStore) historyStore = new HistoryStore()
  if (!downloadManager) downloadManager = new DownloadManager()
  downloadManager.setOnChange((items) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.DOWNLOADS_STATE, items)
    }
  })
  tabs.downloadManager = downloadManager

  const privacyStore = getPrivacyStore()
  privacyStore.setOnChange((snap) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.PRIVACY_STATE, snap)
    }
  })

  tabs.onVisit = (visit) => {
    historyStore?.record(visit)
  }
  tabs.onVisitMeta = (visit) => {
    historyStore?.touchMeta(visit.url, visit.title, visit.favicon)
  }
  tabs.onFindResult = (result) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.FIND_RESULT, result)
    }
  }

  petOverlay = new PetOverlay(mainWindow)
  petOverlay.setHandlers({
    onToggle: () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC.PET_CLICK)
      }
    },
    onHide: () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC.PET_HIDE)
      }
    },
    onMoved: (x, y) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC.PET_MOVED, { x, y })
      }
    }
  })
  tabs.afterLayout = () => petOverlay?.raise()

  // Agent-only: start with a thinner chrome reserve (panel still usable)
  if (flags.agentOnly) {
    tabs.setChromeMetrics({
      top: 100,
      right: 320,
      bottom: 28,
      left: 0
    })
  }

  agent = new AgentSession(
    tabs,
    (state) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC.AGENT_STATE, state)
      }
    },
    () => {
      try {
        recordAgentRun()
      } catch {
        // ignore
      }
    }
  )

  // Localhost MCP bridge — Claude Code / Cursor STDIO proxy attaches here
  mcpBridge.attach({
    getAgent: () => agent,
    getTabs: () => tabs,
    getVersion: () => app.getVersion()
  })
  void mcpBridge.start()

  registerIpcOnce()

  mainWindow.webContents.once('did-finish-load', () => {
    ensureInitialTab()
    pushFullState()
  })
  mainWindow.once('ready-to-show', () => {
    if (!getRuntimeFlags().headless) {
      mainWindow?.show()
    } else {
      console.info('[browgent] headless: window hidden — use CDP/Playwright to drive tabs')
    }
    ensureInitialTab()
    pushFullState()
  })

  mainWindow.on('closed', () => {
    try {
      agent?.stop()
    } catch {
      // ignore
    }
    petOverlay?.destroy()
    petOverlay = null
    tabs?.destroy()
    tabs = null
    agent = null
    mainWindow = null
    initialTabCreated = false
  })

  mainWindow.on('resize', () => {
    tabs?.layoutActiveView()
    petOverlay?.raise()
  })

  const emitFullscreen = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send(
      IPC.WINDOW_FULLSCREEN_CHANGED,
      mainWindow.isFullScreen()
    )
  }
  mainWindow.on('enter-full-screen', emitFullscreen)
  mainWindow.on('leave-full-screen', emitFullscreen)
  // Some macOS builds report late; re-sync after show
  mainWindow.once('ready-to-show', () => {
    setTimeout(emitFullscreen, 0)
    setTimeout(emitFullscreen, 200)
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function ensureInitialTab(): void {
  if (initialTabCreated || !tabs) return
  if (tabs.count() > 0) {
    initialTabCreated = true
    return
  }
  initialTabCreated = true
  tabs.createTab(HOME_URL, true)
}

function pushFullState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (tabs) mainWindow.webContents.send(IPC.TABS_STATE, tabs.getState())
  if (agent) mainWindow.webContents.send(IPC.AGENT_STATE, agent.getState())
}

function assertChromeSender(e: Electron.IpcMainInvokeEvent): void {
  if (!mainWindow || mainWindow.isDestroyed() || e.sender !== mainWindow.webContents) {
    throw new Error('Unauthorized IPC sender')
  }
}

function registerIpcOnce(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  // Bulk wipe of chrome invoke handlers. Exclude:
  // - push-only main→renderer/pet event channels (no invoke handler)
  // - pet-owned invoke channels registered by PetOverlay (drag/click/hide)
  const skipBulkRemove = new Set<string>([
    IPC.TABS_STATE,
    IPC.AGENT_STATE,
    IPC.FIND_RESULT,
    IPC.DOWNLOADS_STATE,
    IPC.PRIVACY_STATE,
    IPC.WINDOW_FULLSCREEN_CHANGED,
    IPC.PET_STATE,
    IPC.PET_MOVED,
    // PetOverlay owns these invoke handlers — removing them on first launch
    // left drag dead until window recreate.
    IPC.PET_DRAG_START,
    IPC.PET_DRAG_BY,
    IPC.PET_DRAG_END,
    IPC.PET_CLICK,
    IPC.PET_HIDE
  ])
  const handlerChannels = Object.values(IPC).filter((c) => !skipBulkRemove.has(c))
  for (const channel of handlerChannels) {
    try {
      ipcMain.removeHandler(channel)
    } catch {
      // ignore
    }
  }

  ipcMain.handle(IPC.TABS_GET, (e) => {
    assertChromeSender(e)
    return tabs?.getState() ?? []
  })
  ipcMain.handle(IPC.TAB_CREATE, (e, url?: unknown) => {
    assertChromeSender(e)
    const initialUrl = url === undefined || url === null ? HOME_URL : ensureString(url, 'tab.create.url', URL_MAX)
    return tabs?.createTab(initialUrl, true) ?? null
  })
  ipcMain.handle(IPC.TAB_CLOSE, (e, id: unknown) => {
    assertChromeSender(e)
    if (!tabs) return false
    return tabs.closeTab(ensureTabId(id, 'tab.close.id'))
  })
  ipcMain.handle(IPC.TAB_ACTIVATE, (e, id: unknown) => {
    assertChromeSender(e)
    if (!tabs) return false
    return tabs.activateTab(ensureTabId(id, 'tab.activate.id'))
  })
  ipcMain.handle(IPC.TAB_NAVIGATE, (e, payload: unknown) => {
    assertChromeSender(e)
    const p = ensureNavigatePayload(payload)
    if (!tabs) return false
    return tabs.navigate(p.tabId, p.input)
  })
  ipcMain.handle(IPC.TAB_BACK, (e, id?: unknown) => {
    assertChromeSender(e)
    if (!tabs) return false
    return tabs.goBack(ensureOptionalTabId(id, 'tab.back.id'))
  })
  ipcMain.handle(IPC.TAB_FORWARD, (e, id?: unknown) => {
    assertChromeSender(e)
    if (!tabs) return false
    return tabs.goForward(ensureOptionalTabId(id, 'tab.forward.id'))
  })
  ipcMain.handle(IPC.TAB_RELOAD, (e, id?: unknown) => {
    assertChromeSender(e)
    if (!tabs) return false
    return tabs.reload(ensureOptionalTabId(id, 'tab.reload.id'))
  })
  ipcMain.handle(IPC.TAB_STOP, (e, id?: unknown) => {
    assertChromeSender(e)
    if (!tabs) return false
    return tabs.stop(ensureOptionalTabId(id, 'tab.stop.id'))
  })

  ipcMain.handle(IPC.CHROME_METRICS, (e, metrics: unknown) => {
    assertChromeSender(e)
    return tabs?.setChromeMetrics(ensureChromeMetrics(metrics))
  })

  ipcMain.handle(IPC.GUEST_VISIBLE, (e, visible: unknown) => {
    assertChromeSender(e)
    if (typeof visible !== 'boolean') throw new Error('guestVisible must be boolean')
    tabs?.setGuestVisible(visible)
  })

  ipcMain.handle(IPC.PET_CONFIGURE, (e, config: unknown) => {
    assertChromeSender(e)
    if (!config || typeof config !== 'object') throw new Error('pet config must be an object')
    const c = config as Record<string, unknown>
    const partial: {
      visible?: boolean
      theme?: string
      mood?: PetMood
      form?: string
      x?: number
      y?: number
    } = {}
    if (typeof c['visible'] === 'boolean') partial.visible = c['visible']
    if (typeof c['theme'] === 'string') partial.theme = c['theme']
    if (
      c['mood'] === 'idle' ||
      c['mood'] === 'busy' ||
      c['mood'] === 'attention'
    ) {
      partial.mood = c['mood']
    }
    if (typeof c['form'] === 'string') partial.form = c['form']
    if (typeof c['x'] === 'number' && Number.isFinite(c['x'])) partial.x = c['x']
    if (typeof c['y'] === 'number' && Number.isFinite(c['y'])) partial.y = c['y']
    petOverlay?.configure(partial)
  })

  ipcMain.handle(IPC.APP_VERSION, (e) => {
    assertChromeSender(e)
    return app.getVersion()
  })
  ipcMain.handle(IPC.WINDOW_MINIMIZE, (e) => {
    assertChromeSender(e)
    return mainWindow?.minimize()
  })
  ipcMain.handle(IPC.WINDOW_MAXIMIZE, (e) => {
    assertChromeSender(e)
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.handle(IPC.WINDOW_CLOSE, (e) => {
    assertChromeSender(e)
    return mainWindow?.close()
  })
  ipcMain.handle(IPC.WINDOW_FULLSCREEN_GET, (e) => {
    assertChromeSender(e)
    return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isFullScreen())
  })

  ipcMain.handle(IPC.AGENT_SEND, async (e, text: unknown, tabId?: unknown) => {
    assertChromeSender(e)
    await agent?.send(ensureString(text, 'agent.send.text', PROMPT_MAX), ensureOptionalTabId(tabId, 'agent.send.tabId'))
  })
  ipcMain.handle(IPC.AGENT_GET, (e) => {
    assertChromeSender(e)
    return agent?.getState() ?? null
  })
  ipcMain.handle(IPC.AGENT_STOP, (e) => {
    assertChromeSender(e)
    return agent?.stop()
  })
  ipcMain.handle(IPC.AGENT_CLEAR, (e) => {
    assertChromeSender(e)
    return agent?.clear()
  })
  ipcMain.handle(IPC.AGENT_PAUSE, (e) => {
    assertChromeSender(e)
    return agent?.pause()
  })
  ipcMain.handle(IPC.AGENT_RESUME, (e) => {
    assertChromeSender(e)
    return agent?.resume()
  })
  ipcMain.handle(IPC.AGENT_TAKEOVER, (e) => {
    assertChromeSender(e)
    return agent?.takeover()
  })
  ipcMain.handle(IPC.AGENT_SET_MODE, (e, mode: unknown) => {
    assertChromeSender(e)
    return agent?.setMode(ensureAgentMode(mode))
  })
  ipcMain.handle(IPC.AGENT_SET_POLICY, (e, partial: unknown) => {
    assertChromeSender(e)
    return agent?.setPolicy(ensureAgentPolicy(partial))
  })
  ipcMain.handle(IPC.AGENT_CONFIRM, (e, id: unknown) => {
    assertChromeSender(e)
    return agent?.confirm(ensureString(id, 'agent.confirm.id', TAB_ID_MAX))
  })
  ipcMain.handle(IPC.AGENT_REJECT, (e, id: unknown) => {
    assertChromeSender(e)
    return agent?.reject(ensureString(id, 'agent.reject.id', TAB_ID_MAX))
  })
  ipcMain.handle(IPC.AGENT_ANSWER, (e, text: unknown) => {
    assertChromeSender(e)
    return agent?.answerHuman(ensureString(text, 'agent.answer.text', PROMPT_MAX))
  })
  ipcMain.handle(IPC.AGENT_EXPORT, (e) => {
    assertChromeSender(e)
    const json = agent?.exportTrajectory() ?? '{}'
    try {
      recordTrajectoryExport()
    } catch {
      // ignore
    }
    return json
  })
  ipcMain.handle(IPC.MCP_STATUS, (e) => {
    assertChromeSender(e)
    return getMcpStatus()
  })
  ipcMain.handle(IPC.METRICS_GET, (e) => {
    assertChromeSender(e)
    return getMetrics()
  })
  ipcMain.handle(IPC.METRICS_SET_TELEMETRY, (e, on: unknown) => {
    assertChromeSender(e)
    return setTelemetryOptIn(ensureBoolean(on, 'metrics.telemetryOptIn'))
  })
  ipcMain.handle(IPC.METRICS_EXPORT_TRACTION, (e) => {
    assertChromeSender(e)
    return JSON.stringify(buildTractionPacket(), null, 2)
  })
  ipcMain.handle(IPC.METRICS_RECORD_DEMO, (e) => {
    assertChromeSender(e)
    recordDemoRun()
    return getMetrics()
  })
  ipcMain.handle(IPC.METRICS_RECORD_RECIPE, (e) => {
    assertChromeSender(e)
    recordRecipeRun()
    return getMetrics()
  })

  // ── Browser import ──────────────────────────────────────────
  ipcMain.handle(IPC.IMPORT_DETECT, (e) => {
    assertChromeSender(e)
    return listDetectedBrowsers()
  })
  ipcMain.handle(IPC.IMPORT_RUN, async (e, options: unknown) => {
    assertChromeSender(e)
    if (!options || typeof options !== 'object') throw new Error('Invalid import options')
    const o = options as Record<string, unknown>
    const browserIdRaw = ensureString(o['browserId'], 'import.browserId', 32)
    if (!isBrowserId(browserIdRaw)) throw new Error(`Unknown browser: ${browserIdRaw}`)
    const opts: ImportOptions = {
      browserId: browserIdRaw,
      history: o['history'] !== false,
      bookmarks: o['bookmarks'] !== false,
      passwords: o['passwords'] === true,
      historyLimit:
        typeof o['historyLimit'] === 'number' && Number.isFinite(o['historyLimit'])
          ? Math.min(5000, Math.max(100, Math.round(o['historyLimit'] as number)))
          : 2000
    }
    if (!historyStore) historyStore = new HistoryStore()
    let pendingBookmarks: { title: string; url: string }[] = []
    const result = await importFromBrowser(opts, {
      history: historyStore,
      onBookmarks: (items) => {
        pendingBookmarks = items.slice(0, 2000)
      }
    })
    return { ...result, bookmarks: pendingBookmarks }
  })

  // ── Vault (metadata only) ───────────────────────────────────
  ipcMain.handle(IPC.VAULT_LIST, (e) => {
    assertChromeSender(e)
    return getPasswordVault().listMeta()
  })
  ipcMain.handle(IPC.VAULT_REMOVE, (e, id: unknown) => {
    assertChromeSender(e)
    return getPasswordVault().remove(ensureString(id, 'vault.id', 64))
  })
  ipcMain.handle(IPC.VAULT_CLEAR, (e) => {
    assertChromeSender(e)
    getPasswordVault().clear()
    return true
  })

  // ── User Hub ────────────────────────────────────────────────
  ipcMain.handle(IPC.PROFILE_GET, (e) => {
    assertChromeSender(e)
    return getProfileStore().get()
  })
  ipcMain.handle(IPC.PROFILE_SET, (e, partial: unknown) => {
    assertChromeSender(e)
    if (!partial || typeof partial !== 'object') throw new Error('Invalid profile')
    return getProfileStore().set(partial as Partial<UserProfile>)
  })

  // ── Privacy ─────────────────────────────────────────────────
  ipcMain.handle(IPC.PRIVACY_GET, (e) => {
    assertChromeSender(e)
    return getPrivacyStore().get()
  })
  ipcMain.handle(IPC.PRIVACY_STATS, (e) => {
    assertChromeSender(e)
    return getPrivacyStore().getStats()
  })
  ipcMain.handle(IPC.PRIVACY_SET, (e, partial: unknown) => {
    assertChromeSender(e)
    if (!partial || typeof partial !== 'object') throw new Error('Invalid privacy prefs')
    const p = partial as Record<string, unknown>
    const patch: Partial<PrivacyPrefs> = {}
    if (typeof p.blockAds === 'boolean') patch.blockAds = p.blockAds
    if (typeof p.blockTrackers === 'boolean') patch.blockTrackers = p.blockTrackers
    if (typeof p.showShieldBadge === 'boolean') patch.showShieldBadge = p.showShieldBadge
    if (isCookieBannerMode(p.cookieBannerMode)) patch.cookieBannerMode = p.cookieBannerMode
    if (Array.isArray(p.allowHosts)) {
      patch.allowHosts = ensureStringArray(p.allowHosts, 'privacy.allowHosts', MAX_HOSTS, HOST_MAX)
    }
    return getPrivacyStore().set(sanitizePrivacyPrefs({ ...getPrivacyStore().get(), ...patch }))
  })

  // ── Page assets ─────────────────────────────────────────────
  ipcMain.handle(IPC.ASSETS_LIST, async (e, tabId?: unknown) => {
    assertChromeSender(e)
    return (await tabs?.listAssets(ensureOptionalTabId(tabId, 'assets.list.tabId'))) ?? []
  })
  ipcMain.handle(IPC.ASSETS_DOWNLOAD, async (e, payload: unknown) => {
    assertChromeSender(e)
    if (!payload || typeof payload !== 'object') throw new Error('Invalid assets download payload')
    const o = payload as Record<string, unknown>
    const urlsRaw = o.urls
    const urls: string[] = Array.isArray(urlsRaw)
      ? urlsRaw.filter((u): u is string => typeof u === 'string').slice(0, 50)
      : []
    const subfolder =
      typeof o.subfolder === 'string' && o.subfolder.trim()
        ? o.subfolder.trim().slice(0, 80)
        : 'browgent-assets'
    const tabId = o.tabId !== undefined ? ensureOptionalTabId(o.tabId, 'assets.download.tabId') : undefined
    return (
      (await tabs?.downloadAssets(urls, { tabId, subfolder })) ?? {
        started: 0,
        errors: ['No tabs']
      }
    )
  })

  ipcMain.handle(IPC.DRIVER_STATUS, async (e) => {
    assertChromeSender(e)
    const mode = tabs?.getDriverMode() ?? getRuntimeFlags().driverMode
    return getCdpStatus(mode)
  })
  ipcMain.handle(IPC.DRIVER_SET_MODE, (e, mode: unknown) => {
    assertChromeSender(e)
    const parsed = ensureDriverMode(mode)
    tabs?.setDriverMode(parsed)
    return parsed
  })

  // ── Find in page ────────────────────────────────────────────
  ipcMain.handle(IPC.FIND_START, (e, text: unknown, options?: unknown, tabId?: unknown) => {
    assertChromeSender(e)
    if (!tabs) return 0
    const q = ensureString(text, 'find.text', 500)
    let opts: FindInPageOptions | undefined
    if (options && typeof options === 'object') {
      const o = options as Record<string, unknown>
      opts = {
        forward: typeof o['forward'] === 'boolean' ? o['forward'] : undefined,
        findNext: typeof o['findNext'] === 'boolean' ? o['findNext'] : undefined,
        matchCase: typeof o['matchCase'] === 'boolean' ? o['matchCase'] : undefined
      }
    }
    return tabs.findInPage(q, opts, ensureOptionalTabId(tabId, 'find.tabId'))
  })
  ipcMain.handle(IPC.FIND_STOP, (e, tabId?: unknown) => {
    assertChromeSender(e)
    tabs?.stopFindInPage(ensureOptionalTabId(tabId, 'find.stop.tabId'))
  })

  // ── Zoom ────────────────────────────────────────────────────
  ipcMain.handle(IPC.ZOOM_GET, (e, tabId?: unknown) => {
    assertChromeSender(e)
    return tabs?.getZoomFactor(ensureOptionalTabId(tabId, 'zoom.get.tabId')) ?? 1
  })
  ipcMain.handle(IPC.ZOOM_SET, (e, factor: unknown, tabId?: unknown) => {
    assertChromeSender(e)
    const f = ensureBoundedNumber(factor, 'zoom.factor', 0.25, 5)
    return tabs?.setZoomFactor(f, ensureOptionalTabId(tabId, 'zoom.set.tabId')) ?? 1
  })
  ipcMain.handle(IPC.ZOOM_IN, (e, tabId?: unknown) => {
    assertChromeSender(e)
    return tabs?.zoomIn(ensureOptionalTabId(tabId, 'zoom.in.tabId')) ?? 1
  })
  ipcMain.handle(IPC.ZOOM_OUT, (e, tabId?: unknown) => {
    assertChromeSender(e)
    return tabs?.zoomOut(ensureOptionalTabId(tabId, 'zoom.out.tabId')) ?? 1
  })
  ipcMain.handle(IPC.ZOOM_RESET, (e, tabId?: unknown) => {
    assertChromeSender(e)
    return tabs?.zoomReset(ensureOptionalTabId(tabId, 'zoom.reset.tabId')) ?? 1
  })

  // ── Print ───────────────────────────────────────────────────
  ipcMain.handle(IPC.TAB_PRINT, (e, tabId?: unknown) => {
    assertChromeSender(e)
    return tabs?.print(ensureOptionalTabId(tabId, 'tab.print.tabId')) ?? false
  })

  // ── History ─────────────────────────────────────────────────
  ipcMain.handle(IPC.HISTORY_GET, (e, limit?: unknown) => {
    assertChromeSender(e)
    const n =
      typeof limit === 'number' && Number.isFinite(limit)
        ? Math.min(5000, Math.max(1, Math.round(limit)))
        : 200
    return historyStore?.list(n) ?? []
  })
  ipcMain.handle(IPC.HISTORY_SEARCH, (e, query?: unknown, limit?: unknown) => {
    assertChromeSender(e)
    const q = ensureOptionalString(query, 'history.query', 500) ?? ''
    const n =
      typeof limit === 'number' && Number.isFinite(limit)
        ? Math.min(5000, Math.max(1, Math.round(limit)))
        : 200
    return historyStore?.search(q, n) ?? []
  })
  ipcMain.handle(IPC.HISTORY_DELETE, (e, id: unknown) => {
    assertChromeSender(e)
    return historyStore?.delete(ensureString(id, 'history.delete.id', 64)) ?? false
  })
  ipcMain.handle(IPC.HISTORY_CLEAR, (e) => {
    assertChromeSender(e)
    historyStore?.clear()
    return true
  })

  // ── Downloads ───────────────────────────────────────────────
  ipcMain.handle(IPC.DOWNLOADS_GET, (e) => {
    assertChromeSender(e)
    return downloadManager?.getState() ?? []
  })
  ipcMain.handle(IPC.DOWNLOADS_OPEN, (e, id: unknown) => {
    assertChromeSender(e)
    return downloadManager?.open(ensureString(id, 'downloads.open.id', 64)) ?? false
  })
  ipcMain.handle(IPC.DOWNLOADS_SHOW, (e, id: unknown) => {
    assertChromeSender(e)
    return downloadManager?.showInFolder(ensureString(id, 'downloads.show.id', 64)) ?? false
  })
  ipcMain.handle(IPC.DOWNLOADS_CANCEL, (e, id: unknown) => {
    assertChromeSender(e)
    return downloadManager?.cancel(ensureString(id, 'downloads.cancel.id', 64)) ?? false
  })
  ipcMain.handle(IPC.DOWNLOADS_CLEAR, (e) => {
    assertChromeSender(e)
    downloadManager?.clearCompleted()
    return true
  })
  ipcMain.handle(IPC.DOWNLOADS_OPEN_FOLDER, (e) => {
    assertChromeSender(e)
    downloadManager?.openDownloadsFolder()
    return true
  })
}

app.whenReady().then(() => {
  // Reload .env in case userData path is now available
  loadEnvFile()
  try {
    recordLaunch()
  } catch {
    // ignore
  }

  const pageSession = session.fromPartition(PAGE_PARTITION)
  // Strip Electron from UA / client hints so Google, Akamai, etc. do not auto-block guest tabs
  applyGuestPageSessionIdentity(pageSession)
  if (!downloadManager) downloadManager = new DownloadManager()
  downloadManager.wireSession(pageSession)
  wireRequestFilter(pageSession, getPrivacyStore())
  if (!historyStore) historyStore = new HistoryStore()
  // Guest page tabs: deny mic/camera/notifications by default (agent browses untrusted sites)
  pageSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  pageSession.setPermissionCheckHandler(() => false)
  // Chrome UI (agent voice): allow media (mic) for speech recognition
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media') {
      callback(true)
      return
    }
    callback(false)
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media'
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else if (!getRuntimeFlags().headless) {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
})

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!getRuntimeFlags().headless) {
      mainWindow.focus()
    }
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  mcpBridge.stop()
  tabs?.destroy()
  historyStore?.flush()
  downloadManager?.flush()
  getPrivacyStore().flush()
})
