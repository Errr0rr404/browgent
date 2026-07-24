import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AgentSessionState,
  type BrowserChromeMetrics,
  type DownloadItemState,
  type FindInPageOptions,
  type FindInPageResult,
  type HistoryEntry,
  type NavigatePayload,
  type TabId,
  type TabState
} from '../shared/types'
import type { AgentMode, AgentPolicy } from '../shared/policies'
import type { CdpEndpointStatus, DriverMode } from '../shared/driver'

const api = {
  getTabs: (): Promise<TabState[]> => ipcRenderer.invoke(IPC.TABS_GET),
  createTab: (url?: string): Promise<TabId | null> => ipcRenderer.invoke(IPC.TAB_CREATE, url),
  closeTab: (id: TabId): Promise<boolean> => ipcRenderer.invoke(IPC.TAB_CLOSE, id),
  activateTab: (id: TabId): Promise<boolean> => ipcRenderer.invoke(IPC.TAB_ACTIVATE, id),
  navigate: (payload: NavigatePayload): Promise<boolean> =>
    ipcRenderer.invoke(IPC.TAB_NAVIGATE, payload),
  goBack: (id?: TabId): Promise<boolean> => ipcRenderer.invoke(IPC.TAB_BACK, id),
  goForward: (id?: TabId): Promise<boolean> => ipcRenderer.invoke(IPC.TAB_FORWARD, id),
  reload: (id?: TabId): Promise<boolean> => ipcRenderer.invoke(IPC.TAB_RELOAD, id),
  stop: (id?: TabId): Promise<boolean> => ipcRenderer.invoke(IPC.TAB_STOP, id),
  onTabsState: (cb: (tabs: TabState[]) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, tabs: TabState[]): void => cb(tabs)
    ipcRenderer.on(IPC.TABS_STATE, listener)
    return () => ipcRenderer.removeListener(IPC.TABS_STATE, listener)
  },

  setChromeMetrics: (metrics: BrowserChromeMetrics): Promise<void> =>
    ipcRenderer.invoke(IPC.CHROME_METRICS, metrics),
  setGuestVisible: (visible: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.GUEST_VISIBLE, visible),
  appVersion: (): Promise<string> => ipcRenderer.invoke(IPC.APP_VERSION),
  minimize: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
  maximize: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_MAXIMIZE),
  close: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_CLOSE),
  isFullScreen: (): Promise<boolean> => ipcRenderer.invoke(IPC.WINDOW_FULLSCREEN_GET),
  onFullScreenChanged: (cb: (full: boolean) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, full: boolean): void => cb(full)
    ipcRenderer.on(IPC.WINDOW_FULLSCREEN_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC.WINDOW_FULLSCREEN_CHANGED, listener)
  },

  sendAgentMessage: (text: string, tabId?: TabId): Promise<void> =>
    ipcRenderer.invoke(IPC.AGENT_SEND, text, tabId),
  getAgentState: (): Promise<AgentSessionState | null> => ipcRenderer.invoke(IPC.AGENT_GET),
  stopAgent: (): Promise<void> => ipcRenderer.invoke(IPC.AGENT_STOP),
  clearAgent: (): Promise<void> => ipcRenderer.invoke(IPC.AGENT_CLEAR),
  pauseAgent: (): Promise<void> => ipcRenderer.invoke(IPC.AGENT_PAUSE),
  resumeAgent: (): Promise<void> => ipcRenderer.invoke(IPC.AGENT_RESUME),
  takeover: (): Promise<void> => ipcRenderer.invoke(IPC.AGENT_TAKEOVER),
  setAgentMode: (mode: AgentMode): Promise<void> => ipcRenderer.invoke(IPC.AGENT_SET_MODE, mode),
  setAgentPolicy: (partial: Partial<AgentPolicy>): Promise<void> =>
    ipcRenderer.invoke(IPC.AGENT_SET_POLICY, partial),
  confirmAction: (id: string): Promise<void> => ipcRenderer.invoke(IPC.AGENT_CONFIRM, id),
  rejectAction: (id: string): Promise<void> => ipcRenderer.invoke(IPC.AGENT_REJECT, id),
  answerHuman: (text: string): Promise<void> => ipcRenderer.invoke(IPC.AGENT_ANSWER, text),
  exportTrajectory: (): Promise<string> => ipcRenderer.invoke(IPC.AGENT_EXPORT),
  getMcpStatus: (): Promise<import('../shared/mcp').McpStatus> =>
    ipcRenderer.invoke(IPC.MCP_STATUS),
  getMetrics: (): Promise<import('../shared/metrics').LocalMetrics> =>
    ipcRenderer.invoke(IPC.METRICS_GET),
  setTelemetryOptIn: (on: boolean): Promise<import('../shared/metrics').LocalMetrics> =>
    ipcRenderer.invoke(IPC.METRICS_SET_TELEMETRY, on),
  exportTractionPacket: (): Promise<string> =>
    ipcRenderer.invoke(IPC.METRICS_EXPORT_TRACTION),
  recordDemoRun: (): Promise<import('../shared/metrics').LocalMetrics> =>
    ipcRenderer.invoke(IPC.METRICS_RECORD_DEMO),
  recordRecipeRun: (): Promise<import('../shared/metrics').LocalMetrics> =>
    ipcRenderer.invoke(IPC.METRICS_RECORD_RECIPE),
  getDriverStatus: (): Promise<CdpEndpointStatus> => ipcRenderer.invoke(IPC.DRIVER_STATUS),
  setDriverMode: (mode: DriverMode): Promise<DriverMode> =>
    ipcRenderer.invoke(IPC.DRIVER_SET_MODE, mode),
  onAgentState: (cb: (state: AgentSessionState) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, state: AgentSessionState): void => cb(state)
    ipcRenderer.on(IPC.AGENT_STATE, listener)
    return () => ipcRenderer.removeListener(IPC.AGENT_STATE, listener)
  },

  /** Floating agent companion overlay (native, above guest pages) */
  configurePet: (config: {
    visible?: boolean
    theme?: string
    mood?: 'idle' | 'busy' | 'attention'
    form?: string
    x?: number
    y?: number
  }): Promise<void> => ipcRenderer.invoke(IPC.PET_CONFIGURE, config),
  onPetClick: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on(IPC.PET_CLICK, listener)
    return () => ipcRenderer.removeListener(IPC.PET_CLICK, listener)
  },
  onPetHide: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on(IPC.PET_HIDE, listener)
    return () => ipcRenderer.removeListener(IPC.PET_HIDE, listener)
  },
  onPetMoved: (cb: (pos: { x: number; y: number }) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, pos: { x: number; y: number }): void =>
      cb(pos)
    ipcRenderer.on(IPC.PET_MOVED, listener)
    return () => ipcRenderer.removeListener(IPC.PET_MOVED, listener)
  },

  // Find in page
  findInPage: (text: string, options?: FindInPageOptions, tabId?: TabId): Promise<number> =>
    ipcRenderer.invoke(IPC.FIND_START, text, options, tabId),
  stopFindInPage: (tabId?: TabId): Promise<void> => ipcRenderer.invoke(IPC.FIND_STOP, tabId),
  onFindResult: (cb: (result: FindInPageResult) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, result: FindInPageResult): void => cb(result)
    ipcRenderer.on(IPC.FIND_RESULT, listener)
    return () => ipcRenderer.removeListener(IPC.FIND_RESULT, listener)
  },

  // Zoom
  getZoom: (tabId?: TabId): Promise<number> => ipcRenderer.invoke(IPC.ZOOM_GET, tabId),
  setZoom: (factor: number, tabId?: TabId): Promise<number> =>
    ipcRenderer.invoke(IPC.ZOOM_SET, factor, tabId),
  zoomIn: (tabId?: TabId): Promise<number> => ipcRenderer.invoke(IPC.ZOOM_IN, tabId),
  zoomOut: (tabId?: TabId): Promise<number> => ipcRenderer.invoke(IPC.ZOOM_OUT, tabId),
  zoomReset: (tabId?: TabId): Promise<number> => ipcRenderer.invoke(IPC.ZOOM_RESET, tabId),

  // Print
  printPage: (tabId?: TabId): Promise<boolean> => ipcRenderer.invoke(IPC.TAB_PRINT, tabId),

  // History
  getHistory: (limit?: number): Promise<HistoryEntry[]> =>
    ipcRenderer.invoke(IPC.HISTORY_GET, limit),
  searchHistory: (query: string, limit?: number): Promise<HistoryEntry[]> =>
    ipcRenderer.invoke(IPC.HISTORY_SEARCH, query, limit),
  deleteHistory: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC.HISTORY_DELETE, id),
  clearHistory: (): Promise<boolean> => ipcRenderer.invoke(IPC.HISTORY_CLEAR),

  // Downloads
  getDownloads: (): Promise<DownloadItemState[]> => ipcRenderer.invoke(IPC.DOWNLOADS_GET),
  openDownload: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC.DOWNLOADS_OPEN, id),
  showDownload: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC.DOWNLOADS_SHOW, id),
  cancelDownload: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC.DOWNLOADS_CANCEL, id),
  clearDownloads: (): Promise<boolean> => ipcRenderer.invoke(IPC.DOWNLOADS_CLEAR),
  openDownloadsFolder: (): Promise<boolean> => ipcRenderer.invoke(IPC.DOWNLOADS_OPEN_FOLDER),
  onDownloadsState: (cb: (items: DownloadItemState[]) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, items: DownloadItemState[]): void => cb(items)
    ipcRenderer.on(IPC.DOWNLOADS_STATE, listener)
    return () => ipcRenderer.removeListener(IPC.DOWNLOADS_STATE, listener)
  },

  platform: process.platform as NodeJS.Platform
}

contextBridge.exposeInMainWorld('browgent', api)

export type BrowgentAPI = typeof api
