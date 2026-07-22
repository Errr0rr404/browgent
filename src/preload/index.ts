import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AgentSessionState,
  type BrowserChromeMetrics,
  type NavigatePayload,
  type TabId,
  type TabState
} from '../shared/types'
import type { AgentMode, AgentPolicy } from '../shared/policies'

const api = {
  getTabs: (): Promise<TabState[]> => ipcRenderer.invoke(IPC.TABS_GET),
  createTab: (url?: string): Promise<TabId | null> => ipcRenderer.invoke(IPC.TAB_CREATE, url),
  closeTab: (id: TabId): Promise<void> => ipcRenderer.invoke(IPC.TAB_CLOSE, id),
  activateTab: (id: TabId): Promise<void> => ipcRenderer.invoke(IPC.TAB_ACTIVATE, id),
  navigate: (payload: NavigatePayload): Promise<void> =>
    ipcRenderer.invoke(IPC.TAB_NAVIGATE, payload),
  goBack: (id?: TabId): Promise<void> => ipcRenderer.invoke(IPC.TAB_BACK, id),
  goForward: (id?: TabId): Promise<void> => ipcRenderer.invoke(IPC.TAB_FORWARD, id),
  reload: (id?: TabId): Promise<void> => ipcRenderer.invoke(IPC.TAB_RELOAD, id),
  stop: (id?: TabId): Promise<void> => ipcRenderer.invoke(IPC.TAB_STOP, id),
  onTabsState: (cb: (tabs: TabState[]) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, tabs: TabState[]): void => cb(tabs)
    ipcRenderer.on(IPC.TABS_STATE, listener)
    return () => ipcRenderer.removeListener(IPC.TABS_STATE, listener)
  },

  setChromeMetrics: (metrics: BrowserChromeMetrics): Promise<void> =>
    ipcRenderer.invoke(IPC.CHROME_METRICS, metrics),
  minimize: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
  maximize: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_MAXIMIZE),
  close: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_CLOSE),

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
  getMcpStatus: (): Promise<{ enabled: boolean; tools: string[]; note: string }> =>
    ipcRenderer.invoke(IPC.MCP_STATUS),
  onAgentState: (cb: (state: AgentSessionState) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, state: AgentSessionState): void => cb(state)
    ipcRenderer.on(IPC.AGENT_STATE, listener)
    return () => ipcRenderer.removeListener(IPC.AGENT_STATE, listener)
  },

  platform: process.platform as NodeJS.Platform
}

contextBridge.exposeInMainWorld('browgent', api)

export type BrowgentAPI = typeof api
