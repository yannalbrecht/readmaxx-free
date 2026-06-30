/* ============================================================
   ui.js — tiny DOM + toast + sheet helpers (no framework)
   ============================================================ */

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(kid));
  return n;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

/* haptic-ish micro feedback (vibrate where supported) */
export function buzz(ms = 8) { try { navigator.vibrate?.(ms); } catch {} }

/* ---------- toast ---------- */
export function toast(msg, { err = false, ms = 2400, icon = '' } = {}) {
  const root = document.getElementById('toast-root');
  const t = el('div', { class: 'toast' + (err ? ' err' : '') });
  if (icon) t.append(el('span', {}, icon));
  t.append(document.createTextNode(msg));
  root.append(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; t.style.transition = '.3s'; setTimeout(() => t.remove(), 320); }, ms);
}

export function achievementToast(emoji, title) {
  const root = document.getElementById('toast-root');
  const t = el('div', { class: 'ach-pop' });
  t.append(el('span', { class: 'e' }, emoji), el('span', {}, title));
  root.append(t);
  buzz(20);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = '.4s'; setTimeout(() => t.remove(), 400); }, 3200);
}

/* ---------- bottom sheet ---------- */
let sheetCloser = null;
export function sheet({ title = '', sub = '', body, onClose = null }) {
  closeSheet();
  const root = document.getElementById('sheet-root');
  const scrim = el('div', { class: 'scrim' });
  const s = el('div', { class: 'sheet' });
  s.append(el('div', { class: 'grip' }));
  if (title) s.append(el('h2', {}, title));
  if (sub) s.append(el('div', { class: 'sub' }, sub));
  s.append(body);
  root.append(scrim, s);
  scrim.addEventListener('click', closeSheet);
  sheetCloser = () => { scrim.remove(); s.style.transform = 'translateY(100%)'; s.style.transition = '.28s'; setTimeout(() => s.remove(), 280); if (onClose) try { onClose(); } catch {} };
  return { close: closeSheet };
}
export function closeSheet() { if (sheetCloser) { sheetCloser(); sheetCloser = null; } }

/* svg icon shortcuts */
export const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  back10: '<svg viewBox="0 0 24 24"><path d="M11 8 6 12l5 4M6 12h9a4 4 0 0 1 0 8h-3"/></svg>',
  fwd: '<svg viewBox="0 0 24 24"><path d="M13 8l5 4-5 4M18 12H9a4 4 0 0 0 0 8h3"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.5h-4l-.3 2.5a7 7 0 0 0-1.7 1l-2.3-1-2 3.4L4.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5a7 7 0 0 0 .1-1z"/></svg>',
  paste: '<svg viewBox="0 0 24 24"><path d="M9 4h6v3H9zM7 5H5v15h14V5h-2"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M14 3v5h5M14 3H6v18h12V8z"/></svg>',
  vault: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5v-1M12 16.5v-1M15.5 12h1M7.5 12h1"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>',
  fire: '🔥', check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  toc: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  sort: '<svg viewBox="0 0 24 24"><path d="M4 7h16M6 12h12M9 17h6"/></svg>',
  viewList: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="6" height="6" rx="1.2"/><path d="M12 6.5h9M12 9.5h6"/><rect x="3" y="14" width="6" height="6" rx="1.2"/><path d="M12 15.5h9M12 18.5h6"/></svg>',
  viewCompact: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  viewGrid: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.4"/><rect x="13" y="4" width="7" height="7" rx="1.4"/><rect x="4" y="13" width="7" height="7" rx="1.4"/><rect x="13" y="13" width="7" height="7" rx="1.4"/></svg>',
};

export function fmt(n) {
  n = Math.round(n);
  if (n >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'') + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(n < 1e4 ? 1 : 0).replace(/\.0$/,'') + 'k';
  return '' + n;
}
export function fmtTime(sec) {
  sec = Math.round(sec);
  if (sec < 60) return sec + 's';
  const m = Math.floor(sec/60), s = sec%60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const hh = Math.floor(m/60);
  return `${hh}h ${m%60}m`;
}
