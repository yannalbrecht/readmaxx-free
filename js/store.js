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
    orp: true,         // highlight pivot letter
    showContext: true, // show surrounding sentence
    accent: 'violet',
    font: 'lexend',    // reading face (see FONTS)
    scale: 'm',        // reading size (see SCALES)
    bigFont: false,    // legacy extra-large toggle
    haptics: true,     // vibrate where supported (Android); no-op on iOS
    sound: false,
    tapToPause: true,  // tap the flash stage to pause/resume
  },
  game: {
    xp: 0,
    level: 1,
    streak: 0,
    lastActiveDay: null,
    wordsToday: 0,
    todayKey: null,
    history: {},        // 'YYYY-MM-DD' -> words read
    achievements: [],   // ids unlocked
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

/* ---------- date helpers ---------- */
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/* ============================================================
   IndexedDB — documents (can be large: PDF/EPUB extracted text)
   ============================================================ */
const DB_NAME = 'readmaxx-db';
const STORE = 'docs';
let _db;

function db() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains(STORE))
        d.createObjectStore(STORE, { keyPath: 'id' });
    };
    r.onsuccess = () => { _db = r.result; res(_db); };
    r.onerror = () => rej(r.error);
  });
}

function tx(mode) { return db().then(d => d.transaction(STORE, mode).objectStore(STORE)); }

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

/* apply accent + reading font + size to :root */
export function applyTheme() {
  const root = document.documentElement;
  const a = ACCENTS[state.settings.accent] || ACCENTS.violet;
  root.style.setProperty('--a1', a.a1);
  root.style.setProperty('--a2', a.a2);
  root.style.setProperty('--accent', a.a1);
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
