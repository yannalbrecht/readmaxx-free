/* ============================================================
   app.js — ReadMaxx Free controller
   onboarding · library · RSVP reader · stats · settings · import
   Imports the engine (rsvp), state (store) and DOM helpers (ui).
   ============================================================ */
import {
  state, save, applyTheme, ACCENTS, FONTS, SCALES, HAS_VIBRATE, dayKey,
  putDoc, getDoc, allDocs, deleteDoc, uid, exportData, importData,
} from './store.js';
import {
  buildFlashes, buildFlashesAsync, flashDelay, orpParts, toChapters, countWords, stripMarkdown,
} from './rsvp.js';
import {
  el, clear, buzz, toast, achievementToast, sheet, closeSheet, ICON, fmt, fmtTime,
} from './ui.js';

const $ = (s, r = document) => r.querySelector(s);
const D = {
  splash: $('#splash'), onboarding: $('#onboarding'), app: $('#app'),
  home: $('#view-home'), stats: $('#view-stats'), profile: $('#view-profile'),
  tabbar: $('#tabbar'), reader: $('#reader'), vaultScreen: $('#vault-screen'), guide: $('#guide'),
  fileInput: $('#file-input'), mdInput: $('#md-multi-input'), dirInput: $('#dir-input'),
};

const haptic = (ms) => { if (state.settings.haptics) buzz(ms); };
const baselineWPM = 200; // "average reader" used to compute time saved
const APP_VERSION = '1.6.2'; // keep in sync with BUILD in sw.js
let updateReady = false;

/* ============================================================
   SAMPLES — built-in public-domain texts (instant try)
   ============================================================ */
const SAMPLES = [
  { id:'s-speed', title:'How Speed Reading Works', author:'ReadMaxx', emoji:'⚡',
    text:`Your eyes do not glide smoothly across a line of text. They jump. Each jump is called a saccade, and between the jumps your eyes briefly stop to take in a few words. Those stops are called fixations.\n\nA large part of ordinary reading speed is lost to these movements, and to a quieter habit called subvocalization — the little voice in your head that pronounces every word as if you were reading aloud.\n\nRSVP, or Rapid Serial Visual Presentation, removes the eye movement entirely. Words appear one at a time in a fixed position, so your eyes never travel. A red pivot letter marks the Optimal Recognition Point, the spot your brain uses to identify a word fastest.\n\nWith the travel time gone, your reading speed is limited mostly by how quickly your mind can recognise words — and that is a muscle you can train. Start comfortable, then nudge the speed up a little each day.` },
  { id:'s-tortoise', title:'The Tortoise and the Hare', author:'Aesop', emoji:'🐢',
    text:`A Hare was making fun of the Tortoise one day for being so slow.\n\n"Do you ever get anywhere?" he asked with a mocking laugh.\n\n"Yes," replied the Tortoise, "and I get there sooner than you think. I will run you a race and prove it."\n\nThe Hare was much amused at the idea of running a race with the Tortoise, but for the fun of the thing he agreed. So the Fox, who had consented to act as judge, marked the distance and started the runners off.\n\nThe Hare was soon far out of sight, and to make the Tortoise feel very deeply how ridiculous it was for him to try a race with a Hare, he lay down beside the course to take a nap until the Tortoise should catch up.\n\nThe Tortoise meanwhile kept going slowly but steadily, and, after a time, passed the place where the Hare was sleeping. But the Hare slept on very peacefully; and when at last he did wake up, the Tortoise was near the goal. The Hare now ran his swiftest, but he could not overtake the Tortoise in time.` },
  { id:'s-holmes', title:'A Scandal in Bohemia (opening)', author:'Arthur Conan Doyle', emoji:'🔍',
    text:`To Sherlock Holmes she is always the woman. I have seldom heard him mention her under any other name. In his eyes she eclipses and predominates the whole of her sex.\n\nIt was not that he felt any emotion akin to love for Irene Adler. All emotions, and that one particularly, were abhorrent to his cold, precise but admirably balanced mind. He was, I take it, the most perfect reasoning and observing machine that the world has seen; but as a lover he would have placed himself in a false position.\n\nHe never spoke of the softer passions, save with a gibe and a sneer. They were admirable things for the observer — excellent for drawing the veil from men's motives and actions. But for the trained reasoner to admit such intrusions into his own delicate and finely adjusted temperament was to introduce a distracting factor which might throw a doubt upon all his mental results.` },
  { id:'s-dream', title:'I Have a Dream (excerpt)', author:'Martin Luther King Jr.', emoji:'🕊️',
    text:`I say to you today, my friends, so even though we face the difficulties of today and tomorrow, I still have a dream. It is a dream deeply rooted in the American dream.\n\nI have a dream that one day this nation will rise up and live out the true meaning of its creed: we hold these truths to be self-evident, that all men are created equal.\n\nI have a dream that my four little children will one day live in a nation where they will not be judged by the colour of their skin but by the content of their character.\n\nI have a dream today. With this faith we will be able to work together, to pray together, to struggle together, to go to jail together, to stand up for freedom together, knowing that we will be free one day.` },
  { id:'s-focus', title:'On Deep Focus', author:'ReadMaxx', emoji:'🧠',
    text:`Attention is not a switch you flip; it is a flame you protect. Every notification, every open tab, every half-finished thought is a small gust of wind, and a flame that is fanned in twenty directions gives no steady light.\n\nThe trick is not to find more time. It is to find a single, unbroken stretch of it, and to guard that stretch fiercely. Put the phone in another room. Close the tabs you are not using. Tell the people around you that for the next twenty minutes you are unavailable, and mean it.\n\nThen do one thing. Read one chapter. Write one page. Solve one problem. When the flame burns steadily, you will be astonished how far its light reaches.` },
];

/* ============================================================
   GAMIFICATION
   ============================================================ */
const xpForLevel = (l) => 60 * (l - 1) * (l - 1);
const levelFromXp = (xp) => Math.floor(Math.sqrt(xp / 60)) + 1;

const ACHIEVEMENTS = [
  { id:'first',   e:'📖', t:'First Words',     test:g => g.totalWords > 0 },
  { id:'finish',  e:'🏁', t:'Finished a Text', test:g => g.finished > 0 },
  { id:'w400',    e:'🚀', t:'Hit 400 WPM',     test:g => g.bestWpm >= 400 },
  { id:'w600',    e:'⚡', t:'Hit 600 WPM',     test:g => g.bestWpm >= 600 },
  { id:'w10k',    e:'🔥', t:'10,000 Words',    test:g => g.totalWords >= 10000 },
  { id:'w100k',   e:'💎', t:'100,000 Words',   test:g => g.totalWords >= 100000 },
  { id:'streak3', e:'📅', t:'3-Day Streak',    test:g => g.streak >= 3 },
  { id:'streak7', e:'🗓️', t:'7-Day Streak',    test:g => g.streak >= 7 },
];

function ensureToday() {
  const k = dayKey();
  if (state.game.todayKey !== k) { state.game.todayKey = k; state.game.wordsToday = 0; }
}

function addReading(words, seconds, wpm) {
  if (words <= 0) return;
  ensureToday();
  const g = state.game;
  if (g.lastActiveDay !== g.todayKey) {
    const y = dayKey(new Date(Date.now() - 864e5));
    g.streak = (g.lastActiveDay === y) ? (g.streak || 0) + 1 : 1;
    g.lastActiveDay = g.todayKey;
  }
  const before = g.wordsToday;
  g.wordsToday += words;
  g.history[g.todayKey] = (g.history[g.todayKey] || 0) + words;
  g.totalWords += words;
  g.totalSeconds += seconds;
  if (wpm > g.bestWpm) g.bestWpm = Math.round(wpm);
  g.xp += Math.round(words / 8) + Math.round(seconds / 20);
  const lvl = levelFromXp(g.xp);
  if (lvl > g.level) { g.level = lvl; achievementToast('⚡', `Level ${lvl} reached!`); }
  if (before < state.profile.dailyGoalWords && g.wordsToday >= state.profile.dailyGoalWords)
    achievementToast('🎯', 'Daily goal complete!');
  checkAchievements();
  save();
}

function checkAchievements() {
  const g = state.game;
  for (const a of ACHIEVEMENTS) {
    if (!g.achievements.includes(a.id) && a.test(g)) {
      g.achievements.push(a.id);
      achievementToast(a.e, a.t);
    }
  }
}

/* ============================================================
   BOOT
   ============================================================ */
function boot() {
  applyTheme();
  ensureToday();
  if (!state.profile.onboarded) startOnboarding();
  else enterApp();
  // Fade the splash via setTimeout (NOT requestAnimationFrame — rAF never fires
  // in a backgrounded tab, which would leave the splash stuck over the app).
  setTimeout(() => {
    D.splash.classList.add('out');
    setTimeout(() => D.splash.classList.add('hidden'), 520);
  }, 400);
  wireGlobal();
}

function wireGlobal() {
  D.tabbar.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    haptic(6);
    if (tab.dataset.action === 'quick-read') return pasteSheet();
    if (tab.dataset.view) showView(tab.dataset.view);
  });
  D.fileInput.addEventListener('change', onFilePicked);
  D.mdInput.addEventListener('change', onVaultPicked);
  D.dirInput.addEventListener('change', onDirPicked);
  document.addEventListener('keydown', readerKeys);

  // Make on-device storage durable so the library survives eviction.
  navigator.storage?.persist?.().catch(() => {});
  // A new build is waiting → offer a one-tap update (data is kept).
  window.addEventListener('rm-update-ready', () => {
    updateReady = true;
    showUpdateBanner();
    if (!D.profile.classList.contains('hidden')) renderProfile();
  });
  if (window.__rmUpdate && window.__rmUpdate.available) { updateReady = true; showUpdateBanner(); }
}

/* ---- in-app update (swap code, keep all data) ---- */
function showUpdateBanner() {
  if (document.querySelector('.update-banner')) return;
  const b = el('div', { class:'update-banner' });
  b.append(
    el('span', { class:'ub-t' }, '✨ New version available'),
    el('button', { class:'ub-btn', onclick: () => updateApp() }, 'Update'),
    el('button', { class:'ub-x', html: ICON.x, onclick: () => b.remove() }),
  );
  document.body.append(b);
  haptic(10);
}

async function updateApp(label) {
  toast('Updating…');
  if (label) label.textContent = 'Updating…';
  try {
    if (window.__rmUpdate) { await window.__rmUpdate.apply(); return; } // reloads via controllerchange
  } catch (e) { console.warn(e); }
  // Fallback if the SW API is unavailable: clear code caches and reload fresh.
  try { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } catch {}
  location.reload();
}

async function checkForUpdate() {
  toast('Checking for updates…');
  try { await window.__rmUpdate?.check(); } catch {}
  setTimeout(() => { if (!updateReady) toast('You’re on the latest version ✓'); }, 1800);
}

function enterApp() {
  D.onboarding.classList.add('hidden');
  D.app.classList.remove('hidden');
  showView('home');
  handleLaunchParams(); // import a shared ?add=URL / ?text= if present
}

function showView(name) {
  for (const v of ['home', 'stats', 'profile']) D[v].classList.toggle('hidden', v !== name);
  for (const t of D.tabbar.querySelectorAll('.tab'))
    t.classList.toggle('active', t.dataset.view === name);
  window.scrollTo(0, 0);
  if (name === 'home') renderHome();
  if (name === 'stats') renderStats();
  if (name === 'profile') renderProfile();
}

/* ============================================================
   ONBOARDING  (welcome → demo → goals → speed → plan → finish)
   ============================================================ */
const GOALS = [
  { id:'books',   e:'📚', t:'Read more books',        d:'Get through your shelf at last' },
  { id:'list',    e:'🗂️', t:'Clear my reading list',  d:'Articles, notes, saved-for-later' },
  { id:'focus',   e:'🧠', t:'Beat distraction',        d:'One word at a time keeps you locked in' },
  { id:'study',   e:'🎓', t:'Study & learn faster',    d:'More material in less time' },
  { id:'time',    e:'⏱️', t:'Save time every day',     d:'Win back hours each week' },
];
const SPEEDS = [
  { id:'slow', big:'150', t:'Careful',  base:150 },
  { id:'avg',  big:'250', t:'Average',  base:250 },
  { id:'fast', big:'400', t:'Quick',    base:400 },
];

let ob = { step: 0, goals: [], base: 250 };
let obTimer = null;
// 'share' (Safari sharing setup) is inserted only on iPhone/iPad.
const obStepNames = () => ['welcome', 'demo', 'goals', 'speed', 'plan', ...(isIOS() ? ['share'] : []), 'finish'];

function startOnboarding() {
  D.app.classList.add('hidden');
  D.onboarding.classList.remove('hidden');
  ob = { step: 0, goals: [], base: 250 };
  renderOb();
}

// Layout: fixed top bar · scrollable .ob-body (centers when it fits, scrolls when
// it doesn't) · pinned .ob-foot so the primary button is ALWAYS on screen.
function renderOb() {
  clearTimeout(obTimer); obTimer = null;
  const o = D.onboarding;
  clear(o);
  const STEPS = obStepNames();
  const pct = (ob.step / (STEPS.length - 1)) * 100;
  const top = el('div', { class:'ob-top' });
  if (ob.step > 0) top.append(el('button', { class:'ob-back', onclick:() => { ob.step--; renderOb(); } }, '‹'));
  const bar = el('div', { class:'ob-bar' }); bar.append(el('i', { style:`width:${pct}%` }));
  top.append(bar);
  top.append(el('button', { class:'ob-skip' + (ob.step < 3 ? '' : ' is-hidden'), onclick: finishOnboarding }, 'Skip'));

  const { content, cta } = ({ welcome:obWelcome, demo:obDemo, goals:obGoals, speed:obSpeed, plan:obPlan, share:obShare, finish:obFinish })[STEPS[ob.step]]();
  const body = el('div', { class:'ob-body' });
  const stage = el('div', { class:'ob-stage' });
  for (const c of content.flat()) if (c != null) stage.append(c);
  body.append(stage);
  const foot = el('div', { class:'ob-foot' });
  foot.append(el('button', { class:'btn', onclick: cta.onClick }, cta.label));

  o.append(top, body, foot);
}

function obNext() { ob.step++; renderOb(); }

function markLogo(size = 54) {
  return el('div', { class:'splash-mark', style:`font-size:${size}px` , html:
    `<span class="chev">›</span><span class="chev d2">›</span><span class="orp-dot"></span>` });
}

function obWelcome() {
  const hero = el('div', { class:'ob-hero' });
  hero.append(el('div', { class:'badge' }, markLogo(46)));
  hero.append(el('h1', { class:'ob-title center' }, 'ReadMaxx Free'));
  hero.append(el('div', { class:'ob-sub center', style:'max-width:32ch' },
    'Read up to 3× faster. One word at a time, perfectly placed for your eyes. Private, offline, free forever.'));
  return { content: [hero], cta: { label:'Get started', onClick:() => { haptic(8); obNext(); } } };
}

function obDemo() {
  const stage = el('div', { class:'demo-stage' });
  const word = el('div', { class:'word' });
  stage.append(word);

  const pick = el('div', { class:'wpm-pick' });
  let wpm = 400;
  const demoText = 'You are reading at four hundred words per minute right now and your comprehension is completely intact.'.split(/\s+/);
  let di = 0;
  const renderWord = (w) => {
    clear(word);
    if (state.settings.orp) {
      const p = orpParts(w);
      word.append(el('span', { class:'pre' }, p.pre), el('span', { class:'pivot' }, p.pivot), el('span', { class:'post' }, p.post));
    } else word.textContent = w;
  };
  const loop = () => {
    renderWord(demoText[di % demoText.length]); di++;
    obTimer = setTimeout(loop, 60000 / wpm);
  };
  const setWpm = (v) => { wpm = v; [...pick.children].forEach(c => c.classList.toggle('sel', +c.dataset.v === v)); };
  for (const v of [300, 400, 550]) {
    pick.append(el('button', { class:'opt', 'data-v':v, onclick:() => { haptic(6); setWpm(v); } },
      el('span', { class:'big' }, v), el('span', { class:'opt-d' }, 'WPM')));
  }
  setWpm(400); loop();

  return { content: [
    el('div', { class:'ob-eyebrow' }, 'Feel it first'),
    el('h1', { class:'ob-title' }, 'This is what fast feels like'),
    el('div', { class:'ob-sub' }, 'Keep your eyes on the red letter. The words come to you.'),
    el('div', { class:'mt16' }, stage),
    el('div', { class:'mt16' }, pick),
  ], cta: { label:'I want that', onClick:() => { haptic(8); obNext(); } } };
}

function obGoals() {
  const list = el('div', { class:'opt-list mt16' });
  for (const g of GOALS) {
    const sel = ob.goals.includes(g.id);
    const row = el('button', { class:'opt' + (sel ? ' sel' : '') }, el('span', { class:'emoji' }, g.e),
      el('div', {}, el('div', { class:'opt-t' }, g.t), el('div', { class:'opt-d' }, g.d)),
      el('span', { class:'tick', html: ICON.check }));
    row.addEventListener('click', () => {
      haptic(6);
      const i = ob.goals.indexOf(g.id);
      if (i >= 0) ob.goals.splice(i, 1); else ob.goals.push(g.id);
      row.classList.toggle('sel');
    });
    list.append(row);
  }
  return { content: [
    el('div', { class:'ob-eyebrow' }, 'Your why'),
    el('h1', { class:'ob-title' }, 'What are you here to do?'),
    el('div', { class:'ob-sub' }, 'Pick any that fit — we’ll tune your plan.'),
    list,
  ], cta: { label:'Continue', onClick:() => { haptic(8); obNext(); } } };
}

function obSpeed() {
  const wrap = el('div', { class:'wpm-pick mt16' });
  for (const s of SPEEDS) {
    const row = el('button', { class:'opt' + (ob.base === s.base ? ' sel' : '') },
      el('span', { class:'big' }, s.big), el('span', { class:'opt-t' }, s.t), el('span', { class:'opt-d' }, 'WPM'));
    row.addEventListener('click', () => { haptic(6); ob.base = s.base; [...wrap.children].forEach(c => c.classList.remove('sel')); row.classList.add('sel'); });
    wrap.append(row);
  }
  return { content: [
    el('div', { class:'ob-eyebrow' }, 'Starting line'),
    el('h1', { class:'ob-title' }, 'How fast do you read now?'),
    el('div', { class:'ob-sub' }, 'A rough guess is fine — most adults read around 200–250 WPM.'),
    wrap,
  ], cta: { label:'See my plan', onClick:() => { haptic(8); obNext(); } } };
}

function obPlan() {
  const goal = Math.min(800, Math.round(ob.base * 1.9 / 25) * 25);
  const minPerDay = 15;
  const extraWordsYr = Math.round((goal - ob.base) * minPerDay * 365);
  const booksYr = Math.max(1, Math.round((goal * minPerDay * 365) / 90000));
  const card = el('div', { class:'plan-card mt16' });
  card.append(el('div', { class:'ob-sub center', style:'margin:0 auto 4px' }, 'Target reading speed'));
  card.append(el('div', { class:'plan-num grad-text' }, String(goal)));
  card.append(el('div', { class:'ob-sub center', style:'margin:0 auto' }, 'words per minute'));
  const rows = el('div', { class:'mt16' });
  const add = (k, v) => rows.append(el('div', { class:'plan-row' }, el('span', { class:'muted' }, k), el('b', {}, v)));
  add('Today', `${ob.base} WPM`);
  add('Your goal', `${goal} WPM`);
  add('That’s about', `${booksYr} books / year`);
  add('Extra words/year', `+${fmt(extraWordsYr)}`);
  return { content: [
    el('div', { class:'ob-eyebrow center' }, 'Your personalized plan'),
    card, rows,
  ], cta: { label:'Build my plan', onClick:() => {
    state.profile.baselineWpm = ob.base;
    state.profile.goalWpm = goal;
    state.profile.dailyGoalWords = recommendedDailyGoal(goal);
    state.settings.wpm = Math.min(goal, Math.max(ob.base, 300));
    haptic(10); obNext();
  } } };
}

function obShare() {
  const card = el('button', { class:'ob-share-card', onclick:() => { haptic(8); openShareGuide(); } },
    el('div', { class:'ic', html: ICON.share }),
    el('div', { class:'grow' }, el('div', { class:'t' }, 'Set up sharing'),
      el('div', { class:'s' }, 'Walk through it now — takes a minute')),
    el('div', { class:'chev', html: ICON.next }));
  return { content: [
    el('div', { class:'ob-eyebrow' }, 'iPhone tip'),
    el('h1', { class:'ob-title' }, 'Read links straight from Safari'),
    el('div', { class:'ob-sub' }, 'Add a one-time shortcut so any article you’re on opens here with a tap of Safari’s Share button.'),
    el('div', { class:'mt16' }, card),
    el('div', { class:'ob-sub mt16', style:'font-size:13px' }, 'You can always set this up later in Import → Share from Safari.'),
  ], cta: { label:'Continue', onClick:() => { haptic(8); obNext(); } } };
}

function obFinish() {
  const input = el('input', { class:'field mt16', placeholder:'Your name', maxlength:'24', value: state.profile.name || '' });
  return { content: [
    el('div', { class:'ob-eyebrow' }, 'Last thing'),
    el('h1', { class:'ob-title' }, 'What should we call you?'),
    el('div', { class:'ob-sub' }, 'Optional — it just makes the app feel like yours.'),
    input,
    el('div', { class:'ob-sub mt16', style:'font-size:14px' },
      '✓ 100% private · ✓ works offline · ✓ no account, no ads, no fee'),
  ], cta: { label:'Start reading →', onClick:() => {
    state.profile.name = input.value.trim();
    state.profile.reasons = ob.goals;
    haptic(14); finishOnboarding();
  } } };
}

// A sensible daily word target derived from the goal speed (~12 focused min/day).
function recommendedDailyGoal(goalWpm) {
  return Math.max(500, Math.round((goalWpm * 12) / 250) * 250);
}

function finishOnboarding() {
  state.profile.onboarded = true;
  save();
  enterApp();
}

/* ============================================================
   HOME / LIBRARY
   ============================================================ */
const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const coverEmoji = (t) => ({ text:'📝', md:'🗒️', epub:'📚', pdf:'📕', url:'🔗', sample:'✨', vault:'📁' }[t] || '📄');

// ---- library state + helpers ----
let librarySearch = '';
let libraryFilter = 'all';
const TILE_COLORS = [
  ['#3a2c6e', '#b9a8ff'], ['#6e2c4e', '#ffaad0'], ['#244a3a', '#7fe0b0'],
  ['#2c3a6e', '#9ab8ff'], ['#4a2c5e', '#d8a8ff'], ['#1f4a4a', '#7fe0e0'],
];
function tileColors(d) {
  if (d.type === 'vault') return ['#5a4420', '#ffc97a'];
  if (d.type === 'sample') return ['#244a3a', '#7fe0b0'];
  let h = 0; const s = d.title || ''; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length];
}
const docCategory = (d) => d.type === 'vault' ? 'vault' : (d.type === 'epub' || d.type === 'pdf') ? 'book' : d.type === 'url' ? 'article' : 'note';
const docProgress = (d) => d.type === 'vault' ? vaultProgress(d).pct / 100 : (d.progress || 0);
function matchesFilter(d, f) {
  if (f === 'all') return true;
  if (f.startsWith('col:')) return (d.tags || []).includes(f.slice(4));
  const pr = docProgress(d);
  if (f === 'reading') return pr > 0 && pr < 0.99;
  if (f === 'unread') return pr <= 0;
  if (f === 'finished') return pr >= 0.99;
  return docCategory(d) === f;
}
const matchesSearch = (d, q) => !q || (`${d.title || ''} ${d.author || ''}`).toLowerCase().includes(q.toLowerCase());
function sortDocs(docs, by) {
  const a = [...docs];
  if (by === 'title') a.sort((x, y) => (x.title || '').localeCompare(y.title || ''));
  else if (by === 'progress') a.sort((x, y) => docProgress(y) - docProgress(x));
  else if (by === 'added') a.sort((x, y) => (y.added || 0) - (x.added || 0));
  else if (by === 'type') a.sort((x, y) => docCategory(x).localeCompare(docCategory(y)) || (y.lastOpened || 0) - (x.lastOpened || 0));
  else a.sort((x, y) => (y.lastOpened || y.added || 0) - (x.lastOpened || x.added || 0));
  return a;
}

async function renderHome() {
  const v = D.home; clear(v);
  const g = state.game, p = state.profile;

  const head = el('div', { class:'home-head' });
  head.append(el('div', {}, el('div', { class:'home-hi' }, greeting()),
    el('div', { class:'home-name' }, p.name ? p.name : 'Reader')));
  const right = el('div', { class:'row gap10' });
  right.append(el('div', { class:'streak-pill' }, el('span', { class:'fire' }, '🔥'), String(g.streak || 0)));
  right.append(el('button', { class:'avatar', style:'width:44px;height:44px;font-size:20px',
    onclick:() => { haptic(6); showView('profile'); } }, p.avatar || '🚀'));
  head.append(right);
  v.append(head);

  // daily goal ring
  const pct = Math.min(100, Math.round(p.dailyGoalWords ? (g.wordsToday / p.dailyGoalWords) * 100 : 0));
  const goal = el('div', { class:'card goal-card' });
  goal.append(el('div', { class:'ring', style:`--p:${pct}` }, el('b', {}, `${pct}%`)));
  const gm = el('div', { class:'goal-meta' });
  gm.append(el('div', { class:'t' }, pct >= 100 ? 'Daily goal complete 🎉' : 'Daily reading goal'));
  gm.append(el('div', { class:'s' }, `${fmt(g.wordsToday)} / ${fmt(p.dailyGoalWords)} words today`));
  const mb = el('div', { class:'mini-bar' }); mb.append(el('i', { style:`width:${pct}%` })); gm.append(mb);
  goal.append(gm);
  v.append(goal);

  // single import entry
  v.append(el('button', { class:'import-btn', onclick:() => { haptic(6); importSheet(); } },
    el('span', { class:'ic', html: ICON.plus }), el('span', { class:'grow' }, 'Import something to read'),
    el('span', { class:'chev', html: ICON.next })));

  const docs = await allDocs();

  // continue reading
  const inProgress = sortDocs(docs.filter(d => { const pr = docProgress(d); return pr > 0 && pr < 0.99; }), 'recent').slice(0, 8);
  if (inProgress.length) {
    v.append(el('div', { class:'sec-title' }, el('h3', {}, 'Continue reading')));
    const row = el('div', { class:'cont-row' });
    for (const d of inProgress) row.append(contCard(d));
    v.append(row);
  }

  // library header: title + view toggle + sort
  const lh = el('div', { class:'lib-head' });
  lh.append(el('h3', {}, 'Library'));
  const ctrls = el('div', { class:'lib-ctrls' });
  const vt = el('div', { class:'view-toggle' });
  for (const [m, icon] of [['list', ICON.viewList], ['compact', ICON.viewCompact], ['grid', ICON.viewGrid]]) {
    const b = el('button', { class: state.settings.view === m ? 'on' : '', html: icon, 'aria-label': m });
    b.addEventListener('click', () => { state.settings.view = m; save(); haptic(6); renderHome(); });
    vt.append(b);
  }
  ctrls.append(vt, el('button', { class:'sort-btn', html: ICON.sort, 'aria-label':'Sort', onclick: sortSheet }));
  lh.append(ctrls);
  v.append(lh);

  // search
  const search = el('div', { class:'search' });
  search.append(el('span', { class:'ic', html: ICON.search }));
  const si = el('input', { class:'search-in', placeholder:'Search title or author', value: librarySearch, inputmode:'search' });
  si.addEventListener('input', () => { librarySearch = si.value; renderList(); });
  search.append(si);
  if (librarySearch) search.append(el('button', { class:'clr', html: ICON.x, 'aria-label':'Clear', onclick:() => { librarySearch = ''; renderHome(); } }));
  v.append(search);

  // filter chips (status + type + collections)
  const chips = el('div', { class:'filter-chips' });
  const addChip = (id, label) => {
    const c = el('button', { class:'fchip' + (libraryFilter === id ? ' on' : '') }, label);
    c.addEventListener('click', () => { libraryFilter = id; haptic(6); renderHome(); });
    chips.append(c);
  };
  for (const [id, label] of [['all','All'],['reading','Reading'],['unread','Unread'],['finished','Finished'],['book','Books'],['article','Articles'],['note','Notes'],['vault','Vaults']]) addChip(id, label);
  const collections = [...new Set(docs.flatMap(d => d.tags || []))].sort();
  for (const name of collections) addChip('col:' + name, '# ' + name);
  v.append(chips);

  const listWrap = el('div', { class:'lib-list', id:'lib-list' });
  v.append(listWrap);
  renderList();
  function renderList() {
    const wrap = $('#lib-list', D.home); if (!wrap) return; clear(wrap);
    let list = sortDocs(docs.filter(d => matchesFilter(d, libraryFilter) && matchesSearch(d, librarySearch)), state.settings.librarySort);
    wrap.classList.toggle('grid', state.settings.view === 'grid' && list.length > 0);
    if (!list.length) {
      wrap.append(el('div', { class:'empty' }, el('div', { class:'big' }, docs.length ? '🔍' : '📚'),
        el('div', {}, docs.length ? 'No matches' : 'Your library is empty'),
        el('div', { class:'faint mt8' }, docs.length ? 'Try another filter or search.' : 'Import something, or try a sample below.')));
    } else for (const d of list) wrap.append(docCard(d, state.settings.view));
  }

  // samples
  v.append(el('div', { class:'sec-title' }, el('h3', {}, 'Try a sample')));
  for (const s of SAMPLES) {
    v.append(el('button', { class:'doc', onclick:() => { haptic(6); openSample(s); } },
      el('div', { class:'cover', style:'background:#244a3a;color:#7fe0b0' }, s.emoji),
      el('div', { class:'info' }, el('div', { class:'t' }, s.title),
        el('div', { class:'m' }, el('span', {}, s.author), el('span', {}, '·'),
          el('span', {}, `${countWords(s.text)} words`))),
      el('div', { class:'go', html: ICON.play })));
  }
}

function importSheet() {
  const body = el('div', { class:'stack' });
  const opt = (icon, t, s, fn) => el('button', { class:'imp-opt', onclick:() => { haptic(6); closeSheet(); fn(); } },
    el('span', { class:'imp-ic', html: icon }), el('div', { class:'grow' }, el('div', { class:'imp-t' }, t), el('div', { class:'imp-s' }, s)),
    el('span', { class:'imp-go', html: ICON.next }));
  body.append(opt(ICON.paste, 'Paste text', 'Articles, emails, notes', pasteSheet));
  body.append(opt(ICON.link, 'Web link', 'Fetch a clean article', urlSheet));
  body.append(opt(ICON.file, 'Upload file', '.txt · .md · .epub · .pdf', () => D.fileInput.click()));
  body.append(opt(ICON.vault, 'Import folder / vault', 'Whole vault, subfolders included', vaultSheet));
  body.append(opt(ICON.share, 'Share from Safari', 'One-tap sharing on iPhone', openShareGuide));
  sheet({ title:'Import', sub:'Everything stays on your device.', body });
}

/* ============================================================
   Share-from-Safari — interactive setup guide
   ============================================================ */
const SHARE_PREFIX = 'https://readmaxx-free.vercel.app/?add=';
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const shortcutFileURL = () => new URL('assets/readmaxx.shortcut', document.baseURI).href;
function openShortcutFile() {
  // Hand the file to the Shortcuts app via its URL scheme (a plain link just
  // renders the file as text in Safari). iOS 15+ still needs "Allow Untrusted
  // Shortcuts" on and may refuse unsigned imports — the manual path is the
  // reliable fallback.
  location.href = 'shortcuts://import-shortcut?url=' + encodeURIComponent(shortcutFileURL()) +
    '&name=' + encodeURIComponent('Read in ReadMaxx');
}
async function copyText(t, msg) { try { await navigator.clipboard.writeText(t); toast(msg || 'Copied'); } catch { toast('Long-press the link to copy', { err:true }); } }

let guideMode = 'manual', guideStep = 0; // manual build is the reliable default
function openShareGuide() { guideMode = 'manual'; guideStep = 0; D.guide.classList.remove('hidden'); renderGuide(); }
function closeGuide() { D.guide.classList.add('hidden'); }
function setGuideMode(m) { guideMode = m; guideStep = 0; haptic(6); renderGuide(); }

// iOS-style mock visuals; `.hl` marks the exact thing to tap.
const MOCK = {
  addShortcut: `<div class="ios-card"><div class="ios-card-row"><span class="ios-glyph">⚡️</span><span>Read in ReadMaxx</span></div><div class="ios-add hl">Add Shortcut</div></div>`,
  shareToggle: `<div class="ios-list"><div class="ios-row"><span>Show in Share Sheet</span><span class="ios-toggle on hl"></span></div><div class="ios-row"><span>Share Sheet Types</span><span class="ios-val">URLs ›</span></div></div>`,
  safariShare: `<div class="ios-sheet"><div class="ios-grab"></div><div class="ios-row hl"><span class="ios-glyph">⚡️</span><span>Read in ReadMaxx</span><span class="ios-chev">›</span></div><div class="ios-row dim"><span>Add to Reading List</span></div><div class="ios-row dim"><span>Copy</span></div></div>`,
  newShortcut: `<div class="ios-nav"><span>Shortcuts</span><span class="ios-plus hl">+</span></div>`,
  openUrls: `<div class="ios-find">🔍 Open URLs</div><div class="ios-list"><div class="ios-row hl"><span class="ios-glyph">🔗</span><span>Open URLs</span></div><div class="ios-row dim"><span>Open App</span></div></div>`,
  urlField: `<div class="ios-action"><div class="ios-action-t">Open URLs</div><div class="ios-url">${SHARE_PREFIX}<span class="ios-chip hl">Shortcut Input</span></div></div>`,
  named: `<div class="ios-action"><div class="ios-url" style="color:var(--text)">Read in ReadMaxx</div></div>`,
};

const DL_STEPS = [
  { eyebrow:'Quick try', title:'Import the ready-made shortcut', desc:'Tap to hand it to the Shortcuts app. Heads up: Apple blocks unsigned shortcuts from the web, so this may not work on your iOS — the build-it-yourself path always does.', mock:MOCK.addShortcut,
    action:{ label:'Try importing it', act: openShortcutFile },
    note:'First turn ON Settings → Shortcuts → Advanced → “Allow Untrusted Shortcuts”. If it still won’t import, switch to “build it yourself” below — that always works.' },
  { eyebrow:'Step 2', title:'Tap “Add Shortcut”', desc:'If it imported, Shortcuts shows a preview. Scroll down and tap the green Add Shortcut button.', mock:MOCK.addShortcut },
  { eyebrow:'Don’t skip this', title:'Turn on “Show in Share Sheet”', desc:'Open the shortcut’s ⓘ details and make sure “Show in Share Sheet” is ON (type: URLs). This is the step people miss — it’s what makes ReadMaxx appear in Safari’s Share menu.', mock:MOCK.shareToggle },
  { eyebrow:'You’re set', title:'Use it from any page', desc:'In Safari, open an article → tap Share → choose “Read in ReadMaxx”. It opens here and starts reading.', mock:MOCK.safariShare },
];
const MANUAL_STEPS = [
  { eyebrow:'Always works · 1', title:'New shortcut', desc:'Open the Shortcuts app and tap + (top-right) to create a new shortcut. Takes about a minute.', mock:MOCK.newShortcut },
  { eyebrow:'Step 2', title:'Add “Open URLs”', desc:'Tap “Add Action”, search for “Open URLs”, and tap it.', mock:MOCK.openUrls },
  { eyebrow:'Step 3', title:'Build the link', desc:'Tap the URL field, paste the link below, then tap the blue “Shortcut Input” chip above the keyboard so it’s added on the end.', mock:MOCK.urlField,
    action:{ label:'Copy the link', act:() => copyText(SHARE_PREFIX, 'Link copied') } },
  { eyebrow:'Don’t skip this', title:'Show in Share Sheet', desc:'Tap the shortcut’s ⓘ details → turn ON “Show in Share Sheet” → set Share Sheet Types to URLs.', mock:MOCK.shareToggle },
  { eyebrow:'Step 5', title:'Name it', desc:'Name the shortcut “Read in ReadMaxx”, then tap Done.', mock:MOCK.named },
  { eyebrow:'You’re set', title:'Use it from any page', desc:'In Safari, open an article → Share → “Read in ReadMaxx”.', mock:MOCK.safariShare },
];

function renderGuide() {
  const steps = guideMode === 'manual' ? MANUAL_STEPS : DL_STEPS;
  const s = steps[guideStep];
  const last = guideStep === steps.length - 1;
  const g = D.guide; clear(g);

  const top = el('div', { class:'g-top' });
  top.append(el('button', { class:'icon-btn', html: guideStep > 0 ? ICON.back : ICON.x,
    onclick:() => { if (guideStep > 0) { guideStep--; renderGuide(); } else closeGuide(); } }));
  top.append(el('div', { class:'g-title' }, 'Share from Safari'));
  top.append(el('button', { class:'icon-btn', html: ICON.x, 'aria-label':'Close', onclick: closeGuide }));
  g.append(top);

  const dots = el('div', { class:'g-dots' });
  steps.forEach((_, i) => dots.append(el('span', { class:'g-dot' + (i === guideStep ? ' on' : '') })));
  g.append(dots);

  const body = el('div', { class:'g-body' });
  body.append(el('div', { class:'g-eyebrow' }, s.eyebrow));
  body.append(el('h2', { class:'g-h' }, s.title));
  const mock = el('div', { class:'g-mock' }); mock.innerHTML = s.mock; body.append(mock);
  body.append(el('div', { class:'g-desc' }, s.desc));
  if (s.note) body.append(el('div', { class:'g-note' }, s.note));
  g.append(body);

  const foot = el('div', { class:'g-foot' });
  if (s.action) foot.append(el('button', { class:'btn', onclick: s.action.act }, s.action.label));
  foot.append(el('button', { class: s.action ? 'btn ghost' : 'btn',
    onclick:() => { if (last) closeGuide(); else { guideStep++; haptic(6); renderGuide(); } } }, last ? 'Done' : 'Next'));
  if (guideStep === 0) foot.append(el('button', { class:'g-switch',
    onclick:() => setGuideMode(guideMode === 'download' ? 'manual' : 'download') },
    guideMode === 'download' ? 'Build it yourself (always works) →' : 'Try the ready-made shortcut →'));
  g.append(foot);
}

function sortSheet() {
  const body = el('div', { class:'stack' });
  for (const [id, label] of [['recent','Recently opened'],['progress','Progress'],['title','Title (A–Z)'],['added','Date added'],['type','Type']]) {
    const b = el('button', { class:'opt' + (state.settings.librarySort === id ? ' sel' : '') },
      el('div', { class:'opt-t grow' }, label), el('span', { class:'tick', html: ICON.check }));
    b.addEventListener('click', () => { state.settings.librarySort = id; save(); haptic(6); closeSheet(); renderHome(); });
    body.append(b);
  }
  sheet({ title:'Sort library', body });
}

function bindCard(card, d) {
  card.addEventListener('click', () => { haptic(6); openDoc(d.id); });
  let lp; card.addEventListener('pointerdown', () => { lp = setTimeout(() => docActions(d), 480); });
  for (const ev of ['pointerup', 'pointerleave', 'pointermove']) card.addEventListener(ev, () => clearTimeout(lp));
}

function contCard(d) {
  const prog = Math.round(docProgress(d) * 100);
  const [bg, fg] = tileColors(d);
  const c = el('button', { class:'cont-card' });
  c.append(el('div', { class:'cont-cover', style:`background:${bg};color:${fg}` }, coverEmoji(d.type)));
  c.append(el('div', { class:'cont-info' }, el('div', { class:'cont-t' }, d.title || 'Untitled'),
    el('div', { class:'cont-bar' }, el('i', { style:`width:${prog}%` })), el('div', { class:'cont-pct' }, `${prog}%`)));
  bindCard(c, d); return c;
}

function docCard(d, mode = 'list') {
  const isVault = d.type === 'vault';
  const vp = isVault ? vaultProgress(d) : null;
  const prog = Math.round(docProgress(d) * 100);
  const done = prog >= 99;
  const [bg, fg] = tileColors(d);
  const emoji = coverEmoji(d.type);

  if (mode === 'grid') {
    const card = el('button', { class:'gcard' });
    const cover = el('div', { class:'gcover', style:`background:${bg};color:${fg}` }, emoji);
    if (prog > 0) cover.append(el('span', { class:'gbadge' + (done ? ' done' : '') }, done ? '✓' : `${prog}%`));
    if (prog > 0 && !done) { const pb = el('div', { class:'gbar' }); pb.append(el('i', { style:`width:${prog}%` })); cover.append(pb); }
    card.append(cover, el('div', { class:'gtitle' }, d.title || 'Untitled'),
      el('div', { class:'gmeta' }, isVault ? `${vp.total} notes` : `${fmt(d.words)} words`));
    bindCard(card, d); return card;
  }
  if (mode === 'compact') {
    const card = el('button', { class:'doc compact' });
    card.append(el('div', { class:'cover', style:`background:${bg};color:${fg}` }, emoji));
    card.append(el('div', { class:'info' }, el('div', { class:'t' }, d.title || 'Untitled')));
    card.append(el('span', { class:'cprog' + (done ? ' good-t' : '') }, isVault ? `${prog}%` : done ? '✓' : prog > 0 ? `${prog}%` : ''));
    bindCard(card, d); return card;
  }
  // rich list
  const card = el('button', { class:'doc' });
  card.append(el('div', { class:'cover', style:`background:${bg};color:${fg}` }, emoji));
  const info = el('div', { class:'info' });
  info.append(el('div', { class:'t' }, d.title || 'Untitled'));
  const meta = el('div', { class:'m' });
  if (isVault) meta.append(el('span', {}, `${vp.total} notes`), el('span', {}, '·'), el('span', {}, `${vp.notesRead}/${vp.total} read`));
  else { meta.append(el('span', {}, `${fmt(d.words)} words`)); if (d.author) meta.append(el('span', {}, '·'), el('span', {}, d.author)); }
  info.append(meta);
  if (prog > 0 && (prog < 99 || isVault)) { const pb = el('div', { class:'pbar' }); pb.append(el('i', { style:`width:${prog}%` })); info.append(pb); }
  card.append(info);
  card.append(done && !isVault ? el('span', { class:'go good-t', html: ICON.check }) : el('div', { class:'go', html: isVault ? ICON.next : ICON.play }));
  bindCard(card, d); return card;
}

function docActions(d) {
  haptic(12);
  const body = el('div', { class:'stack' });
  body.append(el('button', { class:'btn', onclick:() => { closeSheet(); openDoc(d.id); } }, 'Open'));
  body.append(el('button', { class:'btn ghost', onclick:() => { closeSheet(); collectionSheet(d); } }, 'Add to collection'));
  body.append(el('button', { class:'btn ghost', onclick: async () => { closeSheet(); await deleteDoc(d.id); toast('Deleted'); renderHome(); } }, 'Delete'));
  sheet({ title: d.title || 'Item', sub: `${fmt(d.words)} words`, body });
}

async function collectionSheet(d) {
  const docs = await allDocs();
  const all = [...new Set(docs.flatMap(x => x.tags || []))].sort();
  d.tags = d.tags || [];
  const list = el('div', { class:'stack' });
  const renderChips = () => {
    clear(list);
    if (!all.length) list.append(el('div', { class:'ob-sub', style:'font-size:13px' }, 'No collections yet — create one below.'));
    for (const name of all) {
      const b = el('button', { class:'opt' + (d.tags.includes(name) ? ' sel' : '') },
        el('div', { class:'opt-t grow' }, name), el('span', { class:'tick', html: ICON.check }));
      b.addEventListener('click', () => {
        const i = d.tags.indexOf(name); if (i >= 0) d.tags.splice(i, 1); else d.tags.push(name);
        putDoc(d); haptic(6); b.classList.toggle('sel');
      });
      list.append(b);
    }
  };
  renderChips();
  const inp = el('input', { class:'field', style:'flex:1', placeholder:'New collection', maxlength:'24' });
  const add = el('button', { class:'btn sm', onclick:() => {
    const n = inp.value.trim(); if (!n) return;
    if (!d.tags.includes(n)) d.tags.push(n);
    if (!all.includes(n)) all.push(n); all.sort();
    putDoc(d); inp.value = ''; haptic(6); renderChips();
  } }, 'Create');
  const body = el('div', {});
  body.append(list, el('div', { class:'row gap10 mt16' }, inp, add));
  sheet({ title:'Collections', sub: d.title, body, onClose: renderHome });
}

/* ============================================================
   IMPORT — paste / url / file / vault / sample
   ============================================================ */
async function saveDoc(doc) {
  doc.id = doc.id || uid();
  doc.added = doc.added || Date.now();
  doc.lastOpened = Date.now();
  doc.idx = doc.idx || 0;
  doc.progress = doc.progress || 0;
  await putDoc(doc);
  return doc;
}

function makeDoc({ title, type, text, author, markdown }) {
  const chapters = toChapters(text, { markdown: markdown || type === 'md' });
  return { title: title || 'Untitled', type, author, chapters, words: countWords(text) };
}

function pasteSheet() {
  const body = el('div', { class:'stack' });
  const ta = el('textarea', { class:'field pretty', placeholder:'Paste or type anything — an article, an email, notes…' });
  body.append(ta);
  const go = el('button', { class:'btn', onclick: async () => {
    const t = ta.value.trim(); if (!t) return toast('Nothing to read', { err:true });
    closeSheet();
    const firstLine = t.split('\n').find(Boolean) || 'Pasted text';
    const doc = await saveDoc(makeDoc({ title: firstLine.slice(0, 48), type:'text', text:t }));
    openDoc(doc.id);
  } }, 'Read now');
  body.append(go);
  sheet({ title:'Paste text', sub:'Stays on your device.', body });
  setTimeout(() => ta.focus(), 250);
}

function urlSheet() {
  const body = el('div', { class:'stack' });
  const inp = el('input', { class:'field', type:'url', placeholder:'https://article-to-read.com/…', inputmode:'url' });
  body.append(inp);
  const status = el('div', { class:'ob-sub', style:'font-size:13px' }, 'We fetch a clean, readable version of the page.');
  body.append(status);
  const go = el('button', { class:'btn' }, 'Fetch article');
  go.addEventListener('click', async () => {
    let url = inp.value.trim();
    if (!url) return toast('Enter a URL', { err:true });
    if (!/^https?:\/\//.test(url)) url = 'https://' + url;
    go.disabled = true; go.textContent = 'Fetching…';
    status.textContent = 'Reaching the page…';
    try {
      const text = await fetchArticle(url);
      if (!text || text.length < 80) throw new Error('empty');
      closeSheet();
      let title = (text.match(/^#\s+(.+)/m)?.[1] || new URL(url).hostname).slice(0, 60);
      const doc = await saveDoc(makeDoc({ title, type:'url', text, author:new URL(url).hostname, markdown:true }));
      openDoc(doc.id);
    } catch (e) {
      go.disabled = false; go.textContent = 'Try again';
      status.textContent = 'Couldn’t fetch that page. Try another link, or paste the text instead.';
    }
  });
  body.append(go);
  sheet({ title:'Read a web article', sub:'Paste any article link.', body });
  setTimeout(() => inp.focus(), 250);
}

async function fetchArticle(url) {
  // Primary: r.jina.ai returns clean markdown of the page, CORS-enabled.
  try {
    const r = await fetch('https://r.jina.ai/' + url, { headers: { 'X-Return-Format': 'markdown' } });
    if (r.ok) {
      let t = await r.text();
      if (t && t.length > 80) {
        // Strip jina's "Title: … Markdown Content:" preamble; keep the title as an H1.
        const m = t.match(/^Title:\s*(.+)$/m);
        t = t.replace(/^[\s\S]*?Markdown Content:\s*/, '');
        if (m) t = `# ${m[1].trim()}\n\n${t}`;
        return t.trim();
      }
    }
  } catch {}
  // Fallback: allorigins raw HTML → strip to text.
  const r2 = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(url));
  const html = await r2.text();
  return htmlToText(html);
}

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,nav,footer,header,aside,noscript,svg').forEach(n => n.remove());
  const main = doc.querySelector('article, main') || doc.body;
  let out = '';
  main.querySelectorAll('h1,h2,h3,p,li,blockquote').forEach(n => {
    const t = n.textContent.replace(/\s+/g, ' ').trim();
    if (!t) return;
    out += (/^H[123]$/.test(n.tagName) ? '\n\n# ' + t : t) + '\n\n';
  });
  return out.trim() || main.textContent.replace(/\s+/g, ' ').trim();
}

async function onFilePicked(e) {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  const name = file.name.replace(/\.[^.]+$/, '');
  try {
    if (/\.epub$/i.test(file.name)) {
      toast('Opening EPUB…');
      const saved = await saveDoc(await parseEpub(file));
      openDoc(saved.id);
    } else if (/\.pdf$/i.test(file.name)) {
      toast('Reading PDF…');
      const saved = await saveDoc(await parsePdf(file));
      openDoc(saved.id);
    } else {
      const text = await file.text();
      const md = /\.(md|markdown)$/i.test(file.name);
      const doc = await saveDoc(makeDoc({ title: name.slice(0, 60), type: md ? 'md' : 'text', text, markdown: md }));
      openDoc(doc.id);
    }
  } catch (err) { console.error(err); toast(err.message || 'Could not read that file', { err:true }); }
}

/* ---- PDF (client-side text extraction via pdf.js) ---- */
async function parsePdf(file) {
  const pdfjs = await import('../vendor/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.mjs', document.baseURI).href;
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  let text = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    let line = '';
    for (const it of content.items) line += (it.str || '') + (it.hasEOL ? '\n' : ' ');
    text += line + '\n\n';
  }
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < 40) throw new Error('No selectable text — is this a scanned PDF?');
  let title = file.name.replace(/\.pdf$/i, '');
  try { const m = await pdf.getMetadata(); if (m?.info?.Title) title = m.info.Title; } catch {}
  return { title: title.slice(0, 80), type: 'pdf', chapters: toChapters(text), words: countWords(text) };
}

/* ---- shared-link / launch-param import (?add=URL or ?text=...) ---- */
async function importFromUrl(url) {
  if (!/^https?:\/\//.test(url)) url = 'https://' + url;
  toast('Fetching article…');
  try {
    const text = await fetchArticle(url);
    if (!text || text.length < 80) throw 0;
    const title = (text.match(/^#\s+(.+)/m)?.[1] || new URL(url).hostname).slice(0, 60);
    const doc = await saveDoc(makeDoc({ title, type:'url', text, author:new URL(url).hostname, markdown:true }));
    openDoc(doc.id);
  } catch { toast('Couldn’t fetch that link', { err:true }); }
}
async function quickImportText(text) {
  const t = (text || '').trim(); if (!t) return;
  const title = (t.split('\n').find(Boolean) || 'Shared text').slice(0, 48);
  const doc = await saveDoc(makeDoc({ title, type:'text', text: t }));
  openDoc(doc.id);
}
function handleLaunchParams() {
  try {
    const u = new URL(location.href);
    const add = u.searchParams.get('add') || u.searchParams.get('url');
    const text = u.searchParams.get('text');
    if (!add && !text) return;
    history.replaceState({}, '', u.pathname + u.hash); // clear so refresh doesn't re-import
    if (add) importFromUrl(add.trim()); else quickImportText(text);
  } catch {}
}

// Folder picker (#dir-input, webkitdirectory) → recurses ALL subfolders.
async function onDirPicked(e) { const files = [...e.target.files]; e.target.value = ''; buildVaultFromFiles(files, 'My vault'); }
// File picker fallback (#md-multi-input) → also grouped into one browsable vault.
async function onVaultPicked(e) { const files = [...e.target.files]; e.target.value = ''; buildVaultFromFiles(files, 'My notes'); }

/* ---- Vault import (one folder, subfolders included) + browser ---- */
function vaultSheet() {
  const body = el('div', { class:'stack' });
  body.append(el('button', { class:'btn', onclick:() => { closeSheet(); D.dirInput.click(); } }, '📁  Choose a folder'));
  body.append(el('button', { class:'btn ghost', onclick:() => { closeSheet(); D.mdInput.click(); } }, 'Pick files instead'));
  body.append(el('div', { class:'ob-sub', style:'font-size:13px;max-width:none' },
    'Pick one folder — the whole vault, including every subfolder, comes in with per-file reading progress. If your browser can’t pick a folder (some iPhones), tap “Pick files” and select all the notes.'));
  sheet({ title:'Import a vault', sub:'Markdown (.md) & text (.txt) · subfolders included.', body });
}

// `folder` = the path between the vault root and the filename (for grouping).
function makeVaultNote(file, text) {
  const md = /\.(md|markdown)$/i.test(file.name);
  const rel = file.webkitRelativePath || file.name;
  const segs = rel.split('/');
  const folder = segs.length > 2 ? segs.slice(1, -1).join('/') : '';
  const title = (text.match(/^#\s+(.+)/m)?.[1] || file.name.replace(/\.[^.]+$/, '')).slice(0, 80);
  return { path: rel, folder, title, type: md ? 'md' : 'text',
    chapters: toChapters(text, { markdown: md }), words: countWords(text), idx: 0, progress: 0 };
}

async function buildVaultFromFiles(files, fallbackName) {
  const picked = files.filter(f => /\.(md|markdown|txt)$/i.test(f.name));
  if (!picked.length) return toast('No .md or .txt files found', { err:true });
  toast('Importing vault…');
  const rel0 = picked[0].webkitRelativePath || '';
  const vaultName = (rel0.includes('/') ? rel0.split('/')[0] : '') || fallbackName || 'My notes';
  const notes = [];
  for (const f of picked) { try { const text = await f.text(); if (text.trim()) notes.push(makeVaultNote(f, text)); } catch {} }
  if (!notes.length) return toast('Those files were empty', { err:true });
  notes.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric:true }));
  const words = notes.reduce((s, n) => s + n.words, 0);
  const subfolders = new Set(notes.map(n => n.folder).filter(Boolean)).size;
  const vault = await saveDoc({ id: uid(), type:'vault', title: vaultName, notes, words });
  toast(`Imported “${vaultName}” · ${notes.length} notes${subfolders ? ` · ${subfolders} folders` : ''}`);
  openVaultBrowser(vault.id);
}

// words-weighted progress across the whole vault + notes-finished count
function vaultProgress(v) {
  let wordsRead = 0, notesRead = 0;
  for (const n of (v.notes || [])) {
    wordsRead += (n.words || 0) * (n.progress || 0);
    if ((n.progress || 0) >= 0.99) notesRead++;
  }
  const pct = v.words ? Math.round((wordsRead / v.words) * 100) : 0;
  return { pct, notesRead, total: (v.notes || []).length, wordsRead: Math.round(wordsRead) };
}

async function openVaultBrowser(id) {
  const v = await getDoc(id);
  if (!v) return toast('Vault not found', { err:true });
  v.lastOpened = Date.now(); putDoc(v);
  renderVaultScreen(v);
  D.vaultScreen.classList.remove('hidden');
}

function renderVaultScreen(v) {
  const s = D.vaultScreen; clear(s);
  const vp = vaultProgress(v);

  const top = el('div', { class:'rd-top' });
  top.append(el('button', { class:'icon-btn', html: ICON.back, onclick: closeVault }));
  top.append(el('div', { class:'rd-title' }, el('div', { class:'t' }, `📁 ${v.title}`),
    el('div', { class:'c' }, `${vp.total} notes`)));
  top.append(el('button', { class:'icon-btn', html: ICON.trash, onclick: () => vaultActions(v) }));
  s.append(top);

  const scroll = el('div', { class:'vault-scroll' });
  // overall progress hero
  const hero = el('div', { class:'card goal-card', style:'margin:6px 0 14px' });
  hero.append(el('div', { class:'ring', style:`--p:${vp.pct}` }, el('b', {}, `${vp.pct}%`)));
  const hm = el('div', { class:'goal-meta' });
  hm.append(el('div', { class:'t' }, vp.pct >= 99 ? 'Vault complete 🎉' : 'Vault progress'));
  hm.append(el('div', { class:'s' }, `${vp.notesRead} of ${vp.total} notes · ${fmt(vp.wordsRead)} / ${fmt(v.words)} words`));
  const mb = el('div', { class:'mini-bar' }); mb.append(el('i', { style:`width:${vp.pct}%` })); hm.append(mb);
  hero.append(hm);
  scroll.append(hero);

  // continue button → first unread note
  const nextIdx = v.notes.findIndex(n => (n.progress || 0) < 0.99);
  scroll.append(el('button', { class:'btn', style:'margin-bottom:14px', onclick:() => openVaultNote(v, nextIdx < 0 ? 0 : nextIdx) },
    nextIdx < 0 ? 'Read again from start' : (vp.notesRead ? 'Continue vault' : 'Start reading')));

  // file picker — pick any note to read; grouped by subfolder, each shows %.
  scroll.append(el('div', { class:'sec-title' }, el('h3', {}, 'Files'),
    el('a', {}, `${vp.notesRead}/${vp.total} read`)));

  const noteRow = (n, i) => {
    const prog = Math.round((n.progress || 0) * 100);
    const done = prog >= 99;
    const row = el('button', { class:'doc' });
    row.append(el('div', { class:'cover' + (done ? ' done' : ''), style:'font-size:15px' }, done ? '✓' : `${prog || ''}${prog ? '%' : '·'}`));
    const info = el('div', { class:'info' });
    info.append(el('div', { class:'t' }, n.title));
    info.append(el('div', { class:'m' }, el('span', {}, `${fmt(n.words)} words`),
      el('span', {}, '·'), el('span', { class: done ? 'good-t' : prog > 0 ? '' : 'faint' }, done ? 'Finished' : prog > 0 ? `${prog}% read` : 'Unread')));
    if (prog > 0 && !done) { const pb = el('div', { class:'pbar' }); pb.append(el('i', { style:`width:${prog}%` })); info.append(pb); }
    row.append(info, el('div', { class:'go', html: ICON.play }));
    row.addEventListener('click', () => { haptic(6); openVaultNote(v, i); });
    return row;
  };

  // group by subfolder so nested files are easy to find
  const groups = {};
  v.notes.forEach((n, i) => { (groups[n.folder || ''] = groups[n.folder || ''] || []).push(i); });
  const folderKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
  const hasFolders = folderKeys.some(Boolean);
  for (const fk of folderKeys) {
    if (hasFolders) scroll.append(el('div', { class:'vault-folder' },
      el('span', { class:'vf-ic' }, fk ? '📂' : '🏠'), el('span', {}, fk || 'Top level')));
    for (const i of groups[fk]) scroll.append(noteRow(v.notes[i], i));
  }
  s.append(scroll);
}

function vaultActions(v) {
  const body = el('div', { class:'stack' });
  body.append(el('button', { class:'btn ghost', onclick: async () => {
    closeSheet(); await deleteDoc(v.id); D.vaultScreen.classList.add('hidden'); showView('home'); toast('Vault removed');
  } }, 'Remove vault'));
  sheet({ title: v.title, sub: `${v.notes.length} notes · re-import the folder to refresh`, body });
}

function closeVault() { D.vaultScreen.classList.add('hidden'); showView('home'); }

async function openSample(s) {
  // reuse an existing imported copy if present so progress persists
  const existing = (await allDocs()).find(d => d.sampleId === s.id);
  if (existing) return openDoc(existing.id);
  const doc = makeDoc({ title: s.title, type:'sample', text: s.text, author: s.author });
  doc.sampleId = s.id;
  const saved = await saveDoc(doc);
  openDoc(saved.id);
}

/* ---- EPUB (spine-ordered) ---- */
function loadScript(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some(s => s.src.includes(src))) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s);
  });
}
async function parseEpub(file) {
  await loadScript('./vendor/jszip.min.js');
  const zip = await window.JSZip.loadAsync(file);
  const parser = new DOMParser();
  const container = await zip.file('META-INF/container.xml').async('string');
  const opfPath = parser.parseFromString(container, 'application/xml')
    .querySelector('rootfile').getAttribute('full-path');
  const base = opfPath.includes('/') ? opfPath.replace(/[^/]+$/, '') : '';
  const opf = parser.parseFromString(await zip.file(opfPath).async('string'), 'application/xml');
  const title = opf.querySelector('title')?.textContent?.trim() || file.name.replace(/\.epub$/i, '');
  const author = opf.querySelector('creator')?.textContent?.trim() || '';
  const manifest = {};
  opf.querySelectorAll('manifest > item').forEach(it => manifest[it.getAttribute('id')] = it.getAttribute('href'));
  const spine = [...opf.querySelectorAll('spine > itemref')].map(r => manifest[r.getAttribute('idref')]).filter(Boolean);
  const chapters = [];
  for (const href of spine) {
    const entry = zip.file(base + decodeURIComponent(href));
    if (!entry) continue;
    const html = await entry.async('string');
    const dd = parser.parseFromString(html, 'text/html');
    dd.querySelectorAll('script,style,svg').forEach(n => n.remove());
    const chTitle = dd.querySelector('h1,h2,title')?.textContent?.trim() || '';
    let text = '';
    dd.body?.querySelectorAll('h1,h2,h3,p,li,blockquote').forEach(n => {
      const t = n.textContent.replace(/\s+/g, ' ').trim();
      if (t) text += t + '\n\n';
    });
    if (!text.trim()) text = (dd.body?.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.trim()) chapters.push({ title: chTitle, text: text.trim() });
  }
  if (!chapters.length) throw new Error('No readable text in EPUB');
  const words = chapters.reduce((a, c) => a + countWords(c.text), 0);
  return { title, type:'epub', author, chapters, words };
}

/* ============================================================
   READER  (RSVP playback)
   ============================================================ */
let R = null;

async function openDoc(id) {
  const doc = await getDoc(id);
  if (!doc) return toast('Not found', { err:true });
  if (doc.type === 'vault') return openVaultBrowser(id);
  openReader(doc, null);
}

// Open one note inside a vault, carrying the vault context so progress writes
// back to the note and prev/next lets you tab through the whole vault.
function openVaultNote(vault, i) {
  const note = vault.notes[i]; if (!note) return;
  D.vaultScreen.classList.add('hidden');
  const doc = { title: note.title, subtitle: vault.title, words: note.words,
    chapters: note.chapters, idx: note.idx || 0, progress: note.progress || 0, type:'md' };
  openReader(doc, { vaultDoc: vault, i });
}

const BIG_DOC = 50000; // words above which we build asynchronously (no UI freeze)

async function openReader(doc, vaultCtx) {
  D.reader.classList.remove('hidden');
  const big = (doc.words || 0) > BIG_DOC;
  if (big) showReaderBuilding(doc.title);
  const built = big
    ? await buildFlashesAsync(doc.chapters, state.settings.chunk)
    : buildFlashes(doc.chapters, state.settings.chunk);
  R = {
    doc, vaultCtx, flashes: built.flashes, ranges: built.chapterRanges, total: built.flashes.length,
    idx: Math.min(doc.idx || 0, built.flashes.length - 1), playing: false, timer: null,
    sessionWords: 0, sessionStart: 0, wake: null, done: (doc.progress || 0) >= 0.99,
  };
  if (R.idx >= R.total - 1) R.idx = 0; // finished → restart
  state.game.sessions = (state.game.sessions || 0) + 1;
  renderReader();
}

function showReaderBuilding(title) {
  const r = D.reader; clear(r);
  r.append(el('div', { class:'rd-building' },
    el('div', { class:'rd-spin' }),
    el('div', { class:'rd-build-t' }, 'Preparing book…'),
    el('div', { class:'rd-build-s' }, title || '')));
}

function gotoNote(delta) {
  if (!R?.vaultCtx) return;
  const { vaultDoc, i } = R.vaultCtx;
  const j = i + delta;
  if (j < 0 || j >= vaultDoc.notes.length) return;
  pause(); saveProgress();
  openVaultNote(vaultDoc, j);
}

function renderReader() {
  const r = D.reader; clear(r);
  r.classList.toggle('no-orp', !state.settings.orp);

  const inVault = !!R.vaultCtx;
  const multiChapter = R.ranges.length > 1;
  const top = el('div', { class:'rd-top' });
  top.append(el('button', { class:'icon-btn', html: inVault ? ICON.back : ICON.x, onclick: closeReader }));
  const title = el('div', { class:'rd-title' });
  const chapLabel = el('div', { class:'c rd-chap' + (multiChapter ? ' tappable' : '') }, '');
  if (multiChapter) chapLabel.addEventListener('click', openTOC);
  title.append(el('div', { class:'t' }, R.doc.title), chapLabel);
  top.append(title);
  const acts = el('div', { class:'rd-acts' });
  if (multiChapter) acts.append(el('button', { class:'icon-btn', html: ICON.toc, 'aria-label':'Contents', onclick: openTOC }));
  acts.append(el('button', { class:'icon-btn', html: ICON.gear, 'aria-label':'Settings', onclick: readerSettings }));
  top.append(acts);
  r.append(top);

  if (inVault) {
    const { vaultDoc, i } = R.vaultCtx;
    const nav = el('div', { class:'rd-vaultnav' });
    nav.append(el('button', { class:'chip' + (i <= 0 ? ' is-off' : ''), onclick:() => gotoNote(-1) }, '‹ Prev'));
    nav.append(el('div', { class:'vn-label' }, `📁 ${vaultDoc.title} · ${i + 1}/${vaultDoc.notes.length}`));
    nav.append(el('button', { class:'chip' + (i >= vaultDoc.notes.length - 1 ? ' is-off' : ''), onclick:() => gotoNote(1) }, 'Next ›'));
    r.append(nav);
  }

  const stage = el('div', { class:'rd-stage' });
  const zone = el('div', { class:'rd-wordzone' });
  zone.innerHTML = '<span class="barrier top"><i class="tick"></i></span><span class="barrier bot"><i class="tick"></i></span>';
  zone.append(el('div', { class:'word rd-word' }));
  stage.append(zone);
  stage.append(el('div', { class:'rd-context' }, el('div', { class:'ctx-text' })));
  stage.addEventListener('click', () => { if (state.settings.tapToPause) R.playing ? pause() : play(); });
  r.append(stage);

  const ctr = el('div', { class:'rd-controls' });
  const words = el('div', { class:'rd-words' });
  words.append(el('span', { class:'rd-read' }, ''), el('span', { class:'rd-left' }, ''));
  ctr.append(words);

  const scrub = el('div', { class:'rd-scrub' });
  const range = el('input', { type:'range', min:'0', max:String(R.total - 1), value:String(R.idx), class:'rd-range' });
  range.addEventListener('input', () => { seek(+range.value); });
  scrub.append(el('span', { class:'rd-pos' }, ''), range, el('span', { class:'rd-tot' }, ''));
  ctr.append(scrub);

  const transport = el('div', { class:'transport' });
  transport.append(el('button', { class:'icon-btn', html: ICON.back10, onclick:() => skip(-Math.max(8, Math.round(state.settings.wpm / 30))) }));
  transport.append(el('button', { class:'play rd-play', html: ICON.play, onclick:() => R.playing ? pause() : play() }));
  transport.append(el('button', { class:'icon-btn', html: ICON.fwd, onclick:() => skip(Math.max(8, Math.round(state.settings.wpm / 30))) }));
  ctr.append(transport);

  const wpm = el('div', { class:'wpm-control' });
  const wr = el('input', { type:'range', min:'100', max:'1000', step:'10', value:String(state.settings.wpm), class:'grad-track' });
  const wv = el('div', { class:'val rd-wpmval' });
  wr.addEventListener('input', () => { state.settings.wpm = +wr.value; updateWpmLabel(); save(); });
  wpm.append(el('span', { class:'muted', style:'font-size:12px' }, 'WPM'), wr, wv);
  ctr.append(wpm);
  r.append(ctr);

  updateWpmLabel();
  renderFlash(R.idx);
  updatePlayBtn();
  setTimeout(play, 350);
}

const wEl = () => $('.rd-word', D.reader);

function renderFlash(i) {
  const f = R.flashes[i]; if (!f) return;
  const w = wEl(); clear(w);
  if (state.settings.orp) {
    // Pivot-align the whole flash (1+ words) so the red letter sits on the
    // centre tick for every chunk size.
    const p = orpParts(f.text);
    w.append(el('span', { class:'pre' }, p.pre), el('span', { class:'pivot' }, p.pivot), el('span', { class:'post' }, p.post));
  } else {
    w.textContent = f.text;
  }
  // context window (wrapping text in a fixed low box; bottom-aligned)
  const ctxBox = $('.rd-context', D.reader);
  const ctx = $('.ctx-text', D.reader);
  if (state.settings.showContext) {
    ctxBox.style.display = '';
    clear(ctx);
    const lo = Math.max(0, i - 7), hi = Math.min(R.total, i + 8);
    for (let k = lo; k < hi; k++) {
      ctx.append(el('span', k === i ? { class:'cur' } : {}, R.flashes[k].text + ' '));
    }
  } else ctxBox.style.display = 'none';

  // chapter label — shows current chapter + % through THAT chapter
  const chEl = $('.rd-chap', D.reader);
  if (chEl) {
    if (R.ranges.length > 1) {
      const ci = chapterIndexAt(i), chap = R.ranges[ci];
      chEl.innerHTML = `<i class="rd-toc-dot"></i>${ci + 1}/${R.ranges.length} · ${chap.title || 'Chapter ' + (ci + 1)} · ${chapterPct(i)}%`;
    } else chEl.textContent = pctText(i);
  }

  // counters + scrub
  const range = $('.rd-range', D.reader); if (range && +range.value !== i) range.value = i;
  const wordsRead = Math.round(R.doc.words * (i / R.total));
  const wordsLeft = Math.max(0, R.doc.words - wordsRead);
  $('.rd-read', D.reader).textContent = `${fmt(wordsRead)} read`;
  $('.rd-left', D.reader).innerHTML = `<b>${fmt(wordsLeft)}</b> left · ${fmtTime(wordsLeft / state.settings.wpm * 60)}`;
  $('.rd-pos', D.reader).textContent = pctText(i);
  $('.rd-tot', D.reader).textContent = fmtTime((R.total - i) > 0 ? (R.doc.words - wordsRead) / state.settings.wpm * 60 : 0);
}
const pctText = (i) => `${Math.round((i / R.total) * 100)}%`;

/* ---- chapter navigation ---- */
function chapterIndexAt(i) {
  const idx = R.ranges.findIndex(c => i >= c.start && i < c.end);
  return idx < 0 ? Math.max(0, R.ranges.length - 1) : idx;
}
function chapterPct(i) {
  const c = R.ranges[chapterIndexAt(i)];
  const span = Math.max(1, c.end - c.start);
  return Math.min(100, Math.max(0, Math.round(((i - c.start) / span) * 100)));
}
function gotoChapter(ci) {
  const c = R.ranges[Math.max(0, Math.min(R.ranges.length - 1, ci))];
  if (c) seek(c.start);
}
function stepChapter(d) { gotoChapter(chapterIndexAt(R.idx) + d); }

function openTOC() {
  if (R?.playing) pause();
  haptic(6);
  const cur = chapterIndexAt(R.idx);
  const list = el('div', { class:'toc-list' });
  R.ranges.forEach((c, ci) => {
    // % read of each chapter, derived from saved position
    const span = Math.max(1, c.end - c.start);
    const pct = R.idx >= c.end ? 100 : R.idx <= c.start ? 0 : Math.round(((R.idx - c.start) / span) * 100);
    const done = pct >= 99;
    const row = el('button', { class:'toc-row' + (ci === cur ? ' cur' : '') });
    row.append(el('span', { class:'toc-n' + (done ? ' done' : '') }, done ? '✓' : String(ci + 1)));
    const mid = el('div', { class:'grow' });
    mid.append(el('div', { class:'toc-t' }, c.title || `Chapter ${ci + 1}`));
    if (ci === cur && pct > 0 && pct < 100) { const pb = el('div', { class:'toc-bar' }); pb.append(el('i', { style:`width:${pct}%` })); mid.append(pb); }
    row.append(mid, el('span', { class:'toc-pct' }, `${pct}%`));
    row.addEventListener('click', () => { closeSheet(); gotoChapter(ci); });
    list.append(row);
  });

  const nav = el('div', { class:'toc-nav' });
  nav.append(el('button', { class:'btn ghost' + (cur <= 0 ? ' is-off' : ''), onclick:() => { closeSheet(); stepChapter(-1); } }, '‹ Prev'));
  nav.append(el('button', { class:'btn', onclick:() => { closeSheet(); play(); } }, 'Resume'));
  nav.append(el('button', { class:'btn ghost' + (cur >= R.ranges.length - 1 ? ' is-off' : ''), onclick:() => { closeSheet(); stepChapter(1); } }, 'Next ›'));

  const head = el('div', { class:'row', style:'justify-content:space-between;align-items:center;margin-bottom:6px' });
  head.append(el('div', { style:'font-weight:600' }, `${R.ranges.length} chapters`));
  head.append(el('button', { class:'chip', onclick:() => { closeSheet(); switchBook(); } }, '⇄ Switch book'));

  const body = el('div', {});
  body.append(head, list, nav);
  sheet({ title:'Contents', body });
}

function switchBook() {
  // save where we are, leave the reader, land on the library's Continue-reading row
  if (R) { pause(); saveProgress(); }
  R = null;
  D.reader.classList.add('hidden');
  showView('home');
}

function updateWpmLabel() { const v = $('.rd-wpmval', D.reader); if (v) v.innerHTML = `${state.settings.wpm}<small> wpm</small>`; }
function updatePlayBtn() { const b = $('.rd-play', D.reader); if (b) b.innerHTML = R.playing ? ICON.pause : ICON.play; }

function play() {
  if (!R || R.playing) return;
  if (R.idx >= R.total - 1) { R.idx = 0; R.done = false; }
  R.playing = true; R.sessionStart = performance.now(); R.sessionWords = 0;
  updatePlayBtn(); acquireWake();
  tick();
}
function tick() {
  if (!R || !R.playing) return;
  if (R.idx >= R.total) { finishDoc(); return; }
  renderFlash(R.idx);
  const f = R.flashes[R.idx];
  if (f.paraEnd) haptic(12);
  R.sessionWords += f.n;
  const delay = flashDelay(f, state.settings.wpm);
  R.idx++;
  R.timer = setTimeout(tick, delay);
}
function pause() {
  if (!R || !R.playing) return;
  R.playing = false; clearTimeout(R.timer); updatePlayBtn(); releaseWake();
  accrue(); saveProgress();
}
function accrue() {
  if (!R || !R.sessionStart) return;
  const secs = (performance.now() - R.sessionStart) / 1000;
  if (R.sessionWords > 0 && secs > 0.5) {
    // Record ACTUAL measured throughput (words / minutes) — not the slider value,
    // so best-WPM and achievements reflect real reading, including auto-pauses.
    const actualWpm = Math.round(R.sessionWords / (secs / 60));
    addReading(R.sessionWords, secs, actualWpm);
  }
  R.sessionWords = 0; R.sessionStart = performance.now();
}
function seek(i) {
  const wasPlaying = R.playing;
  if (wasPlaying) pause();
  R.idx = Math.max(0, Math.min(R.total - 1, i));
  R.done = R.idx >= R.total - 1;
  renderFlash(R.idx);
}
function skip(n) { seek(R.idx + n); }
function finishDoc() {
  R.playing = false; R.done = true; clearTimeout(R.timer); releaseWake();
  R.idx = R.total - 1; renderFlash(R.idx);
  accrue();
  writeProgress(true);
  state.game.finished = (state.game.finished || 0) + 1; checkAchievements(); save();
  updatePlayBtn();
  // In a vault, advance to the next unread note automatically; else celebrate.
  if (R.vaultCtx && R.vaultCtx.i < R.vaultCtx.vaultDoc.notes.length - 1) {
    achievementToast('✅', 'Note done — next up');
    setTimeout(() => gotoNote(1), 900);
  } else {
    achievementToast('🏁', R.vaultCtx ? 'Vault complete!' : 'Finished!');
  }
}
// Persist progress to the right place: a standalone doc, or a note inside a vault.
function writeProgress(finalize) {
  if (!R) return;
  const prog = finalize ? 1 : R.idx / R.total;
  const idx = finalize ? R.total - 1 : R.idx;
  if (R.vaultCtx) {
    const { vaultDoc, i } = R.vaultCtx;
    vaultDoc.notes[i].idx = idx; vaultDoc.notes[i].progress = prog; vaultDoc.lastOpened = Date.now();
    putDoc(vaultDoc);
  } else {
    R.doc.idx = idx; R.doc.progress = prog; R.doc.lastOpened = Date.now();
    putDoc(R.doc);
  }
}
function saveProgress() { writeProgress(R && R.done); }
function closeReader() {
  const vaultCtx = R?.vaultCtx;
  if (R) { pause(); saveProgress(); }
  R = null;
  D.reader.classList.add('hidden');
  if (vaultCtx) openVaultBrowser(vaultCtx.vaultDoc.id); // back to vault, progress refreshed
  else showView('home');
}

/* screen wake lock so the display doesn't dim mid-read */
async function acquireWake() {
  try { if ('wakeLock' in navigator) R.wake = await navigator.wakeLock.request('screen'); } catch {}
}
function releaseWake() { try { R?.wake?.release?.(); R.wake = null; } catch {} }
document.addEventListener('visibilitychange', () => {
  if (document.hidden && R?.playing) pause();
  else if (!document.hidden && R?.wake === null && R?.playing) acquireWake();
});

function readerKeys(e) {
  if (D.reader.classList.contains('hidden') || !R) return;
  if (e.key === ' ') { e.preventDefault(); R.playing ? pause() : play(); }
  else if (e.key === 'ArrowLeft') skip(-8);
  else if (e.key === 'ArrowRight') skip(8);
  else if (e.key === 'Escape') closeReader();
  else if (e.key === 'ArrowUp') { state.settings.wpm = Math.min(1000, state.settings.wpm + 25); syncReaderWpm(); }
  else if (e.key === 'ArrowDown') { state.settings.wpm = Math.max(100, state.settings.wpm - 25); syncReaderWpm(); }
}
function syncReaderWpm() { const r = $('.rd-range', D.reader); if (r) r.value = state.settings.wpm; updateWpmLabel(); save(); }

/* quick in-reader settings sheet */
function readerSettings() {
  if (R?.playing) pause();
  const body = el('div', { class:'stack' });
  body.append(toggleRow('Highlight pivot letter (ORP)', 'orp', () => renderFlash(R.idx)));
  body.append(toggleRow('Show context', 'showContext', () => renderFlash(R.idx)));
  body.append(toggleRow('Tap screen to pause', 'tapToPause'));
  body.append(stepperRow('Words per flash', 'chunk', 1, 4, () => rebuildFlashes()));
  body.append(segRow('Reading size', 'scale', SCALES, () => { applyTheme(); }));
  body.append(fontRow());
  sheet({ title:'Reading settings', body });
}
async function rebuildFlashes() {
  const cur = R.idx / R.total;
  const big = (R.doc.words || 0) > BIG_DOC;
  if (big) showReaderBuilding(R.doc.title);
  const built = big
    ? await buildFlashesAsync(R.doc.chapters, state.settings.chunk)
    : buildFlashes(R.doc.chapters, state.settings.chunk);
  R.flashes = built.flashes; R.ranges = built.chapterRanges; R.total = built.flashes.length;
  R.idx = Math.min(R.total - 1, Math.round(cur * R.total));
  const range = $('.rd-range', D.reader); if (range) { range.max = R.total - 1; range.value = R.idx; }
  renderReader();
}

/* ============================================================
   STATS  (all-time history · timeframe KPIs · shareable card)
   ============================================================ */
let statsRange = 'week';
const RANGES = { week:'This week', month:'This month', quarter:'This quarter', year:'This year', all:'All time' };
const DAY = 86400000;
const dKey = (d) => dayKey(d);
const dayWords = (d) => state.game.history[dKey(d)] || 0;
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

function rangeStartDate(range) {
  const now = startOfToday();
  if (range === 'week') return new Date(now - 6 * DAY);
  if (range === 'month') return new Date(now - 29 * DAY);
  if (range === 'quarter') return new Date(now - 89 * DAY);
  if (range === 'year') return new Date(now - 364 * DAY);
  const keys = Object.keys(state.game.history).sort();
  return keys.length ? new Date(keys[0] + 'T00:00') : now;
}

// KPIs for the selected window, read from the all-time daily history map.
function rangeStats(range) {
  const start = rangeStartDate(range), today = startOfToday();
  let total = 0, best = 0, active = 0;
  for (const [k, w] of Object.entries(state.game.history)) {
    const d = new Date(k + 'T00:00');
    if (d >= start && d <= today) { total += w; if (w > 0) active++; if (w > best) best = w; }
  }
  const spanDays = Math.max(1, Math.round((today - start) / DAY) + 1);
  return { total, best, active, spanDays, dailyAvg: Math.round(total / spanDays) };
}

// Chart buckets: ≤12 clean bars whatever the timeframe.
function chartBuckets(range) {
  const now = startOfToday();
  const monthlySum = (y, m) => Object.entries(state.game.history)
    .filter(([k]) => { const [Y, M] = k.split('-').map(Number); return Y === y && M - 1 === m; })
    .reduce((s, [, w]) => s + w, 0);
  const out = [];
  if (range === 'week') {
    for (let i = 6; i >= 0; i--) { const d = new Date(now - i * DAY); out.push({ label:'SMTWTFS'[d.getDay()], value: dayWords(d) }); }
  } else if (range === 'month') {
    for (let i = 3; i >= 0; i--) {
      let s = 0; for (let j = 0; j < 7; j++) s += dayWords(new Date(now - (i * 7 + j) * DAY));
      out.push({ label: i === 0 ? 'now' : `-${i}w`, value: s });
    }
  } else if (range === 'quarter' || range === 'year') {
    const n = range === 'quarter' ? 3 : 12;
    for (let i = n - 1; i >= 0; i--) { const m = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push({ label:'JFMAMJJASOND'[m.getMonth()], value: monthlySum(m.getFullYear(), m.getMonth()) }); }
  } else {
    const years = {};
    for (const [k, w] of Object.entries(state.game.history)) { const y = k.slice(0, 4); years[y] = (years[y] || 0) + w; }
    const keys = Object.keys(years).sort();
    (keys.length ? keys : [String(now.getFullYear())]).forEach(y => out.push({ label:"'" + y.slice(2), value: years[y] || 0 }));
  }
  return out;
}

function renderStats() {
  const v = D.stats; clear(v);
  const g = state.game;

  const head = el('div', { class:'home-head' });
  head.append(el('div', { class:'home-name' }, 'Your progress'));
  head.append(el('button', { class:'icon-btn', html: ICON.share, onclick: shareStats }));
  v.append(head);

  // timeframe selector
  const seg = el('div', { class:'range-seg' });
  for (const k of Object.keys(RANGES)) {
    const b = el('button', { class:'chip' + (statsRange === k ? ' on' : '') }, k[0].toUpperCase() + k.slice(1));
    b.addEventListener('click', () => { statsRange = k; haptic(6); renderStats(); });
    seg.append(b);
  }
  v.append(seg);

  const rs = rangeStats(statsRange);
  const minutesSaved = Math.max(0, (g.totalWords / baselineWPM) - (g.totalSeconds / 60));
  const grid = el('div', { class:'stat-grid' });
  const stat = (n, k, grad) => el('div', { class:'stat' }, el('div', { class:'n' + (grad ? ' grad' : '') }, n), el('div', { class:'k' }, k));
  grid.append(stat(fmt(rs.total), 'words read', true));
  grid.append(stat(fmt(rs.dailyAvg), 'daily average', true));
  grid.append(stat(fmt(rs.best), 'best day'));
  grid.append(stat(`${rs.active}`, statsRange === 'all' ? 'active days' : `of ${rs.spanDays} days`));
  grid.append(stat(`${g.bestWpm || 0}`, 'best WPM (all-time)'));
  grid.append(stat(`${g.streak || 0} 🔥`, 'day streak'));
  v.append(grid);

  // adaptive chart
  v.append(el('div', { class:'sec-title' }, el('h3', {}, RANGES[statsRange]),
    el('a', {}, `${fmtTime(minutesSaved * 60)} saved`)));
  const buckets = chartBuckets(statsRange);
  const max = Math.max(100, ...buckets.map(b => b.value));
  const chart = el('div', { class:'card chart' });
  buckets.forEach(b => {
    const bar = el('div', { class:'bar', style:`height:${Math.max(4, (b.value / max) * 100)}%` });
    bar.append(el('span', {}, b.label));
    chart.append(bar);
  });
  v.append(chart);

  // achievements
  v.append(el('div', { class:'sec-title' }, el('h3', {}, 'Achievements'),
    el('a', {}, `${g.achievements.length}/${ACHIEVEMENTS.length}`)));
  const recs = el('div', { class:'card records', style:'padding:4px 16px' });
  for (const a of ACHIEVEMENTS) {
    const got = g.achievements.includes(a.id);
    recs.append(el('div', { class:'rec' + (got ? '' : ' locked') },
      el('span', { class:'e' }, a.e), el('span', {}, a.t),
      el('span', { class:'v' }, got ? '✓' : '🔒')));
  }
  v.append(recs);
}

/* Build a branded 1080² PNG of the current stats window and share/download it. */
async function shareStats() {
  haptic(8);
  const g = state.game, rs = rangeStats(statsRange);
  const a = ACCENTS[state.settings.accent] || ACCENTS.violet;
  const W = 1080, c = document.createElement('canvas'); c.width = W; c.height = W;
  const x = c.getContext('2d');
  x.fillStyle = '#0b0814'; x.fillRect(0, 0, W, W);
  const rg = x.createRadialGradient(W / 2, 120, 60, W / 2, 120, W); rg.addColorStop(0, '#1b1336'); rg.addColorStop(1, '#0b0814');
  x.fillStyle = rg; x.fillRect(0, 0, W, W);
  const grad = x.createLinearGradient(0, 0, W, W); grad.addColorStop(0, a.a1); grad.addColorStop(1, a.a2);
  x.textAlign = 'center';
  x.fillStyle = '#fff'; x.font = '700 44px Lexend, sans-serif'; x.globalAlpha = .9;
  x.fillText('READMAXX', W / 2, 150); x.globalAlpha = 1;
  x.fillStyle = a.a1; x.font = '600 34px Lexend, sans-serif'; x.fillText(RANGES[statsRange].toUpperCase(), W / 2, 230);
  x.fillStyle = grad; x.font = '800 220px Lexend, sans-serif'; x.fillText(fmt(rs.total), W / 2, 470);
  x.fillStyle = '#a09bb8'; x.font = '500 40px Lexend, sans-serif'; x.fillText('words read', W / 2, 540);
  const cells = [['Daily avg', fmt(rs.dailyAvg)], ['Best day', fmt(rs.best)], ['Best WPM', `${g.bestWpm || 0}`],
    ['Streak', `${g.streak || 0} 🔥`], ['Active days', `${rs.active}`], ['All-time', fmt(g.totalWords)]];
  cells.forEach(([k, val], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const cx = 180 + col * 360, cy = 700 + row * 170;
    x.fillStyle = '#fff'; x.font = '800 66px Lexend, sans-serif'; x.fillText(val, cx, cy);
    x.fillStyle = '#6b6680'; x.font = '500 30px Lexend, sans-serif'; x.fillText(k, cx, cy + 46);
  });
  x.fillStyle = '#6b6680'; x.font = '500 30px Lexend, sans-serif'; x.fillText('readmaxx-free.vercel.app', W / 2, W - 50);

  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const file = new File([blob], 'readmaxx-stats.png', { type:'image/png' });
  const text = `My ReadMaxx stats (${RANGES[statsRange]}): ${fmt(rs.total)} words · ${fmt(rs.dailyAvg)}/day · ${g.bestWpm || 0} best WPM · ${g.streak || 0}🔥`;
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text, title:'ReadMaxx' }); return; }
    if (navigator.share) { await navigator.share({ text, title:'ReadMaxx' }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'readmaxx-stats.png'; link.click(); URL.revokeObjectURL(url);
  try { await navigator.clipboard.writeText(text); toast('Image saved · summary copied'); } catch { toast('Stats image saved'); }
}

/* ============================================================
   PROFILE / SETTINGS
   ============================================================ */
function renderProfile() {
  const v = D.profile; clear(v);
  const p = state.profile, g = state.game, s = state.settings;

  const head = el('div', { class:'prof-head' });
  const av = el('button', { class:'avatar', onclick: pickAvatar }, p.avatar || '🚀');
  head.append(av);
  head.append(el('div', { class:'home-name' }, p.name || 'Reader'));
  const xpInto = g.xp - xpForLevel(g.level), xpNeed = xpForLevel(g.level + 1) - xpForLevel(g.level);
  const lvlWrap = el('div', { class:'lvl-bar' });
  lvlWrap.append(el('div', { class:'row', style:'justify-content:space-between;font-size:13px;font-weight:700' },
    el('span', {}, `Level ${g.level}`), el('span', { class:'muted' }, `${Math.max(0,xpInto)}/${xpNeed} XP`)));
  const mb = el('div', { class:'mini-bar mt8' }); mb.append(el('i', { style:`width:${Math.min(100, (xpInto / xpNeed) * 100)}%` }));
  lvlWrap.append(mb);
  head.append(lvlWrap);
  v.append(head);

  // Reading group
  v.append(groupTitle('Reading'));
  const g1 = el('div', { class:'set-group' });
  g1.append(navRow(ICON.fwd, 'Default speed', `${s.wpm} WPM`, () => speedSheet()));
  g1.append(stepperRow('Words per flash', 'chunk', 1, 4, null, true));
  g1.append(toggleRow('Highlight pivot (ORP)', 'orp', null, true));
  g1.append(toggleRow('Show context line', 'showContext', null, true));
  g1.append(toggleRow('Tap screen to pause', 'tapToPause', null, true));
  v.append(g1);

  // Appearance
  v.append(groupTitle('Appearance'));
  const g2 = el('div', { class:'set-group' });
  g2.append(accentRow());
  g2.append(fontRow(true));
  g2.append(segRow('Reading size', 'scale', SCALES, () => applyTheme(), true));
  v.append(g2);

  // Daily goal
  v.append(groupTitle('Goals'));
  const g3 = el('div', { class:'set-group' });
  g3.append(navRow('🎯', 'Daily word goal', fmt(p.dailyGoalWords), goalSheet));
  v.append(g3);

  // Feedback / haptics
  v.append(groupTitle('Feedback'));
  const g4 = el('div', { class:'set-group' });
  if (HAS_VIBRATE) g4.append(toggleRow('Haptic feedback', 'haptics', null, true));
  else g4.append(el('div', { class:'set' }, el('div', { class:'st' }, 'Haptic feedback'),
    el('div', { class:'sv' }, 'Not supported on this device')));
  v.append(g4);

  // Sharing — set up the Safari "Read in ReadMaxx" shortcut any time
  v.append(groupTitle('Sharing'));
  const gShare = el('div', { class:'set-group' });
  gShare.append(navRow(ICON.share, 'Add Safari shortcut', 'one-tap import', openShareGuide));
  v.append(gShare);

  // Data
  v.append(groupTitle('Your data'));
  const g5 = el('div', { class:'set-group' });
  const storageRow = el('div', { class:'set' });
  storageRow.append(el('div', { class:'si', html: ICON.refresh }), el('div', { class:'st' }, 'Storage used'),
    el('div', { class:'sv rm-storage' }, '…'));
  g5.append(storageRow);
  updateStorageRow();
  g5.append(navRow(ICON.file, 'Export backup', '.json', exportBackup));
  g5.append(navRow(ICON.paste, 'Import backup', '', importBackup));
  g5.append(navRow(ICON.trash, 'Reset onboarding', '', () => { state.profile.onboarded = false; save(); startOnboarding(); }));
  v.append(g5);

  // App / updates — applies a new version in place, keeping all your data.
  v.append(groupTitle('App'));
  const g6 = el('div', { class:'set-group' });
  const updateRow = el('button', { class:'set' + (updateReady ? ' set-hot' : ''), style:'width:100%;text-align:left',
    onclick: () => updateApp() });
  updateRow.append(el('div', { class:'si', html: ICON.refresh }));
  updateRow.append(el('div', { class:'st' }, updateReady ? 'Update available — tap to update' : 'Update app'));
  updateRow.append(el('div', { class:'sv' }, updateReady ? 'new' : 'keeps your data'));
  updateRow.append(el('div', { style:'color:var(--faint);width:18px;height:18px', html: ICON.next }));
  g6.append(updateRow);
  g6.append(navRow(ICON.share, 'Check for updates', `v${APP_VERSION}`, checkForUpdate));
  v.append(g6);

  v.append(el('div', { class:'center faint', style:'padding:18px 0 6px;font-size:12px' },
    `ReadMaxx Free · v${APP_VERSION} · private & offline`));
  v.append(el('div', { class:'center faint', style:'font-size:12px;padding-bottom:10px' },
    'Add to Home Screen: Share → “Add to Home Screen”.'));
}

/* ---- settings row builders ---- */
function groupTitle(t) { return el('div', { class:'sec-title' }, el('h3', {}, t)); }

function toggleRow(label, key, after, inGroup) {
  const row = el('div', { class:'set' });
  if (inGroup) row.append(el('div', { class:'st' }, label));
  else row.append(el('div', { class:'st', style:'flex:1' }, label));
  const tg = el('div', { class:'toggle' + (state.settings[key] ? ' on' : '') });
  tg.addEventListener('click', () => { state.settings[key] = !state.settings[key]; tg.classList.toggle('on'); save(); haptic(6); after && after(); });
  row.append(tg);
  return row;
}
function stepperRow(label, key, min, max, after, inGroup) {
  const row = el('div', { class:'set' });
  row.append(el('div', { class:'st' }, label));
  const wrap = el('div', { class:'row gap10' });
  const val = el('div', { class:'sv', style:'min-width:18px;text-align:center' }, String(state.settings[key]));
  const mk = (sym, dir) => el('button', { class:'icon-btn', style:'width:34px;height:34px' , onclick:() => {
    state.settings[key] = Math.max(min, Math.min(max, state.settings[key] + dir));
    val.textContent = state.settings[key]; save(); haptic(6); after && after();
  } }, sym);
  wrap.append(mk('–', -1), val, mk('+', 1));
  row.append(wrap);
  return row;
}
function segRow(label, key, map, after, inGroup) {
  const row = el('div', { class:'set', style:'flex-wrap:wrap' });
  row.append(el('div', { class:'st' }, label));
  const seg = el('div', { class:'row gap6' });
  for (const k of Object.keys(map)) {
    const b = el('button', { class:'chip' + (state.settings[key] === k ? ' on' : ''), style: state.settings[key] === k ? 'color:var(--text);border-color:var(--accent)' : '' }, k.toUpperCase());
    b.addEventListener('click', () => { state.settings[key] = k; save(); haptic(6); after && after(); [...seg.children].forEach(c => { c.style.cssText=''; c.classList.remove('on'); }); b.style.cssText='color:var(--text);border-color:var(--accent)'; });
    seg.append(b);
  }
  row.append(seg);
  return row;
}
function navRow(icon, label, value, onclick) {
  const row = el('button', { class:'set', style:'width:100%;text-align:left', onclick });
  row.append(el('div', { class:'si', html: icon.length <= 3 ? null : icon }, icon.length <= 3 ? icon : null));
  row.append(el('div', { class:'st' }, label));
  row.append(el('div', { class:'sv' }, value || ''));
  row.append(el('div', { style:'color:var(--faint);width:18px;height:18px', html: ICON.next }));
  return row;
}
function accentRow() {
  const row = el('div', { class:'set' });
  row.append(el('div', { class:'st' }, 'Accent'));
  const sw = el('div', { class:'swatches' });
  for (const [k, a] of Object.entries(ACCENTS)) {
    const b = el('button', { class:'swatch' + (state.settings.accent === k ? ' on' : ''),
      style:`background:linear-gradient(120deg,${a.a1},${a.a2})` });
    b.addEventListener('click', () => { state.settings.accent = k; applyTheme(); save(); haptic(6); [...sw.children].forEach(c => c.classList.remove('on')); b.classList.add('on'); });
    sw.append(b);
  }
  row.append(sw);
  return row;
}
function fontRow(inGroup) {
  const row = el('button', { class:'set', style:'width:100%;text-align:left', onclick: fontSheet });
  row.append(el('div', { class:'st' }, 'Reading font'));
  row.append(el('div', { class:'sv', style:`font-family:${FONTS[state.settings.font].css}` }, FONTS[state.settings.font].name));
  row.append(el('div', { style:'color:var(--faint);width:18px;height:18px', html: ICON.next }));
  return row;
}
function fontSheet() {
  const body = el('div', { class:'stack' });
  for (const [k, f] of Object.entries(FONTS)) {
    const b = el('button', { class:'opt' + (state.settings.font === k ? ' sel' : '') },
      el('div', { style:`font-family:${f.css};font-size:20px;font-weight:700;width:40px;text-align:center` }, 'Ag'),
      el('div', {}, el('div', { class:'opt-t', style:`font-family:${f.css}` }, f.name),
        el('div', { class:'opt-d', style:`font-family:${f.css}` }, 'The quick brown fox')),
      el('span', { class:'tick', html: ICON.check }));
    b.addEventListener('click', () => { state.settings.font = k; applyTheme(); save(); haptic(6); closeSheet(); if (D.profile && !D.profile.classList.contains('hidden')) renderProfile(); if (R) renderFlash(R.idx); });
    body.append(b);
  }
  sheet({ title:'Reading font', sub:'Used for the flashing word.', body });
}
function speedSheet() {
  const body = el('div', { class:'stack' });
  const val = el('div', { class:'plan-num grad-text center', style:'font-size:44px' }, `${state.settings.wpm}`);
  body.append(val, el('div', { class:'ob-sub center', style:'margin:0 auto 8px' }, 'words per minute'));
  const wr = el('input', { type:'range', min:'100', max:'1000', step:'10', value:String(state.settings.wpm), class:'grad-track' });
  wr.addEventListener('input', () => { state.settings.wpm = +wr.value; val.textContent = state.settings.wpm; save(); });
  body.append(wr);
  body.append(el('button', { class:'btn mt16', onclick:() => { closeSheet(); renderProfile(); } }, 'Done'));
  sheet({ title:'Default reading speed', body });
}
function goalSheet() {
  const body = el('div', { class:'stack' });
  const opts = [500, 1000, 2000, 4000, 8000];
  for (const o of opts) {
    const b = el('button', { class:'opt' + (state.profile.dailyGoalWords === o ? ' sel' : '') },
      el('div', { class:'opt-t' }, `${fmt(o)} words`),
      el('div', { class:'opt-d' }, `~${Math.round(o / 250)} min at 250 WPM`),
      el('span', { class:'tick', html: ICON.check }));
    b.addEventListener('click', () => { state.profile.dailyGoalWords = o; save(); haptic(6); closeSheet(); renderProfile(); });
    body.append(b);
  }
  sheet({ title:'Daily word goal', body });
}
function pickAvatar() {
  const body = el('div', { class:'src-row', style:'grid-template-columns:repeat(5,1fr)' });
  for (const e of ['🚀','📚','🧠','⚡','🦉','🐢','🔥','💎','🎯','✨','🦅','🌙']) {
    body.append(el('button', { class:'src', style:'font-size:26px', onclick:() => { state.profile.avatar = e; save(); haptic(6); closeSheet(); renderProfile(); } }, e));
  }
  sheet({ title:'Pick an avatar', body });
}

async function updateStorageRow() {
  let est;
  try { est = await navigator.storage.estimate(); } catch {}
  const node = $('.rm-storage', D.profile); if (!node) return; // queried after await — row is now in the DOM
  if (!est) { node.textContent = 'on device'; return; }
  const used = est.usage || 0, quota = est.quota || 0;
  const fmtB = (b) => b >= 1048576 ? (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB' : Math.round(b / 1024) + ' KB';
  const pctUsed = quota ? Math.round((used / quota) * 100) : 0;
  node.textContent = `${fmtB(used)}${quota ? ` of ${fmtB(quota)} · ${pctUsed}%` : ''}`;
  if (pctUsed >= 80) { node.style.color = 'var(--warn)'; toast('Storage is getting full — export a backup', { err:true }); }
}

async function exportBackup() {
  const json = await exportData();
  const blob = new Blob([json], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `readmaxx-backup-${dayKey()}.json`;
  a.click(); URL.revokeObjectURL(a.href);
  toast('Backup downloaded');
}
function importBackup() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = async () => {
    try { const n = await importData(await inp.files[0].text()); applyTheme(); toast(`Restored ${n} item${n!==1?'s':''}`); renderProfile(); }
    catch { toast('Invalid backup file', { err:true }); }
  };
  inp.click();
}

/* ============================================================ */
boot();
