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

const MUTATING_MOUSE_TYPES = new Set(['mousePressed', 'mouseReleased', 'mouseWheel'])
const MUTATING_METHODS = new Set([
  'Input.insertText',
  'Input.dispatchKeyEvent'
])

interface HeldState {
  pressedButton: 'left' | 'middle' | 'right' | null
  pressedModifiers: Set<string>
  lastPoint: { x: number; y: number } | null
}

interface RunState {
  signal: AbortSignal | undefined
  mutated: boolean
  held: HeldState
}

class AbortError extends Error {
  constructor(message = 'aborted') {
    super(message)
    this.name = 'AbortError'
  }
}

function isMutatingCall(method: string, params?: Record<string, unknown>): boolean {
  if (!params) return false
  if (MUTATING_METHODS.has(method)) return true
  if (method === 'Input.dispatchMouseEvent' && typeof params.type === 'string') {
    return MUTATING_MOUSE_TYPES.has(params.type)
  }
  return false
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

function updateHeldState(method: string, params: Record<string, unknown>, held: HeldState): void {
  if (method === 'Input.dispatchMouseEvent') {
    const x = typeof params.x === 'number' ? params.x : held.lastPoint?.x ?? 0
    const y = typeof params.y === 'number' ? params.y : held.lastPoint?.y ?? 0
    held.lastPoint = { x, y }
    if (params.type === 'mousePressed') {
      const btn = params.button
      if (btn === 'left' || btn === 'middle' || btn === 'right') {
        held.pressedButton = btn
      }
    } else if (params.type === 'mouseReleased') {
      held.pressedButton = null
    }
  } else if (method === 'Input.dispatchKeyEvent') {
    const modBitfield = typeof params.modifiers === 'number' ? params.modifiers : 0
    if (params.type === 'keyDown') {
      if (modBitfield & 1) held.pressedModifiers.add('Alt')
      if (modBitfield & 2) held.pressedModifiers.add('Control')
      if (modBitfield & 4) held.pressedModifiers.add('Meta')
      if (modBitfield & 8) held.pressedModifiers.add('Shift')
    } else if (params.type === 'keyUp') {
      if (modBitfield & 1) held.pressedModifiers.delete('Alt')
      if (modBitfield & 2) held.pressedModifiers.delete('Control')
      if (modBitfield & 4) held.pressedModifiers.delete('Meta')
      if (modBitfield & 8) held.pressedModifiers.delete('Shift')
    }
  }
}

function raceAbort<T>(p: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return p
  if (signal.aborted) return Promise.reject(new AbortError())
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener('abort', onAbort)
      reject(new AbortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v) },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e instanceof Error ? e : new Error(String(e))) }
    )
  })
}

async function cdp<T = unknown>(
  wc: WebContents,
  method: string,
  params: Record<string, unknown>,
  state: RunState
): Promise<T> {
  if (isMutatingCall(method, params)) {
    if (state.signal?.aborted) throw new AbortError()

    state.mutated = true
    const isRelease =
      (method === 'Input.dispatchMouseEvent' && params.type === 'mouseReleased') ||
      (method === 'Input.dispatchKeyEvent' && params.type === 'keyUp')
    if (!isRelease) updateHeldState(method, params, state.held)

    const result = await (wc.debugger.sendCommand(method, params) as Promise<T>)
    if (isRelease) updateHeldState(method, params, state.held)
    if (state.signal?.aborted) {
      await cleanupHeldInput(wc, state.held)
      throw new AbortError()
    }
    return result
  }

  if (state.signal?.aborted) throw new AbortError()
  return raceAbort(wc.debugger.sendCommand(method, params) as Promise<T>, state.signal)
}

async function cleanupHeldInput(wc: WebContents, held: HeldState): Promise<void> {
  if (wc.isDestroyed()) return
  if (!wc.debugger.isAttached()) return
  if (!held.pressedButton && held.pressedModifiers.size === 0) return

  const releases: Promise<unknown>[] = []

  if (held.pressedButton) {
    const x = held.lastPoint?.x ?? 0
    const y = held.lastPoint?.y ?? 0
    releases.push(
      wc.debugger
        .sendCommand('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x,
          y,
          button: held.pressedButton,
          clickCount: 1
        })
        .catch(() => undefined)
    )
  }

  for (const mod of held.pressedModifiers) {
    releases.push(
      wc.debugger
        .sendCommand('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: mod,
          modifiers: 0
        })
        .catch(() => undefined)
    )
  }

  await Promise.allSettled(releases)

  held.pressedButton = null
  held.pressedModifiers.clear()
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
    if (ref) {
      el = document.querySelector('[data-browgent-ref="' + CSS.escape(ref) + '"]');
      if (!el) return JSON.stringify({ ok: false, error: 'ref not found' });
    } else if (sel) {
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

async function validateClickPoint(
  wc: WebContents,
  ref: string | null,
  selector: string | null,
  x: number,
  y: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const script = `
    (() => {
      const x = ${x};
      const y = ${y};
      const ref = ${JSON.stringify(ref)};
      const sel = ${JSON.stringify(selector)};
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (x < 0 || y < 0 || x > vw || y > vh) return JSON.stringify({ ok: false, error: 'point outside viewport' });
      const el = document.elementFromPoint(x, y);
      if (!el) return JSON.stringify({ ok: false, error: 'no element at point' });
      if (ref) {
        const target = document.querySelector('[data-browgent-ref="' + CSS.escape(ref) + '"]');
        if (!target) return JSON.stringify({ ok: false, error: 'ref stale' });
        const ok = target === el || (target.contains && target.contains(el));
        if (!ok) return JSON.stringify({ ok: false, error: 'point does not hit target' });
      } else if (sel) {
        let target = null;
        try { target = document.querySelector(sel); } catch (_) { return JSON.stringify({ ok: false, error: 'bad selector' }); }
        if (!target) return JSON.stringify({ ok: false, error: 'selector not found' });
        const ok = target === el || (target.contains && target.contains(el));
        if (!ok) return JSON.stringify({ ok: false, error: 'point does not hit target' });
      }
      return JSON.stringify({ ok: true });
    })()
  `
  try {
    const raw = await wc.executeJavaScript(script, true)
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw
    return data as { ok: true } | { ok: false; error: string }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'validate failed' }
  }
}

async function cdpClick(wc: WebContents, args: ToolArgs, state: RunState): Promise<DriverActionResult> {
  const ref = typeof args.ref === 'string' ? args.ref : null
  const selector = typeof args.selector === 'string' ? args.selector : null
  const center = await resolveCenter(wc, args)
  if (!center) return { ok: false, error: 'element not found', via: 'cdp' }

  const validation = await validateClickPoint(wc, ref, selector, center.x, center.y)
  if (!validation.ok) {
    return { ok: false, error: validation.error, via: 'cdp' }
  }

  await cdp(wc, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: center.x,
    y: center.y,
    button: 'none'
  }, state)
  await cdp(wc, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: center.x,
    y: center.y,
    button: 'left',
    clickCount: 1
  }, state)
  await cdp(wc, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: center.x,
    y: center.y,
    button: 'left',
    clickCount: 1
  }, state)
  return { ok: true, name: center.name, via: 'cdp' }
}

async function cdpHover(wc: WebContents, args: ToolArgs, state: RunState): Promise<DriverActionResult> {
  const center = await resolveCenter(wc, args)
  if (!center) return { ok: false, error: 'element not found', via: 'cdp' }
  await cdp(wc, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: center.x,
    y: center.y,
    button: 'none'
  }, state)
  return { ok: true, name: center.name, via: 'cdp' }
}

async function cdpType(wc: WebContents, args: ToolArgs, state: RunState): Promise<DriverActionResult> {
  // Focus via real click, then insert text (CDP) — clearer for SPAs than pure DOM .value
  const click = await cdpClick(wc, args, state)
  if (!click.ok) return click

  const clear = Boolean(args.clear)
  if (clear) {
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
    await cdpKey(wc, 'keyDown', 'a', mod, state)
    await cdpKey(wc, 'keyUp', 'a', mod, state)
    await cdpKey(wc, 'keyDown', 'Backspace', undefined, state)
    await cdpKey(wc, 'keyUp', 'Backspace', undefined, state)
  }

  const text = String(args.text ?? '')
  if (text.length > 0) {
    await cdp(wc, 'Input.insertText', { text }, state)
  }
  return { ok: true, name: click.name, via: 'cdp' }
}

async function cdpKey(
  wc: WebContents,
  type: 'keyDown' | 'keyUp' | 'char',
  key: string,
  modifiers: string | undefined,
  state: RunState
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
  }, state)
}

async function cdpPress(wc: WebContents, args: ToolArgs, state: RunState): Promise<DriverActionResult> {
  const key = String(args.key ?? '')
  if (!key) return { ok: false, error: 'key required', via: 'cdp' }

  // Support "Enter", "Meta+l", "Control+a"
  const parts = key.split('+').map((p) => p.trim())
  const main = parts[parts.length - 1]
  const mods = parts.slice(0, -1)
  const modStr = mods.join('') || undefined

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
    await cdpKey(wc, 'keyDown', resolved, modStr, state)
    await cdpKey(wc, 'keyUp', resolved, modStr, state)
  } else if (resolved.length === 1) {
    await cdp(wc, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      text: resolved,
      key: resolved,
      unmodifiedText: resolved
    }, state)
    await cdp(wc, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: resolved
    }, state)
  } else {
    await cdpKey(wc, 'keyDown', resolved, undefined, state)
    await cdpKey(wc, 'keyUp', resolved, undefined, state)
  }
  return { ok: true, via: 'cdp' }
}

async function cdpScroll(wc: WebContents, args: ToolArgs, state: RunState): Promise<DriverActionResult> {
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
  }, state)
  return { ok: true, via: 'cdp' }
}

function newRunState(signal: AbortSignal | undefined): RunState {
  return {
    signal,
    mutated: false,
    held: { pressedButton: null, pressedModifiers: new Set(), lastPoint: null }
  }
}

/**
 * Run a page action with the selected driver. CDP falls back to DOM on failure.
 */
export async function runPageAction(
  wc: WebContents,
  kind: DomActionKind,
  args: ToolArgs,
  mode: DriverMode,
  signal?: AbortSignal
): Promise<DriverActionResult> {
  if (signal?.aborted) {
    return { ok: false, error: 'cancelled', via: 'cdp' }
  }

  if (mode === 'dom') {
    const r = await runDomAction(wc, kind, args)
    if (signal?.aborted) return { ok: false, error: 'cancelled', via: 'dom' }
    return { ...r, via: 'dom' }
  }

  // wait_for / select are more reliable via DOM (ref attributes + native select)
  if (kind === 'wait_for' || kind === 'select') {
    const r = await runDomAction(wc, kind, args)
    if (signal?.aborted) return { ok: false, error: 'cancelled', via: 'dom' }
    return { ...r, via: 'dom' }
  }

  const refProvided = typeof args.ref === 'string' && args.ref.length > 0

  if (!ensureDebugger(wc)) {
    if (refProvided) {
      return { ok: false, error: 'ref not found / debugger unavailable', via: 'cdp' }
    }
    const r = await runDomAction(wc, kind, args)
    return { ...r, via: 'dom', error: r.error }
  }

  const state = newRunState(signal)
  try {
    switch (kind) {
      case 'click':
        return await cdpClick(wc, args, state)
      case 'type':
        return await cdpType(wc, args, state)
      case 'hover':
        return await cdpHover(wc, args, state)
      case 'press':
        return await cdpPress(wc, args, state)
      case 'scroll':
        return await cdpScroll(wc, args, state)
      default: {
        const r = await runDomAction(wc, kind, args)
        return { ...r, via: 'dom' }
      }
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'CDP failed'
    const aborted = e instanceof AbortError || signal?.aborted === true
    if (aborted) {
      if (state.mutated) {
        await cleanupHeldInput(wc, state.held)
        return {
          ok: false,
          error: 'cancelled: aborted after mutating CDP command',
          via: 'cdp'
        }
      }
      return { ok: false, error: 'cancelled', via: 'cdp' }
    }
    if (state.mutated) {
      console.warn('[page-driver] CDP action failed mid-sequence; refusing DOM replay', e)
      await cleanupHeldInput(wc, state.held)
      return {
        ok: false,
        error: `indeterminate: CDP failed after mutating command (${errMsg})`,
        via: 'cdp'
      }
    }
    if (refProvided) {
      console.warn('[page-driver] CDP failed with ref provided; rejecting instead of selector fallback', e)
      return { ok: false, error: 'ref not found / CDP failed', via: 'cdp' }
    }
    console.warn('[page-driver] CDP action failed, falling back to DOM', e)
    const r = await runDomAction(wc, kind, args)
    return {
      ...r,
      via: 'dom',
      error: r.ok ? undefined : r.error ?? errMsg
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

export async function run(
  wc: WebContents,
  kind: DomActionKind,
  args: ToolArgs,
  mode: DriverMode,
  signal?: AbortSignal
): Promise<DriverActionResult> {
  return runPageAction(wc, kind, args, mode, signal)
}
