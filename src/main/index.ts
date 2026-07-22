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
  ipcMain.handle(IPC.TAB_CREATE, (e, url?: string) => {
    assertChromeSender(e)
    return tabs?.createTab(url ?? HOME_URL, true) ?? null
  })
  ipcMain.handle(IPC.TAB_CLOSE, (e, id: TabId) => {
    assertChromeSender(e)
    return tabs?.closeTab(id)
  })
  ipcMain.handle(IPC.TAB_ACTIVATE, (e, id: TabId) => {
    assertChromeSender(e)
    return tabs?.activateTab(id)
  })
  ipcMain.handle(IPC.TAB_NAVIGATE, (e, payload: NavigatePayload) => {
    assertChromeSender(e)
    return tabs?.navigate(payload.tabId, payload.input)
  })
  ipcMain.handle(IPC.TAB_BACK, (e, id?: TabId) => {
    assertChromeSender(e)
    return tabs?.goBack(id)
  })
  ipcMain.handle(IPC.TAB_FORWARD, (e, id?: TabId) => {
    assertChromeSender(e)
    return tabs?.goForward(id)
  })
  ipcMain.handle(IPC.TAB_RELOAD, (e, id?: TabId) => {
    assertChromeSender(e)
    return tabs?.reload(id)
  })
  ipcMain.handle(IPC.TAB_STOP, (e, id?: TabId) => {
    assertChromeSender(e)
    return tabs?.stop(id)
  })

  ipcMain.handle(IPC.CHROME_METRICS, (e, metrics: BrowserChromeMetrics) => {
    assertChromeSender(e)
    return tabs?.setChromeMetrics(metrics)
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

  ipcMain.handle(IPC.AGENT_SEND, async (e, text: string, tabId?: TabId) => {
    assertChromeSender(e)
    await agent?.send(text, tabId)
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
  ipcMain.handle(IPC.AGENT_SET_MODE, (e, mode: AgentMode) => {
    assertChromeSender(e)
    return agent?.setMode(mode)
  })
  ipcMain.handle(IPC.AGENT_SET_POLICY, (e, partial: Partial<AgentPolicy>) => {
    assertChromeSender(e)
    return agent?.setPolicy(partial)
  })
  ipcMain.handle(IPC.AGENT_CONFIRM, (e, id: string) => {
    assertChromeSender(e)
    return agent?.confirm(id)
  })
  ipcMain.handle(IPC.AGENT_REJECT, (e, id: string) => {
    assertChromeSender(e)
    return agent?.reject(id)
  })
  ipcMain.handle(IPC.AGENT_ANSWER, (e, text: string) => {
    assertChromeSender(e)
    return agent?.answerHuman(text)
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
  ipcMain.handle(IPC.DRIVER_SET_MODE, (e, mode: string) => {
    assertChromeSender(e)
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
