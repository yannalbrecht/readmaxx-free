/* ============================================================
   store.js — app state, localStorage + IndexedDB persistence
   ============================================================ */

const LS_KEY = 'readmaxx.state.v1';

export const ACCENTS = {
  violet: { a1:'#8b6cff', a2:'#ff4d9d', name:'Nebula' },
  cyan:   { a1:'#22d3ee', a2:'#3b82f6', name:'Glacier' },
  lime:   { a1:'#a3e635', a2:'#22d3ee', name:'Voltage' },
  amber:  { a1:'#ffb84d', a2:'#ff5e7e', name:'Sunset' },
  mono:   { a1:'#c8c4e0', a2:'#8b87a8', name:'Mono' },
};

// Kindle-style display themes. Applied via data-theme on <html> (the default
// 'dark' theme uses the base :root, no attribute). `sw:[page, ink]` colours the
// "Aa" preview swatch. `lock:true` themes own their accent (mono/red) — applyTheme
// must NOT write inline --a1/--a2/--accent for them, or it would beat the CSS.
export const THEMES = {
  dark:  { name:'Night', sw:['#15131f', '#f4f3fb'] },
  paper: { name:'Paper', sw:['#ffffff', '#1d1a26'] },
  sepia: { name:'Sepia', sw:['#fdf6e5', '#4a3b28'] },
  mono:  { name:'Mono',  sw:['#000000', '#f5f5f5'], lock:true },
  red:   { name:'Ember', sw:['#130303', '#ff8d7a'], lock:true },
};

// Reading faces offered in Settings. `css` is the font-family stack.
export const FONTS = {
  lexend:  { name:'Lexend',     css:'"Lexend", var(--font)' },
  atkinson:{ name:'Atkinson',   css:'"Atkinson Hyperlegible", var(--font)' },
  system:  { name:'System',     css:'var(--font)' },
  serif:   { name:'Serif',      css:'Georgia, "Times New Roman", serif' },
  dyslexic:{ name:'OpenDyslexic', css:'"OpenDyslexic", var(--font)' },
};

// Reading size steps (multiplies the RSVP word + context size).
export const SCALES = { s:0.85, m:1, l:1.18, xl:1.4 };

const DEFAULT = {
  profile: {
    name: '',
    onboarded: false,
    goalWpm: 400,
    baselineWpm: 250,
    dailyGoalWords: 2000,
    reasons: [],
    avatar: '🚀',
  },
  settings: {
    wpm: 350,
    chunk: 1,          // words per flash
    orp: true,         // ORP pivot ALIGNMENT (fixed pivot position — the RSVP mechanism)
    pivotColor: true,  // colour the pivot letter red (independent of alignment)
    showContext: true, // show surrounding sentence
    accent: 'violet',
    theme: 'dark',     // display theme (see THEMES): dark | paper | sepia | mono | red
    font: 'lexend',    // reading face (see FONTS)
    scale: 'm',        // reading size (see SCALES)
    bigFont: false,    // legacy extra-large toggle
    loadImages: true,  // fetch remote images at import to store them locally (offline after)
    imageBudgetMB: 300,// soft cap on stored image bytes; LRU-evicted past this
    haptics: true,     // vibrate where supported (Android); no-op on iOS
    sound: false,
    tapToPause: true,  // tap the flash stage to pause/resume
    view: 'list',          // library layout: list | compact | grid
    librarySort: 'recent', // recent | progress | title | added | type
  },
  game: {
    xp: 0,
    level: 1,
    streak: 0,
    longestStreak: 0,   // best streak ever reached
    lastActiveDay: null,
    wordsToday: 0,
    todayKey: null,
    history: {},        // 'YYYY-MM-DD' -> words read
    hours: {},          // hour-of-day (0-23) -> words read (for time-of-day achievements)
    topicWords: {},     // topic -> words read (running aggregate for the Interests view)
    achievements: [],   // ids unlocked
    goalHits: 0,        // number of days the daily word goal was met
    finished: 0,        // texts completed (first completion only)
    bestWpm: 0,
    totalWords: 0,
    totalSeconds: 0,
    sessions: 0,
  },
};

// deep-ish merge so new fields appear after upgrades
function hydrate(saved) {
  const s = structuredClone(DEFAULT);
  if (!saved) return s;
  for (const k of Object.keys(DEFAULT)) Object.assign(s[k], saved[k] || {});
  return s;
}

export const state = hydrate(safeParse(localStorage.getItem(LS_KEY)));

function safeParse(s){ try { return JSON.parse(s); } catch { return null; } }

let saveTimer;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
  }, 120);
}
// Write immediately — the 120ms debounce above can otherwise drop the final
// XP/streak/goal increment when iOS freezes or kills a backgrounded PWA.
export function flushSave() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
}
if (typeof addEventListener !== 'undefined') {
  addEventListener('pagehide', flushSave);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
}

/* ---------- date helpers ---------- */
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/* ============================================================
   IndexedDB — documents (can be large: PDF/EPUB extracted text)
   ============================================================ */
const DB_NAME = 'readmaxx-db';
const STORE = 'docs';
const ASSETS = 'assets';   // binary blobs (images), keyed by content hash
const DB_VERSION = 2;
let _db;

function db() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    // Migration is additive and version-guarded so existing docs survive the upgrade.
    r.onupgradeneeded = (e) => {
      const d = r.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      if (!d.objectStoreNames.contains(ASSETS)) {
        const a = d.createObjectStore(ASSETS, { keyPath: 'hash' });
        a.createIndex('lastUsed', 'lastUsed'); // for LRU eviction under quota pressure
      }
    };
    r.onsuccess = () => { _db = r.result; res(_db); };
    r.onerror = () => rej(r.error);
  });
}

function tx(mode) { return db().then(d => d.transaction(STORE, mode).objectStore(STORE)); }
function assetStore(mode) { return db().then(d => d.transaction(ASSETS, mode).objectStore(ASSETS)); }
const idbReq = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/* ---------- image assets (content-addressed, deduped across docs) ---------- */
export async function sha256Hex(buf) {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function getAsset(hash) { return idbReq((await assetStore('readonly')).get(hash)); }
export async function putAsset(rec) { await idbReq((await assetStore('readwrite')).put(rec)); return rec; }
export async function deleteAsset(hash) { return idbReq((await assetStore('readwrite')).delete(hash)); }
// Store a blob under its content hash, deduping and tracking which docs reference it.
export async function saveAsset(blob, docId) {
  const hash = await sha256Hex(await blob.arrayBuffer());
  const existing = await getAsset(hash);
  const docIds = new Set(existing?.docIds || []); if (docId) docIds.add(docId);
  await putAsset({ hash, blob, type: blob.type || 'image/*', bytes: blob.size, docIds: [...docIds], lastUsed: Date.now() });
  return hash;
}
export async function touchAsset(hash) {
  const a = await getAsset(hash); if (a) { a.lastUsed = Date.now(); await putAsset(a); }
}
// Sum of stored asset bytes + a coarse device-quota estimate (for the Settings readout).
export async function assetUsage() {
  let bytes = 0, count = 0;
  const store = await assetStore('readonly');
  await new Promise((res) => { const c = store.openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { bytes += cur.value.bytes || 0; count++; cur.continue(); } else res(); }; c.onerror = () => res(); });
  let quota = null, usage = null;
  try { const est = await navigator.storage?.estimate?.(); if (est) { quota = est.quota; usage = est.usage; } } catch {}
  return { bytes, count, quota, usage };
}
// Evict least-recently-used assets until stored image bytes fall under `cap`.
export async function evictAssetsTo(cap) {
  const store = await assetStore('readwrite');
  let total = 0; const recs = [];
  await new Promise((res) => { const c = store.openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { total += cur.value.bytes || 0; recs.push({ hash: cur.value.hash, bytes: cur.value.bytes || 0, lastUsed: cur.value.lastUsed || 0 }); cur.continue(); } else res(); }; c.onerror = () => res(); });
  if (total <= cap) return 0;
  recs.sort((a, b) => a.lastUsed - b.lastUsed); // oldest first
  let freed = 0;
  for (const r of recs) { if (total - freed <= cap) break; await deleteAsset(r.hash); freed += r.bytes; }
  return freed;
}
export async function clearAssets() {
  await idbReq((await assetStore('readwrite')).clear());
}

export async function putDoc(doc) {
  const o = await tx('readwrite');
  return new Promise((res, rej) => {
    const r = o.put(doc); r.onsuccess = () => res(doc); r.onerror = () => rej(r.error);
  });
}
export async function getDoc(id) {
  const o = await tx('readonly');
  return new Promise((res, rej) => {
    const r = o.get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
export async function allDocs() {
  const o = await tx('readonly');
  return new Promise((res, rej) => {
    const r = o.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error);
  });
}
export async function deleteDoc(id) {
  const o = await tx('readwrite');
  return new Promise((res, rej) => {
    const r = o.delete(id); r.onsuccess = () => res(); r.onerror = () => rej(r.error);
  });
}

export function uid() {
  return 'd' + Date.now().toString(36) + Math.floor(performance.now()*1000 % 1e6).toString(36);
}

/* apply display theme + accent + reading font + size to :root */
export function applyTheme() {
  const root = document.documentElement;
  const themeKey = THEMES[state.settings.theme] ? state.settings.theme : 'dark';
  const theme = THEMES[themeKey];
  // 'dark' is the base :root (no attribute); everything else is a data-theme.
  if (themeKey === 'dark') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', themeKey);
  // Accent: lock themes (mono/red) define their own in CSS — an inline override
  // here would win over the stylesheet, so clear it for them instead.
  if (theme.lock) {
    root.style.removeProperty('--a1');
    root.style.removeProperty('--a2');
    root.style.removeProperty('--accent');
  } else {
    const a = ACCENTS[state.settings.accent] || ACCENTS.violet;
    root.style.setProperty('--a1', a.a1);
    root.style.setProperty('--a2', a.a2);
    root.style.setProperty('--accent', a.a1);
  }
  const f = FONTS[state.settings.font] || FONTS.lexend;
  root.style.setProperty('--read-font', f.css);
  root.style.setProperty('--read-scale', SCALES[state.settings.scale] ?? 1);
  root.classList.toggle('bigfont', state.settings.bigFont);
}

/* Capability flag — iOS Safari has no Vibration API, so haptics is Android-only.
   We detect rather than pretend, per honest-feature design. */
export const HAS_VIBRATE = typeof navigator !== 'undefined' && 'vibrate' in navigator;

/* ---- data export / import (insurance against iOS evicting IndexedDB) ---- */
export async function exportData() {
  const docs = await allDocs();
  return JSON.stringify({ app:'readmaxx', v:1, exported:new Date().toISOString(), state, docs }, null, 2);
}
export async function importData(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (data.state) for (const k of Object.keys(DEFAULT)) Object.assign(state[k], data.state[k] || {});
  if (Array.isArray(data.docs)) for (const d of data.docs) await putDoc(d);
  save();
  return (data.docs || []).length;
}
