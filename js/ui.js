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

/* svg icon shorthands — 24×24 grid, stroke-width 2, rounded caps (set globally in CSS).
   Lucide-style geometry: even optical weight, 2px padding, consistent corner radii. */
export const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  back10: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  fwd: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
  paste: '<svg viewBox="0 0 24 24"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M15 2v5h5"/></svg>',
  vault: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5V7M12 17v-1.5M15.5 12H17M7 12h1.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  fire: '🔥', check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 2v13"/><path d="m16 6-4-4-4 4"/><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  toc: '<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
  sort: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h5"/></svg>',
  viewList: '<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="6.5" height="6.5" rx="1.6"/><path d="M13 6.5h8M13 9.5h5"/><rect x="3" y="13.5" width="6.5" height="6.5" rx="1.6"/><path d="M13 15.5h8M13 18.5h5"/></svg>',
  viewCompact: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  viewGrid: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.8"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.8"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.8"/><rect x="13" y="13" width="7.5" height="7.5" rx="1.8"/></svg>',
  flame: '<svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  snowflake: '<svg viewBox="0 0 24 24"><path d="M12 2v20M4 7l16 10M20 7 4 17"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2.5"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>',
  contrast: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>',
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
