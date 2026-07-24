/**
 * Scan guest page for downloadable assets (images, media, docs).
 */
import type { WebContents } from 'electron'

export type AssetKind = 'image' | 'video' | 'audio' | 'document' | 'other'

export interface PageAsset {
  url: string
  kind: AssetKind
  name: string
  width?: number
  height?: number
}

const SCAN_SCRIPT = `(() => {
  const MAX = 200;
  const out = [];
  const seen = new Set();
  const abs = (u) => {
    try { return new URL(u, location.href).href; } catch { return null; }
  };
  const nameOf = (u) => {
    try {
      const p = new URL(u).pathname.split('/').filter(Boolean);
      return decodeURIComponent(p[p.length - 1] || 'asset').slice(0, 180);
    } catch { return 'asset'; }
  };
  const push = (url, kind, extra) => {
    if (!url || seen.has(url) || out.length >= MAX) return;
    if (!/^https?:/i.test(url)) return;
    seen.add(url);
    out.push(Object.assign({ url, kind, name: nameOf(url) }, extra || {}));
  };
  const extKind = (u) => {
    const path = (u.split('?')[0] || '').toLowerCase();
    if (/\\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(path)) return 'image';
    if (/\\.(mp4|webm|mov|m4v|ogv)$/i.test(path)) return 'video';
    if (/\\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(path)) return 'audio';
    if (/\\.(pdf|zip|gz|tar|7z|rar|docx?|xlsx?|pptx?)$/i.test(path)) return 'document';
    return null;
  };

  for (const img of document.querySelectorAll('img')) {
    let src = img.currentSrc || img.src || img.getAttribute('src');
    const srcset = img.getAttribute('srcset');
    if (srcset) {
      const parts = srcset.split(',').map((s) => s.trim().split(/\\s+/)[0]).filter(Boolean);
      if (parts.length) src = parts[parts.length - 1];
    }
    const a = abs(src);
    if (a) push(a, 'image', { width: img.naturalWidth || undefined, height: img.naturalHeight || undefined });
  }
  for (const v of document.querySelectorAll('video')) {
    const a = abs(v.currentSrc || v.src || v.getAttribute('src'));
    if (a) push(a, 'video');
    for (const s of v.querySelectorAll('source[src]')) {
      const sa = abs(s.getAttribute('src'));
      if (sa) push(sa, 'video');
    }
  }
  for (const a of document.querySelectorAll('audio')) {
    const u = abs(a.currentSrc || a.src || a.getAttribute('src'));
    if (u) push(u, 'audio');
    for (const s of a.querySelectorAll('source[src]')) {
      const sa = abs(s.getAttribute('src'));
      if (sa) push(sa, 'audio');
    }
  }
  for (const link of document.querySelectorAll('a[href]')) {
    const a = abs(link.getAttribute('href'));
    if (!a) continue;
    const k = extKind(a);
    if (k) push(a, k);
  }
  for (const s of document.querySelectorAll('source[src]')) {
    const a = abs(s.getAttribute('src'));
    if (!a) continue;
    const parent = s.parentElement && s.parentElement.tagName;
    const k = parent === 'VIDEO' ? 'video' : parent === 'AUDIO' ? 'audio' : extKind(a) || 'other';
    push(a, k);
  }
  return JSON.stringify(out);
})()`

export async function scanPageAssets(wc: WebContents): Promise<PageAsset[]> {
  if (wc.isDestroyed()) return []
  try {
    const raw = await wc.executeJavaScript(SCAN_SCRIPT, true)
    let list: unknown = raw
    if (typeof raw === 'string') {
      try {
        list = JSON.parse(raw)
      } catch {
        return []
      }
    }
    if (!Array.isArray(list)) return []
    const out: PageAsset[] = []
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      if (typeof o.url !== 'string' || !/^https?:\/\//i.test(o.url)) continue
      const kind = (['image', 'video', 'audio', 'document', 'other'] as const).includes(
        o.kind as AssetKind
      )
        ? (o.kind as AssetKind)
        : 'other'
      out.push({
        url: o.url.slice(0, 4000),
        kind,
        name: typeof o.name === 'string' ? o.name.slice(0, 180) : 'asset',
        width: typeof o.width === 'number' ? o.width : undefined,
        height: typeof o.height === 'number' ? o.height : undefined
      })
      if (out.length >= 200) break
    }
    return out
  } catch {
    return []
  }
}
