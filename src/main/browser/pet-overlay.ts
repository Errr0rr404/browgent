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
  /** mark | invader | cloud | cycle */
  form: string
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
    form: 'cycle',
    x: -1,
    y: -1
  }
  private ready = false
  private dragBase: { x: number; y: number } | null = null
  /** Full-window hit target while dragging so pointer events do not drop. */
  private dragging = false
  /** Safety net: force-clear a stuck drag if the terminal PET_DRAG_END is lost. */
  private dragWatchdog: ReturnType<typeof setTimeout> | null = null
  private static readonly DRAG_WATCHDOG_MS = 1000
  private onBlur: (() => void) | null = null
  private onToggle: (() => void) | null = null
  private onHide: (() => void) | null = null
  private onMoved: ((x: number, y: number) => void) | null = null
  private ipcBound = false

  constructor(private readonly window: BrowserWindow) {
    this.bindIpc()
    // If the window loses focus mid-drag (e.g. alt-tab), the renderer's pointerup —
    // and thus PET_DRAG_END — may never arrive. Reset so the overlay stops eating clicks.
    this.onBlur = (): void => this.forceEndDrag()
    this.window.on('blur', this.onBlur)
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
      this.armDragWatchdog()
    })
    ipcMain.handle(IPC.PET_DRAG_BY, (e, dx: number, dy: number) => {
      this.assertPetSender(e)
      if (!this.dragBase) return
      if (typeof dx !== 'number' || typeof dy !== 'number') return
      // Live drag activity — push the watchdog out so it only fires once movement stops.
      this.armDragWatchdog()
      this.setPosition(this.dragBase.x + dx, this.dragBase.y + dy, false)
    })
    ipcMain.handle(IPC.PET_DRAG_END, (e) => {
      this.assertPetSender(e)
      this.clearDragWatchdog()
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

  /** (Re)arm the stuck-drag watchdog; fires once no dragBy/dragEnd arrives in time. */
  private armDragWatchdog(): void {
    this.clearDragWatchdog()
    this.dragWatchdog = setTimeout(() => {
      this.dragWatchdog = null
      this.forceEndDrag()
    }, PetOverlay.DRAG_WATCHDOG_MS)
  }

  private clearDragWatchdog(): void {
    if (this.dragWatchdog) {
      clearTimeout(this.dragWatchdog)
      this.dragWatchdog = null
    }
  }

  /**
   * Force-clear a stuck drag and shrink the overlay back to the pet's bounds. Without
   * this, a lost PET_DRAG_END leaves the transparent full-window view on top, silently
   * swallowing every page click.
   */
  private forceEndDrag(): void {
    this.clearDragWatchdog()
    if (!this.dragging) return
    this.dragging = false
    this.dragBase = null
    this.applyBounds()
    this.pushState()
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
        form: this.state.form,
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
    this.clearDragWatchdog()
    if (this.onBlur) {
      try {
        if (!this.window.isDestroyed()) this.window.removeListener('blur', this.onBlur)
      } catch {
        /* ignore */
      }
      this.onBlur = null
    }
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
  /* Morphing companion: mark / invader / cloud — mirrors FloatingAgentPet. */
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
  body.full-drag #stage { right: auto; bottom: auto; }
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
  #pet.idle { animation: markFloat 3.4s ease-in-out infinite; }
  #pet.busy { animation: markPulse 0.95s ease-in-out infinite; }
  #pet.attention { animation: markNudge 1.05s ease-in-out infinite; }
  .layer { position: absolute; inset: 0; display: grid; place-items: center; }
  .layer svg { width: 56px; height: 56px; overflow: visible; }
  .layer.in { animation: morphIn 620ms cubic-bezier(0.16,1,0.3,1) both; }
  .layer.out { animation: morphOut 520ms cubic-bezier(0.4,0,0.7,0.2) both; }
  @keyframes morphIn {
    0% { opacity: 0; transform: scale(0.55) rotate(-12deg); filter: blur(3px); }
    55% { opacity: 1; filter: blur(0); }
    75% { transform: scale(1.08) rotate(2deg); }
    100% { opacity: 1; transform: scale(1) rotate(0); filter: blur(0); }
  }
  @keyframes morphOut {
    0% { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(0.45) rotate(14deg); filter: blur(4px); }
  }
  @keyframes markFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
  }
  @keyframes markPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.78; transform: scale(0.96); }
  }
  @keyframes markNudge {
    0%, 100% { transform: scale(1) rotate(0); }
    30% { transform: scale(1.07) rotate(-3deg); }
    55% { transform: scale(0.97) rotate(2deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    #pet, .layer.in, .layer.out { animation: none !important; }
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
    <div id="pet" class="idle" title="Agent companion — drag to move"></div>
    <div class="menu" id="menu" role="menu">
      <button type="button" id="hide-btn" role="menuitem">Hide companion</button>
    </div>
  </div>
<script>
(function () {
  const pet = document.getElementById('pet');
  const menu = document.getElementById('menu');
  const stage = document.getElementById('stage');
  const forms = ['mark','invader','cloud'];
  let formPref = 'cycle';
  let form = 'mark';
  let mood = 'idle';
  let cycleTimer = null;

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

  function svgFor(id, m) {
    if (id === 'invader') {
      const ey = m === 'busy' ? 10.5 : 10;
      const eh = m === 'busy' ? 1.2 : 2.4;
      return '<svg viewBox="0 0 24 24" fill="none"><g fill="var(--accent)"><rect x="6" y="4" width="2" height="3" rx="0.4"/><rect x="16" y="4" width="2" height="3" rx="0.4"/><rect x="5" y="3" width="2" height="2" rx="0.3"/><rect x="17" y="3" width="2" height="2" rx="0.3"/><path d="M7 7h10v2H7V7zm-2 2h14v6H5V9zm1 6h3v2H6v-2zm9 0h3v2h-3v-2z"/><path d="M4 11h2v3H4v-3zm14 0h2v3h-2v-3z"/><rect x="7" y="17" width="2" height="3" rx="0.3"/><rect x="11" y="17" width="2" height="3" rx="0.3"/><rect x="15" y="17" width="2" height="3" rx="0.3"/><rect x="8" y="'+ey+'" width="2.2" height="'+eh+'" rx="0.3" fill="#fff"/><rect x="13.8" y="'+ey+'" width="2.2" height="'+eh+'" rx="0.3" fill="#fff"/></g></svg>';
    }
    if (id === 'cloud') {
      return '<svg viewBox="0 0 24 24" fill="none"><defs><linearGradient id="cf" x1="4" y1="4" x2="20" y2="20"><stop stop-color="#6ea8ff"/><stop offset="0.55" stop-color="#3d7cf0"/><stop offset="1" stop-color="#2b5fd4"/></linearGradient></defs><circle cx="8.2" cy="11" r="4.2" fill="url(#cf)"/><circle cx="15.8" cy="10.6" r="4.4" fill="url(#cf)"/><circle cx="12" cy="9.2" r="4.8" fill="url(#cf)"/><ellipse cx="12" cy="14.2" rx="7.4" ry="5.2" fill="url(#cf)"/><rect x="7.5" y="10.5" width="9" height="6.2" rx="2.2" fill="#152238"/><g fill="none" stroke="#7dffb3" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"><path d="M9.3 12.6 L11.1 13.8 L9.3 15"/><path d="M12.4 15 h2.4"/></g></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="5.5" stroke="var(--accent)" stroke-width="1.75"/><circle cx="14.4" cy="14.4" r="3" fill="var(--accent-2)"/></svg>';
  }

  function render(next, animate) {
    const prev = form;
    form = next;
    if (!animate) {
      pet.innerHTML = '<div class="layer">'+svgFor(form, mood)+'</div>';
      return;
    }
    pet.innerHTML =
      '<div class="layer out">'+svgFor(prev, mood)+'</div>'+
      '<div class="layer in">'+svgFor(form, mood)+'</div>';
    setTimeout(function () {
      pet.innerHTML = '<div class="layer">'+svgFor(form, mood)+'</div>';
    }, 620);
  }

  function applyTheme(id) {
    const t = themes[id] || themes.eink;
    document.documentElement.style.setProperty('--accent', t.a);
    document.documentElement.style.setProperty('--accent-2', t.b);
  }
  function applyMood(m) {
    mood = m || 'idle';
    pet.classList.remove('idle', 'busy', 'attention');
    pet.classList.add(mood);
    // re-render current form for mood-sensitive eyes
    pet.innerHTML = '<div class="layer">'+svgFor(form, mood)+'</div>';
  }
  let lastFormPref = '';
  function applyFormPref(pref) {
    const next = pref || 'cycle';
    if (next === lastFormPref) return;
    lastFormPref = next;
    formPref = next;
    if (cycleTimer) { clearInterval(cycleTimer); cycleTimer = null; }
    if (formPref === 'cycle') {
      cycleTimer = setInterval(function () {
        const i = forms.indexOf(form);
        render(forms[(i + 1) % forms.length], true);
      }, 5200);
    } else if (forms.indexOf(formPref) >= 0) {
      render(formPref, true);
    }
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
  render('mark', false);
  applyFormPref('cycle');
  if (window.browgentPet) {
    window.browgentPet.onState(function (s) {
      if (s && s.theme) applyTheme(s.theme);
      if (s && s.mood) applyMood(s.mood);
      if (s && s.form) applyFormPref(s.form);
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
