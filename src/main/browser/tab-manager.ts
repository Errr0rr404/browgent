import { BrowserWindow, WebContentsView, shell, type WebContents } from 'electron'
import { randomUUID } from 'crypto'
import type {
  BrowserChromeMetrics,
  FindInPageOptions,
  FindInPageResult,
  TabId,
  TabState
} from '../../shared/types'
import { normalizeUrl } from '../../shared/types'
import {
  extractLinks,
  extractText,
  observePage
} from './actions'
import type { ObserveSnapshot } from '../../shared/types'
import type { DriverMode } from '../../shared/driver'
import { getRuntimeFlags, setDriverMode as setRuntimeDriverMode } from './runtime-flags'
import { detachDebugger, runPageAction, type DomActionKind } from './page-driver'
import {
  canonicalHost,
  isHttpOrHttpsOrAboutBlank,
  isPrivateOrMetadataHost,
  looksLikeForbiddenScheme
} from '../../shared/policies'
import { applyWebContentsUserAgent, installGuestStealthPatches } from './guest-identity'
import { scanPageAssets, type AssetKind, type PageAsset } from './asset-scanner'
import { maybeHandleCookieBanner } from './cookie-banner'
import { getPrivacyStore } from './privacy-store'
import type { DownloadManager } from './download-manager'

interface AgentGuardPolicy {
  allowHosts: string[]
  blockHosts: string[]
  crossHostRequired: boolean
}

interface NavigationAttempt {
  id: number
  baseHost: string
  approvedHost: string
  ts: number
}

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
  guardPolicy: AgentGuardPolicy | null
  activeAttempt: NavigationAttempt | null
  navFailedReason: string | null
  zoomFactor: number
}

export interface VisitRecord {
  url: string
  /** Omit when title is not yet known (e.g. mid-navigation). */
  title?: string
  favicon?: string
}

/** Default new-tab target — chrome renders the New Tab page over about:blank */
const HOME_URL = 'about:blank'
const MAX_TABS = 24
export const PAGE_PARTITION = 'persist:browgent-pages'
// Align with waitForLoad (~15s) + multi-hop OAuth redirects; 5s was too short.
const ATTEMPT_MAX_AGE_MS = 20_000

function resolveAndGate(rawInput: string): { ok: true; url: string } | { ok: false } {
  if (typeof rawInput !== 'string') return { ok: false }
  const trimmed = rawInput.trim()
  if (!trimmed) return { ok: false }
  if (looksLikeForbiddenScheme(trimmed)) return { ok: false }
  const url = normalizeUrl(trimmed)
  if (!isHttpOrHttpsOrAboutBlank(url)) return { ok: false }
  return { ok: true, url }
}

function hostOf(u: string | null | undefined): string {
  if (!u) return ''
  try {
    return new URL(u).hostname.toLowerCase()
  } catch {
    return ''
  }
}

export class TabManager {
  private tabs = new Map<TabId, ManagedTab>()
  private order: TabId[] = []
  private activeTabId: TabId | null = null
  private metrics: BrowserChromeMetrics = {
    top: 124,
    right: 400,
    bottom: 30,
    left: 0
  }
  private destroyed = false
  private lastPopupAt = new Map<TabId, number>()
  /** In-app agent actuation path (dom | cdp). External Playwright always uses CDP endpoint. */
  private driverMode: DriverMode = getRuntimeFlags().driverMode
  private attemptCounter = 0
  /**
   * Chrome-overlay override (Settings). New Tab (`about:blank`) is always hidden
   * via URL check — only Settings needs an explicit hide while a real page sits under it.
   */
  private guestForcedHidden = false
  /** Called after guest bounds update so overlays (pet) can re-raise above guests. */
  afterLayout: (() => void) | null = null
  /** Fired once per main-frame navigation for browsing history. */
  onVisit: ((visit: VisitRecord) => void) | null = null
  /** Title/favicon updates for an already-recorded URL (no new visit). */
  onVisitMeta: ((visit: VisitRecord) => void) | null = null
  /** Find-in-page result stream for the chrome Find bar. */
  onFindResult: ((result: FindInPageResult) => void) | null = null
  /** Optional downloads manager for asset batch saves. */
  downloadManager: DownloadManager | null = null

  constructor(
    private window: BrowserWindow,
    private onStateChange: (tabs: TabState[]) => void
  ) {}

  getDriverMode(): DriverMode {
    return this.driverMode
  }

  setDriverMode(mode: DriverMode): void {
    this.driverMode = mode
    setRuntimeDriverMode(mode)
  }

  count(): number {
    return this.tabs.size
  }

  getActiveTabId(): TabId | null {
    return this.activeTabId
  }

  has(tabId: TabId): boolean {
    return this.tabs.has(tabId)
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
    if (tab.owner === owner) return
    tab.owner = owner
    if (owner !== 'agent') {
      tab.activeAttempt = null
    }
    if (owner === null) {
      tab.guardPolicy = null
      tab.activeAttempt = null
    }
    this.emitState()
  }

  applyGuardPolicy(tabId: TabId, policy: AgentGuardPolicy | null): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    tab.guardPolicy = policy
    if (!policy) tab.activeAttempt = null
  }

  releaseAgentTabs(): number {
    let n = 0
    for (const tab of this.tabs.values()) {
      if (tab.owner === 'agent') {
        tab.owner = null
        tab.guardPolicy = null
        tab.activeAttempt = null
        n++
      }
    }
    if (n > 0) this.emitState()
    return n
  }

  transferAgentTabsToHuman(): number {
    let n = 0
    for (const tab of this.tabs.values()) {
      if (tab.owner === 'agent') {
        tab.owner = 'human'
        tab.guardPolicy = null
        tab.activeAttempt = null
        n++
      }
    }
    if (n > 0) this.emitState()
    return n
  }

  getCommittedHost(tabId?: TabId): string {
    const tab = this.tabs.get(tabId ?? this.activeTabId ?? '')
    if (!tab || tab.view.webContents.isDestroyed()) return ''
    return hostOf(tab.view.webContents.getURL())
  }

  getHistoryTargetUrl(tabId: TabId | undefined, offset: -1 | 1): string | null {
    const tab = this.resolve(tabId)
    if (!tab || tab.view.webContents.isDestroyed()) return null
    try {
      const history = tab.view.webContents.navigationHistory
      const index = history.getActiveIndex() + offset
      if (index < 0 || index >= history.length()) return null
      return history.getEntryAtIndex(index)?.url ?? null
    } catch {
      return null
    }
  }

  beginNavigationAttempt(tabId: TabId, approvedHost: string): number {
    const tab = this.tabs.get(tabId)
    if (!tab || tab.view.webContents.isDestroyed()) return -1
    const baseHost = this.getCommittedHost(tabId)
    const attempt: NavigationAttempt = {
      id: ++this.attemptCounter,
      baseHost,
      approvedHost: approvedHost.toLowerCase(),
      ts: Date.now()
    }
    tab.activeAttempt = attempt
    tab.navFailedReason = null
    return attempt.id
  }

  updateApprovedHost(tabId: TabId, approvedHost: string): number {
    const tab = this.tabs.get(tabId)
    if (!tab) return -1
    const host = approvedHost.toLowerCase()
    if (tab.activeAttempt) {
      tab.activeAttempt = { ...tab.activeAttempt, approvedHost: host, ts: Date.now() }
      return tab.activeAttempt.id
    }
    tab.activeAttempt = {
      id: ++this.attemptCounter,
      baseHost: this.getCommittedHost(tabId),
      approvedHost: host,
      ts: Date.now()
    }
    tab.navFailedReason = null
    return tab.activeAttempt.id
  }

  clearNavigationAttempt(tabId: TabId, attemptId?: number): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    if (attemptId === undefined) {
      tab.activeAttempt = null
      return
    }
    if (tab.activeAttempt?.id === attemptId) tab.activeAttempt = null
  }

  grantOneTimeHost(tabId: TabId | null | undefined, host: string): number {
    const id = tabId ?? this.activeTabId ?? ''
    if (!id) return -1
    return this.updateApprovedHost(id, host)
  }

  createAgentTab(
    url: string,
    activate: boolean,
    guardPolicy: AgentGuardPolicy,
    initialApprovedHost: string,
    activateIfExists: boolean = true
  ): TabId | null {
    if (this.destroyed) return null
    if (this.tabs.size >= MAX_TABS) {
      console.warn(`Tab limit reached (${MAX_TABS})`)
      return null
    }

    const gate = resolveAndGate(url)
    if (!gate.ok) return null
    const safeUrl = gate.url

    const id = randomUUID()
    const view = this.createGuestView()

    const tab: ManagedTab = {
      id,
      view,
      title: 'New Tab',
      url: safeUrl,
      isLoading: true,
      canGoBack: false,
      canGoForward: false,
      owner: 'agent',
      guardPolicy,
      activeAttempt: {
        id: ++this.attemptCounter,
        baseHost: '',
        approvedHost: initialApprovedHost.toLowerCase(),
        ts: Date.now()
      },
      navFailedReason: null,
      zoomFactor: 1
    }

    this.wireViewEvents(tab)
    this.tabs.set(id, tab)
    this.order.push(id)
    this.window.contentView.addChildView(view)
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    view.setVisible(false)

    void view.webContents.loadURL(tab.url).catch((err) => {
      console.warn('loadURL failed', err)
      tab.isLoading = false
      tab.title = 'Failed to load'
      tab.navFailedReason = 'Failed to load'
      tab.activeAttempt = null
      this.emitState()
    })

    if (activate && activateIfExists) this.activateTab(id)
    else this.emitState()

    return id
  }

  createTab(url = HOME_URL, activate = true): TabId | null {
    if (this.destroyed) return null
    if (this.tabs.size >= MAX_TABS) {
      console.warn(`Tab limit reached (${MAX_TABS})`)
      return null
    }

    const gate = resolveAndGate(url)
    if (!gate.ok) return null
    const safeUrl = gate.url

    const id = randomUUID()
    const view = this.createGuestView()

    const tab: ManagedTab = {
      id,
      view,
      title: 'New Tab',
      url: safeUrl,
      isLoading: true,
      canGoBack: false,
      canGoForward: false,
      owner: null,
      guardPolicy: null,
      activeAttempt: null,
      navFailedReason: null,
      zoomFactor: 1
    }

    this.wireViewEvents(tab)
    this.tabs.set(id, tab)
    this.order.push(id)
    this.window.contentView.addChildView(view)
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    view.setVisible(false)

    void view.webContents.loadURL(tab.url).catch((err) => {
      console.warn('loadURL failed', err)
      tab.isLoading = false
      tab.title = 'Failed to load'
      this.emitState()
    })

    if (activate) this.activateTab(id)
    else this.emitState()

    return id
  }

  closeTab(id: TabId): boolean {
    if (this.destroyed) return false
    const tab = this.tabs.get(id)
    if (!tab) return false

    this.destroyTab(tab)
    this.tabs.delete(id)
    this.lastPopupAt.delete(id)
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
    return true
  }

  activateTab(id: TabId): boolean {
    if (this.destroyed || !this.tabs.has(id)) return false

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
    return true
  }

  navigate(id: TabId | undefined, input: string): boolean {
    const tabId = id ?? this.activeTabId
    if (!tabId) return false
    const tab = this.tabs.get(tabId)
    if (!tab || tab.view.webContents.isDestroyed()) return false

    const gate = resolveAndGate(input)
    if (!gate.ok) return false
    const url = gate.url

    tab.navFailedReason = null
    tab.url = url
    tab.title = 'Loading…'
    tab.isLoading = true

    if (tab.owner === 'agent' && tab.guardPolicy) {
      const targetHost = hostOf(url) || ''
      this.beginNavigationAttempt(tabId, targetHost)
    }

    void tab.view.webContents.loadURL(url).catch((err) => {
      console.warn('navigate loadURL failed', err)
      tab.isLoading = false
      tab.title = 'Failed to load'
      tab.navFailedReason = 'Failed to load'
      tab.activeAttempt = null
      this.emitState()
    })
    // Leaving about:blank → show guest immediately (don't wait for renderer effect)
    this.layoutActiveView()
    this.emitState()
    return true
  }

  goBack(id?: TabId): boolean {
    const tab = this.resolve(id)
    if (!tab || tab.view.webContents.isDestroyed()) return false
    if (!tab.view.webContents.navigationHistory.canGoBack()) return false
    const targetUrl = this.getHistoryTargetUrl(tab.id, -1)
    tab.isLoading = true
    tab.navFailedReason = null
    if (tab.owner === 'agent' && tab.guardPolicy) {
      this.beginNavigationAttempt(tab.id, targetUrl ? hostOf(targetUrl) : '')
    }
    tab.view.webContents.navigationHistory.goBack()
    return true
  }

  goForward(id?: TabId): boolean {
    const tab = this.resolve(id)
    if (!tab || tab.view.webContents.isDestroyed()) return false
    if (!tab.view.webContents.navigationHistory.canGoForward()) return false
    const targetUrl = this.getHistoryTargetUrl(tab.id, 1)
    tab.isLoading = true
    tab.navFailedReason = null
    if (tab.owner === 'agent' && tab.guardPolicy) {
      this.beginNavigationAttempt(tab.id, targetUrl ? hostOf(targetUrl) : '')
    }
    tab.view.webContents.navigationHistory.goForward()
    return true
  }

  reload(id?: TabId): boolean {
    const tab = this.resolve(id)
    if (!tab || tab.view.webContents.isDestroyed()) return false
    tab.isLoading = true
    tab.navFailedReason = null
    tab.view.webContents.reload()
    this.emitState()
    return true
  }

  stop(id?: TabId): boolean {
    const tab = this.resolve(id)
    if (!tab || tab.view.webContents.isDestroyed()) return false
    tab.view.webContents.stop()
    return true
  }

  findInPage(text: string, options?: FindInPageOptions, tabId?: TabId): number {
    const tab = this.resolve(tabId)
    if (!tab || tab.view.webContents.isDestroyed()) return 0
    const q = text.trim()
    if (!q) {
      tab.view.webContents.stopFindInPage('clearSelection')
      return 0
    }
    return tab.view.webContents.findInPage(q, {
      forward: options?.forward ?? true,
      findNext: options?.findNext ?? false,
      matchCase: options?.matchCase ?? false
    })
  }

  stopFindInPage(tabId?: TabId): void {
    const tab = this.resolve(tabId)
    if (!tab || tab.view.webContents.isDestroyed()) return
    try {
      tab.view.webContents.stopFindInPage('clearSelection')
    } catch {
      // ignore
    }
  }

  getZoomFactor(tabId?: TabId): number {
    const tab = this.resolve(tabId)
    if (!tab || tab.view.webContents.isDestroyed()) return 1
    try {
      return tab.view.webContents.getZoomFactor()
    } catch {
      return tab.zoomFactor
    }
  }

  setZoomFactor(factor: number, tabId?: TabId): number {
    const tab = this.resolve(tabId)
    if (!tab || tab.view.webContents.isDestroyed()) return 1
    const next = Math.min(5, Math.max(0.25, Math.round(factor * 100) / 100))
    try {
      tab.view.webContents.setZoomFactor(next)
      tab.zoomFactor = next
    } catch {
      // ignore
    }
    this.emitState()
    return tab.zoomFactor
  }

  zoomIn(tabId?: TabId): number {
    const cur = this.getZoomFactor(tabId)
    return this.setZoomFactor(cur + 0.1, tabId)
  }

  zoomOut(tabId?: TabId): number {
    const cur = this.getZoomFactor(tabId)
    return this.setZoomFactor(cur - 0.1, tabId)
  }

  zoomReset(tabId?: TabId): number {
    return this.setZoomFactor(1, tabId)
  }

  print(tabId?: TabId): boolean {
    const tab = this.resolve(tabId)
    if (!tab || tab.view.webContents.isDestroyed()) return false
    if (this.isBlankTabUrl(tab.url)) return false
    try {
      tab.view.webContents.print({ silent: false, printBackground: true })
      return true
    } catch (err) {
      console.warn('[browgent] print failed', err)
      return false
    }
  }

  setChromeMetrics(metrics: BrowserChromeMetrics): void {
    this.metrics = { ...metrics }
    this.layoutActiveView()
  }

  /**
   * Force-hide the guest view for chrome overlays (Settings).
   * Pass true to hide; false restores normal blank-URL / metrics layout.
   */
  setGuestVisible(visible: boolean): void {
    this.guestForcedHidden = !visible
    this.layoutActiveView()
  }

  private isBlankTabUrl(url: string): boolean {
    const u = (url || '').trim().toLowerCase()
    return !u || u === 'about:blank' || u === 'about:blank/' || u === 'about:newtab'
  }

  layoutActiveView(): void {
    if (this.destroyed || !this.activeTabId) return
    const tab = this.tabs.get(this.activeTabId)
    if (!tab || this.window.isDestroyed()) return

    const isBlank = this.isBlankTabUrl(tab.url)
    const show = !this.guestForcedHidden && !isBlank

    if (!show) {
      try {
        tab.view.setVisible(false)
        tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      } catch {
        // ignore
      }
      this.afterLayout?.()
      return
    }

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

    this.afterLayout?.()
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
        owner: tab.owner,
        zoomFactor: tab.zoomFactor
      }))
  }

  async waitForLoad(tabId?: TabId, timeoutMs = 15000, signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted) return false
    const tab = this.tabs.get(tabId ?? this.activeTabId ?? '')
    if (!tab || tab.view.webContents.isDestroyed()) return false
    const wc = tab.view.webContents

    return new Promise<boolean>((resolve) => {
      if (signal?.aborted) {
        resolve(false)
        return
      }
      let settled = false
      let timer: ReturnType<typeof setTimeout> | null = null
      let pollTimer: ReturnType<typeof setInterval> | null = null
      let settleTimer: ReturnType<typeof setTimeout> | null = null

      const onDone = (): void => {
        if (settled) return
        settleTimer = setTimeout(() => {
          if (settled) return
          settled = true
          cleanup()
          resolve(!signal?.aborted)
        }, 250)
      }
      const onFail = (_e: unknown, errorCode?: number, _d?: unknown, _v?: unknown, isMainFrame?: boolean): void => {
        if (isMainFrame === false) return
        if (typeof errorCode === 'number' && errorCode === -3) return
        if (settled) return
        settled = true
        cleanup()
        resolve(false)
      }
      const onAbort = (): void => {
        if (settled) return
        settled = true
        cleanup()
        resolve(false)
      }
      const onTimeout = (): void => {
        if (settled) return
        settled = true
        cleanup()
        resolve(false)
      }

      const cleanup = (): void => {
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
        if (pollTimer) {
          clearInterval(pollTimer)
          pollTimer = null
        }
        if (settleTimer) {
          clearTimeout(settleTimer)
          settleTimer = null
        }
        try { wc.removeListener('did-finish-load', onDone) } catch { /* listener already gone */ }
        try { wc.removeListener('did-fail-load', onFail) } catch { /* listener already gone */ }
        if (signal) signal.removeEventListener('abort', onAbort)
      }

      timer = setTimeout(onTimeout, Math.max(1, timeoutMs))
      try {
        wc.on('did-finish-load', onDone)
        wc.on('did-fail-load', onFail)
      } catch {
        cleanup()
        resolve(false)
        return
      }
      if (signal) signal.addEventListener('abort', onAbort, { once: true })

      pollTimer = setInterval(() => {
        if (settled) return
        if (tab.navFailedReason) {
          settled = true
          cleanup()
          resolve(false)
          return
        }
        if (wc.isDestroyed()) {
          settled = true
          cleanup()
          resolve(false)
        }
      }, 100)

      if (!tab.isLoading && !tab.navFailedReason) {
        settleTimer = setTimeout(() => {
          if (settled) return
          settled = true
          cleanup()
          resolve(!signal?.aborted)
        }, 200)
      }
    })
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
    kind: DomActionKind,
    args: Record<string, unknown>,
    tabId?: TabId,
    signal?: AbortSignal
  ): Promise<{ ok: boolean; error?: string; name?: string; via?: 'dom' | 'cdp' }> {
    if (signal?.aborted) return { ok: false, error: 'Aborted' }
    const wc = this.getWebContents(tabId)
    if (!wc) return { ok: false, error: 'No active page' }
    try {
      const r = await runPageAction(wc, kind, args, this.driverMode, signal)
      if (signal?.aborted) return { ok: false, error: 'Aborted' }
      return r
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

  async listAssets(tabId?: TabId, kinds?: AssetKind[]): Promise<PageAsset[]> {
    const wc = this.getWebContents(tabId)
    if (!wc) return []
    const all = await scanPageAssets(wc)
    if (!kinds || kinds.length === 0) return all
    const set = new Set(kinds)
    return all.filter((a) => set.has(a.kind))
  }

  async downloadAssets(
    urls: string[],
    opts?: { tabId?: TabId; subfolder?: string; allowPrivateHosts?: boolean }
  ): Promise<{ started: number; errors: string[] }> {
    const wc = this.getWebContents(opts?.tabId)
    if (!wc) return { started: 0, errors: ['No active page'] }
    const errors: string[] = []
    let started = 0
    const sub = (opts?.subfolder || 'browgent-assets').slice(0, 80)
    const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))].slice(0, 50)
    const allowPrivate =
      opts?.allowPrivateHosts === true || process.env.BROWGENT_ALLOW_PRIVATE_HOSTS === '1'
    for (const raw of unique) {
      try {
        const u = new URL(raw)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          errors.push(`blocked scheme: ${raw.slice(0, 80)}`)
          continue
        }
        const host = u.hostname.toLowerCase()
        if (!allowPrivate && isPrivateOrMetadataHost(host)) {
          errors.push(`blocked private/metadata host: ${host}`)
          continue
        }
        this.downloadManager?.preferSubfolder(u.href, sub)
        wc.downloadURL(u.href)
        started += 1
      } catch (e) {
        errors.push(e instanceof Error ? e.message : `failed: ${raw.slice(0, 60)}`)
      }
    }
    return { started, errors }
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
      if (!tab.view.webContents.isDestroyed()) detachDebugger(tab.view.webContents)
    } catch {
      // ignore
    }
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

  private hostAllowedByPolicy(host: string, policy: AgentGuardPolicy): boolean {
    // Canonicalize the host AND every list entry (lowercase, strip trailing dot) so a trailing-dot
    // host (google.com.) or mixed-case block entry (Google.com) can't bypass the block-list.
    // Mirrors isHostAllowed in shared/policies. [block-bypass fix]
    const h = canonicalHost(host)
    if (!h) return false
    if (
      policy.blockHosts.some((b) => {
        const entry = canonicalHost(b)
        return entry !== '' && (h === entry || h.endsWith(`.${entry}`))
      })
    ) {
      return false
    }
    if (policy.allowHosts.length === 0) return true
    return policy.allowHosts.some((a) => {
      const entry = canonicalHost(a)
      if (!entry || entry.length < 2) return false
      return h === entry || h.endsWith(`.${entry}`)
    })
  }

  private isAttemptFresh(attempt: NavigationAttempt): boolean {
    return Date.now() - attempt.ts <= ATTEMPT_MAX_AGE_MS
  }

  private guardAgentNavigation(
    tab: ManagedTab,
    targetUrl: string,
    event: { preventDefault: () => void },
    isMainFrame: boolean
  ): boolean {
    if (!isMainFrame) return true

    let parsed: URL
    try {
      parsed = new URL(targetUrl)
    } catch {
      event.preventDefault()
      this.markNavBlocked(tab, targetUrl, 'Bad URL')
      return false
    }

    // Universal dangerous-scheme gate for all guest tabs (human and agent).
    // Allow chrome-error / about:blank so real error pages still render; block file/js/data.
    const proto = parsed.protocol
    const dangerous =
      proto === 'file:' ||
      proto === 'javascript:' ||
      proto === 'vbscript:' ||
      proto === 'data:' ||
      proto === 'blob:' ||
      proto === 'jar:'
    if (dangerous) {
      event.preventDefault()
      this.markNavBlocked(tab, targetUrl, 'Blocked URL scheme')
      return false
    }

    // Host / cross-host policy only applies while the agent owns the tab.
    if (tab.owner !== 'agent' || !tab.guardPolicy) return true

    // Agent tabs: only http(s) / about:blank top-level navigations
    if (proto !== 'http:' && proto !== 'https:' && targetUrl !== 'about:blank') {
      event.preventDefault()
      this.markNavBlocked(tab, targetUrl, 'Blocked URL scheme')
      return false
    }

    const targetHost = parsed.hostname.toLowerCase()

    if (!this.hostAllowedByPolicy(targetHost, tab.guardPolicy)) {
      event.preventDefault()
      this.markNavBlocked(tab, targetUrl, `Host blocked by policy: ${targetHost}`)
      return false
    }

    if (!tab.guardPolicy.crossHostRequired) return true

    const prevHost = this.getCommittedHost(tab.id)
    if (prevHost && prevHost === targetHost) return true

    const attempt = tab.activeAttempt
    if (attempt && this.isAttemptFresh(attempt)) {
      if (targetHost === attempt.approvedHost && attempt.approvedHost) {
        // Refresh TTL on each approved hop so multi-redirect OAuth chains stay valid
        attempt.ts = Date.now()
        attempt.baseHost = targetHost
        return true
      }
      if (targetHost === attempt.baseHost && attempt.baseHost) {
        attempt.ts = Date.now()
        return true
      }
    }

    event.preventDefault()
    this.markNavBlocked(tab, targetUrl, `Cross-host not approved: ${targetHost}`)
    return false
  }

  private markNavBlocked(tab: ManagedTab, _targetUrl: string, reason: string): void {
    tab.navFailedReason = reason
    tab.isLoading = false
    tab.title = 'Blocked by policy'
    try {
      const committed = tab.view.webContents.getURL() || 'about:blank'
      tab.url = committed
    } catch {
      // ignore
    }
    this.emitState()
  }

  /** Guest WebContentsView with Chrome-like identity (no Electron UA leak). */
  private createGuestView(): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: true,
        partition: PAGE_PARTITION
      }
    })
    applyWebContentsUserAgent(view.webContents)
    installGuestStealthPatches(view.webContents)
    return view
  }

  private wireViewEvents(tab: ManagedTab): void {
    const { webContents } = tab.view
    const safeEmit = (): void => {
      if (!this.destroyed) this.emitState()
    }

    webContents.setWindowOpenHandler(({ url: target }) => {
      const now = Date.now()
      // Debounce popup storms (ads / multi-window openers)
      const lastPopupAt = this.lastPopupAt.get(tab.id) ?? 0
      if (now - lastPopupAt < 400) return { action: 'deny' }
      this.lastPopupAt.set(tab.id, now)
      if (!target) return { action: 'deny' }

      if (tab.owner === 'agent' && tab.guardPolicy) {
        return this.handleAgentPopup(tab, target)
      }

      // Block file://, javascript:, data: popups from untrusted pages
      if (target.startsWith('mailto:') || target.startsWith('tel:') || target.startsWith('sms:')) {
        void shell.openExternal(target)
      } else if (isHttpOrHttpsOrAboutBlank(target)) {
        this.createTab(target, true)
      }
      return { action: 'deny' }
    })

    // Electron 36: (details, url, isInPlace, isMainFrame, …) — 3rd arg is isInPlace,
    // not isMainFrame. Prefer details fields so agent host guards actually run.
    webContents.on('will-navigate', (details) => {
      const url = details.url
      const isMainFrame = details.isMainFrame !== false
      this.guardAgentNavigation(tab, url, details, isMainFrame)
    })

    webContents.on('will-redirect', (details) => {
      const url = details.url
      const isMainFrame = details.isMainFrame !== false
      this.guardAgentNavigation(tab, url, details, isMainFrame)
    })

    webContents.on('page-title-updated', (_e, title) => {
      const trimmed = title?.trim()
      if (this.isBlankTabUrl(tab.url) || !trimmed || trimmed === 'about:blank') {
        tab.title = 'New Tab'
      } else {
        tab.title = trimmed
      }
      if (!this.isBlankTabUrl(tab.url) && tab.title && tab.title !== 'New Tab') {
        this.onVisitMeta?.({ url: tab.url, title: tab.title, favicon: tab.favicon })
      }
      safeEmit()
    })
    webContents.on('page-favicon-updated', (_e, favicons) => {
      tab.favicon = favicons?.[0]
      if (!this.isBlankTabUrl(tab.url)) {
        this.onVisitMeta?.({ url: tab.url, title: tab.title, favicon: tab.favicon })
      }
      safeEmit()
    })
    webContents.on('did-start-loading', () => {
      tab.isLoading = true
      tab.navFailedReason = null
      safeEmit()
    })
    webContents.on('did-stop-loading', () => {
      tab.isLoading = false
      this.syncNavState(tab)
      safeEmit()
    })
    webContents.on('did-finish-load', () => {
      if (tab.activeAttempt) tab.activeAttempt = null
      tab.navFailedReason = null
      safeEmit()
      // Best-effort cookie banner handling (prefs-driven; once per nav key)
      const mode = getPrivacyStore().get().cookieBannerMode
      if (mode !== 'off' && !this.isBlankTabUrl(tab.url) && /^https?:/i.test(tab.url)) {
        const navKey = `${tab.id}:${tab.url}`
        void maybeHandleCookieBanner(webContents, mode, navKey).catch(() => {
          /* ignore */
        })
      }
    })
    webContents.on('did-navigate', (_e, url) => {
      tab.url = url
      this.syncNavState(tab)
      if (tab.id === this.activeTabId) this.layoutActiveView()
      if (!this.isBlankTabUrl(url)) {
        // Commit URL only here — title/favicon are often still the previous page or
        // "Loading…"; page-title-updated / favicon-updated fill meta via onVisitMeta.
        this.onVisit?.({ url })
      }
      safeEmit()
    })
    webContents.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (isMainFrame === false) return
      tab.url = url
      this.syncNavState(tab)
      if (tab.id === this.activeTabId) this.layoutActiveView()
      if (!this.isBlankTabUrl(url)) {
        this.onVisit?.({ url })
      }
      safeEmit()
    })
    webContents.on('did-fail-load', (_e, errorCode, _d, validatedURL, isMainFrame) => {
      if (isMainFrame === false) {
        safeEmit()
        return
      }
      if (errorCode === -3) {
        safeEmit()
        return
      }
      tab.isLoading = false
      tab.title = 'Failed to load'
      tab.url = validatedURL || tab.url
      if (tab.activeAttempt) tab.activeAttempt = null
      safeEmit()
    })
    webContents.on('found-in-page', (_e, result) => {
      this.onFindResult?.({
        tabId: tab.id,
        requestId: result.requestId,
        activeMatchOrdinal: result.activeMatchOrdinal,
        matches: result.matches,
        finalUpdate: result.finalUpdate
      })
    })
  }

  private handleAgentPopup(tab: ManagedTab, target: string): { action: 'deny' } {
    if (!isHttpOrHttpsOrAboutBlank(target)) return { action: 'deny' }
    const targetHost = hostOf(target)
    if (!targetHost) return { action: 'deny' }
    const policy = tab.guardPolicy
    if (!policy) return { action: 'deny' }
    if (!this.hostAllowedByPolicy(targetHost, policy)) return { action: 'deny' }
    const currentHost = this.getCommittedHost(tab.id)
    const sameHost = !!(currentHost && currentHost === targetHost)
    if (!sameHost) {
      const attempt = tab.activeAttempt
      if (!attempt) return { action: 'deny' }
      if (!this.isAttemptFresh(attempt)) return { action: 'deny' }
      if (targetHost !== attempt.approvedHost) return { action: 'deny' }
    }
    this.createAgentTab(target, true, policy, targetHost)
    return { action: 'deny' }
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
