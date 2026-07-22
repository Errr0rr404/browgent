/**
 * Dual page driver:
 * - DOM  — executeJavaScript observe/act (fast, ref-native, default)
 * - CDP  — Electron webContents.debugger for real Input events (Playwright-parity actuation)
 *
 * Observe / extract always use DOM scripts (compact eN refs are Browgent-native).
 * When mode is `cdp`, click/type/hover/scroll/press use CDP Input domain when possible,
 * with DOM fallback if debugger attach fails.
 */

import type { WebContents } from 'electron'
import type { DriverMode } from '../../shared/driver'
import { runDomAction, highlightRef } from './actions'
import type { ToolArgs } from '../../shared/tools'

export type DomActionKind = 'click' | 'type' | 'hover' | 'select' | 'press' | 'scroll' | 'wait_for'

export interface DriverActionResult {
  ok: boolean
  error?: string
  name?: string
  via?: 'dom' | 'cdp'
}

function ensureDebugger(wc: WebContents): boolean {
  if (wc.isDestroyed()) return false
  try {
    if (!wc.debugger.isAttached()) {
      wc.debugger.attach('1.3')
    }
    return true
  } catch (e) {
    console.warn('[page-driver] debugger attach failed', e)
    return false
  }
}

async function cdp<T = unknown>(
  wc: WebContents,
  method: string,
  params?: Record<string, unknown>
): Promise<T> {
  return wc.debugger.sendCommand(method, params ?? {}) as Promise<T>
}

async function resolveCenter(
  wc: WebContents,
  args: ToolArgs
): Promise<{ x: number; y: number; name?: string } | null> {
  const ref = typeof args.ref === 'string' ? args.ref : null
  const selector = typeof args.selector === 'string' ? args.selector : null
  if (!ref && !selector) return null

  if (ref) {
    try {
      await highlightRef(wc, ref)
    } catch {
      // ignore
    }
  }

  const script = `(() => {
    const ref = ${JSON.stringify(ref)};
    const sel = ${JSON.stringify(selector)};
    let el = null;
    if (ref) el = document.querySelector('[data-browgent-ref="' + CSS.escape(ref) + '"]');
    if (!el && sel) {
      try { el = document.querySelector(sel); } catch (e) { return JSON.stringify({ ok: false, error: 'bad selector' }); }
    }
    if (!el) return JSON.stringify({ ok: false, error: 'element not found' });
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return JSON.stringify({ ok: false, error: 'not visible' });
    const name = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.tagName || '').trim().slice(0, 80);
    return JSON.stringify({
      ok: true,
      x: Math.round(r.x + r.width / 2),
      y: Math.round(r.y + r.height / 2),
      name
    });
  })()`

  const raw = await wc.executeJavaScript(script, true)
  const data =
    typeof raw === 'string' ? (JSON.parse(raw) as { ok: boolean; x?: number; y?: number; name?: string; error?: string }) : raw
  if (!data?.ok || data.x == null || data.y == null) return null
  return { x: data.x, y: data.y, name: data.name }
}

async function cdpClick(wc: WebContents, args: ToolArgs): Promise<DriverActionResult> {
  const center = await resolveCenter(wc, args)
  if (!center) return { ok: false, error: 'element not found', via: 'cdp' }

  await cdp(wc, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: center.x,
    y: center.y,
    button: 'none'
  })
  await cdp(wc, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: center.x,
    y: center.y,
    button: 'left',
    clickCount: 1
  })
  await cdp(wc, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: center.x,
    y: center.y,
    button: 'left',
    clickCount: 1
  })
  return { ok: true, name: center.name, via: 'cdp' }
}

async function cdpHover(wc: WebContents, args: ToolArgs): Promise<DriverActionResult> {
  const center = await resolveCenter(wc, args)
  if (!center) return { ok: false, error: 'element not found', via: 'cdp' }
  await cdp(wc, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: center.x,
    y: center.y,
    button: 'none'
  })
  return { ok: true, name: center.name, via: 'cdp' }
}

async function cdpType(wc: WebContents, args: ToolArgs): Promise<DriverActionResult> {
  // Focus via real click, then insert text (CDP) — clearer for SPAs than pure DOM .value
  const click = await cdpClick(wc, args)
  if (!click.ok) return click

  const clear = Boolean(args.clear)
  if (clear) {
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
    await cdpKey(wc, 'keyDown', 'a', mod)
    await cdpKey(wc, 'keyUp', 'a', mod)
    await cdpKey(wc, 'keyDown', 'Backspace')
    await cdpKey(wc, 'keyUp', 'Backspace')
  }

  const text = String(args.text ?? '')
  if (text.length > 0) {
    await cdp(wc, 'Input.insertText', { text })
  }
  return { ok: true, name: click.name, via: 'cdp' }
}

async function cdpKey(
  wc: WebContents,
  type: 'keyDown' | 'keyUp' | 'char',
  key: string,
  modifiers?: string
): Promise<void> {
  const mods = modifiers
    ? {
        modifiers:
          (modifiers.includes('Alt') ? 1 : 0) |
          (modifiers.includes('Control') ? 2 : 0) |
          (modifiers.includes('Meta') ? 4 : 0) |
          (modifiers.includes('Shift') ? 8 : 0)
      }
    : {}
  await cdp(wc, 'Input.dispatchKeyEvent', {
    type,
    key,
    code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
    windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
    nativeVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
    text: type === 'keyDown' && key.length === 1 ? key : undefined,
    ...mods
  })
}

async function cdpPress(wc: WebContents, args: ToolArgs): Promise<DriverActionResult> {
  const key = String(args.key ?? '')
  if (!key) return { ok: false, error: 'key required', via: 'cdp' }

  // Support "Enter", "Meta+l", "Control+a"
  const parts = key.split('+').map((p) => p.trim())
  const main = parts[parts.length - 1]
  const mods = parts.slice(0, -1)
  const modStr = mods.join('')

  // Map common names
  const keyMap: Record<string, string> = {
    enter: 'Enter',
    return: 'Enter',
    esc: 'Escape',
    escape: 'Escape',
    tab: 'Tab',
    space: ' ',
    backspace: 'Backspace',
    delete: 'Delete',
    arrowdown: 'ArrowDown',
    arrowup: 'ArrowUp',
    arrowleft: 'ArrowLeft',
    arrowright: 'ArrowRight'
  }
  const resolved = keyMap[main.toLowerCase()] ?? main

  if (modStr) {
    await cdpKey(wc, 'keyDown', resolved, modStr)
    await cdpKey(wc, 'keyUp', resolved, modStr)
  } else if (resolved.length === 1) {
    await cdp(wc, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      text: resolved,
      key: resolved,
      unmodifiedText: resolved
    })
    await cdp(wc, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: resolved
    })
  } else {
    await cdpKey(wc, 'keyDown', resolved)
    await cdpKey(wc, 'keyUp', resolved)
  }
  return { ok: true, via: 'cdp' }
}

async function cdpScroll(wc: WebContents, args: ToolArgs): Promise<DriverActionResult> {
  const direction = String(args.direction ?? 'down').toLowerCase()
  const amount = typeof args.amount === 'number' ? args.amount : 400
  let deltaX = 0
  let deltaY = 0
  if (direction === 'up') deltaY = -amount
  else if (direction === 'left') deltaX = -amount
  else if (direction === 'right') deltaX = amount
  else deltaY = amount

  // Scroll at viewport center
  const point = await wc.executeJavaScript(
    `JSON.stringify({ x: Math.round(window.innerWidth/2), y: Math.round(window.innerHeight/2) })`,
    true
  )
  const { x, y } = typeof point === 'string' ? JSON.parse(point) : point

  await cdp(wc, 'Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x,
    y,
    deltaX,
    deltaY
  })
  return { ok: true, via: 'cdp' }
}

/**
 * Run a page action with the selected driver. CDP falls back to DOM on failure.
 */
export async function runPageAction(
  wc: WebContents,
  kind: DomActionKind,
  args: ToolArgs,
  mode: DriverMode
): Promise<DriverActionResult> {
  if (mode === 'dom') {
    const r = await runDomAction(wc, kind, args)
    return { ...r, via: 'dom' }
  }

  // wait_for / select are more reliable via DOM (ref attributes + native select)
  if (kind === 'wait_for' || kind === 'select') {
    const r = await runDomAction(wc, kind, args)
    return { ...r, via: 'dom' }
  }

  if (!ensureDebugger(wc)) {
    const r = await runDomAction(wc, kind, args)
    return { ...r, via: 'dom', error: r.error }
  }

  try {
    switch (kind) {
      case 'click':
        return await cdpClick(wc, args)
      case 'type':
        return await cdpType(wc, args)
      case 'hover':
        return await cdpHover(wc, args)
      case 'press':
        return await cdpPress(wc, args)
      case 'scroll':
        return await cdpScroll(wc, args)
      default: {
        const r = await runDomAction(wc, kind, args)
        return { ...r, via: 'dom' }
      }
    }
  } catch (e) {
    console.warn('[page-driver] CDP action failed, falling back to DOM', e)
    const r = await runDomAction(wc, kind, args)
    return {
      ...r,
      via: 'dom',
      error: r.ok ? undefined : r.error ?? (e instanceof Error ? e.message : 'CDP failed')
    }
  }
}

export function detachDebugger(wc: WebContents): void {
  try {
    if (!wc.isDestroyed() && wc.debugger.isAttached()) {
      wc.debugger.detach()
    }
  } catch {
    // ignore
  }
}
