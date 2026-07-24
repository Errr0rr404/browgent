/**
 * Injected into page context — builds compact interactive element index
 * (parity with browser-use / agent-browser @eN refs).
 */
export const OBSERVE_SCRIPT = `(() => {
  // Clear stale refs so re-observe is stable
  document.querySelectorAll('[data-browgent-ref]').forEach((n) => n.removeAttribute('data-browgent-ref'));
  const INTERACTIVE = 'a,button,input,select,textarea,summary,[role="button"],[role="link"],[role="textbox"],[role="searchbox"],[role="checkbox"],[role="radio"],[role="menuitem"],[role="tab"],[role="switch"],[role="option"],[contenteditable="true"],[tabindex]:not([tabindex="-1"])';
  const nodes = Array.from(document.querySelectorAll(INTERACTIVE));
  const elements = [];
  let i = 0;
  for (const el of nodes) {
    if (i >= 100) break;
    if (el.closest('[aria-hidden="true"]')) continue;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    if (rect.bottom < -40 || rect.top > window.innerHeight + 240) continue;

    const ref = 'e' + (++i);
    el.setAttribute('data-browgent-ref', ref);

    const inputType = (el.tagName === 'INPUT' && el.type) ? el.type : '';
    const role = el.getAttribute('role')
      || (el.tagName === 'A' ? 'link'
        : el.tagName === 'BUTTON' ? 'button'
        : el.tagName === 'INPUT' ? (inputType === 'search' ? 'searchbox' : (inputType || 'textbox'))
        : el.tagName === 'SELECT' ? 'combobox'
        : el.tagName === 'TEXTAREA' ? 'textbox'
        : el.tagName.toLowerCase());

    const isFormControl = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;

    const ariaLabel = el.getAttribute('aria-label') || '';
    const ariaLabelledByText = el.getAttribute('aria-labelledby') && (() => {
      const id = el.getAttribute('aria-labelledby');
      return id ? (document.getElementById(id)?.innerText || '') : '';
    })();
    const innerText = el.innerText || '';
    const placeholder = el.getAttribute('placeholder') || '';
    const title = el.getAttribute('title') || '';
    const nameAttr = el.getAttribute('name') || '';
    const altAttr = el.getAttribute('alt') || '';

    const rawValue = el.isContentEditable
      ? (el.textContent || '')
      : (typeof el.value === 'string' ? el.value : '');
    // Never leak live password field values into observe → LLM / trajectory / export
    const value = isFormControl && rawValue.length > 0 ? '••••' : undefined;

    const rawHref = typeof el.href === 'string' ? el.href : '';
    const safeHref = rawHref && !rawHref.toLowerCase().startsWith('javascript:') ? rawHref : undefined;

    // Associated label text (critical for fill_form matching on real forms)
    let labelText = '';
    try {
      if (el.labels && el.labels.length) {
        labelText = Array.from(el.labels).map(function(l) { return (l.innerText || l.textContent || ''); }).join(' ');
      } else {
        const closestLab = el.closest && el.closest('label');
        if (closestLab) labelText = closestLab.innerText || closestLab.textContent || '';
      }
    } catch (e) { labelText = ''; }
    const autocomplete = el.getAttribute('autocomplete') || '';

    let name;
    if (isFormControl) {
      // Include nameAttr + labels + autocomplete so fill_form / agents can match fields
      name = (ariaLabel || ariaLabelledByText || labelText || innerText || placeholder || title || nameAttr || autocomplete || 'field')
        .trim().replace(/\\s+/g, ' ').slice(0, 160);
    } else {
      name = (ariaLabel || ariaLabelledByText || innerText || placeholder || title || nameAttr || altAttr || '')
        .trim().replace(/\\s+/g, ' ').slice(0, 120);
    }

    elements.push({
      ref,
      role,
      name,
      tag: el.tagName.toLowerCase(),
      href: safeHref,
      placeholder: el.getAttribute('placeholder') || undefined,
      value,
      autocomplete: autocomplete || undefined,
      nameAttr: nameAttr || undefined,
      bbox: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
    });
  }

  const body = document.body;
  const text = (body && (body.innerText || body.textContent) || '').replace(/\\s+/g, ' ').trim().slice(0, 2500);
  return JSON.stringify({
    url: location.href,
    title: document.title || '',
    elements,
    textPreview: text
  });
})()`

export const HIGHLIGHT_SCRIPT = (ref: string): string => {
  // Escape so a malformed ref cannot break out of the attribute/string
  const safeRef = JSON.stringify(String(ref))
  return `
(() => {
  document.querySelectorAll('[data-browgent-hl]').forEach(n => n.remove());
  const ref = ${safeRef};
  const el = document.querySelector('[data-browgent-ref="' + CSS.escape(ref) + '"]');
  if (!el) return false;
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  const r = el.getBoundingClientRect();
  const box = document.createElement('div');
  box.setAttribute('data-browgent-hl', '1');
  Object.assign(box.style, {
    position: 'fixed',
    left: r.left - 3 + 'px',
    top: r.top - 3 + 'px',
    width: r.width + 6 + 'px',
    height: r.height + 6 + 'px',
    border: '2px solid #3ee0c5',
    borderRadius: '6px',
    boxShadow: '0 0 0 3px rgba(62,224,197,0.25), 0 0 20px rgba(62,224,197,0.35)',
    pointerEvents: 'none',
    zIndex: '2147483647',
    transition: 'opacity 0.2s'
  });
  document.documentElement.appendChild(box);
  setTimeout(() => { box.style.opacity = '0'; setTimeout(() => box.remove(), 250); }, 900);
  return true;
})()
`
}

export function actionScript(
  kind: 'click' | 'type' | 'hover' | 'select' | 'press' | 'scroll' | 'wait_for',
  args: Record<string, unknown>
): string {
  // Sanitize selector/ref strings that will be used in querySelector
  const safeArgs = { ...args }
  if (typeof safeArgs.ref === 'string') {
    // refs are always eN from observe — reject anything else
    if (!/^e\d{1,4}$/.test(safeArgs.ref)) {
      delete safeArgs.ref
    }
  }
  if (typeof safeArgs.selector === 'string' && safeArgs.selector.length > 500) {
    safeArgs.selector = safeArgs.selector.slice(0, 500)
  }
  const payload = JSON.stringify(safeArgs)
  return `(() => {
    const args = ${payload};
    const find = () => {
      if (args.ref) {
        const el = document.querySelector('[data-browgent-ref="' + CSS.escape(String(args.ref)) + '"]');
        if (!el) return { staleRef: true, el: null };
        return { staleRef: false, el };
      }
      if (args.selector) {
        let el = null;
        try { el = document.querySelector(String(args.selector)); } catch (_) { el = null; }
        return { staleRef: false, el };
      }
      return { staleRef: false, el: null };
    };

    const kind = ${JSON.stringify(kind)};

    if (kind === 'press') {
      const key = String(args.key || 'Enter');
      const target = document.activeElement || document.body;
      const code = key.length === 1 ? 'Key' + key.toUpperCase() : key;
      const opts = { key, code, bubbles: true, cancelable: true };
      target.dispatchEvent(new KeyboardEvent('keydown', opts));
      target.dispatchEvent(new KeyboardEvent('keypress', opts));
      target.dispatchEvent(new KeyboardEvent('keyup', opts));
      if (key === 'Enter') {
        if (target.form && typeof target.form.requestSubmit === 'function') {
          try { target.form.requestSubmit(); } catch (_) { /* ignore */ }
        } else if (target.closest) {
          const btn = target.closest('form') && target.closest('form').querySelector('[type="submit"], button:not([type="button"])');
          if (btn) btn.click();
        }
      }
      return JSON.stringify({ ok: true });
    }

    if (kind === 'scroll') {
      const amount = Number(args.amount || 500);
      const dir = String(args.direction || 'down');
      const found = find();
      if (found.staleRef) return JSON.stringify({ ok: false, error: 'ref not found / stale' });
      const el = found.el || window;
      const dx = dir === 'left' ? -amount : dir === 'right' ? amount : 0;
      const dy = dir === 'up' ? -amount : dir === 'down' ? amount : 0;
      if (el === window) window.scrollBy({ left: dx, top: dy, behavior: 'instant' });
      else el.scrollBy({ left: dx, top: dy, behavior: 'instant' });
      return JSON.stringify({ ok: true });
    }

    if (kind === 'wait_for') {
      const found = find();
      if (found.staleRef) return JSON.stringify({ ok: false, error: 'ref not found / stale' });
      return JSON.stringify({ ok: !!found.el });
    }

    const found = find();
    if (found.staleRef) return JSON.stringify({ ok: false, error: 'ref not found / stale' });
    const el = found.el;
    if (!el) return JSON.stringify({ ok: false, error: 'Element not found' });

    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });

    if (kind === 'hover') {
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      return JSON.stringify({ ok: true });
    }

    if (kind === 'click') {
      el.focus({ preventScroll: true });
      const opts = { bubbles: true, cancelable: true, view: window };
      el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, pointerType: 'mouse' }));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, pointerType: 'mouse' }));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      return JSON.stringify({ ok: true, name: (el.innerText || el.value || '').slice(0, 80) });
    }

    if (kind === 'type') {
      el.focus({ preventScroll: true });
      const text = String(args.text ?? '');
      const setNativeValue = (node, value) => {
        const proto = node.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(node, value);
        else node.value = value;
      };
      if ('value' in el) {
        const next = (args.clear ? '' : (el.value || '')) + text;
        setNativeValue(el, next);
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (el.isContentEditable) {
        if (args.clear) el.textContent = '';
        el.textContent = (el.textContent || '') + text;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
      } else {
        return JSON.stringify({ ok: false, error: 'Not a text field' });
      }
      return JSON.stringify({ ok: true });
    }

    if (kind === 'select') {
      if (el.tagName !== 'SELECT') return JSON.stringify({ ok: false, error: 'Not a select' });
      if (args.value != null) {
        el.value = String(args.value);
      } else if (args.label != null) {
        const opt = Array.from(el.options).find(o => o.text.trim() === String(args.label).trim());
        if (!opt) return JSON.stringify({ ok: false, error: 'Option not found' });
        el.value = opt.value;
      } else {
        return JSON.stringify({ ok: false, error: 'value or label required' });
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return JSON.stringify({ ok: true });
    }

    return JSON.stringify({ ok: false, error: 'Unknown action' });
  })()`
}

export const EXTRACT_TEXT_SCRIPT = (maxChars: number): string => `
(() => {
  const max = Math.max(1, Math.min(50000, Math.floor(Number(${maxChars}) || 0) || 2500));
  const title = document.title || '';
  const text = (document.body && document.body.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, max);
  return JSON.stringify({ title, url: location.href, text });
})()
`

export const EXTRACT_LINKS_SCRIPT = (limit: number): string => `
(() => {
  const max = Math.max(1, Math.min(500, Math.floor(Number(${limit}) || 0) || 40));
  const links = Array.from(document.querySelectorAll('a[href]'))
    .slice(0, max)
    .map(a => ({ text: (a.innerText || '').trim().slice(0, 100), href: a.href }))
    .filter(l => l.href && !l.href.toLowerCase().startsWith('javascript:'));
  return JSON.stringify({ url: location.href, links });
})()
`
