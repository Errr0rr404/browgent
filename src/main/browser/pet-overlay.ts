import { BrowserWindow, WebContentsView, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import { IPC } from '@shared/types'

export const PET_SIZE = 96
/** Extra headroom so the context menu is not clipped by the native view. */
const VIEW_W = 148
const VIEW_H = 168
const PAD = 12

export type PetMood = 'idle' | 'busy' | 'attention'

export interface PetOverlayState {
  visible: boolean
  theme: string
  mood: PetMood
  x: number
  y: number
}

/**
 * Topmost transparent WebContentsView so the companion can float over guest pages
 * (guest WebContentsViews paint above the chrome HTML layer).
 */
export class PetOverlay {
  private view: WebContentsView | null = null
  private state: PetOverlayState = {
    visible: false,
    theme: 'eink',
    mood: 'idle',
    x: -1,
    y: -1
  }
  private ready = false
  private dragBase: { x: number; y: number } | null = null
  /** Full-window hit target while dragging so pointer events do not drop. */
  private dragging = false
  private onToggle: (() => void) | null = null
  private onHide: (() => void) | null = null
  private onMoved: ((x: number, y: number) => void) | null = null
  private ipcBound = false

  constructor(private readonly window: BrowserWindow) {
    this.bindIpc()
  }

  setHandlers(opts: {
    onToggle: () => void
    onHide: () => void
    onMoved: (x: number, y: number) => void
  }): void {
    this.onToggle = opts.onToggle
    this.onHide = opts.onHide
    this.onMoved = opts.onMoved
  }

  private assertPetSender(e: IpcMainInvokeEvent): void {
    if (!this.view || e.sender !== this.view.webContents) {
      throw new Error('Unauthorized pet IPC sender')
    }
  }

  private bindIpc(): void {
    for (const ch of [
      IPC.PET_DRAG_START,
      IPC.PET_DRAG_BY,
      IPC.PET_DRAG_END,
      IPC.PET_CLICK,
      IPC.PET_HIDE
    ]) {
      try {
        ipcMain.removeHandler(ch)
      } catch {
        /* ignore */
      }
    }

    ipcMain.handle(IPC.PET_DRAG_START, (e) => {
      this.assertPetSender(e)
      this.dragging = true
      this.dragBase = { x: this.state.x, y: this.state.y }
      this.applyBounds()
      this.pushState()
    })
    ipcMain.handle(IPC.PET_DRAG_BY, (e, dx: number, dy: number) => {
      this.assertPetSender(e)
      if (!this.dragBase) return
      if (typeof dx !== 'number' || typeof dy !== 'number') return
      this.setPosition(this.dragBase.x + dx, this.dragBase.y + dy, false)
    })
    ipcMain.handle(IPC.PET_DRAG_END, (e) => {
      this.assertPetSender(e)
      this.dragging = false
      this.dragBase = null
      this.applyBounds()
      this.pushState()
      this.onMoved?.(this.state.x, this.state.y)
    })
    ipcMain.handle(IPC.PET_CLICK, (e) => {
      this.assertPetSender(e)
      this.onToggle?.()
    })
    ipcMain.handle(IPC.PET_HIDE, (e) => {
      this.assertPetSender(e)
      this.onHide?.()
    })
    this.ipcBound = true
  }

  private unbindIpc(): void {
    if (!this.ipcBound) return
    for (const ch of [
      IPC.PET_DRAG_START,
      IPC.PET_DRAG_BY,
      IPC.PET_DRAG_END,
      IPC.PET_CLICK,
      IPC.PET_HIDE
    ]) {
      try {
        ipcMain.removeHandler(ch)
      } catch {
        /* ignore */
      }
    }
    this.ipcBound = false
  }

  ensure(): void {
    if (this.view || this.window.isDestroyed()) return

    const preload = join(__dirname, '../preload/pet.js')
    const view = new WebContentsView({
      webPreferences: {
        preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false
      }
    })

    try {
      view.setBackgroundColor('#00000000')
    } catch {
      /* older electron */
    }

    this.view = view
    this.window.contentView.addChildView(view)
    view.setVisible(false)
    view.setBounds({ x: 0, y: 0, width: VIEW_W, height: VIEW_H })

    void view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(petHtml())}`)

    view.webContents.on('did-finish-load', () => {
      this.ready = true
      this.pushState()
      this.applyBounds()
      this.raise()
    })
  }

  configure(partial: Partial<PetOverlayState>): void {
    this.ensure()
    this.state = { ...this.state, ...partial }
    if (this.state.x < 0 || this.state.y < 0) {
      this.defaultPosition()
    }
    this.applyBounds()
    this.pushState()
    if (this.state.visible) this.raise()
  }

  private defaultPosition(): void {
    if (this.window.isDestroyed()) return
    const [cw, ch] = this.window.getContentSize()
    this.state.x = Math.max(PAD, cw - VIEW_W - 24)
    this.state.y = Math.max(PAD, ch - VIEW_H - 24)
  }

  setPosition(x: number, y: number, emit = false): void {
    if (this.window.isDestroyed()) return
    const [cw, ch] = this.window.getContentSize()
    const nx = Math.round(Math.min(Math.max(PAD, x), Math.max(PAD, cw - VIEW_W - PAD)))
    const ny = Math.round(Math.min(Math.max(PAD, y), Math.max(PAD, ch - VIEW_H - PAD)))
    this.state.x = nx
    this.state.y = ny
    this.applyBounds()
    this.pushState()
    if (emit) this.onMoved?.(nx, ny)
  }

  private applyBounds(): void {
    if (!this.view || this.window.isDestroyed()) return
    if (this.state.x < 0 || this.state.y < 0) this.defaultPosition()
    try {
      if (this.dragging) {
        // Full content so pointer events keep flowing while the cursor leaves the mark.
        const [cw, ch] = this.window.getContentSize()
        this.view.setBounds({ x: 0, y: 0, width: cw, height: ch })
      } else {
        this.view.setBounds({
          x: this.state.x,
          y: this.state.y,
          width: VIEW_W,
          height: VIEW_H
        })
      }
      this.view.setVisible(Boolean(this.state.visible))
    } catch {
      /* ignore */
    }
  }

  /** Keep pet above guest WebContentsViews after tab layout. */
  raise(): void {
    if (!this.view || this.window.isDestroyed() || !this.state.visible) return
    try {
      this.window.contentView.addChildView(this.view)
      this.applyBounds()
    } catch {
      /* ignore */
    }
  }

  private pushState(): void {
    if (!this.view || !this.ready || this.view.webContents.isDestroyed()) return
    try {
      this.view.webContents.send(IPC.PET_STATE, {
        theme: this.state.theme,
        mood: this.state.mood,
        visible: this.state.visible,
        x: this.state.x,
        y: this.state.y,
        dragging: this.dragging
      })
    } catch {
      /* ignore */
    }
  }

  destroy(): void {
    this.unbindIpc()
    this.dragging = false
    this.dragBase = null
    if (this.view) {
      try {
        if (!this.window.isDestroyed()) {
          this.window.contentView.removeChildView(this.view)
        }
        if (!this.view.webContents.isDestroyed()) {
          this.view.webContents.close()
        }
      } catch {
        /* ignore */
      }
      this.view = null
    }
    this.ready = false
  }
}

function petHtml(): string {
  /* Browgent logo mark: rounded square + wandering orb (matches BrandMark). */
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  html, body {
    margin: 0; width: 100%; height: 100%; overflow: hidden;
    background: transparent !important;
    user-select: none; -webkit-user-select: none;
  }
  body { cursor: grab; }
  body.dragging { cursor: grabbing; }
  #stage {
    position: absolute; right: 0; bottom: 0;
    width: 96px; height: 96px; display: grid; place-items: center;
  }
  body.full-drag #stage {
    right: auto; bottom: auto;
  }
  .shadow {
    position: absolute; bottom: 10px; left: 50%; width: 36px; height: 8px;
    transform: translateX(-50%);
    background: radial-gradient(ellipse, rgba(0,0,0,0.18), transparent 70%);
    border-radius: 50%; pointer-events: none;
  }
  #pet {
    width: 56px; height: 56px; position: relative; z-index: 1;
    filter: drop-shadow(0 3px 10px rgba(0,0,0,0.14));
  }
  #pet.idle { animation: markFloat 3.6s ease-in-out infinite; }
  #pet.busy { animation: markPulse 0.9s ease-in-out infinite; }
  #pet.attention { animation: markNudge 1.1s ease-in-out infinite; }
  .orb-wrap {
    transform-box: view-box; transform-origin: 0 0;
    animation: orbWander 3.6s ease-in-out infinite;
  }
  #pet.busy .orb-wrap { animation: orbBusy 0.9s ease-in-out infinite; }
  #pet.attention .orb-wrap { animation: orbAttention 1.1s ease-in-out infinite; }
  @keyframes orbWander {
    0%, 100% { transform: translate(14.4px, 14.4px); }
    20% { transform: translate(11.2px, 12px); }
    40% { transform: translate(13px, 10.5px); }
    60% { transform: translate(16.2px, 12.5px); }
    80% { transform: translate(15px, 15.8px); }
  }
  @keyframes orbBusy {
    0%, 100% { transform: translate(14.4px, 14.4px) scale(1); }
    50% { transform: translate(14.4px, 14.4px) scale(1.25); }
  }
  @keyframes orbAttention {
    0%, 100% { transform: translate(14.4px, 14.4px); }
    25% { transform: translate(12px, 13px); }
    50% { transform: translate(16.5px, 13px); }
    75% { transform: translate(14.4px, 16px); }
  }
  @keyframes markFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
  }
  @keyframes markPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.72; }
  }
  @keyframes markNudge {
    0%, 100% { transform: scale(1); }
    40% { transform: scale(1.06); }
    60% { transform: scale(0.97); }
  }
  @media (prefers-reduced-motion: reduce) {
    #pet, .orb-wrap { animation: none !important; }
    .orb-wrap { transform: translate(14.4px, 14.4px); }
  }
  .menu {
    display: none; position: absolute; right: 4px; bottom: 90px; min-width: 132px;
    padding: 4px; border-radius: 10px; background: rgba(255,255,255,0.96);
    border: 1px solid rgba(0,0,0,0.12); box-shadow: 0 8px 24px rgba(0,0,0,0.16); z-index: 5;
  }
  .menu.open { display: block; }
  .menu button {
    display: block; width: 100%; text-align: left; border: 0; background: transparent;
    padding: 8px 10px; border-radius: 7px; font-size: 12px; font-weight: 600;
    color: #1a1a1a; cursor: pointer;
  }
  .menu button:hover { background: rgba(0,0,0,0.06); }
  :root { --accent: #191813; --accent-2: #55534b; }
</style>
</head>
<body>
  <div id="stage">
    <div class="shadow" aria-hidden="true"></div>
    <div id="pet" class="idle" title="Agent companion — drag to move">
      <svg viewBox="0 0 24 24" width="56" height="56" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5.5" stroke="var(--accent)" stroke-width="1.75"/>
        <g class="orb-wrap"><circle cx="0" cy="0" r="3" fill="var(--accent-2)"/></g>
      </svg>
    </div>
    <div class="menu" id="menu" role="menu">
      <button type="button" id="hide-btn" role="menuitem">Hide companion</button>
    </div>
  </div>
<script>
(function () {
  const pet = document.getElementById('pet');
  const menu = document.getElementById('menu');
  const stage = document.getElementById('stage');
  const themes = {
    eink: { a:'#191813', b:'#55534b' },
    midnight: { a:'#3ee0c5', b:'#5b8cff' },
    terminal: { a:'#3fb950', b:'#58a6ff' },
    matrix: { a:'#00ff41', b:'#2e7a4c' },
    nord: { a:'#88c0d0', b:'#b48ead' },
    solarized: { a:'#2aa198', b:'#b58900' },
    synthwave: { a:'#ff6ec7', b:'#00e5ff' },
    brutalist: { a:'#000000', b:'#d00000' }
  };
  function applyTheme(id) {
    const t = themes[id] || themes.eink;
    document.documentElement.style.setProperty('--accent', t.a);
    document.documentElement.style.setProperty('--accent-2', t.b);
  }
  function applyMood(mood) {
    pet.classList.remove('idle', 'busy', 'attention');
    pet.classList.add(mood || 'idle');
  }
  function placeStage(x, y, full) {
    if (full) {
      document.body.classList.add('full-drag');
      stage.style.left = Math.max(0, (x || 0) + 52) + 'px';
      stage.style.top = Math.max(0, (y || 0) + 72) + 'px';
    } else {
      document.body.classList.remove('full-drag');
      stage.style.left = '';
      stage.style.top = '';
    }
  }
  applyTheme('eink');
  if (window.browgentPet) {
    window.browgentPet.onState(function (s) {
      if (s && s.theme) applyTheme(s.theme);
      if (s && s.mood) applyMood(s.mood);
      if (s) placeStage(s.x, s.y, !!s.dragging);
    });
  }
  let dragging = false, moved = false, startX = 0, startY = 0, activePointer = null;
  function closeMenu() { menu.classList.remove('open'); }
  document.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    if (e.target.closest && e.target.closest('.menu')) return;
    closeMenu();
    dragging = true; moved = false;
    activePointer = e.pointerId;
    document.body.classList.add('dragging');
    startX = e.screenX; startY = e.screenY;
    try { e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    try { document.body.setPointerCapture && document.body.setPointerCapture(e.pointerId); } catch (_) {}
    if (window.browgentPet) window.browgentPet.dragStart();
    e.preventDefault();
  });
  document.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    if (activePointer != null && e.pointerId !== activePointer) return;
    const dx = e.screenX - startX, dy = e.screenY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    if (window.browgentPet) window.browgentPet.dragBy(dx, dy);
  });
  function endDrag(e) {
    if (!dragging) return;
    if (activePointer != null && e && e.pointerId != null && e.pointerId !== activePointer) return;
    dragging = false;
    activePointer = null;
    document.body.classList.remove('dragging');
    if (window.browgentPet) window.browgentPet.dragEnd();
    if (!moved && e && e.button === 0 && window.browgentPet) window.browgentPet.click();
  }
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault(); menu.classList.add('open');
  });
  document.getElementById('hide-btn').addEventListener('click', function () {
    closeMenu();
    if (window.browgentPet) window.browgentPet.hide();
  });
})();
</script>
</body>
</html>`
}
