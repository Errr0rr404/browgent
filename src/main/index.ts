import { app, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { HOME_URL, PAGE_PARTITION, TabManager } from './browser/tab-manager'
import { AgentSession } from './agent/session'
import { loadEnvFile } from './agent/env'
import { getMcpStatus } from './mcp/server'
import { applyCdpCommandLine, getCdpStatus } from './browser/cdp-endpoint'
import { getRuntimeFlags } from './browser/runtime-flags'
import { parseDriverMode } from '../shared/driver'
import { IPC, type BrowserChromeMetrics, type NavigatePayload, type TabId } from '../shared/types'
import type { AgentMode, AgentPolicy } from '../shared/policies'

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
      left: 0,
      agentPanelOpen: true
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

  ipcMain.handle(IPC.TABS_GET, () => tabs?.getState() ?? [])
  ipcMain.handle(IPC.TAB_CREATE, (_e, url?: string) => tabs?.createTab(url ?? HOME_URL, true) ?? null)
  ipcMain.handle(IPC.TAB_CLOSE, (_e, id: TabId) => tabs?.closeTab(id))
  ipcMain.handle(IPC.TAB_ACTIVATE, (_e, id: TabId) => tabs?.activateTab(id))
  ipcMain.handle(IPC.TAB_NAVIGATE, (_e, payload: NavigatePayload) =>
    tabs?.navigate(payload.tabId, payload.input)
  )
  ipcMain.handle(IPC.TAB_BACK, (_e, id?: TabId) => tabs?.goBack(id))
  ipcMain.handle(IPC.TAB_FORWARD, (_e, id?: TabId) => tabs?.goForward(id))
  ipcMain.handle(IPC.TAB_RELOAD, (_e, id?: TabId) => tabs?.reload(id))
  ipcMain.handle(IPC.TAB_STOP, (_e, id?: TabId) => tabs?.stop(id))

  ipcMain.handle(IPC.CHROME_METRICS, (_e, metrics: BrowserChromeMetrics) =>
    tabs?.setChromeMetrics(metrics)
  )
  ipcMain.handle(IPC.WINDOW_MINIMIZE, () => mainWindow?.minimize())
  ipcMain.handle(IPC.WINDOW_MAXIMIZE, () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.handle(IPC.WINDOW_CLOSE, () => mainWindow?.close())

  ipcMain.handle(IPC.AGENT_SEND, async (_e, text: string, tabId?: TabId) => {
    await agent?.send(text, tabId)
  })
  ipcMain.handle(IPC.AGENT_GET, () => agent?.getState() ?? null)
  ipcMain.handle(IPC.AGENT_STOP, () => agent?.stop())
  ipcMain.handle(IPC.AGENT_CLEAR, () => agent?.clear())
  ipcMain.handle(IPC.AGENT_PAUSE, () => agent?.pause())
  ipcMain.handle(IPC.AGENT_RESUME, () => agent?.resume())
  ipcMain.handle(IPC.AGENT_TAKEOVER, () => agent?.takeover())
  ipcMain.handle(IPC.AGENT_SET_MODE, (_e, mode: AgentMode) => agent?.setMode(mode))
  ipcMain.handle(IPC.AGENT_SET_POLICY, (_e, partial: Partial<AgentPolicy>) =>
    agent?.setPolicy(partial)
  )
  ipcMain.handle(IPC.AGENT_CONFIRM, (_e, id: string) => agent?.confirm(id))
  ipcMain.handle(IPC.AGENT_REJECT, (_e, id: string) => agent?.reject(id))
  ipcMain.handle(IPC.AGENT_ANSWER, (_e, text: string) => agent?.answerHuman(text))
  ipcMain.handle(IPC.AGENT_EXPORT, () => agent?.exportTrajectory() ?? '{}')
  ipcMain.handle(IPC.MCP_STATUS, () => getMcpStatus())

  ipcMain.handle(IPC.DRIVER_STATUS, async () => {
    const mode = tabs?.getDriverMode() ?? getRuntimeFlags().driverMode
    return getCdpStatus(mode)
  })
  ipcMain.handle(IPC.DRIVER_SET_MODE, (_e, mode: string) => {
    const parsed = parseDriverMode(mode)
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
