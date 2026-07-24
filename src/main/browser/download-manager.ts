/**
 * Guest-session download tracking for the Downloads chrome panel.
 */
import { app, shell, type DownloadItem, type Session } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { basename, extname, join, resolve, sep } from 'path'
import type { DownloadItemState, DownloadState } from '../../shared/types'

const MAX_TRACKED = 100
const SAVE_DEBOUNCE_MS = 500

function mapState(item: DownloadItem): DownloadState {
  const s = item.getState()
  if (s === 'progressing' || s === 'completed' || s === 'cancelled' || s === 'interrupted') {
    return s
  }
  return 'interrupted'
}

/** Strip path segments so Content-Disposition cannot escape the downloads folder. */
function safeFilename(raw: string): string {
  let name = basename(raw.replace(/\\/g, '/')).trim()
  name = name.replace(/[\u0000-\u001f<>:"|?*]/g, '_').replace(/^\.+/, '')
  if (!name || name === '.' || name === '..') name = 'download'
  return name.slice(0, 180)
}

function uniqueSavePath(downloadsDir: string, filename: string): string {
  const root = resolve(downloadsDir) + sep
  let candidate = join(downloadsDir, filename)
  if (!resolve(candidate).startsWith(root)) {
    candidate = join(downloadsDir, 'download')
  }
  if (!existsSync(candidate)) return candidate
  const ext = extname(filename)
  const stem = ext ? filename.slice(0, -ext.length) : filename
  for (let i = 1; i < 10_000; i++) {
    const next = join(downloadsDir, `${stem} (${i})${ext}`)
    if (!resolve(next).startsWith(root)) continue
    if (!existsSync(next)) return next
  }
  return join(downloadsDir, `${stem}-${randomUUID().slice(0, 8)}${ext}`)
}

export class DownloadManager {
  private items = new Map<string, DownloadItemState>()
  private live = new Map<string, DownloadItem>()
  private order: string[] = []
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private path: string
  private onChange: ((items: DownloadItemState[]) => void) | null = null
  private wired = false
  /** One-shot URL → preferred relative subfolder under downloads */
  private pendingSubfolders = new Map<string, string>()

  constructor(filePath?: string) {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.path = filePath ?? join(dir, 'downloads.json')
    this.load()
  }

  setOnChange(cb: (items: DownloadItemState[]) => void): void {
    this.onChange = cb
  }

  private load(): void {
    try {
      if (!existsSync(this.path)) return
      const raw = readFileSync(this.path, 'utf8')
      const data = JSON.parse(raw) as { items?: DownloadItemState[] }
      if (!Array.isArray(data.items)) return
      for (const it of data.items) {
        if (!it?.id) continue
        // Never restore as progressing after restart
        const state: DownloadState =
          it.state === 'progressing' ? 'interrupted' : it.state || 'completed'
        this.items.set(it.id, { ...it, state })
        this.order.push(it.id)
      }
    } catch (err) {
      console.warn('[browgent] downloads load failed', err)
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flush(), SAVE_DEBOUNCE_MS)
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    try {
      const items = this.getState().filter((i) => i.state !== 'progressing')
      writeFileSync(this.path, JSON.stringify({ items }, null, 0), 'utf8')
    } catch (err) {
      console.warn('[browgent] downloads save failed', err)
    }
  }

  private emit(): void {
    this.onChange?.(this.getState())
    this.scheduleSave()
  }

  wireSession(sess: Session): void {
    if (this.wired) return
    this.wired = true
    sess.on('will-download', (_event, item) => {
      this.track(item)
    })
  }

  /** Queue preferred subfolder for the next download of this URL (http(s) only). */
  preferSubfolder(url: string, subfolder: string): void {
    const safe = safeFilename(subfolder.replace(/[\\/]+/g, '-')).slice(0, 80) || 'assets'
    try {
      const u = new URL(url)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return
      this.pendingSubfolders.set(u.href, safe)
    } catch {
      /* ignore */
    }
  }

  private track(item: DownloadItem): void {
    const id = randomUUID()
    const downloadsRoot = app.getPath('downloads')
    const itemUrl = item.getURL()
    let downloadsDir = downloadsRoot
    try {
      const key = new URL(itemUrl).href
      const sub = this.pendingSubfolders.get(key)
      if (sub) {
        this.pendingSubfolders.delete(key)
        const candidate = join(downloadsRoot, sub)
        const root = resolve(downloadsRoot) + sep
        if (resolve(candidate).startsWith(root)) {
          if (!existsSync(candidate)) mkdirSync(candidate, { recursive: true })
          downloadsDir = candidate
        }
      }
    } catch {
      /* ignore */
    }
    const filename = safeFilename(item.getFilename() || basename(itemUrl) || 'download')
    // Prefer our safe path; only keep Electron's path if already under downloads.
    let savePath = item.getSavePath()
    if (savePath) {
      const root = resolve(downloadsRoot) + sep
      if (!resolve(savePath).startsWith(root)) {
        savePath = uniqueSavePath(downloadsDir, filename)
        item.setSavePath(savePath)
      }
    } else {
      savePath = uniqueSavePath(downloadsDir, filename)
      item.setSavePath(savePath)
    }

    const state: DownloadItemState = {
      id,
      url: item.getURL(),
      filename: safeFilename(item.getFilename() || filename),
      savePath: item.getSavePath() || savePath,
      mimeType: item.getMimeType() || undefined,
      totalBytes: item.getTotalBytes(),
      receivedBytes: item.getReceivedBytes(),
      state: 'progressing',
      startedAt: Date.now(),
      canResume: item.canResume()
    }

    this.items.set(id, state)
    this.live.set(id, item)
    // Never evict in-flight downloads from the ordered list / map.
    const progressing = new Set(
      this.order.filter((oid) => this.items.get(oid)?.state === 'progressing' || this.live.has(oid))
    )
    progressing.add(id)
    const rest = this.order.filter((x) => x !== id && !progressing.has(x))
    this.order = [id, ...[...progressing].filter((x) => x !== id), ...rest].slice(0, MAX_TRACKED)
    // If still over, drop completed/cancelled only
    while (this.order.length > MAX_TRACKED) {
      const dropIdx = this.order.map((oid, i) => ({ oid, i })).reverse().find(({ oid }) => {
        const it = this.items.get(oid)
        return it && it.state !== 'progressing' && !this.live.has(oid)
      })
      if (!dropIdx) break
      this.order.splice(dropIdx.i, 1)
      this.items.delete(dropIdx.oid)
    }
    for (const [k] of this.items) {
      if (!this.order.includes(k) && !this.live.has(k)) this.items.delete(k)
    }
    this.emit()

    item.on('updated', (_e, _state) => {
      const cur = this.items.get(id)
      if (!cur) return
      cur.receivedBytes = item.getReceivedBytes()
      cur.totalBytes = item.getTotalBytes()
      cur.state = mapState(item)
      cur.savePath = item.getSavePath() || cur.savePath
      cur.filename = safeFilename(item.getFilename() || cur.filename)
      cur.canResume = item.canResume()
      this.emit()
    })

    item.once('done', (_e, doneState) => {
      this.live.delete(id)
      const cur = this.items.get(id)
      if (!cur) return
      cur.receivedBytes = item.getReceivedBytes()
      cur.totalBytes = item.getTotalBytes()
      cur.state =
        doneState === 'completed' || doneState === 'cancelled' || doneState === 'interrupted'
          ? doneState
          : 'interrupted'
      cur.savePath = item.getSavePath() || cur.savePath
      cur.filename = safeFilename(item.getFilename() || cur.filename)
      cur.endedAt = Date.now()
      this.emit()
    })
  }

  getState(): DownloadItemState[] {
    return this.order
      .map((id) => this.items.get(id))
      .filter((i): i is DownloadItemState => Boolean(i))
  }

  open(id: string): boolean {
    const it = this.items.get(id)
    if (!it || it.state !== 'completed') return false
    if (!it.savePath || !existsSync(it.savePath)) return false
    if (!this.isUnderDownloadsRoot(it.savePath)) return false
    void shell.openPath(it.savePath)
    return true
  }

  showInFolder(id: string): boolean {
    const it = this.items.get(id)
    if (!it?.savePath) return false
    if (!existsSync(it.savePath) || !this.isUnderDownloadsRoot(it.savePath)) {
      void shell.openPath(app.getPath('downloads'))
      return true
    }
    shell.showItemInFolder(it.savePath)
    return true
  }

  /** Prevent shell.openPath on paths rewritten in downloads.json outside the downloads root. */
  private isUnderDownloadsRoot(p: string): boolean {
    try {
      const root = resolve(app.getPath('downloads')) + sep
      const target = resolve(p)
      return target.startsWith(root)
    } catch {
      return false
    }
  }

  cancel(id: string): boolean {
    const live = this.live.get(id)
    if (!live) return false
    live.cancel()
    return true
  }

  clearCompleted(): void {
    const keep = new Set(
      this.order.filter((id) => {
        const it = this.items.get(id)
        return it && it.state === 'progressing'
      })
    )
    for (const id of [...this.items.keys()]) {
      if (!keep.has(id)) this.items.delete(id)
    }
    this.order = this.order.filter((id) => keep.has(id))
    this.emit()
  }

  openDownloadsFolder(): void {
    void shell.openPath(app.getPath('downloads'))
  }

  activeCount(): number {
    return this.getState().filter((i) => i.state === 'progressing').length
  }
}
