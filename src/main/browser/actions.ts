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

export async function extractText(wc: WebContents, maxChars = 8000): Promise<unknown> {
  return evalJson(wc, EXTRACT_TEXT_SCRIPT(maxChars))
}

export async function extractLinks(wc: WebContents, limit = 40): Promise<unknown> {
  return evalJson(wc, EXTRACT_LINKS_SCRIPT(limit))
}
