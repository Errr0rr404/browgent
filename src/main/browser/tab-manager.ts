import { BrowserWindow, WebContentsView, shell, type WebContents } from 'electron'
import { randomUUID } from 'crypto'
import type { BrowserChromeMetrics, TabId, TabState } from '../../shared/types'
import { normalizeUrl } from '../../shared/types'
import {
  extractLinks,
  extractText,
  observePage,
  runDomAction
} from './actions'
import type { ObserveSnapshot } from '../../shared/types'

interface ManagedTab {
  id: TabId
  view: WebContentsView
  title: string
  url: string
  favicon?: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  owner: 'human' | 'agent' | null
}

const HOME_URL = 'https://www.google.com'
const MAX_TABS = 24
export const PAGE_PARTITION = 'persist:browgent-pages'

export class TabManager {
  private tabs = new Map<TabId, ManagedTab>()
  private order: TabId[] = []
  private activeTabId: TabId | null = null
  private metrics: BrowserChromeMetrics = {
    top: 124,
    right: 400,
    bottom: 30,
    left: 0,
    agentPanelOpen: true
  }
  private destroyed = false
  private lastPopupAt = 0

  constructor(
    private window: BrowserWindow,
    private onStateChange: (tabs: TabState[]) => void
  ) {}

  count(): number {
    return this.tabs.size
  }

  getActiveTabId(): TabId | null {
    return this.activeTabId
  }

  getActiveView(): WebContentsView | null {
    if (!this.activeTabId) return null
    return this.tabs.get(this.activeTabId)?.view ?? null
  }

  getWebContents(tabId?: TabId): WebContents | null {
    const id = tabId ?? this.activeTabId
    if (!id) return null
    const tab = this.tabs.get(id)
    if (!tab || tab.view.webContents.isDestroyed()) return null
    return tab.view.webContents
  }

  setOwner(tabId: TabId | null | undefined, owner: 'human' | 'agent' | null): void {
    const id = tabId ?? this.activeTabId
    if (!id) return
    const tab = this.tabs.get(id)
    if (!tab) return
    tab.owner = owner
    this.emitState()
  }

  createTab(url = HOME_URL, activate = true): TabId | null {
    if (this.destroyed) return null
    if (this.tabs.size >= MAX_TABS) {
      console.warn(`Tab limit reached (${MAX_TABS})`)
      return null
    }

    const id = randomUUID()
    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: true,
        partition: PAGE_PARTITION
      }
    })

    const tab: ManagedTab = {
      id,
      view,
      title: 'New Tab',
      url: normalizeUrl(url),
      isLoading: true,
      canGoBack: false,
      canGoForward: false,
      owner: null
    }

    this.wireViewEvents(tab)
    this.tabs.set(id, tab)
    this.order.push(id)
    this.window.contentView.addChildView(view)
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    view.setVisible(false)

    void view.webContents.loadURL(tab.url).catch((err) => {
      console.warn('loadURL failed', err)
    })

    view.webContents.setWindowOpenHandler(({ url: target }) => {
      const now = Date.now()
      // Debounce popup storms (ads / multi-window openers)
      if (now - this.lastPopupAt < 400) return { action: 'deny' }
      this.lastPopupAt = now
      if (!target) return { action: 'deny' }
      if (target.startsWith('http://') || target.startsWith('https://')) {
        this.createTab(target, true)
      } else if (
        target.startsWith('mailto:') ||
        target.startsWith('tel:') ||
        target.startsWith('sms:')
      ) {
        void shell.openExternal(target)
      }
      // Block file://, javascript:, data: popups from untrusted pages
      return { action: 'deny' }
    })

    if (activate) this.activateTab(id)
    else this.emitState()

    return id
  }

  closeTab(id: TabId): void {
    if (this.destroyed) return
    const tab = this.tabs.get(id)
    if (!tab) return

    this.destroyTab(tab)
    this.tabs.delete(id)
    this.order = this.order.filter((t) => t !== id)

    if (this.activeTabId === id) {
      this.activeTabId = null
      if (this.order.length > 0) {
        this.activateTab(this.order[this.order.length - 1])
      } else {
        this.createTab(HOME_URL, true)
      }
    } else {
      this.emitState()
    }
  }

  activateTab(id: TabId): void {
    if (this.destroyed || !this.tabs.has(id)) return

    for (const [tabId, tab] of this.tabs) {
      try {
        tab.view.setVisible(tabId === id)
      } catch {
        // ignore
      }
    }

    this.activeTabId = id
    this.layoutActiveView()
    this.emitState()
  }

  navigate(id: TabId | undefined, input: string): void {
    const tabId = id ?? this.activeTabId
    if (!tabId) return
    const tab = this.tabs.get(tabId)
    if (!tab || tab.view.webContents.isDestroyed()) return

    const trimmed = input.trim()
    if (!trimmed) return

    const url = normalizeUrl(trimmed)
    tab.url = url
    tab.title = 'Loading…'
    tab.isLoading = true
    void tab.view.webContents.loadURL(url).catch((err) => {
      console.warn('navigate loadURL failed', err)
      tab.isLoading = false
      tab.title = 'Failed to load'
      this.emitState()
    })
    this.emitState()
  }

  goBack(id?: TabId): void {
    const tab = this.resolve(id)
    if (tab?.view.webContents.navigationHistory.canGoBack()) {
      tab.view.webContents.navigationHistory.goBack()
    }
  }

  goForward(id?: TabId): void {
    const tab = this.resolve(id)
    if (tab?.view.webContents.navigationHistory.canGoForward()) {
      tab.view.webContents.navigationHistory.goForward()
    }
  }

  reload(id?: TabId): void {
    const tab = this.resolve(id)
    if (!tab) return
    if (tab.isLoading) tab.view.webContents.stop()
    else tab.view.webContents.reload()
  }

  stop(id?: TabId): void {
    this.resolve(id)?.view.webContents.stop()
  }

  setChromeMetrics(metrics: BrowserChromeMetrics): void {
    this.metrics = { ...metrics }
    this.layoutActiveView()
  }

  layoutActiveView(): void {
    if (this.destroyed || !this.activeTabId) return
    const tab = this.tabs.get(this.activeTabId)
    if (!tab || this.window.isDestroyed()) return

    const [width, height] = this.window.getContentSize()
    const { top, right, bottom, left } = this.metrics
    const x = Math.max(0, Math.round(left))
    const y = Math.max(0, Math.round(top))
    const w = Math.max(1, Math.round(width - left - right))
    const h = Math.max(1, Math.round(height - top - bottom))

    try {
      tab.view.setBounds({ x, y, width: w, height: h })
      tab.view.setVisible(true)
    } catch {
      // ignore
    }
  }

  getState(): TabState[] {
    return this.order
      .map((id) => this.tabs.get(id))
      .filter((t): t is ManagedTab => Boolean(t))
      .map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favicon: tab.favicon,
        isLoading: tab.isLoading,
        canGoBack: tab.canGoBack,
        canGoForward: tab.canGoForward,
        isActive: tab.id === this.activeTabId,
        owner: tab.owner
      }))
  }

  async waitForLoad(tabId?: TabId, timeoutMs = 15000): Promise<void> {
    const wc = this.getWebContents(tabId)
    if (!wc || wc.isDestroyed()) return

    // Attach listeners BEFORE the grace poll so a fast load cannot be missed
    let settled = false
    let removeListeners = (): void => {}
    const finishGate = { resolve: null as null | (() => void) }
    const waitEvent = new Promise<void>((resolve) => {
      finishGate.resolve = resolve
    })

    const finish = (): void => {
      if (settled) return
      settled = true
      removeListeners()
      // small settle for post-load scripts / SPA routes
      setTimeout(() => finishGate.resolve?.(), 250)
    }

    const t = setTimeout(finish, timeoutMs)
    const onDone = (): void => finish()
    removeListeners = (): void => {
      clearTimeout(t)
      try {
        wc.removeListener('did-finish-load', onDone)
        wc.removeListener('did-fail-load', onDone)
        wc.removeListener('did-stop-loading', onDone)
      } catch {
        // ignore
      }
    }

    try {
      wc.once('did-finish-load', onDone)
      wc.once('did-fail-load', onDone)
      wc.once('did-stop-loading', onDone)
    } catch {
      removeListeners()
      return
    }

    // Navigation may not have flipped isLoading yet — brief grace period
    if (!wc.isLoading()) {
      await new Promise((r) => setTimeout(r, 120))
    }
    if (!wc.isLoading() && !wc.isDestroyed()) {
      // Already settled — drop listeners and allow SPA paint
      if (!settled) {
        settled = true
        removeListeners()
      }
      await new Promise((r) => setTimeout(r, 200))
      return
    }

    await waitEvent
  }

  async observe(tabId?: TabId): Promise<ObserveSnapshot | null> {
    const wc = this.getWebContents(tabId)
    if (!wc) return null
    try {
      return await observePage(wc)
    } catch {
      return null
    }
  }

  async extractText(tabId?: TabId, maxChars = 8000): Promise<unknown | null> {
    const wc = this.getWebContents(tabId)
    if (!wc) return null
    try {
      return await extractText(wc, maxChars)
    } catch {
      return null
    }
  }

  async extractLinks(tabId?: TabId, limit = 40): Promise<unknown | null> {
    const wc = this.getWebContents(tabId)
    if (!wc) return null
    try {
      return await extractLinks(wc, limit)
    } catch {
      return null
    }
  }

  async domAction(
    kind: 'click' | 'type' | 'hover' | 'select' | 'press' | 'scroll' | 'wait_for',
    args: Record<string, unknown>,
    tabId?: TabId
  ): Promise<{ ok: boolean; error?: string; name?: string }> {
    const wc = this.getWebContents(tabId)
    if (!wc) return { ok: false, error: 'No active page' }
    try {
      return await runDomAction(wc, kind, args)
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Action failed' }
    }
  }

  async screenshotActive(tabId?: TabId): Promise<Buffer | null> {
    const wc = this.getWebContents(tabId)
    if (!wc) return null
    try {
      const image = await wc.capturePage()
      return image.toPNG()
    } catch {
      return null
    }
  }

  async extractActiveText(): Promise<string | null> {
    const data = await this.extractText()
    return data ? JSON.stringify(data) : null
  }

  destroy(): void {
    this.destroyed = true
    for (const tab of this.tabs.values()) this.destroyTab(tab)
    this.tabs.clear()
    this.order = []
    this.activeTabId = null
  }

  private destroyTab(tab: ManagedTab): void {
    try {
      this.window.contentView.removeChildView(tab.view)
    } catch {
      // ignore
    }
    try {
      if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close()
    } catch {
      // ignore
    }
  }

  private resolve(id?: TabId): ManagedTab | undefined {
    const tabId = id ?? this.activeTabId
    if (!tabId) return undefined
    return this.tabs.get(tabId)
  }

  private wireViewEvents(tab: ManagedTab): void {
    const { webContents } = tab.view
    const safeEmit = (): void => {
      if (!this.destroyed) this.emitState()
    }

    webContents.on('page-title-updated', (_e, title) => {
      tab.title = title?.trim() || 'New Tab'
      safeEmit()
    })
    webContents.on('page-favicon-updated', (_e, favicons) => {
      tab.favicon = favicons?.[0]
      safeEmit()
    })
    webContents.on('did-start-loading', () => {
      tab.isLoading = true
      safeEmit()
    })
    webContents.on('did-stop-loading', () => {
      tab.isLoading = false
      this.syncNavState(tab)
      safeEmit()
    })
    webContents.on('did-navigate', (_e, url) => {
      tab.url = url
      this.syncNavState(tab)
      safeEmit()
    })
    webContents.on('did-navigate-in-page', (_e, url) => {
      tab.url = url
      this.syncNavState(tab)
      safeEmit()
    })
    webContents.on('did-fail-load', (_e, errorCode, _d, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return
      tab.isLoading = false
      tab.title = 'Failed to load'
      tab.url = validatedURL || tab.url
      safeEmit()
    })
  }

  private syncNavState(tab: ManagedTab): void {
    try {
      const history = tab.view.webContents.navigationHistory
      tab.canGoBack = history.canGoBack()
      tab.canGoForward = history.canGoForward()
    } catch {
      tab.canGoBack = false
      tab.canGoForward = false
    }
  }

  private emitState(): void {
    if (this.destroyed) return
    this.onStateChange(this.getState())
  }
}

export { HOME_URL }
