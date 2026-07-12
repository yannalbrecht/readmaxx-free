/* ============================================================
   app.js — ReadMaxx Free controller
   onboarding · library · RSVP reader · stats · settings · import
   Imports the engine (rsvp), state (store) and DOM helpers (ui).
   ============================================================ */
import {
  state, save, applyTheme, ACCENTS, THEMES, FONTS, SCALES, HAS_VIBRATE, dayKey,
  putDoc, getDoc, allDocs, deleteDoc, uid, exportData, importData,
} from './store.js';
import {
  buildFlashes, buildFlashesAsync, flashDelay, orpParts, mdToBlocks, blocksToOutline, countWords, analyzeTopics,
} from './rsvp.js';
import {
  el, clear, buzz, toast, achievementToast, sheet, closeSheet, ICON, fmt, fmtTime,
} from './ui.js';

const $ = (s, r = document) => r.querySelector(s);
const D = {
  splash: $('#splash'), onboarding: $('#onboarding'), app: $('#app'),
  home: $('#view-home'), discover: $('#view-discover'), stats: $('#view-stats'), profile: $('#view-profile'),
  tabbar: $('#tabbar'), reader: $('#reader'), vaultScreen: $('#vault-screen'), textview: $('#textview'),
  fileInput: $('#file-input'), mdInput: $('#md-multi-input'), dirInput: $('#dir-input'),
};

const haptic = (ms) => { if (state.settings.haptics) buzz(ms); };
const baselineWPM = 200; // "average reader" used to compute time saved
const APP_VERSION = '1.15.2'; // keep in sync with BUILD in sw.js
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

// Every test reads a field the app actually writes (see addReading/finishDoc/topics),
// so no achievement is permanently unreachable. `g` = state.game.
const ACHIEVEMENTS = [
  // Words read (all-time)
  { id:'first',  e:'📖', g:'Words', t:'First Words',    test:g => g.totalWords > 0 },
  { id:'w1k',    e:'✍️', g:'Words', t:'1,000 Words',    test:g => g.totalWords >= 1000 },
  { id:'w10k',   e:'🔥', g:'Words', t:'10,000 Words',   test:g => g.totalWords >= 10000 },
  { id:'w50k',   e:'📚', g:'Words', t:'50,000 Words',   test:g => g.totalWords >= 50000 },
  { id:'w100k',  e:'💎', g:'Words', t:'100,000 Words',  test:g => g.totalWords >= 100000 },
  { id:'w500k',  e:'🏆', g:'Words', t:'500,000 Words',  test:g => g.totalWords >= 500000 },
  // Speed (best measured WPM)
  { id:'w300',   e:'🐇', g:'Speed', t:'Hit 300 WPM',    test:g => g.bestWpm >= 300 },
  { id:'w400',   e:'🚀', g:'Speed', t:'Hit 400 WPM',    test:g => g.bestWpm >= 400 },
  { id:'w500',   e:'💨', g:'Speed', t:'Hit 500 WPM',    test:g => g.bestWpm >= 500 },
  { id:'w600',   e:'⚡', g:'Speed', t:'Hit 600 WPM',    test:g => g.bestWpm >= 600 },
  { id:'w800',   e:'🌠', g:'Speed', t:'Hit 800 WPM',    test:g => g.bestWpm >= 800 },
  // Completion (texts finished)
  { id:'fin1',   e:'🏁', g:'Completion', t:'Finished a Text', test:g => (g.finished||0) >= 1 },
  { id:'fin5',   e:'📗', g:'Completion', t:'5 Texts Finished',  test:g => (g.finished||0) >= 5 },
  { id:'fin10',  e:'📘', g:'Completion', t:'10 Texts Finished', test:g => (g.finished||0) >= 10 },
  { id:'fin25',  e:'📙', g:'Completion', t:'25 Texts Finished', test:g => (g.finished||0) >= 25 },
  { id:'fin50',  e:'🎓', g:'Completion', t:'50 Texts Finished', test:g => (g.finished||0) >= 50 },
  // Streaks (best ever)
  { id:'streak3',  e:'📅', g:'Streaks', t:'3-Day Streak',   test:g => (g.longestStreak||g.streak||0) >= 3 },
  { id:'streak7',  e:'🗓️', g:'Streaks', t:'7-Day Streak',   test:g => (g.longestStreak||g.streak||0) >= 7 },
  { id:'streak14', e:'📆', g:'Streaks', t:'14-Day Streak',  test:g => (g.longestStreak||g.streak||0) >= 14 },
  { id:'streak30', e:'🔥', g:'Streaks', t:'30-Day Streak',  test:g => (g.longestStreak||g.streak||0) >= 30 },
  { id:'streak100',e:'👑', g:'Streaks', t:'100-Day Streak', test:g => (g.longestStreak||g.streak||0) >= 100 },
  // Habit (sessions · daily goal · time of day)
  { id:'sess10',  e:'🎯', g:'Habit', t:'10 Sessions',    test:g => (g.sessions||0) >= 10 },
  { id:'sess50',  e:'🧠', g:'Habit', t:'50 Sessions',    test:g => (g.sessions||0) >= 50 },
  { id:'goal1',   e:'✅', g:'Habit', t:'First Daily Goal',test:g => (g.goalHits||0) >= 1 },
  { id:'goal10',  e:'🌟', g:'Habit', t:'10 Daily Goals', test:g => (g.goalHits||0) >= 10 },
  { id:'night',   e:'🦉', g:'Habit', t:'Night Owl',      test:g => Object.entries(g.hours||{}).some(([h,w]) => +h < 5 && w > 0) },
  { id:'early',   e:'🌅', g:'Habit', t:'Early Bird',     test:g => Object.entries(g.hours||{}).some(([h,w]) => +h >= 5 && +h < 8 && w > 0) },
  // Topics (breadth — needs topic analysis)
  { id:'topic3',  e:'🧭', g:'Topics', t:'Curious — 3 Topics',  test:g => Object.values(g.topicWords||{}).filter(w => w > 0).length >= 3 },
  { id:'topic5',  e:'🧩', g:'Topics', t:'Polymath — 5 Topics', test:g => Object.values(g.topicWords||{}).filter(w => w > 0).length >= 5 },
];

function ensureToday() {
  const k = dayKey();
  if (state.game.todayKey !== k) {
    const g = state.game;
    g.todayKey = k;
    g.wordsToday = 0; g.secondsToday = 0; g.sessionsToday = 0; g.finishedToday = 0; g.bestWpmToday = 0;
  }
}

/* ---------- Duolingo-style streak engine ----------
   A streak day is earned by ANY real reading (≥150 words cumulative) — deliberately
   decoupled from the daily word goal (Duolingo's highest-impact streak change).
   Freezes: max 2, earned 1 per 7 consecutive days, auto-consumed silently on missed
   days; the calendar shows a snowflake. Displayed streak is truthful (0 when broken). */
const STREAK_DAY_WORDS = 150;
const MAX_FREEZES = 2;
const MILESTONES = [3, 7, 30, 100, 365];

const yesterdayKey = () => dayKey(new Date(Date.now() - 864e5));
function daysBetween(k1, k2) { // dayKey → dayKey, whole days
  return Math.round((new Date(k2 + 'T00:00') - new Date(k1 + 'T00:00')) / 864e5);
}

// Run at boot/home-render: consume freezes for missed days so a saved streak
// survives BEFORE the user reads again.
function reconcileStreak() {
  const g = state.game;
  if (!g.lastActiveDay) return;
  const gap = daysBetween(g.lastActiveDay, dayKey());
  if (gap <= 1) return;                       // active yesterday/today — nothing missed
  const missed = gap - 1;
  if ((g.freezes || 0) >= missed && (g.streak || 0) > 0) {
    g.freezes -= missed;
    for (let i = 1; i <= missed; i++) {
      const d = dayKey(new Date(new Date(g.lastActiveDay + 'T00:00').getTime() + i * 864e5));
      g.frozenDays = g.frozenDays || {}; g.frozenDays[d] = true;
    }
    g.lastActiveDay = yesterdayKey();          // streak continues as if read yesterday
    save();
    toast(`❄️ A Streak Freeze saved your ${g.streak}-day streak`, { ms: 3200 });
  }
  // else: streak is broken — displayStreak() shows 0; the counter resets on next read
}

// Truthful streak for display: 0 unless the chain reaches yesterday or today.
function displayStreak() {
  const g = state.game;
  if (!g.lastActiveDay) return 0;
  return daysBetween(g.lastActiveDay, dayKey()) <= 1 ? (g.streak || 0) : 0;
}
const streakEarnedToday = () => state.game.lastActiveDay === dayKey() && (state.game.wordsToday || 0) >= STREAK_DAY_WORDS;

function addReading(words, seconds, wpm) {
  if (words <= 0) return;
  ensureToday();
  const g = state.game;
  const before = g.wordsToday;
  g.wordsToday += words;
  g.secondsToday = (g.secondsToday || 0) + seconds;
  if (words >= 50) g.sessionsToday = (g.sessionsToday || 0) + 1;
  if (wpm > (g.bestWpmToday || 0) && words >= 100) g.bestWpmToday = Math.round(wpm);
  // streak day earned once real reading accumulates (not by a 5-word accidental open)
  if (g.lastActiveDay !== g.todayKey && g.wordsToday >= STREAK_DAY_WORDS) {
    const wasChainAlive = g.lastActiveDay === yesterdayKey();
    g.streak = wasChainAlive ? (g.streak || 0) + 1 : 1;
    g.lastActiveDay = g.todayKey;
    // consistency earns protection: 1 freeze per 7 consecutive days (capped)
    g.freezeProgress = wasChainAlive || g.streak === 1 ? (g.freezeProgress || 0) + 1 : 1;
    if (g.freezeProgress >= 7) {
      g.freezeProgress = 0;
      if ((g.freezes || 0) < MAX_FREEZES) { g.freezes = (g.freezes || 0) + 1; achievementToast('❄️', 'Streak Freeze earned!'); }
    }
  }
  g.longestStreak = Math.max(g.longestStreak || 0, g.streak || 0);
  g.history[g.todayKey] = (g.history[g.todayKey] || 0) + words;
  const hr = new Date().getHours();
  g.hours = g.hours || {}; g.hours[hr] = (g.hours[hr] || 0) + words;
  g.totalWords += words;
  g.totalSeconds += seconds;
  if (wpm > g.bestWpm) g.bestWpm = Math.round(wpm);
  g.xp += Math.round(words / 8) + Math.round(seconds / 20);
  const lvl = levelFromXp(g.xp);
  if (lvl > g.level) { g.level = lvl; achievementToast('⚡', `Level ${lvl} reached!`); }
  if (before < state.profile.dailyGoalWords && g.wordsToday >= state.profile.dailyGoalWords) {
    g.goalHits = (g.goalHits || 0) + 1;
    achievementToast('🎯', 'Daily goal complete!');
  }
  updateQuests();
  checkAchievements();
  save();
}

/* ---------- daily quests (3/day, date-seeded, deterministic) ---------- */
const QUEST_XP = [10, 20, 30]; // bronze / silver / gold
const QUEST_MEDAL = ['🥉', '🥈', '🥇'];

function seededPick(seedStr, arr, salt) { // deterministic template choice per day
  let h = 2166136261 ^ salt;
  for (const c of seedStr) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return arr[(h >>> 0) % arr.length];
}

function questTemplates(goal, wpm) {
  const w = (f, min) => Math.max(min, Math.round(goal * f / 100) * 100);
  return {
    bronze: [
      { metric:'wordsToday',   target: w(0.2, 200),  label: t => `Read ${fmt(t)} words` },
      { metric:'secondsToday', target: 180,          label: () => 'Read for 3 minutes' },
      { metric:'sessionsToday',target: 1,            label: () => 'Do a reading session' },
    ],
    silver: [
      { metric:'wordsToday',   target: w(0.6, 600),  label: t => `Read ${fmt(t)} words` },
      { metric:'secondsToday', target: 480,          label: () => 'Read for 8 minutes' },
      { metric:'sessionsToday',target: 2,            label: () => 'Do 2 reading sessions' },
    ],
    gold: [
      { metric:'wordsToday',   target: w(1.2, 1200), label: t => `Read ${fmt(t)} words` },
      { metric:'secondsToday', target: 900,          label: () => 'Read for 15 minutes' },
      { metric:'finishedToday',target: 1,            label: () => 'Finish a text' },
      { metric:'bestWpmToday', target: Math.max(350, state.settings.wpm + 50), label: t => `Hit ${t}+ WPM in a session` },
    ],
  };
}

function ensureQuests() {
  ensureToday();
  const g = state.game, k = g.todayKey;
  if (g.questsDay === k && g.quests?.length === 3) return;
  const tpl = questTemplates(state.profile.dailyGoalWords || 2000, state.settings.wpm);
  g.quests = ['bronze', 'silver', 'gold'].map((tier, i) => {
    const t = seededPick(k, tpl[tier], i * 7919);
    return { metric: t.metric, target: t.target, tier: i, label: t.label(t.target), done: false, claimed: false };
  });
  g.questsDay = k;
  save();
}

const questProgress = (q) => Math.min(q.target, state.game[q.metric] || 0);

// Called after every addReading: mark newly-completed quests, grant XP, all-3 bonus.
function updateQuests() {
  ensureQuests();
  const g = state.game;
  for (const q of g.quests) {
    if (!q.done && questProgress(q) >= q.target) {
      q.done = true;
      if (!q.claimed) { q.claimed = true; g.xp += QUEST_XP[q.tier]; achievementToast(QUEST_MEDAL[q.tier], `Quest complete! +${QUEST_XP[q.tier]} XP`); }
    }
  }
  if (g.quests.every(q => q.done) && g.questsRewardDay !== g.todayKey) {
    g.questsRewardDay = g.todayKey;
    if ((g.freezes || 0) < MAX_FREEZES) { g.freezes = (g.freezes || 0) + 1; achievementToast('❄️', 'All quests done — Streak Freeze earned!'); }
    else { g.xp += 50; achievementToast('🎁', 'All quests done! +50 XP'); }
  }
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
  reconcileStreak();
  ensureQuests();
  if (!state.profile.onboarded) startOnboarding();
  else enterApp();
  // Fade the splash via setTimeout (NOT requestAnimationFrame — rAF never fires
  // in a backgrounded tab, which would leave the splash stuck over the app).
  // Held ~1.1s so the tagline is readable before the fade.
  setTimeout(() => {
    D.splash.classList.add('out');
    setTimeout(() => D.splash.classList.add('hidden'), 520);
  }, 1100);
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
  for (const v of ['home', 'discover', 'stats', 'profile']) D[v].classList.toggle('hidden', v !== name);
  for (const t of D.tabbar.querySelectorAll('.tab'))
    t.classList.toggle('active', t.dataset.view === name);
  window.scrollTo(0, 0);
  if (name === 'home') renderHome();
  if (name === 'discover') renderDiscover();
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
const OB_STEPS = ['welcome', 'demo', 'goals', 'speed', 'plan', 'finish'];

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
  const pct = (ob.step / (OB_STEPS.length - 1)) * 100;
  const top = el('div', { class:'ob-top' });
  if (ob.step > 0) top.append(el('button', { class:'ob-back', onclick:() => { ob.step--; renderOb(); } }, '‹'));
  const bar = el('div', { class:'ob-bar' }); bar.append(el('i', { style:`width:${pct}%` }));
  top.append(bar);
  top.append(el('button', { class:'ob-skip' + (ob.step < 3 ? '' : ' is-hidden'), onclick: finishOnboarding }, 'Skip'));

  const { content, cta } = ({ welcome:obWelcome, demo:obDemo, goals:obGoals, speed:obSpeed, plan:obPlan, finish:obFinish })[OB_STEPS[ob.step]]();
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
  clearTimeout(obTimer); obTimer = null; // Skip during the demo would otherwise leak its self-rescheduling timer
  state.profile.onboarded = true;
  save();
  enterApp();
}

/* ============================================================
   HOME / LIBRARY
   ============================================================ */
const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const coverEmoji = (t) => ({ text:'📝', md:'🗒️', epub:'📚', pdf:'📕', url:'🔗', sample:'✨', vault:'📁', library:'🏛️' }[t] || '📄');

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
const docCategory = (d) => d.type === 'vault' ? 'vault' : (d.type === 'epub' || d.type === 'pdf' || d.type === 'library') ? 'book' : d.type === 'url' ? 'article' : 'note';
const docProgress = (d) => d.type === 'vault' ? vaultProgress(d).pct / 100 : (d.progress || 0);
// A text counts as "read" permanently once finished — the flag survives a later re-read
// (progress may drop while re-reading, but the ✓ badge never disappears). Old docs with
// only progress>=0.99 are treated as finished (lazy migration).
const isRead = (d) => d.type === 'vault' ? vaultProgress(d).pct >= 100 : (!!d.finished || (d.progress || 0) >= 0.99);
function matchesFilter(d, f) {
  if (f === 'all') return true;
  if (f.startsWith('col:')) return (d.tags || []).includes(f.slice(4));
  const pr = docProgress(d);
  if (f === 'reading') return !isRead(d) && pr > 0;
  if (f === 'unread') return !isRead(d) && pr <= 0;
  if (f === 'finished') return isRead(d);
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

// Turn a word count into a tangible readout: page-equivalent + a relatable reference
// ("≈ 4 pages · 2× a news article"). ~250 words per page (standard paperback).
const READ_REFS = [
  { w: 300,   one: 'a news brief' },
  { w: 800,   one: 'a news article' },
  { w: 1500,  one: 'a blog post' },
  { w: 4000,  one: 'a book chapter' },
  { w: 7500,  one: 'a short story' },
  { w: 25000, one: 'a novella' },
  { w: 90000, one: 'a novel' },
];
function readingEquivalent(words) {
  if (!words) return '';
  const pages = words / 250;
  const pagesTxt = pages < 1 ? 'under a page' : `${Math.round(pages)} page${Math.round(pages) === 1 ? '' : 's'}`;
  let ref = READ_REFS[0];
  for (const r of READ_REFS) if (words >= r.w) ref = r;
  const mult = words / ref.w;
  const refTxt = mult >= 1.5 ? `${Math.round(mult)}× ${ref.one}` : `about ${ref.one}`;
  return `≈ ${pagesTxt} · ${refTxt}`;
}

async function renderHome() {
  const v = D.home; clear(v);
  const g = state.game, p = state.profile;
  reconcileStreak(); ensureQuests();

  const head = el('div', { class:'home-head' });
  head.append(el('div', {}, el('div', { class:'home-hi' }, greeting()),
    el('div', { class:'home-name' }, p.name ? p.name : 'Reader')));
  const right = el('div', { class:'row gap10' });
  // Streak pill: truthful count, flame lit only when today is earned, at-risk styling
  // in the evening, freeze pips, tap → streak calendar.
  const ds = displayStreak();
  const earned = streakEarnedToday();
  const atRisk = !earned && ds > 0 && new Date().getHours() >= 17;
  const pill = el('button', {
    class:'streak-pill' + (earned ? ' lit' : '') + (atRisk ? ' risk' : ''),
    'aria-label':'Streak calendar', onclick:() => { haptic(6); streakSheet(); } },
    el('span', { class:'flame', html: ICON.flame }), String(ds));
  if ((g.freezes || 0) > 0) pill.append(el('span', { class:'freeze-pips' }, '❄'.repeat(g.freezes)));
  right.append(pill);
  right.append(el('button', { class:'avatar', style:'width:44px;height:44px;font-size:20px',
    onclick:() => { haptic(6); showView('profile'); } }, p.avatar || '🚀'));
  head.append(right);
  v.append(head);

  if (atRisk) v.append(el('button', { class:'risk-banner', onclick:() => { haptic(6); streakSheet(); } },
    el('span', { class:'flame', html: ICON.flame }), `Read today to keep your ${ds}-day streak`));

  // daily goal ring — tappable → goal sheet
  const pct = Math.min(100, Math.round(p.dailyGoalWords ? (g.wordsToday / p.dailyGoalWords) * 100 : 0));
  const goal = el('button', { class:'card goal-card', onclick:() => { haptic(6); goalSheet(); } });
  goal.append(el('div', { class:'ring', style:`--p:${pct}` }, el('b', {}, `${pct}%`)));
  const gm = el('div', { class:'goal-meta' });
  gm.append(el('div', { class:'t' }, pct >= 100 ? 'Daily goal complete 🎉' : 'Daily reading goal'));
  gm.append(el('div', { class:'s' }, `${fmt(g.wordsToday)} / ${fmt(p.dailyGoalWords)} words today`));
  if (g.wordsToday > 0) gm.append(el('div', { class:'goal-eq' }, readingEquivalent(g.wordsToday)));
  const mb = el('div', { class:'mini-bar' }); mb.append(el('i', { style:`width:${pct}%` })); gm.append(mb);
  goal.append(gm);
  v.append(goal);

  // daily quests
  v.append(questCard());

  // single import entry
  v.append(el('button', { class:'import-btn', onclick:() => { haptic(6); importSheet(); } },
    el('span', { class:'ic', html: ICON.plus }), el('span', { class:'grow' }, 'Import something to read'),
    el('span', { class:'chev', html: ICON.next })));
  // one-tap "read a link I copied" — the realistic way to get a Safari link in here
  v.append(el('button', { class:'paste-link-row', onclick:() => { haptic(6); pasteLinkImport(); } },
    el('span', { class:'ic', html: ICON.link }), el('span', {}, 'Read a link you copied')));

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
      const empty = el('div', { class:'empty' }, el('div', { class:'big' }, docs.length ? '🔍' : '📚'),
        el('div', {}, docs.length ? 'No matches' : 'Your library is empty'),
        el('div', { class:'faint mt8' }, docs.length ? 'Try another filter or search.' : 'Import something, or browse the free library.'));
      if (!docs.length) empty.append(el('button', { class:'btn sm', style:'margin:14px auto 0',
        onclick:() => { haptic(6); showView('discover'); } }, 'Browse the free library'));
      wrap.append(empty);
    } else for (const d of list) wrap.append(docCard(d, state.settings.view));
  }
}

function importSheet() {
  const body = el('div', { class:'stack' });
  const opt = (icon, t, s, fn) => el('button', { class:'imp-opt', onclick:() => { haptic(6); closeSheet(); fn(); } },
    el('span', { class:'imp-ic', html: icon }), el('div', { class:'grow' }, el('div', { class:'imp-t' }, t), el('div', { class:'imp-s' }, s)),
    el('span', { class:'imp-go', html: ICON.next }));
  body.append(opt(ICON.flame, 'Discover library', 'Curated authors & timeless classics', () => showView('discover')));
  body.append(opt(ICON.link, 'Read a copied link', 'Copy in Safari, then tap here', pasteLinkImport));
  body.append(opt(ICON.paste, 'Paste text', 'Articles, emails, notes', pasteSheet));
  body.append(opt(ICON.search, 'Type a web link', 'Enter or paste a URL', urlSheet));
  body.append(opt(ICON.file, 'Upload file', '.txt · .md · .epub · .pdf', () => D.fileInput.click()));
  body.append(opt(ICON.vault, 'Import folder / vault', 'Whole vault, subfolders included', vaultSheet));
  sheet({ title:'Import', sub:'Everything stays on your device.', body });
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
  const done = isRead(d);
  const [bg, fg] = tileColors(d);
  const emoji = coverEmoji(d.type);

  if (mode === 'grid') {
    const card = el('button', { class:'gcard' });
    const cover = el('div', { class:'gcover', style:`background:${bg};color:${fg}` }, emoji);
    if (done || prog > 0) cover.append(el('span', { class:'gbadge' + (done ? ' done' : '') }, done ? '✓' : `${prog}%`));
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
  const topic = !isVault && (d.topics || []).find(t => t && t !== 'General');
  if (topic) info.append(el('span', { class:'topic-tag' }, topic));
  if (!done && prog > 0 && (prog < 99 || isVault)) { const pb = el('div', { class:'pbar' }); pb.append(el('i', { style:`width:${prog}%` })); info.append(pb); }
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

// Unified doc builder: from raw text (→ mdToBlocks) or pre-parsed blocks (EPUB/HTML).
// Stores typed `blocks` + heading `toc` and derives the `{title,text}` chapters the
// RSVP reader already consumes — so the reader is unchanged.
function makeDoc({ title, type, text, author, markdown, blocks }) {
  // Recognise markdown when asked, when it's an .md file, or when the text plainly
  // contains heading syntax — so pasted/.txt content also formats by H1/H2/H3.
  const isMd = markdown || type === 'md' || (!blocks && /^#{1,6}\s+\S/m.test(text || ''));
  const bl = blocks || mdToBlocks(text, { markdown: isMd });
  const { chapters, toc } = blocksToOutline(bl, { title });
  const { topics, keywords } = analyzeTopics(text || bl.map(b => b.text).join(' '));
  return { title: title || 'Untitled', type, author, blocks: bl, chapters, toc, topics, keywords,
    words: chapters.reduce((s, c) => s + (c.words || 0), 0) };
}

function pasteSheet() {
  const body = el('div', { class:'stack' });
  const ta = el('textarea', { class:'field pretty', placeholder:'Paste or type anything — an article, an email, notes…' });
  body.append(ta);
  const go = el('button', { class:'btn', onclick: async () => {
    const t = ta.value.trim(); if (!t) return toast('Nothing to read', { err:true });
    closeSheet();
    const firstLine = (t.split('\n').find(Boolean) || 'Pasted text').replace(/^#{1,6}\s*/, '');
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

async function fetchArticle(url, timeoutMs = 15000) {
  // Abort a hung proxy so the button can't stick forever. Books/PDFs need a longer
  // budget (a 130-page PDF can take ~a minute for the reader proxy to parse).
  const timed = () => { const c = new AbortController(); setTimeout(() => c.abort(), timeoutMs); return c.signal; };
  // Primary: r.jina.ai returns clean markdown of the page, CORS-enabled.
  try {
    const r = await fetch('https://r.jina.ai/' + url, { headers: { 'X-Return-Format': 'markdown' }, signal: timed() });
    if (r.ok) {
      let t = await r.text();
      if (t && t.length > 80) {
        // Strip jina's "Title: … Markdown Content:" preamble; keep the title as an H1
        // — unless it's just a filename (e.g. a PDF), in which case the body's own
        // first heading is the real title.
        const m = t.match(/^Title:\s*(.+)$/m);
        t = t.replace(/^[\s\S]*?Markdown Content:\s*/, '');
        if (m && !/\.[a-z0-9]{2,4}$/i.test(m[1].trim())) t = `# ${m[1].trim()}\n\n${t}`;
        return t.trim();
      }
    }
  } catch {}
  // Fallback: allorigins raw HTML → strip to text.
  const r2 = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(url), { signal: timed() });
  const html = await r2.text();
  return htmlToText(html);
}

// The ONE DOM→blocks walker (used by HTML article import and EPUB).
function domToBlocks(root) {
  const blocks = [];
  root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote').forEach(n => {
    const t = n.textContent.replace(/\s+/g, ' ').trim();
    if (!t) return;
    const tag = n.tagName.toLowerCase();
    const type = /^h[1-6]$/.test(tag) ? 'h' + Math.min(3, +tag[1]) : tag === 'blockquote' ? 'quote' : tag;
    blocks.push({ type, text: t });
  });
  return blocks;
}
function blocksToMarkdown(blocks) {
  const pre = { h1:'# ', h2:'## ', h3:'### ', li:'- ', quote:'> ', p:'' };
  return blocks.map(b => (pre[b.type] || '') + b.text).join('\n\n');
}
function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,nav,footer,header,aside,noscript,svg').forEach(n => n.remove());
  const main = doc.querySelector('article, main') || doc.body;
  const blocks = domToBlocks(main);
  return blocks.length ? blocksToMarkdown(blocks) : main.textContent.replace(/\s+/g, ' ').trim();
}

async function onFilePicked(e) {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) return toast('That file is too large (max 50 MB)', { err:true });
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
  return makeDoc({ title: title.slice(0, 80), type: 'pdf', text });
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
  // Strip a leading markdown heading marker so the title isn't literally "# Foo".
  const title = ((t.split('\n').find(Boolean) || 'Shared text').replace(/^#{1,6}\s*/, '')).slice(0, 48);
  const doc = await saveDoc(makeDoc({ title, type:'text', text: t }));
  openDoc(doc.id);
}

// One-tap "read what I copied": the realistic iOS share flow — copy a link in
// Safari, open this app, tap once. Reads the clipboard (needs a tap = the gesture)
// and imports a URL or text into THIS (home-screen) library.
async function pasteLinkImport() {
  let clip = '';
  try { clip = (await navigator.clipboard.readText() || '').trim(); }
  catch { toast('Allow paste to read your link', { err:true }); return urlSheet(); }
  if (!clip) return toast('Copy a link first, then tap this', { err:true });
  const url = clip.match(/https?:\/\/[^\s]+/);
  if (url) return importFromUrl(url[0]);
  if (clip.length > 50) return quickImportText(clip);
  toast('No link found on the clipboard', { err:true });
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
  const d = makeDoc({ title, type: md ? 'md' : 'text', text, markdown: md });
  return { path: rel, folder, title, type: d.type, blocks: d.blocks, chapters: d.chapters,
    toc: d.toc, words: d.words, idx: 0, progress: 0 };
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
  const allBlocks = [];
  for (let si = 0; si < spine.length; si++) {
    const entry = zip.file(base + decodeURIComponent(spine[si]));
    if (!entry) continue;
    const dd = parser.parseFromString(await entry.async('string'), 'text/html');
    dd.querySelectorAll('script,style,svg').forEach(n => n.remove());
    const blocks = domToBlocks(dd.body || dd);
    if (!blocks.length) continue;
    // make each spine file a chapter: ensure it starts at the top heading level.
    if (!blocks.some(b => b.type === 'h1')) {
      if (/^h[23]$/.test(blocks[0].type)) blocks[0] = { type: 'h1', text: blocks[0].text };
      else blocks.unshift({ type: 'h1', text: (dd.querySelector('title')?.textContent || '').replace(/\s+/g, ' ').trim() || `Section ${si + 1}` });
    }
    allBlocks.push(...blocks);
  }
  if (!allBlocks.length) throw new Error('No readable text in EPUB');
  return makeDoc({ title, type: 'epub', author, blocks: allBlocks });
}

/* ============================================================
   READER  (RSVP playback)
   ============================================================ */
let R = null;

/* ============================================================
   DISCOVER — curated library (catalog.json + bundled/web/link texts)
   ============================================================ */
let CATALOG = null, discoverAuthorId = null, discoverSearch = '';

async function loadCatalog() {
  if (CATALOG) return CATALOG;
  try {
    const r = await fetch('library/catalog.json', { cache: 'no-cache' });
    if (r.ok) { CATALOG = await r.json(); try { localStorage.setItem('readmaxx.catalog', JSON.stringify(CATALOG)); } catch {} return CATALOG; }
  } catch {}
  try { CATALOG = JSON.parse(localStorage.getItem('readmaxx.catalog')); } catch {} // offline fallback
  return CATALOG;
}
// libraryId -> docId for ✓/dedupe states
async function libraryDocIndex() {
  const idx = {};
  for (const d of await allDocs()) if (d.libraryId) idx[d.libraryId] = d.id;
  return idx;
}
const authorInitials = (name) => (name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const readMins = (w) => Math.max(1, Math.round((w || 0) / Math.max(150, state.settings.wpm)));
// author avatar: Wikipedia photo when we have one, initials otherwise (photo errors
// gracefully fall back to initials).
function authorAvatar(a, cls = 'auth-tile') {
  if (a?.img) {
    const img = el('img', { class: `${cls} ava-img`, src: a.img, alt: a.name || '', loading: 'lazy' });
    img.addEventListener('error', () => img.replaceWith(el('span', { class: cls }, authorInitials(a.name))));
    return img;
  }
  return el('span', { class: cls }, authorInitials(a?.name));
}
function refreshDiscover() {
  if (!D.discover || D.discover.classList.contains('hidden')) return;
  if (discoverAuthorId) renderAuthorPage(discoverAuthorId); else renderDiscover();
}

async function renderDiscover() {
  const v = D.discover; clear(v);
  v.append(el('div', { class:'home-head' }, el('div', {},
    el('div', { class:'home-hi' }, 'Curated for you'),
    el('div', { class:'home-name' }, 'Discover'))));
  const cat = await loadCatalog();
  if (!D.discover || D.discover.classList.contains('hidden')) return;
  if (!cat) {
    v.append(el('div', { class:'card', style:'padding:22px;text-align:center;color:var(--faint)' },
      'Couldn’t load the catalog. Check your connection and try again.'));
    return;
  }
  const owned = await libraryDocIndex();

  // search
  const search = el('div', { class:'search' });
  search.append(el('span', { class:'ic', html: ICON.search }));
  const si = el('input', { class:'search-in', placeholder:'Search authors, titles, topics', value: discoverSearch, inputmode:'search' });
  si.addEventListener('input', () => { discoverSearch = si.value; renderDiscoverBody(body, cat, owned); });
  search.append(si);
  v.append(search);

  const body = el('div', {});
  v.append(body);
  renderDiscoverBody(body, cat, owned);
}

function renderDiscoverBody(box, cat, owned) {
  clear(box);
  const q = discoverSearch.trim().toLowerCase();
  if (q) { // flat search results across the whole catalog
    const hits = cat.texts.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (cat.authors.find(a => a.id === t.authorId)?.name || '').toLowerCase().includes(q) ||
      (t.tags || []).some(tag => tag.toLowerCase().includes(q))).slice(0, 60);
    if (!hits.length) { box.append(el('div', { class:'card', style:'padding:18px;text-align:center;color:var(--faint)' }, 'No matches')); return; }
    const card = el('div', { class:'card', style:'padding:4px 14px' });
    for (const t of hits) card.append(discoverTextRow(t, cat, owned));
    box.append(card);
    return;
  }
  // reading paths
  box.append(el('div', { class:'sec-title' }, el('h3', {}, 'Reading paths')));
  const paths = el('div', { class:'cont-row' });
  for (const c of cat.collections) {
    const authors = c.authorIds.map(id => cat.authors.find(a => a.id === id)).filter(Boolean);
    const nTexts = authors.reduce((s, a) => s + a.texts, 0);
    const pc = el('button', { class:'path-card' },
      el('div', { class:'pc-n' }, String(c.phase)),
      el('div', { class:'pc-t' }, c.title),
      el('div', { class:'pc-d' }, `${authors.length} author${authors.length !== 1 ? 's' : ''} · ${nTexts} texts`));
    pc.addEventListener('click', () => { haptic(6); document.getElementById('phase-' + c.phase)?.scrollIntoView({ behavior:'smooth', block:'start' }); });
    paths.append(pc);
  }
  box.append(paths);
  // author shelves grouped by phase
  for (const c of cat.collections) {
    box.append(el('div', { class:'sec-title', id:'phase-' + c.phase }, el('h3', {}, c.title)));
    const card = el('div', { class:'card', style:'padding:2px 14px' });
    for (const id of c.authorIds) {
      const a = cat.authors.find(x => x.id === id); if (!a) continue;
      const row = el('button', { class:'auth-row' });
      row.append(authorAvatar(a, 'auth-tile'));
      row.append(el('div', { class:'auth-mid' },
        el('div', { class:'auth-name' }, a.name),
        el('div', { class:'auth-tag' }, a.tagline || `${a.texts} texts`)));
      row.append(el('span', { class:'auth-n' }, String(a.texts)), el('span', { class:'go', html: ICON.next }));
      row.addEventListener('click', () => { haptic(6); discoverAuthorId = a.id; renderAuthorPage(a.id); });
      card.append(row);
    }
    box.append(card);
  }
  box.append(el('div', { class:'disc-note' },
    'Classics are bundled with the app. Living authors’ essays download from their original sites — you fetch them yourself, like a browser.'));
}

async function renderAuthorPage(authorId) {
  const cat = await loadCatalog(); if (!cat) return;
  const a = cat.authors.find(x => x.id === authorId); if (!a) return;
  const owned = await libraryDocIndex();
  const v = D.discover; clear(v);
  window.scrollTo(0, 0); // the author page is shorter — don't keep the shelf's scroll (nav-shift bug)
  const head = el('div', { class:'home-head', style:'align-items:center' });
  head.append(el('button', { class:'icon-btn', html: ICON.back, 'aria-label':'Back',
    onclick:() => { discoverAuthorId = null; window.scrollTo(0, 0); renderDiscover(); } }));
  head.append(el('div', { class:'home-name', style:'font-size:22px;flex:1' }, a.name));
  v.append(head);
  // author hero: photo + bio
  const hero = el('div', { class:'auth-hero' });
  hero.append(authorAvatar(a, 'auth-hero-ava'));
  if (a.bio) hero.append(el('div', { class:'auth-bio' }, a.bio));
  v.append(hero);

  const texts = cat.texts.filter(t => t.authorId === authorId);
  const dl = texts.filter(t => t.src !== 'link' && t.src !== 'owned');
  if (dl.length > 1) {
    const allBtn = el('button', { class:'btn ghost sm', style:'margin:2px 0 10px' }, `Add all ${dl.length}`);
    allBtn.addEventListener('click', async () => {
      allBtn.disabled = true;
      let n = 0;
      for (const t of dl) {
        if (owned[t.id]) { n++; continue; }
        allBtn.textContent = `Adding ${n + 1}/${dl.length}…`;
        try { await downloadLibText(t, a, null, true); n++; } catch {}
      }
      allBtn.textContent = 'All added ✓';
      renderAuthorPage(authorId);
    });
    v.append(allBtn);
  }
  const card = el('div', { class:'card', style:'padding:4px 14px' });
  for (const t of texts) card.append(discoverTextRow(t, cat, owned, a));
  v.append(card);
}

function discoverTextRow(t, cat, owned, authorOverride) {
  const a = authorOverride || cat.authors.find(x => x.id === t.authorId);
  const row = el('div', { class:'lib-row' });
  // tapping the row body opens the info sheet ("what's this about?")
  const mid = el('button', { class:'lr-mid' });
  mid.append(el('div', { class:'lr-t' }, t.title));
  const bits = [];
  if (!authorOverride && a) bits.push(a.name);
  if (t.date) bits.push(String(t.date).slice(0, 4));
  if (t.words) bits.push(`${fmt(t.words)} words · ${readMins(t.words)} min`);
  else if (t.src === 'web') bits.push('tap for details');
  if (t.tags?.length) bits.push(t.tags[0]);
  mid.append(el('div', { class:'lr-m' }, bits.join(' · ')));
  mid.append(el('span', { class:'lr-info', html: ICON.next }));
  mid.onclick = () => textInfoSheet(t, a);
  row.append(mid);
  const btn = el('button', { class:'lr-btn' });
  const ownedId = owned[t.id];
  if (ownedId) { btn.classList.add('owned'); btn.innerHTML = ICON.check; btn.title = 'In your library — tap to open'; btn.onclick = () => openDoc(ownedId); }
  else if (t.src === 'owned') { btn.innerHTML = ICON.plus; btn.title = 'You own this — import your copy'; btn.onclick = () => textInfoSheet(t, a); }
  else { btn.innerHTML = '<span class="lr-get">GET</span>'; btn.onclick = () => downloadLibText(t, a, btn); } // link texts are downloadable too
  row.append(btn);
  return row;
}

// "What's this about?" — metadata, summary, and download/copy/open actions.
async function textInfoSheet(t, a) {
  haptic(6);
  const owned = await libraryDocIndex();
  const ownedId = owned[t.id];
  const body = el('div', { class:'stack' });
  const hd = el('div', { class:'ti-head' });
  hd.append(authorAvatar(a, 'ti-ava'));
  hd.append(el('div', { class:'grow' }, el('div', { class:'ti-title' }, t.title),
    el('div', { class:'ti-author' }, a?.name || '')));
  body.append(hd);
  const meta = [];
  if (t.date) meta.push(String(t.date).slice(0, 4));
  if (t.words) meta.push(`${fmt(t.words)} words · ${readMins(t.words)} min read`);
  if (meta.length) body.append(el('div', { class:'ti-meta' }, meta.join('   ·   ')));
  const summary = t.desc || t.preview;
  body.append(el('div', { class:'ti-summary' + (summary ? '' : ' faint') },
    summary || 'Add it to your library to download and read the full text.'));
  if (t.tags?.length) { const tg = el('div', { class:'ti-tags' }); t.tags.forEach(x => tg.append(el('span', { class:'topic-tag' }, x))); body.append(tg); }
  const srcNote = { bundled:'Included with the app — instant and offline.',
    web:'Downloads from the original source to your device.',
    link:'Hosted on the author’s own site — best read there, but you can still add it.',
    owned:'This book is in copyright — we can’t host it. Import your own copy to read it here, or find a legitimate ebook.' }[t.src];
  if (srcNote) body.append(el('div', { class:'ti-src' }, srcNote));

  const acts = el('div', { class:'stack', style:'margin-top:8px' });
  if (ownedId) acts.append(el('button', { class:'btn', onclick:() => { closeSheet(); openDoc(ownedId); } }, 'Open'));
  else if (t.src === 'owned') acts.append(el('button', { class:'btn', onclick:() => { closeSheet(); importSheet(); } }, 'Import my copy'));
  else acts.append(el('button', { class:'btn', onclick:() => { closeSheet(); downloadLibText(t, a, null, false).then(refreshDiscover).catch(() => {}); } }, 'Add to library'));
  const row2 = el('div', { class:'row', style:'gap:10px' });
  if (t.src !== 'owned') row2.append(el('button', { class:'btn ghost sm', style:'flex:1', onclick:() => copyLibText(t) }, 'Copy text'));
  if (t.url) row2.append(el('button', { class:'btn ghost sm', style:'flex:1', onclick:() => window.open(t.url, '_blank') }, t.src === 'owned' ? 'Find the ebook' : 'Open original'));
  if (row2.childElementCount) acts.append(row2);
  body.append(acts);
  sheet({ title:'', body });
}

// Copy the full text to the clipboard (fetches web/link texts on demand).
async function copyLibText(entry) {
  toast('Preparing text…');
  try {
    const text = entry.src === 'bundled' ? await (await fetch(entry.path)).text() : await fetchArticle(entry.url);
    if (!text || text.length < 40) throw new Error('empty');
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch { toast(entry.url ? 'Couldn’t copy — try “Open original”' : 'Couldn’t copy that text', { err:true }); }
}

async function downloadLibText(entry, author, btn, quiet) {
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="lr-spin"></span>'; }
  try {
    let doc;
    if (entry.src === 'bundled') {
      const r = await fetch(entry.path);
      if (!r.ok) throw new Error('missing text');
      doc = makeDoc({ title: entry.title, type:'library', text: await r.text(), author: author?.name });
    } else { // web — user-initiated on-device fetch from the original source
      // Books/PDFs can be large and slow to parse; give a big fetch a heads-up + budget.
      const big = !entry.words || entry.words > 6000;
      if (!quiet && big) toast('Fetching the book… this can take a minute', { ms: 4000 });
      const text = await fetchArticle(entry.url, big ? 120000 : 20000);
      if (!text || text.length < 200) throw new Error('fetch failed');
      doc = makeDoc({ title: entry.title, type:'library', text, author: author?.name, markdown: true });
    }
    doc.libraryId = entry.id;
    const saved = await saveDoc(doc);
    if (btn) { btn.disabled = false; btn.classList.add('owned'); btn.innerHTML = ICON.check; btn.onclick = () => openDoc(saved.id); }
    if (!quiet) toast(`Added “${entry.title.slice(0, 34)}${entry.title.length > 34 ? '…' : ''}”`);
    return saved;
  } catch (e) {
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="lr-get">GET</span>'; }
    if (!quiet) toast(!navigator.onLine ? 'You’re offline — try again later'
      : entry.url ? 'Couldn’t fetch — try “Open original” from the details' : 'Couldn’t fetch that text', { err:true });
    throw e;
  }
}

async function openDoc(id) {
  const doc = await getDoc(id);
  if (!doc) return toast('Not found', { err:true });
  if (doc.type === 'vault') return openVaultBrowser(id);
  if (!doc.topics) { // lazy-backfill topics for docs imported before topic analysis existed
    const a = analyzeTopics((doc.chapters || []).map(c => c.text).join(' '));
    doc.topics = a.topics; doc.keywords = a.keywords; putDoc(doc);
  }
  openReader(doc, null);
}

// Open one note inside a vault, carrying the vault context so progress writes
// back to the note and prev/next lets you tab through the whole vault.
function openVaultNote(vault, i) {
  const note = vault.notes[i]; if (!note) return;
  D.vaultScreen.classList.add('hidden');
  const doc = { title: note.title, subtitle: vault.title, words: note.words,
    chapters: note.chapters, idx: note.idx || 0, progress: note.progress || 0, finished: note.finished, type:'md' };
  openReader(doc, { vaultDoc: vault, i });
}

const BIG_DOC = 50000; // words above which we build asynchronously (no UI freeze)
const MAX_IMPORT_BYTES = 50 * 1024 * 1024; // reject huge files before they OOM the tab

async function openReader(doc, vaultCtx) {
  D.reader.classList.remove('hidden');
  const big = (doc.words || 0) > BIG_DOC;
  if (big) showReaderBuilding(doc.title);
  const built = big
    ? await buildFlashesAsync(doc.chapters, state.settings.chunk)
    : buildFlashes(doc.chapters, state.settings.chunk);
  if (!built.flashes.length) { // empty / whitespace-only doc → avoid NaN% + a dead scrubber
    D.reader.classList.add('hidden');
    return toast('No readable text in this document', { err:true });
  }
  // A finished text opens in its completed state (shown at 100%, not auto-played);
  // "Read again" is the only thing that restarts it, and it keeps the ✓ read badge.
  const isFinished = !!doc.finished || (doc.progress || 0) >= 0.999;
  R = {
    doc, vaultCtx, flashes: built.flashes, ranges: built.chapterRanges, total: built.flashes.length,
    // Restore from the saved FRACTION, not the raw flash index: flash count depends on
    // the current "words per flash", which may have changed since this doc was saved.
    idx: isFinished ? built.flashes.length - 1
       : Math.min(built.flashes.length - 1, Math.round((doc.progress || 0) * built.flashes.length)),
    playing: false, timer: null,
    sessionWords: 0, sessionStart: 0, wake: null, done: isFinished, finished: isFinished,
    visitWords: 0, visitSecs: 0, visitWpm: 0, xpAtOpen: state.game.xp,
    streakWasEarned: streakEarnedToday(), summaryShown: false,
  };
  if (!isFinished && R.idx >= R.total - 1) R.idx = 0; // near-end but not finished → restart
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
  // inline speed readout — sits just above the context so you can see your speed
  // without moving your eyes down to the slider.
  const speedLbl = el('div', { class:'rd-speed' }, `${state.settings.wpm} wpm`);
  stage.append(speedLbl);
  stage.append(el('div', { class:'rd-context', onclick:(e) => { e.stopPropagation(); haptic(6); openTextView(); } },
    el('div', { class:'ctx-text' }), el('div', { class:'ctx-hint' }, 'tap for full text')));
  stage.addEventListener('click', () => { if (state.settings.tapToPause) R.playing ? pause() : play(); });
  addSpeedStrips(stage, speedLbl);
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
  transport.append(el('button', { class:'play rd-play', html: ICON.play, onclick:() => { if (R.finished) readAgain(); else R.playing ? pause() : play(); } }));
  transport.append(el('button', { class:'icon-btn', html: ICON.fwd, onclick:() => skip(Math.max(8, Math.round(state.settings.wpm / 30))) }));
  ctr.append(transport);

  const wpm = el('div', { class:'wpm-control' });
  const wr = el('input', { type:'range', min:'100', max:'1000', step:'10', value:String(state.settings.wpm), class:'grad-track' });
  const wv = el('div', { class:'val rd-wpmval' });
  wr.addEventListener('input', () => { setWpmLive(+wr.value, speedLbl); });
  wpm.append(el('span', { class:'muted', style:'font-size:12px' }, 'WPM'), wr, wv);
  ctr.append(wpm);
  r.append(ctr);

  updateWpmLabel();
  renderFlash(R.idx);
  updatePlayBtn();
  if (R.finished) showDoneBanner(); else setTimeout(play, 350); // don't auto-play a completed text
}

// A small "Finished ✓ · Read again" banner shown when a completed text is reopened.
function showDoneBanner() {
  const stage = $('.rd-stage', D.reader); if (!stage || $('.rd-done', D.reader)) return;
  const chip = el('div', { class:'rd-done' },
    el('span', { class:'rd-done-badge', html: ICON.check }),
    el('span', {}, 'Finished'),
    el('button', { class:'rd-again', html: ICON.refresh + '<span>Read again</span>', onclick:(e) => { e.stopPropagation(); readAgain(); } }));
  stage.append(chip);
}

const wEl = () => $('.rd-word', D.reader);

// Set WPM from anywhere (drag strips, slider) and keep every readout in sync.
function setWpmLive(v, speedLbl) {
  v = Math.max(100, Math.min(1000, Math.round(v / 5) * 5));
  if (v === state.settings.wpm) return;
  state.settings.wpm = v;
  const wr = $('.wpm-control input', D.reader); if (wr) wr.value = v;
  if (speedLbl) { speedLbl.textContent = `${v} wpm`; speedLbl.classList.remove('pulse'); void speedLbl.offsetWidth; speedLbl.classList.add('pulse'); }
  updateWpmLabel(); save();
}

// Draggable speed control on BOTH edges of the reading stage: drag up = faster,
// down = slower. Owns its pointer events so it never triggers tap-to-pause or the
// context tap.
function addSpeedStrips(stage, speedLbl) {
  for (const side of ['l', 'r']) {
    const strip = el('div', { class:`rd-speedstrip ${side}`, html:'<span class="ss-ar">▲</span><span class="ss-hint">speed</span><span class="ss-ar">▼</span>' });
    let startY = 0, startWpm = 0, lastHap = 0, dragging = false;
    strip.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); dragging = true; startY = e.clientY; startWpm = state.settings.wpm; lastHap = startWpm;
      try { strip.setPointerCapture(e.pointerId); } catch {}
      strip.classList.add('active');
    });
    strip.addEventListener('pointermove', (e) => {
      if (!dragging) return; e.preventDefault();
      setWpmLive(startWpm + (startY - e.clientY) * 1.4, speedLbl); // up (smaller clientY) = faster
      if (Math.abs(state.settings.wpm - lastHap) >= 25) { haptic(4); lastHap = state.settings.wpm; }
    });
    const end = (e) => { if (!dragging) return; dragging = false; strip.classList.remove('active'); try { strip.releasePointerCapture(e.pointerId); } catch {} };
    strip.addEventListener('pointerup', end);
    strip.addEventListener('pointercancel', end);
    strip.addEventListener('click', (e) => e.stopPropagation()); // a drag-end must not bubble to tap-to-pause
    stage.append(strip);
  }
  // one-time coaching hint
  if (!state.settings.seenSpeedHint) {
    toast('Drag either edge up/down to change speed', { ms: 3200 });
    state.settings.seenSpeedHint = true; save();
  }
}

function renderFlash(i) {
  const f = R.flashes[i]; if (!f) return;
  const w = wEl(); clear(w);
  w.classList.toggle('rd-heading', !!f.card);
  if (f.card) {
    // a heading shows as a brief title card (not flashed word-by-word)
    w.append(el('div', { class:'rd-card-eyebrow' }, f.heading === 1 ? 'Chapter' : 'Section'),
      el('div', { class:'rd-card-t' }, f.text));
  } else if (state.settings.orp) {
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

  // counters + scrub — a finished text reads 100% / 0 left even though the last
  // flash index is total-1.
  const range = $('.rd-range', D.reader); if (range && +range.value !== i) range.value = i;
  const wordsRead = R.finished ? R.doc.words : Math.round(R.doc.words * (i / R.total));
  const wordsLeft = Math.max(0, R.doc.words - wordsRead);
  $('.rd-read', D.reader).textContent = `${fmt(wordsRead)} read`;
  $('.rd-left', D.reader).innerHTML = `<b>${fmt(wordsLeft)}</b> left · ${fmtTime(wordsLeft / state.settings.wpm * 60)}`;
  $('.rd-pos', D.reader).textContent = pctText(i);
  $('.rd-tot', D.reader).textContent = fmtTime((R.total - i) > 0 ? (R.doc.words - wordsRead) / state.settings.wpm * 60 : 0);
}
const pctText = (i) => `${R?.finished ? 100 : Math.round((i / R.total) * 100)}%`;

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

/* ============================================================
   TEXT VIEW — full chapter as book-formatted text, with a read-line
   marker that tracks scroll and resumes RSVP from any word.
   ============================================================ */
const TV_BLOCK_CLASS = { h1:'tv-h1', h2:'tv-h2', h3:'tv-h3', p:'tv-p', li:'tv-li', quote:'tv-quote' };
// Old docs have chapters without `blocks` — derive them so the text view works.
const chapterBlocks = (ch) => ch.blocks?.length ? ch.blocks : mdToBlocks(ch.text || '', { markdown:false });

function openTextView() {
  if (!R || !R.ranges?.length) return;
  if (R.playing) pause();
  const ci = chapterIndexAt(R.idx);
  const chap = R.ranges[ci];
  const chDoc = R.doc.chapters[ci] || { title: R.doc.title, text: '' };
  const chunk = Math.max(1, state.settings.chunk);

  const tv = D.textview; clear(tv); tv.classList.remove('hidden');
  const top = el('div', { class:'tv-top' });
  top.append(el('button', { class:'icon-btn', html: ICON.x, 'aria-label':'Close', onclick: () => doResume() }));
  top.append(el('div', { class:'tv-title' }, chDoc.title || R.doc.title));
  top.append(el('button', { class:'icon-btn', html: ICON.toc, 'aria-label':'Contents',
    onclick: () => { closeTextView(); if (R.ranges.length > 1) openTOC(); } }));
  tv.append(top);

  const stageWrap = el('div', { class:'tv-stage' });
  const scroll = el('div', { class:'tv-scroll' });
  const inner = el('div', { class:'tv-inner' });
  // render blocks with one span per word (index = word position within chapter)
  const spans = [];
  for (const b of chapterBlocks(chDoc)) {
    const blk = el('div', { class: TV_BLOCK_CLASS[b.type] || 'tv-p' });
    for (const word of b.text.split(/\s+/).filter(Boolean)) {
      const s = document.createElement('span');
      s.className = 'tv-w'; s.dataset.w = spans.length; s.textContent = word;
      blk.append(s, document.createTextNode(' '));
      spans.push(s);
    }
    inner.append(blk);
  }
  scroll.append(inner);
  const chip = el('div', { class:'tv-chip', html: ICON.play });
  const chipPct = el('span', {}); chip.append(chipPct);
  stageWrap.append(scroll, el('div', { class:'tv-readline' }), chip);
  tv.append(stageWrap);
  const foot = el('div', { class:'tv-foot' });
  foot.append(el('div', { class:'tv-hint' }, 'Scroll to move the marker · tap a word to jump'));
  foot.append(el('button', { class:'btn', onclick: () => doResume() }, 'Resume reading'));
  tv.append(foot);

  const READ_FRAC = 0.42;
  // Map words ↔ flashes by accumulating each flash's word count — robust whatever
  // the flash shapes are (chunks, heading cards, etc.).
  const chFlashes = R.flashes.slice(chap.start, chap.end);
  const flashStartWord = []; let acc = 0;
  for (let f = 0; f < chFlashes.length; f++) { flashStartWord[f] = acc; acc += chFlashes[f].n; }
  const wordToFlash = (wd) => {
    let lo = 0, hi = chFlashes.length - 1, res = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (flashStartWord[mid] <= wd) { res = mid; lo = mid + 1; } else hi = mid - 1; }
    return chap.start + res;
  };
  let marker = flashStartWord[Math.max(0, Math.min(chFlashes.length - 1, R.idx - chap.start))] || 0;
  marker = Math.max(0, Math.min(spans.length - 1, marker));
  let offsets = null;
  const cacheOffsets = () => { offsets = spans.map(s => s.offsetTop + s.offsetHeight / 2); };

  function setMarker(w, scrollTo) {
    spans[marker]?.classList.remove('tv-cur');
    marker = Math.max(0, Math.min(spans.length - 1, w));
    spans[marker].classList.add('tv-cur');
    chipPct.textContent = ' ' + Math.round((wordToFlash(marker) / R.total) * 100) + '%';
    if (scrollTo && offsets) scroll.scrollTop = offsets[marker] - scroll.clientHeight * READ_FRAC;
  }
  function markerFromScroll() {
    if (!offsets) return;
    const y = scroll.scrollTop + scroll.clientHeight * READ_FRAC;
    let lo = 0, hi = offsets.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (offsets[mid] < y) lo = mid + 1; else hi = mid; }
    if (lo > 0 && Math.abs(offsets[lo - 1] - y) < Math.abs(offsets[lo] - y)) lo--;
    setMarker(lo, false);
  }
  // Direct (not rAF-gated) so it still tracks if the tab throttles rAF; the binary
  // search over cached offsets is cheap.
  scroll.addEventListener('scroll', markerFromScroll, { passive: true });
  inner.addEventListener('click', (e) => { const s = e.target.closest('.tv-w'); if (s) { haptic(6); setMarker(+s.dataset.w, true); } });

  // Span geometry changes when a non-preloaded reading font swaps in, or on
  // rotation/resize — recompute offsets and re-pin the marker so scroll tracking
  // and tap-to-jump stay accurate. (Listeners are cleaned up on close.)
  const recache = () => { if (!D.textview.classList.contains('hidden')) { cacheOffsets(); setMarker(marker, true); } };
  window.addEventListener('resize', recache);
  window.addEventListener('orientationchange', recache);
  if (document.fonts?.ready) document.fonts.ready.then(recache);

  function closeTextView() {
    window.removeEventListener('resize', recache);
    window.removeEventListener('orientationchange', recache);
    D.textview.classList.add('hidden');
  }
  function doResume() { closeTextView(); if (R) { seek(wordToFlash(marker)); play(); } }
  D.textview._resume = doResume; // for keyboard/back

  // first layout → cache offsets, place marker on the read-line (setTimeout, not
  // rAF, so it runs even if the tab throttles animation frames)
  setTimeout(() => { cacheOffsets(); setMarker(marker, true); }, 0);
}

function updateWpmLabel() { const v = $('.rd-wpmval', D.reader); if (v) v.innerHTML = `${state.settings.wpm}<small> wpm</small>`; }
function updatePlayBtn() {
  const b = $('.rd-play', D.reader); if (!b) return;
  // A finished doc shows a ↻ "Read again" affordance instead of play/pause.
  b.innerHTML = R.finished ? ICON.refresh : R.playing ? ICON.pause : ICON.play;
  b.classList.toggle('is-replay', !!R.finished);
}

function play() {
  if (!R || R.playing) return;
  if (R.finished) return; // completed → only "Read again" restarts (keeps the ✓ badge)
  // Paused past the final flash → the text was read to the end: finish it properly.
  // (No restart-from-0 here: openReader already resets non-finished docs that load
  // at the end, and idx is post-increment — flash idx-1 was the last one SHOWN.)
  if (R.idx >= R.total) { finishDoc(); return; }
  R.playing = true; R.sessionStart = performance.now(); R.sessionWords = 0;
  updatePlayBtn(); acquireWake();
  tick();
}
// Restart a finished text from the top WITHOUT clearing its permanent read status.
function readAgain() {
  if (!R) return;
  R.finished = false; R.done = false; R.idx = 0;
  const chip = $('.rd-done', D.reader); if (chip) chip.remove();
  renderFlash(R.idx); updatePlayBtn(); play();
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
    // Attribute the session's words to this doc's topics for the Interests aggregate
    // (before addReading so topic-breadth achievements can unlock in the same pass).
    const topics = R.doc.topics || [];
    if (topics.length) { state.game.topicWords = state.game.topicWords || {}; for (const t of topics) state.game.topicWords[t] = (state.game.topicWords[t] || 0) + R.sessionWords; }
    addReading(R.sessionWords, secs, actualWpm);
    // visit totals feed the post-session summary
    R.visitWords = (R.visitWords || 0) + R.sessionWords;
    R.visitSecs = (R.visitSecs || 0) + secs;
    R.visitWpm = Math.max(R.visitWpm || 0, actualWpm);
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
  // Count a text toward "finished" only the FIRST time it completes, so re-reads
  // don't inflate the tally (the permanent ✓ read badge is separate).
  const wasFinished = R.vaultCtx ? !!R.vaultCtx.vaultDoc.notes[R.vaultCtx.i].finished : !!R.doc.finished;
  R.finished = true;
  writeProgress(true);
  if (!wasFinished) state.game.finished = (state.game.finished || 0) + 1;
  state.game.finishedToday = (state.game.finishedToday || 0) + 1;
  updateQuests();
  checkAchievements(); save();
  updatePlayBtn(); showDoneBanner(); // completed state appears immediately, not just on reopen
  // In a vault, advance to the next unread note automatically; else the summary celebrates.
  if (R.vaultCtx && R.vaultCtx.i < R.vaultCtx.vaultDoc.notes.length - 1) {
    achievementToast('✅', 'Note done — next up');
    setTimeout(() => gotoNote(1), 900);
  } else {
    showSummary({ finished: true });
  }
}
// Persist progress to the right place: a standalone doc, or a note inside a vault.
function writeProgress(finalize) {
  if (!R) return;
  const prog = finalize ? 1 : R.idx / R.total;
  const idx = finalize ? R.total - 1 : R.idx;
  if (R.vaultCtx) {
    const { vaultDoc, i } = R.vaultCtx;
    const note = vaultDoc.notes[i];
    note.idx = idx; note.progress = prog; vaultDoc.lastOpened = Date.now();
    if (finalize) { note.finished = true; note.finishedAt = Date.now(); } // set once, never cleared
    putDoc(vaultDoc);
  } else {
    R.doc.idx = idx; R.doc.progress = prog; R.doc.lastOpened = Date.now();
    if (finalize) { R.doc.finished = true; R.doc.finishedAt = Date.now(); } // set once, never cleared
    putDoc(R.doc);
  }
}
function saveProgress() { writeProgress(R && R.done); }
function closeReader() {
  const vaultCtx = R?.vaultCtx;
  if (R) { pause(); saveProgress(); }
  // A meaningful visit that ends without a natural finish still deserves its summary
  // (the live feedback loop) — only once per visit.
  const wantSummary = R && !R.summaryShown && !vaultCtx && (R.visitWords || 0) >= 250;
  const visit = R ? { words: R.visitWords, secs: R.visitSecs, wpm: R.visitWpm, xpAtOpen: R.xpAtOpen, streakWasEarned: R.streakWasEarned } : null;
  R = null;
  D.reader.classList.add('hidden');
  if (vaultCtx) openVaultBrowser(vaultCtx.vaultDoc.id); // back to vault, progress refreshed
  else showView('home');
  if (wantSummary) showSummaryFor(visit, false);
}

/* ---------- post-session summary (the Duolingo-style feedback loop) ----------
   Choreography: title → stat cards deal in with count-ups → quest bars fill →
   streak tick (first earn of the day) → milestone takeover → explicit "done for
   today" exit signal when the goal is met. */
function showSummary(opts = {}) {
  if (!R || R.summaryShown) return;
  R.summaryShown = true;
  showSummaryFor({ words: R.visitWords, secs: R.visitSecs, wpm: R.visitWpm,
    xpAtOpen: R.xpAtOpen, streakWasEarned: R.streakWasEarned }, !!opts.finished);
}

// simple count-up (setTimeout, not rAF — must animate even in throttled tabs)
function countUp(node, to, format = (v) => fmt(v), dur = 700) {
  const steps = 18; let i = 0;
  const tick = () => { i++; node.textContent = format(Math.round(to * (i / steps))); if (i < steps) setTimeout(tick, dur / steps); };
  if (to <= 0) { node.textContent = format(0); return; }
  tick();
}

function showSummaryFor(visit, finished) {
  const g = state.game;
  const earnedNow = streakEarnedToday() && !visit.streakWasEarned;
  const ds = displayStreak();
  const milestone = earnedNow && MILESTONES.includes(ds) && !(g.milestonesSeen || []).includes(ds) ? ds : 0;
  const xpGained = Math.max(0, g.xp - (visit.xpAtOpen ?? g.xp));
  const goalMet = g.wordsToday >= (state.profile.dailyGoalWords || Infinity);

  const wrap = el('div', { class:'summary' });
  const card = el('div', { class:'sum-card' });
  card.append(el('div', { class:'sum-title' }, finished ? 'Text finished! 🏁' : 'Session complete!'));

  // stat cards, dealt in one by one
  const stats = el('div', { class:'sum-stats' });
  const mkStat = (cls, label, delay) => {
    const v = el('b', {}, '0');
    const s = el('div', { class:'sum-stat ' + cls, style:`animation-delay:${delay}ms` }, v, el('span', {}, label));
    stats.append(s); return v;
  };
  const vWords = mkStat('gold', 'words', 0);
  const vWpm = mkStat('blue', 'WPM', 140);
  const vTime = mkStat('green', 'time', 280);
  const vXp = mkStat('violet', 'XP earned', 420);
  card.append(stats);

  // quest bars (fill after the cards land)
  ensureQuests();
  const qwrap = el('div', { class:'sum-quests' });
  const fills = [];
  for (const q of g.quests) {
    const pr = questProgress(q), pct = Math.min(100, Math.round((pr / q.target) * 100));
    const row = el('div', { class:'quest sm' + (q.done ? ' done' : '') });
    row.append(el('span', { class:'q-medal' }, QUEST_MEDAL[q.tier]));
    const mid = el('div', { class:'q-mid' });
    mid.append(el('div', { class:'q-label' }, q.label));
    const bar = el('div', { class:'q-bar' }); const fill = el('i', { style:'width:0%' });
    bar.append(fill); mid.append(bar); row.append(mid);
    row.append(el('span', { class:'q-state' }, q.done ? '✓' : ''));
    qwrap.append(row); fills.push([fill, pct]);
  }
  card.append(qwrap);

  // streak strip — flame ignites when today was just earned
  if (earnedNow) {
    const strip = el('div', { class:'sum-streak' });
    strip.append(el('span', { class:'flame', html: ICON.flame }));
    const n = el('b', {}, String(Math.max(0, ds - 1)));
    strip.append(n, el('span', {}, ds === 1 ? 'streak started!' : 'day streak'));
    card.append(strip);
    setTimeout(() => { strip.classList.add('lit'); n.textContent = String(ds); haptic(14); }, 900);
  }
  if (goalMet) card.append(el('div', { class:'sum-doneline' }, '✓ You’re done for today. See you tomorrow!'));

  card.append(el('button', { class:'btn', style:'margin-top:14px', onclick:() => {
    if (milestone) { renderMilestone(wrap, milestone); return; }
    wrap.remove(); if (!D.home.classList.contains('hidden')) renderHome();
  } }, milestone ? 'Continue' : 'Done'));
  wrap.append(card);
  document.body.append(wrap);

  // run the choreography
  setTimeout(() => countUp(vWords, visit.words || 0), 60);
  setTimeout(() => countUp(vWpm, visit.wpm || 0, v => String(v)), 200);
  setTimeout(() => { vTime.parentElement.querySelector('b').textContent = fmtTime(visit.secs || 0); }, 340);
  setTimeout(() => countUp(vXp, xpGained, v => '+' + v), 480);
  setTimeout(() => { for (const [f, p] of fills) f.style.width = p + '%'; }, 650);
}

// Full-screen milestone celebration (3/7/30/100/365) — shown once per milestone.
function renderMilestone(wrap, ms) {
  const g = state.game;
  g.milestonesSeen = g.milestonesSeen || []; g.milestonesSeen.push(ms); save();
  clear(wrap);
  const card = el('div', { class:'sum-card milestone' });
  for (let i = 0; i < 24; i++) card.append(el('span', { class:'confetti', style:`--i:${i}` }));
  card.append(el('span', { class:'flame giant', html: ICON.flame }));
  const n = el('div', { class:'ms-n' }, String(ms - 1));
  card.append(n, el('div', { class:'ms-l' }, `${ms}-day streak!`));
  card.append(el('div', { class:'ms-sub' }, ms >= 30 ? 'You’re unstoppable.' : 'A real habit is forming.'));
  const share = el('button', { class:'btn ghost sm', onclick: shareStats }, 'Share it');
  const done = el('button', { class:'btn sm', onclick:() => { wrap.remove(); if (!D.home.classList.contains('hidden')) renderHome(); } }, 'Keep reading');
  card.append(el('div', { class:'ms-btns' }, share, done));
  wrap.append(card);
  haptic(20);
  setTimeout(() => { n.textContent = String(ms); n.classList.add('pop'); }, 500);
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
  if (!D.textview.classList.contains('hidden')) { if (e.key === 'Escape') D.textview._resume?.(); return; }
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
  body.append(themeRow()); // Kindle-style: switch display theme without leaving the book
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

// Earliest day the user actually read anything (for a fair daily-average divisor).
function firstActivityDate() {
  const keys = Object.keys(state.game.history).filter(k => state.game.history[k] > 0).sort();
  return keys.length ? new Date(keys[0] + 'T00:00') : startOfToday();
}

// Sum words in [start, end] (inclusive) from the daily history map.
function sumWindow(start, end) {
  let total = 0, best = 0, active = 0;
  for (const [k, w] of Object.entries(state.game.history)) {
    const d = new Date(k + 'T00:00');
    if (d >= start && d <= end && w > 0) { total += w; active++; if (w > best) best = w; }
  }
  return { total, best, active };
}

// KPIs for the selected window, read from the all-time daily history map.
function rangeStats(range) {
  const start = rangeStartDate(range), today = startOfToday();
  const { total, best, active } = sumWindow(start, today);
  const spanDays = Math.max(1, Math.round((today - start) / DAY) + 1);
  // Divide the daily average by days actually elapsed since first use (capped to the
  // window) — NOT the full window — so a day-one user isn't averaged over 7 empty days.
  const first = firstActivityDate();
  const elapsed = Math.max(1, Math.min(spanDays, Math.round((today - Math.max(+first, +start)) / DAY) + 1));
  // Previous equal-length window, for a period-over-period delta.
  const prevEnd = new Date(+start - DAY), prevStart = new Date(+start - spanDays * DAY);
  const prevTotal = sumWindow(prevStart, prevEnd).total;
  const delta = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : (total > 0 ? 100 : 0);
  return {
    total, best, active, spanDays, elapsedDays: elapsed, prevTotal, delta,
    dailyAvg: Math.round(total / elapsed),
    perActiveDay: Math.round(total / Math.max(1, active)),
  };
}

// Chart buckets: ≤12 clean bars whatever the timeframe.
function chartBuckets(range) {
  const now = startOfToday();
  const monthlySum = (y, m) => Object.entries(state.game.history)
    .filter(([k]) => { const [Y, M] = k.split('-').map(Number); return Y === y && M - 1 === m; })
    .reduce((s, [, w]) => s + w, 0);
  const out = [];
  // each bucket also carries `full` — a descriptive label for the hover tooltip.
  if (range === 'week') {
    for (let i = 6; i >= 0; i--) { const d = new Date(now - i * DAY); out.push({ label:'SMTWTFS'[d.getDay()], full: d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' }), value: dayWords(d) }); }
  } else if (range === 'month') {
    for (let i = 3; i >= 0; i--) {
      let s = 0; for (let j = 0; j < 7; j++) s += dayWords(new Date(now - (i * 7 + j) * DAY));
      out.push({ label: i === 0 ? 'now' : `-${i}w`, full: i === 0 ? 'This week' : i === 1 ? 'Last week' : `${i} weeks ago`, value: s });
    }
  } else if (range === 'quarter' || range === 'year') {
    const n = range === 'quarter' ? 3 : 12;
    for (let i = n - 1; i >= 0; i--) { const m = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push({ label:'JFMAMJJASOND'[m.getMonth()], full: m.toLocaleDateString(undefined, { month:'long', year:'numeric' }), value: monthlySum(m.getFullYear(), m.getMonth()) }); }
  } else {
    const years = {};
    for (const [k, w] of Object.entries(state.game.history)) { const y = k.slice(0, 4); years[y] = (years[y] || 0) + w; }
    const keys = Object.keys(years).sort();
    (keys.length ? keys : [String(now.getFullYear())]).forEach(y => out.push({ label:"'" + y.slice(2), full: y, value: years[y] || 0 }));
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
  const avgWpm = g.totalSeconds > 0 ? Math.round(g.totalWords / (g.totalSeconds / 60)) : 0;
  const minutesSaved = Math.max(0, (g.totalWords / baselineWPM) - (g.totalSeconds / 60));
  const grid = el('div', { class:'stat-grid' });
  const stat = (n, k, grad, delta) => {
    const s = el('div', { class:'stat' }, el('div', { class:'n' + (grad ? ' grad' : '') }, n), el('div', { class:'k' }, k));
    if (delta != null && delta !== 0 && statsRange !== 'all')
      s.insertBefore(el('div', { class:'delta ' + (delta > 0 ? 'up' : 'down') }, `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}%`), s.firstChild);
    return s;
  };
  grid.append(stat(fmt(rs.total), 'words read', true, rs.delta));
  grid.append(stat(fmt(rs.dailyAvg), 'daily average', true));
  grid.append(stat(fmt(rs.best), 'best day'));
  grid.append(stat(statsRange === 'all' ? `${rs.active}` : `${rs.active}/${rs.elapsedDays}`, statsRange === 'all' ? 'active days' : 'days active'));
  grid.append(stat(`${avgWpm}`, 'avg WPM'));
  grid.append(stat(`${g.bestWpm || 0}`, 'best WPM'));
  grid.append(stat(`${g.streak || 0} 🔥`, 'day streak'));
  grid.append(stat(`${g.finished || 0}`, 'texts finished'));
  grid.append(stat(fmtTime(g.totalSeconds || 0), 'time read'));
  v.append(grid);

  // trend chart (line + area + regression trend line)
  v.append(el('div', { class:'sec-title' }, el('h3', {}, RANGES[statsRange]),
    el('a', {}, `${fmtTime(minutesSaved * 60)} saved`)));
  v.append(lineChart(chartBuckets(statsRange)));

  // interests (aggregate topics) — filled below the chart
  v.append(renderInterests());

  // achievements — grouped, earned first within each group
  const gotCount = ACHIEVEMENTS.filter(a => g.achievements.includes(a.id)).length;
  v.append(el('div', { class:'sec-title' }, el('h3', {}, 'Achievements'), el('a', {}, `${gotCount}/${ACHIEVEMENTS.length}`)));
  for (const grp of [...new Set(ACHIEVEMENTS.map(a => a.g))]) {
    const items = ACHIEVEMENTS.filter(a => a.g === grp)
      .sort((a, b) => (g.achievements.includes(b.id) ? 1 : 0) - (g.achievements.includes(a.id) ? 1 : 0));
    const recs = el('div', { class:'card records', style:'padding:4px 16px' });
    for (const a of items) {
      const got = g.achievements.includes(a.id);
      recs.append(el('div', { class:'rec' + (got ? '' : ' locked') },
        el('span', { class:'e' }, a.e), el('span', {}, a.t), el('span', { class:'v' }, got ? '✓' : '🔒')));
    }
    v.append(el('div', { class:'ach-group' }, grp), recs);
  }
}

// SVG line/area chart with a dashed regression trend line and a hover/touch tooltip
// that reads out each bucket's words read + reading time + share of the period.
function lineChart(buckets) {
  const W = 320, H = 132, padX = 12, padTop = 14, padBot = 22;
  const n = buckets.length;
  const max = Math.max(1, ...buckets.map(b => b.value));
  const periodTotal = buckets.reduce((s, b) => s + b.value, 0);
  const innerW = W - padX * 2, innerH = H - padTop - padBot, base = padTop + innerH;
  const x = (i) => n <= 1 ? W / 2 : padX + (i / (n - 1)) * innerW;
  const y = (val) => padTop + innerH - (val / max) * innerH;
  const pts = buckets.map((b, i) => [x(i), y(b.value)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const area = n ? `${line} L${x(n - 1).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z` : '';
  let trend = '';
  if (n >= 2) {
    const mx = (n - 1) / 2, my = periodTotal / n;
    let num = 0, den = 0;
    buckets.forEach((b, i) => { num += (i - mx) * (b.value - my); den += (i - mx) ** 2; });
    const slope = den ? num / den : 0, b0 = my - slope * mx;
    const clamp = (v) => Math.max(0, Math.min(max, v));
    trend = `<line x1="${x(0)}" y1="${y(clamp(b0)).toFixed(1)}" x2="${x(n - 1)}" y2="${y(clamp(b0 + slope * (n - 1))).toFixed(1)}" class="lc-trend"/>`;
  }
  const dots = pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6" class="lc-dot"/>`).join('');
  const labels = buckets.map((b, i) => `<text x="${x(i).toFixed(1)}" y="${H - 6}" class="lc-lbl">${b.label}</text>`).join('');
  const svg = `<svg viewBox="0 0 ${W} ${H}" class="lc"><defs><linearGradient id="lcfill" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="var(--a1)" stop-opacity="0.32"/><stop offset="1" stop-color="var(--a1)" stop-opacity="0"/></linearGradient></defs>` +
    `<line class="lc-cross" x1="0" y1="${padTop}" x2="0" y2="${base}" opacity="0"/>` +
    `<path d="${area}" fill="url(#lcfill)" stroke="none"/><path d="${line}" class="lc-line"/>${trend}${dots}` +
    `<circle class="lc-active" r="4.5" opacity="0"/>${labels}</svg>`;

  const card = el('div', { class:'card linechart', html: svg });
  const tip = el('div', { class:'lc-tip hidden' });
  card.append(tip);
  const cross = card.querySelector('.lc-cross'), active = card.querySelector('.lc-active');

  const showAt = (clientX) => {
    const r = card.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    let bi = 0, bestd = Infinity;
    for (let i = 0; i < n; i++) { const d = Math.abs(x(i) / W - frac); if (d < bestd) { bestd = d; bi = i; } }
    const b = buckets[bi], px = x(bi);
    cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('opacity', '1');
    active.setAttribute('cx', px); active.setAttribute('cy', y(b.value)); active.setAttribute('opacity', '1');
    const mins = b.value ? fmtTime(b.value / Math.max(60, state.settings.wpm) * 60) : '—';
    const share = periodTotal ? Math.round((b.value / periodTotal) * 100) : 0;
    tip.innerHTML = `<div class="lc-tip-t">${b.full || b.label}</div>` +
      `<div class="lc-tip-v">${fmt(b.value)} words</div>` +
      `<div class="lc-tip-s">${mins}${periodTotal ? ` · ${share}% of period` : ''}</div>`;
    tip.style.left = (px / W) * 100 + '%';
    tip.dataset.side = px / W > 0.72 ? 'r' : px / W < 0.28 ? 'l' : 'c';
    tip.classList.remove('hidden');
  };
  const hide = () => { tip.classList.add('hidden'); cross.setAttribute('opacity', '0'); active.setAttribute('opacity', '0'); };

  card.addEventListener('pointermove', (e) => showAt(e.clientX));
  card.addEventListener('pointerdown', (e) => { haptic(4); showAt(e.clientX); });
  card.addEventListener('pointerleave', hide);
  card.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') hide(); });
  card.addEventListener('pointercancel', hide);
  return card;
}

// Aggregate "Interests" from the running topic->words map (built as you read).
function renderInterests() {
  const tw = state.game.topicWords || {};
  const entries = Object.entries(tw).filter(([t, w]) => w > 0 && t !== 'General').sort((a, b) => b[1] - a[1]);
  const wrap = el('div', {});
  wrap.append(el('div', { class:'sec-title' }, el('h3', {}, 'Interests'),
    el('a', {}, entries.length ? `${entries.length} topics` : '')));
  if (!entries.length) {
    wrap.append(el('div', { class:'card', style:'padding:16px;color:var(--faint);font-size:13px;text-align:center' },
      'Read a few texts and your top topics will appear here.'));
    return wrap;
  }
  const top = entries.slice(0, 6);
  const max = top[0][1] || 1;
  const summary = top.slice(0, 3).map(([t]) => t).join(', ');
  wrap.append(el('div', { class:'interest-sum' }, `Mostly ${summary}.`));
  const card = el('div', { class:'card', style:'padding:12px 16px' });
  for (const [topic, w] of top) {
    const row = el('div', { class:'interest-row' });
    row.append(el('div', { class:'ir-top' }, el('span', { class:'ir-name' }, topic), el('span', { class:'ir-val' }, `${fmt(w)} words`)));
    const bar = el('div', { class:'ir-bar' }); bar.append(el('i', { style:`width:${Math.max(4, (w / max) * 100)}%` }));
    row.append(bar);
    card.append(row);
  }
  wrap.append(card);
  return wrap;
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
  g2.append(themeRow(() => renderProfile())); // re-render: lock themes hide the Accent row
  if (!THEMES[state.settings.theme]?.lock) g2.append(accentRow());
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
// Kindle-style display theme picker: "Aa" swatches previewing each theme's page + ink.
// onPick lets callers re-render around the change (profile hides Accent for lock themes).
function themeRow(onPick) {
  const row = el('div', { class:'set theme-set' });
  row.append(el('div', { class:'st' }, 'Theme'));
  const sw = el('div', { class:'theme-swatches' });
  for (const [k, t] of Object.entries(THEMES)) {
    const b = el('button', { class:'tswatch' + (state.settings.theme === k ? ' on' : '') },
      el('span', { class:'tsw-chip', style:`background:${t.sw[0]};color:${t.sw[1]}` }, 'Aa'),
      el('span', { class:'tsw-name' }, t.name));
    b.addEventListener('click', () => {
      state.settings.theme = k; applyTheme(); save(); haptic(6);
      [...sw.querySelectorAll('.tswatch')].forEach(c => c.classList.remove('on')); b.classList.add('on');
      onPick?.(k);
    });
    sw.append(b);
  }
  row.append(sw);
  return row;
}
function fontRow(inGroup) {
  const row = el('button', { class:'set', style:'width:100%;text-align:left', onclick: fontSheet });
  const f = FONTS[state.settings.font] || FONTS.lexend; // guard unknown font from an imported/old backup
  row.append(el('div', { class:'st' }, 'Reading font'));
  row.append(el('div', { class:'sv', style:`font-family:${f.css}` }, f.name));
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
// Goal picker framed in minutes/day (Duolingo commitment framing), mapped to words
// via the user's own speed, plus a custom words stepper. Nothing applies until
// "Commit to my goal" — an active choice, not a passive dial.
function goalSheet() {
  const body = el('div', { class:'stack' });
  const wpm = Math.max(150, state.settings.wpm);
  const tiers = [
    { name:'Casual',  mins:5 },  { name:'Regular', mins:10 },
    { name:'Serious', mins:15 }, { name:'Intense', mins:20 },
  ].map(t => ({ ...t, words: Math.max(200, Math.round((t.mins * wpm) / 100) * 100) }));
  let pick = state.profile.dailyGoalWords || 2000;
  const rows = [];
  const custom = el('div', { class:'goal-custom' });
  const cVal = el('b', {}, fmt(pick));
  const syncSel = () => {
    rows.forEach(([b, w]) => b.classList.toggle('sel', pick === w));
    custom.classList.toggle('sel', !tiers.some(t => t.words === pick));
    cVal.textContent = fmt(pick);
  };
  for (const t of tiers) {
    const b = el('button', { class:'opt' },
      el('div', {}, el('div', { class:'opt-t' }, `${t.name} — ${t.mins} min/day`),
        el('div', { class:'opt-d' }, `${fmt(t.words)} words at your ${wpm} WPM`)),
      el('span', { class:'tick', html: ICON.check }));
    b.addEventListener('click', () => { pick = t.words; haptic(6); syncSel(); });
    rows.push([b, t.words]); body.append(b);
  }
  const step = (d) => { pick = Math.max(200, Math.min(50000, pick + d)); haptic(4); syncSel(); };
  custom.append(el('button', { class:'icon-btn sm', onclick:() => step(-250), html:'<span style="font-size:20px">−</span>' }),
    el('div', { class:'goal-custom-v' }, 'Custom: ', cVal, ' words'),
    el('button', { class:'icon-btn sm', onclick:() => step(250), html:'<span style="font-size:20px">+</span>' }));
  body.append(custom);
  body.append(el('button', { class:'btn', onclick:() => {
    state.profile.dailyGoalWords = pick; save(); haptic(10); closeSheet();
    toast('Goal committed 🎯');
    if (!D.home.classList.contains('hidden')) renderHome();
    if (!D.profile.classList.contains('hidden')) renderProfile();
  } }, 'Commit to my goal'));
  syncSel();
  sheet({ title:'Daily reading goal', sub:'How much do you want to read each day?', body });
}

/* ---------- daily quest card (home) ---------- */
function questCard() {
  ensureQuests();
  const g = state.game;
  const card = el('div', { class:'card quest-card' });
  card.append(el('div', { class:'qc-head' }, el('span', {}, 'Daily quests'),
    el('span', { class:'qc-count' }, `${g.quests.filter(q => q.done).length}/3`)));
  for (const q of g.quests) {
    const pr = questProgress(q), pct = Math.min(100, Math.round((pr / q.target) * 100));
    const row = el('div', { class:'quest' + (q.done ? ' done' : '') });
    row.append(el('span', { class:'q-medal' }, QUEST_MEDAL[q.tier]));
    const mid = el('div', { class:'q-mid' });
    mid.append(el('div', { class:'q-label' }, q.label));
    const bar = el('div', { class:'q-bar' }); bar.append(el('i', { style:`width:${pct}%` }));
    mid.append(bar);
    row.append(mid);
    row.append(el('span', { class:'q-state' }, q.done ? '✓' : q.metric === 'secondsToday' ? `${Math.floor(pr / 60)}/${Math.floor(q.target / 60)}` : `${fmt(pr)}/${fmt(q.target)}`));
    card.append(row);
  }
  return card;
}

/* ---------- streak calendar sheet ---------- */
function streakSheet() {
  const g = state.game;
  const body = el('div', { class:'stack' });
  const ds = displayStreak();
  const head = el('div', { class:'streak-hero' + (streakEarnedToday() ? ' lit' : '') });
  head.append(el('span', { class:'flame big', html: ICON.flame }), el('div', { class:'sh-n' }, String(ds)),
    el('div', { class:'sh-l' }, ds === 1 ? 'day streak' : 'day streak'));
  body.append(head);
  if (!streakEarnedToday()) body.append(el('div', { class:'sh-hint' },
    ds > 0 ? `Read ${STREAK_DAY_WORDS}+ words today to keep it going` : `Read ${STREAK_DAY_WORDS}+ words to start a streak`));

  // month grid
  const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y, m, 1), startDow = first.getDay(), days = new Date(y, m + 1, 0).getDate();
  const grid = el('div', { class:'cal-grid' });
  for (const d of ['S','M','T','W','T','F','S']) grid.append(el('span', { class:'cal-dow' }, d));
  for (let i = 0; i < startDow; i++) grid.append(el('span', {}));
  const todayK = dayKey();
  for (let d = 1; d <= days; d++) {
    const k = dayKey(new Date(y, m, d));
    const read = (g.history[k] || 0) >= STREAK_DAY_WORDS;
    const frozen = !!(g.frozenDays || {})[k];
    const cell = el('span', { class:'cal-day' + (read ? ' read' : '') + (frozen ? ' frozen' : '') + (k === todayK ? ' today' : '') });
    cell.append(read ? el('i', { class:'flame', html: ICON.flame }) : frozen ? el('i', {}, '❄') : el('i', { class:'cal-n' }, String(d)));
    grid.append(cell);
  }
  body.append(el('div', { class:'card', style:'padding:14px' }, grid));

  // footer facts
  const next = MILESTONES.find(ms => ms > ds);
  const facts = el('div', { class:'streak-facts' });
  facts.append(el('div', { class:'sf' }, el('b', {}, `❄ ${g.freezes || 0}/${MAX_FREEZES}`), el('span', {}, 'freezes held')));
  if (next) facts.append(el('div', { class:'sf' }, el('b', {}, `${next - ds}`), el('span', {}, `days to ${next}-day milestone`)));
  facts.append(el('div', { class:'sf' }, el('b', {}, String(g.longestStreak || 0)), el('span', {}, 'longest ever')));
  body.append(facts);
  body.append(el('div', { class:'sh-hint' }, 'Freezes are earned every 7 days in a row and protect your streak automatically if you miss a day.'));
  sheet({ title:'Your streak', body });
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
