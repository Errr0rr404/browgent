import { app, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { HOME_URL, PAGE_PARTITION, TabManager } from './browser/tab-manager'
import { AgentSession } from './agent/session'
import { loadEnvFile } from './agent/env'
import { getMcpStatus } from './mcp/server'
import { applyCdpCommandLine, getCdpStatus } from './browser/cdp-endpoint'
import { getRuntimeFlags } from './browser/runtime-flags'
import { IPC, type BrowserChromeMetrics, type NavigatePayload, type TabId } from '../shared/types'
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

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

// Env must load before CDP flags + command-line switches (pre-ready).
loadEnvFile()
const runtime = getRuntimeFlags()
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
    backgroundColor: '#090a0d',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
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

  // Agent-only: start with a thinner chrome reserve (panel still usable)
  if (flags.agentOnly) {
    tabs.setChromeMetrics({
      top: 100,
      right: 320,
      bottom: 28,
      left: 0
    })
  }

  agent = new AgentSession(tabs, (state) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.AGENT_STATE, state)
    }
  })

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
    tabs?.destroy()
    tabs = null
    agent = null
    mainWindow = null
    initialTabCreated = false
  })

  mainWindow.on('resize', () => tabs?.layoutActiveView())

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

  // Only remove invoke handlers (not push-only event channels)
  const handlerChannels = Object.values(IPC).filter(
    (c) => c !== IPC.TABS_STATE && c !== IPC.AGENT_STATE
  )
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
    return agent?.exportTrajectory() ?? '{}'
  })
  ipcMain.handle(IPC.MCP_STATUS, (e) => {
    assertChromeSender(e)
    return getMcpStatus()
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
}

app.whenReady().then(() => {
  // Reload .env in case userData path is now available
  loadEnvFile()

  const pageSession = session.fromPartition(PAGE_PARTITION)
  // Guest page tabs: deny mic/camera/notifications by default (agent browses untrusted sites)
  pageSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
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

app.on('before-quit', () => tabs?.destroy())
