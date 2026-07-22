import type { WebContents } from 'electron'
import {
  actionScript,
  EXTRACT_LINKS_SCRIPT,
  EXTRACT_TEXT_SCRIPT,
  HIGHLIGHT_SCRIPT,
  OBSERVE_SCRIPT
} from './observe-script'
import type { ObserveSnapshot } from '../../shared/types'
import type { ToolArgs } from '../../shared/tools'

const EXTRACT_TEXT_MAX = 50000
const EXTRACT_LINKS_MAX = 500
const EXTRACT_TEXT_DEFAULT = 8000
const EXTRACT_LINKS_DEFAULT = 40

async function evalJson<T>(wc: WebContents, script: string): Promise<T> {
  if (wc.isDestroyed()) throw new Error('Page closed')
  const raw = await wc.executeJavaScript(script, true)
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T
    } catch {
      throw new Error('Invalid page response')
    }
  }
  return raw as T
}

function clampInt(value: number, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback
  const n = Math.floor(value)
  if (n <= 0) return fallback
  return Math.min(n, max)
}

export async function observePage(wc: WebContents): Promise<ObserveSnapshot> {
  return evalJson<ObserveSnapshot>(wc, OBSERVE_SCRIPT)
}

export async function highlightRef(wc: WebContents, ref: string): Promise<void> {
  try {
    await wc.executeJavaScript(HIGHLIGHT_SCRIPT(ref), true)
  } catch {
    // ignore
  }
}

export async function runDomAction(
  wc: WebContents,
  kind: 'click' | 'type' | 'hover' | 'select' | 'press' | 'scroll' | 'wait_for',
  args: ToolArgs
): Promise<{ ok: boolean; error?: string; name?: string }> {
  if (args.ref && typeof args.ref === 'string') {
    await highlightRef(wc, args.ref)
  }
  return evalJson(wc, actionScript(kind, args))
}

export async function extractText(wc: WebContents, maxChars = EXTRACT_TEXT_DEFAULT): Promise<unknown> {
  const safe = clampInt(maxChars, EXTRACT_TEXT_DEFAULT, EXTRACT_TEXT_MAX)
  return evalJson(wc, EXTRACT_TEXT_SCRIPT(safe))
}

export async function extractLinks(wc: WebContents, limit = EXTRACT_LINKS_DEFAULT): Promise<unknown> {
  const safe = clampInt(limit, EXTRACT_LINKS_DEFAULT, EXTRACT_LINKS_MAX)
  return evalJson(wc, EXTRACT_LINKS_SCRIPT(safe))
}
