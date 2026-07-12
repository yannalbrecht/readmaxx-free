#!/usr/bin/env node
/* build-catalog.mjs — generates library/catalog.json (+ bundled texts) for Discover.
 *
 * Sources:
 *  1. The Essay Library folder (--essays <path>): 10 seed authors. Only METADATA is
 *     committed for living authors (mode 'web' → the app fetches from SOURCE_URL at
 *     download time, Instapaper-style). Derek Sivers is bundled (his footer reads
 *     "© Derek Sivers · Copy & share"). Housel/McCormick/Munger are 'link' (their
 *     ToS forbid automated fetching → open in browser).
 *  2. The Almanack of Naval Ravikant: chapter-level 'web' entries (navalmanack.com
 *     hosts the whole book free — "This project is a public service").
 *  3. Public-domain classics (--fetch-classics): downloaded once from Project
 *     Gutenberg, boilerplate stripped (their license explicitly permits this),
 *     bundled into library/texts/classics/.
 *
 * Usage:
 *   node scripts/build-catalog.mjs --essays "<path to Essay Library>" [--fetch-classics] [--bundle-all]
 *   --bundle-all  bundles every essay's full text (PRIVATE deployments only).
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'library');
const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ESSAYS = arg('--essays');
const FETCH_CLASSICS = args.includes('--fetch-classics');
const BUNDLE_ALL = args.includes('--bundle-all');

const FETCH_NAVAL = args.includes('--fetch-naval');
const FETCH_IMAGES = args.includes('--fetch-images');

const words = (t) => (t.match(/\S+/g) || []).length;
const slug = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// short preview snippet (search-result style — a preview, not redistribution)
function excerpt(text, n = 320) {
  let s = (text || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')          // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')         // links (including empty [ ]( ) )
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/https?:\/\/\S+/g, ' ')                 // bare URLs
    .replace(/[*_`>#|=]/g, '')
    .replace(/\s+/g, ' ').trim()
    .replace(/^[^A-Za-z0-9"'“]+/, '');               // trim leading junk/punctuation
  if (s.length <= n) return s;
  s = s.slice(0, n);
  return s.slice(0, s.lastIndexOf(' ')).trim() + '…';
}
// Wikipedia thumbnail for an author name (app falls back to initials if absent).
// Wikipedia REQUIRES a descriptive User-Agent and throttles rapid anonymous calls.
const WIKI_UA = { 'User-Agent': 'ReadMaxxCatalogBuilder/1.0 (https://readmaxx-free.vercel.app; catalog build script)' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function wikiImage(name) {
  try {
    const u = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=thumbnail&pithumbsize=240&redirects=1&titles=${encodeURIComponent(name)}`;
    const r = await fetch(u, { headers: WIKI_UA }); if (!r.ok) return null;
    const pages = (await r.json())?.query?.pages || {};
    for (const p of Object.values(pages)) if (p.thumbnail?.source) return p.thumbnail.source;
  } catch {}
  return null;
}

/* per-author distribution mode (see docs/discover-library-plan.md §3) */
const AUTHOR_MODE = {
  'derek-sivers': 'bundled',           // explicit "Copy & share" footer
  'morgan-housel': 'link',             // Collab Fund ToS bans automated fetching
  'packy-mccormick': 'link',           // Substack ToS
  'charlie-munger': 'link',            // copyrighted speeches — link to authorized copies
};
const PHASES = {
  'shane-parrish': 1, 'paul-graham': 1, 'dan-koe': 1,
  'tiago-forte': 2, 'cal-newport': 2,
  'morgan-housel': 3, 'charlie-munger': 3,
  'david-perell': 4, 'derek-sivers': 4,
  'packy-mccormick': 5,
};
const PHASE_NAMES = { 1:'Foundation', 2:'Organization & Leverage', 3:'Deeper Perspectives', 4:'Creative Expression', 5:'Big Picture', 6:'Timeless Classics', 7:'Free Books', 8:'Your Bookshelf' };

const catalog = { version: 1, updated: new Date().toISOString().slice(0, 10), authors: [], texts: [], collections: [] };

// reuse previously-fetched Naval counts + author images so re-runs don't re-fetch
let prevText = {}, prevAuthor = {};
try {
  const prev = JSON.parse(readFileSync(join(OUT, 'catalog.json'), 'utf8'));
  for (const t of prev.texts) prevText[t.id] = t;
  for (const a of prev.authors) prevAuthor[a.id] = a;
} catch {}

/* ---------- 1. Essay Library ---------- */
if (ESSAYS && existsSync(ESSAYS)) {
  const authorsDir = join(ESSAYS, 'Authors');
  for (const dir of readdirSync(authorsDir).sort()) {
    const m = dir.match(/^(\d+)_(.+)$/); if (!m) continue;
    const name = m[2].replace(/_/g, ' ').replace(/ FarnamStreet$/, '');
    const id = slug(name);
    const mode = BUNDLE_ALL ? 'bundled' : (AUTHOR_MODE[id] || 'web');
    // profile → tagline (first sentence) + bio (first paragraph)
    let tagline = '', bio = '';
    const profPath = join(authorsDir, dir, '00_Profile_and_Why_Important.txt');
    if (existsSync(profPath)) {
      let prof = readFileSync(profPath, 'utf8').trim();
      const hd = prof.indexOf('\n---'); // some profiles carry a TITLE:/AUTHOR: header block
      if (/^TITLE:/m.test(prof.slice(0, 200)) && hd > 0) prof = prof.slice(prof.indexOf('\n', hd + 2) + 1).trim();
      const paras = prof.split(/\n\s*\n/).filter(p => p.trim() && !/^(TITLE|AUTHOR|DATE|SOURCE_URL|TAGS):/m.test(p));
      bio = (paras[0] || '').replace(/\s+/g, ' ').trim();
      tagline = (bio.match(/^.*?[.!?](?=\s|$)/) || [bio.slice(0, 120)])[0];
    }
    const essaysDir = join(authorsDir, dir, 'Essays');
    if (!existsSync(essaysDir)) continue;
    let count = 0;
    for (const f of readdirSync(essaysDir).sort()) {
      if (!f.endsWith('.txt')) continue;
      const raw = readFileSync(join(essaysDir, f), 'utf8');
      const hEnd = raw.indexOf('\n---');
      const head = hEnd > 0 ? raw.slice(0, hEnd) : '';
      const body = hEnd > 0 ? raw.slice(raw.indexOf('\n', hEnd + 2) + 1).trim() : raw.trim();
      const get = (k) => (head.match(new RegExp('^' + k + ':\\s*(.+)$', 'm')) || [])[1]?.trim() || '';
      const title = get('TITLE') || f.replace(/\.txt$/, '').replace(/^[\d-]+/, '').replace(/-/g, ' ');
      const url = get('SOURCE_URL');
      const entry = {
        id: `${id}--${slug(title)}`, authorId: id, title,
        date: get('DATE') || null, words: words(body),
        tags: get('TAGS') ? get('TAGS').split(',').map(t => t.trim()).slice(0, 4) : [],
        src: mode, url: url || null, preview: excerpt(body),
      };
      if (mode === 'bundled') {
        const tdir = join(OUT, 'texts', id); mkdirSync(tdir, { recursive: true });
        const file = `${slug(title)}.txt`;
        const attribution = id === 'derek-sivers' ? `\n\n— © Derek Sivers · ${url || 'sive.rs'} (copy & share)` : '';
        writeFileSync(join(tdir, file), body + attribution);
        entry.path = `library/texts/${id}/${file}`;
      }
      if (mode === 'link' && !url) continue; // a link entry without a URL is useless
      catalog.texts.push(entry); count++;
    }
    if (count) catalog.authors.push({ id, name, tagline, bio, phase: PHASES[id] || 5, order: +m[1], texts: count });
  }
} else if (ESSAYS) {
  console.error('Essay Library path not found:', ESSAYS); process.exit(1);
}

/* ---------- 2. The Almanack of Naval Ravikant (free official site) ---------- */
const NAVAL_BASE = 'https://www.navalmanack.com/almanack-of-naval-ravikant/';
const NAVAL = [
  ['Understand How Wealth Is Created', 'understanding-how-wealth-is-created', 'Wealth'],
  ['Find and Build Specific Knowledge', 'find-and-build-specific-knowledge', 'Wealth'],
  ['Play Long-Term Games with Long-Term People', 'play-long-term-games-with-long-term-people', 'Wealth'],
  ['Take on Accountability', 'take-on-accountability', 'Wealth'],
  ['Build or Buy Equity in a Business', 'build-or-buy-equity-in-a-business', 'Wealth'],
  ['Find a Position of Leverage', 'find-a-position-of-leverage', 'Wealth'],
  ['Get Paid for Your Judgment', 'get-paid-for-your-judgment', 'Wealth'],
  ['Prioritize and Focus', 'prioritize-and-focus', 'Wealth'],
  ['Find Work That Feels Like Play', 'find-work-that-feels-like-play', 'Wealth'],
  ['How to Get Lucky', 'how-to-get-lucky', 'Wealth'],
  ['Be Patient', 'be-patient', 'Wealth'],
  ['Judgment', 'judgment', 'Judgment'],
  ['How to Think Clearly', 'how-to-think-clearly', 'Judgment'],
  ['Shed Your Identity to See Reality', 'shed-your-identity-to-see-reality', 'Judgment'],
  ['Learn the Skills of Decision-Making', 'learn-the-skills-of-decision-making', 'Judgment'],
  ['Collect Mental Models', 'collect-mental-models', 'Judgment'],
  ['Learn to Love to Read', 'learn-to-love-to-read', 'Judgment'],
  ['Happiness Is Learned', 'happiness-is-learned', 'Happiness'],
  ['Happiness Is a Choice', 'happiness-is-a-choice', 'Happiness'],
  ['Happiness Requires Presence', 'happiness-requires-presence', 'Happiness'],
  ['Happiness Requires Peace', 'happiness-requires-peace', 'Happiness'],
  ['Every Desire Is a Chosen Unhappiness', 'every-desire-is-a-chosen-unhappiness', 'Happiness'],
  ['Success Does Not Earn Happiness', 'success-does-not-earn-happiness', 'Happiness'],
  ['Envy Is the Enemy of Happiness', 'envy-is-the-enemy-of-happiness', 'Happiness'],
  ['Happiness Is Built by Habits', 'happiness-is-built-by-habits', 'Happiness'],
  ['Find Happiness in Acceptance', 'find-happiness-in-acceptance', 'Happiness'],
  ['Choosing to Be Yourself', 'choosing-to-be-yourself', 'Self'],
  ['Choosing to Care for Yourself', 'choosing-to-care-for-yourself', 'Self'],
  ['Meditation + Mental Strength', 'meditation-mental-strength', 'Self'],
  ['Choosing to Build Yourself', 'choosing-to-build-yourself', 'Self'],
  ['Choosing to Grow Yourself', 'choosing-to-grow-yourself', 'Self'],
  ['Choosing to Free Yourself', 'choosing-to-free-yourself', 'Self'],
  ['The Meanings of Life', 'the-meanings-of-life', 'Philosophy'],
  ['Live by Your Values', 'live-by-your-values', 'Philosophy'],
  ['Rational Buddhism', 'rational-buddhism', 'Philosophy'],
  ['The Present Is All We Have', 'the-present-is-all-we-have', 'Philosophy'],
];
catalog.authors.push({ id: 'naval-ravikant', name: 'Naval Ravikant', phase: 7, order: 90, texts: NAVAL.length,
  tagline: 'The Almanack — a free guide to wealth and happiness, curated by Eric Jorgenson.',
  bio: 'Angel investor and philosopher. The Almanack of Naval Ravikant collects his wisdom on wealth, judgment and happiness. The entire book is free to read online — the project is a public service by Eric Jorgenson.' });
NAVAL.forEach(([title, path, part], i) => {
  const id = `naval--${slug(title)}`, p = prevText[id];
  // curated per-part summary (the jina-fetched previews were page chrome, not content)
  const desc = {
    Wealth: 'From Part I (Wealth) of the Almanack — Naval on building lasting wealth through specific knowledge, leverage, equity and judgment.',
    Judgment: 'From the Almanack — Naval on clear thinking, mental models and making better decisions.',
    Happiness: 'From Part II (Happiness) — Naval on happiness as a skill you can learn, choose and build by habit.',
    Self: 'From the Almanack — Naval on caring for, building, growing and freeing yourself.',
    Philosophy: 'From the Almanack — Naval’s reflections on meaning, values, presence and living well.',
  }[part];
  catalog.texts.push({ id, authorId: 'naval-ravikant', title, date: '2020',
    words: p?.words ?? null, desc, tags: [part], src: 'web', url: NAVAL_BASE + path, seq: i });
});
// --fetch-naval: pull each chapter once (via r.jina.ai) to record word count + a
// preview snippet, so the catalog can show length & "what it's about" for web texts.
if (FETCH_NAVAL) {
  for (const t of catalog.texts.filter(x => x.authorId === 'naval-ravikant' && !x.words)) {
    process.stdout.write(`naval: ${t.title}... `);
    try {
      const r = await fetch('https://r.jina.ai/' + t.url, { headers: { 'X-Return-Format': 'markdown' } });
      let txt = (await r.text()).replace(/^[\s\S]*?Markdown Content:\s*/, '').replace(/^Title:.*$/m, '');
      // trim nav/boilerplate: keep from the chapter heading onward
      const w = words(txt);
      if (w > 40) { t.words = w; t.preview = excerpt(txt); console.log(`${w} words`); }
      else { console.log('thin, skipped'); }
    } catch (e) { console.log('failed'); }
  }
}

/* Dan Koe's book: no legal free full text (official site sells it) — include the
   author's own free summary letter instead. */
catalog.texts.push({
  id: 'dan-koe--art-of-focus-official-summary', authorId: 'dan-koe',
  title: 'The Art of Focus — Official Summary (by the author)', date: '2024',
  words: null, tags: ['focus', 'book summary'], src: 'web',
  url: 'https://thedankoe.com/letters/the-art-of-focus-official-book-summary-by-the-author-dan-koe/',
});
const koe = catalog.authors.find(a => a.id === 'dan-koe'); if (koe) koe.texts++;

/* ---------- 3. Public-domain classics (bundled) ---------- */
// Verified via Gutendex/PG metadata (see docs/library-sourcing-roadmap.md).
const CLASSICS = [
  // Stoicism
  { pg: 2680,  title: 'Meditations', author: 'Marcus Aurelius', year: '180', tags: ['stoicism', 'philosophy'] },
  { pg: 45109, title: 'The Enchiridion', author: 'Epictetus', year: '125', tags: ['stoicism', 'philosophy'] },
  { pg: 871,   title: 'The Golden Sayings of Epictetus', author: 'Epictetus', year: '108', tags: ['stoicism'] },
  { pg: 56075, title: 'Seneca’s Morals of a Happy Life', author: 'Seneca', year: '60', tags: ['stoicism', 'happiness'] },
  { pg: 64576, title: 'Minor Dialogues (incl. On the Shortness of Life)', author: 'Seneca', year: '49', tags: ['stoicism', 'time'] },
  // Philosophy classics
  { pg: 1656,  title: 'Apology (The Trial of Socrates)', author: 'Plato', year: '-399', tags: ['philosophy'] },
  { pg: 1657,  title: 'Crito', author: 'Plato', year: '-399', tags: ['philosophy'] },
  { pg: 1600,  title: 'Symposium', author: 'Plato', year: '-385', tags: ['philosophy', 'love'] },
  { pg: 14328, title: 'The Consolation of Philosophy', author: 'Boethius', year: '524', tags: ['philosophy', 'adversity'] },
  { pg: 59,    title: 'Discourse on the Method', author: 'René Descartes', year: '1637', tags: ['philosophy', 'reason'] },
  { pg: 18269, title: 'Pensées', author: 'Blaise Pascal', year: '1670', tags: ['philosophy', 'faith'] },
  { pg: 5827,  title: 'The Problems of Philosophy', author: 'Bertrand Russell', year: '1912', tags: ['philosophy'] },
  { pg: 10741, title: 'The Wisdom of Life', author: 'Arthur Schopenhauer', year: '1851', tags: ['philosophy', 'happiness'] },
  { pg: 10715, title: 'Counsels and Maxims', author: 'Arthur Schopenhauer', year: '1851', tags: ['philosophy', 'wisdom'] },
  { pg: 1998,  title: 'Thus Spake Zarathustra', author: 'Friedrich Nietzsche', year: '1885', tags: ['philosophy'] },
  { pg: 4363,  title: 'Beyond Good and Evil', author: 'Friedrich Nietzsche', year: '1886', tags: ['philosophy'] },
  // Essays & letters
  { pg: 16643, title: 'Essays — First Series', author: 'Ralph Waldo Emerson', year: '1841', tags: ['essays', 'self-reliance'] },
  { pg: 2945,  title: 'Essays — Second Series', author: 'Ralph Waldo Emerson', year: '1844', tags: ['essays'] },
  { pg: 575,   title: 'Essays, Civil and Moral', author: 'Francis Bacon', year: '1625', tags: ['essays', 'wisdom'] },
  { pg: 16769, title: 'Orthodoxy', author: 'G.K. Chesterton', year: '1908', tags: ['essays', 'faith'] },
  // Wisdom & self-mastery
  { pg: 20203, title: 'Autobiography of Benjamin Franklin', author: 'Benjamin Franklin', year: '1791', tags: ['biography'] },
  { pg: 935,   title: 'Self-Help', author: 'Samuel Smiles', year: '1859', tags: ['self-improvement'] },
  { pg: 4507,  title: 'As a Man Thinketh', author: 'James Allen', year: '1903', tags: ['mindset'] },
  { pg: 59844, title: 'The Science of Getting Rich', author: 'Wallace Wattles', year: '1910', tags: ['wealth'] },
  { pg: 368,   title: 'Acres of Diamonds', author: 'Russell Conwell', year: '1890', tags: ['opportunity'] },
  // Mind & psychology
  { pg: 16287, title: 'Talks to Teachers on Psychology (incl. Habit)', author: 'William James', year: '1899', tags: ['psychology', 'habits'] },
  // Eastern & ancient wisdom
  { pg: 216,   title: 'The Tao Teh King', author: 'Laozi', year: '-400', tags: ['taoism', 'wisdom'] },
  { pg: 132,   title: 'The Art of War', author: 'Sun Tzu', year: '-500', tags: ['strategy'] },
  { pg: 3330,  title: 'The Analects', author: 'Confucius', year: '-475', tags: ['wisdom'] },
  { pg: 2388,  title: 'The Song Celestial (Bhagavad Gita)', author: 'Vyasa', year: '-200', tags: ['wisdom', 'spirituality'] },
  { pg: 58585, title: 'The Prophet', author: 'Kahlil Gibran', year: '1923', tags: ['poetry', 'wisdom'] },
  { pg: 14209, title: 'The Kybalion', author: 'Three Initiates', year: '1908', tags: ['hermeticism', 'philosophy'] },
  // Strategy & nature
  { pg: 1232,  title: 'The Prince', author: 'Niccolò Machiavelli', year: '1532', tags: ['strategy', 'power'] },
  { pg: 205,   title: 'Walden', author: 'Henry David Thoreau', year: '1854', tags: ['nature', 'simplicity'] },
  { pg: 71,    title: 'On the Duty of Civil Disobedience', author: 'Henry David Thoreau', year: '1849', tags: ['essays'] },
];
// PG boilerplate strip — marker-prefix approach (c-w/gutenberg style)
function stripPG(text) {
  const lines = text.split('\n');
  let start = 0, end = lines.length;
  for (let i = 0; i < Math.min(600, lines.length); i++)
    if (/^\*{3} ?START OF/i.test(lines[i]) || /^\*END\*THE SMALL PRINT/.test(lines[i])) start = i + 1;
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 600); i--)
    if (/^\*{3} ?END OF/i.test(lines[i]) || /^End of (the |this )?Project Gutenberg/i.test(lines[i])) { end = i; break; }
  let body = lines.slice(start, end).join('\n');
  body = body.replace(/Project Gutenberg/gi, '').replace(/\[(Illustration|Picture)[^\]]*\]/g, '');
  // older files put transcriber credits AFTER the start marker — drop those paragraphs
  const paras = body.split(/\n\s*\n/);
  while (paras.length && (!paras[0].trim() || /^(Produced by|E-text prepared by|This etext was prepared by|HTML version by|Distributed Proofread|Transcribed from|A note from the digitizer|This digitized version|\[?Transcriber)/i.test(paras[0].trim()))) paras.shift();
  body = paras.join('\n\n');
  // unwrap hard-wrapped paragraphs, preserving indented blocks (poetry/quotes)
  return body.split(/\n\s*\n/).map(p =>
    /^\s/.test(p) ? p : p.replace(/\n(?!\s)/g, ' ')
  ).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}
if (FETCH_CLASSICS) {
  const cdir = join(OUT, 'texts', 'classics'); mkdirSync(cdir, { recursive: true });
  for (const c of CLASSICS) {
    const file = join(cdir, `${slug(c.title)}.txt`);
    if (!existsSync(file)) {
      const url = `https://www.gutenberg.org/cache/epub/${c.pg}/pg${c.pg}.txt`;
      process.stdout.write(`fetching PG ${c.pg} ${c.title}... `);
      const res = await fetch(url);
      if (!res.ok) { console.log('FAILED', res.status); continue; }
      const clean = stripPG(await res.text());
      writeFileSync(file, clean);
      console.log(`ok (${words(clean)} words)`);
    }
  }
}
// curated one-line "what it's about" summaries, keyed by PG id
const DESC = {
  2680:'The private journal of a Roman emperor — Stoic reflections on duty, mortality and mastering your own mind.',
  45109:'A short handbook of Stoic practice: concern yourself only with what’s in your control, and calmly accept the rest.',
  871:'A curated collection of the Stoic teacher’s sharpest sayings on freedom and self-command.',
  56075:'Seneca’s letters and essays on living well — happiness, gratitude, anger and clemency.',
  64576:'Seneca’s essays, including the famous “On the Shortness of Life” — why we squander time and how to reclaim it.',
  1656:'Socrates’ defense at his trial — the origin of “the unexamined life is not worth living.”',
  1657:'Awaiting execution, Socrates argues why he must obey the law rather than flee — a dialogue on justice and duty.',
  1600:'A dinner-party debate on the nature of love, rising to Socrates’ celebrated “ladder of love.”',
  14328:'Written in prison awaiting death — how philosophy consoles the mind against the turning wheel of fortune.',
  59:'The birth of modern philosophy: “I think, therefore I am,” and a method for reasoning toward truth.',
  18269:'Pascal’s piercing fragments on faith, reason and the human condition — including his famous wager.',
  5827:'Russell’s lucid, humane introduction to philosophy’s biggest question: what can we actually know?',
  10741:'Practical philosophy on what truly makes a life happy — who you are matters more than what you have.',
  10715:'Blunt, worldly counsel for moving through life with clear eyes and steady expectations.',
  1998:'Nietzsche’s poetic masterwork — the Übermensch, eternal recurrence, and the call to create your own values.',
  4363:'A bold assault on inherited morality and a summons to think beyond good and evil.',
  16643:'Emerson’s foundational essays, including “Self-Reliance” — trust yourself and think for yourself.',
  2945:'More of Emerson’s transcendentalist essays on nature, character, experience and the poet.',
  575:'Francis Bacon’s terse, endlessly quotable essays on studies, adversity, ambition and more.',
  16769:'Chesterton’s witty defense of wonder and faith — a spiritual autobiography of ideas.',
  20203:'Franklin’s own account of his rise, his thirteen virtues, and a lifetime of deliberate self-improvement.',
  935:'The Victorian bestseller that coined “self-help” — perseverance and character as the roots of achievement.',
  4507:'A tiny, potent classic: your thoughts shape your circumstances and forge your character.',
  59844:'The 1910 manual on creating wealth through purposeful thought and action that seeded modern success writing.',
  368:'The famous lecture arguing that real opportunity lies right where you already stand.',
  16287:'William James on habit, attention and interest — including the enduring chapter on “The Laws of Habit.”',
  216:'The founding text of Taoism — effortless action, humility, and living in harmony with the Way.',
  132:'The oldest treatise on strategy — winning without fighting, and knowing both yourself and your opponent.',
  3330:'The collected sayings of Confucius on virtue, learning, and how to live and lead well.',
  2388:'Edwin Arnold’s verse rendering of the Gita — Krishna’s counsel on duty, action and the self.',
  58585:'Gibran’s beloved prose-poems on love, work, freedom and the great passages of life.',
  1232:'The unflinching handbook on gaining and holding power — realism over idealism.',
  205:'Two years alone at Walden Pond — a manifesto for simple, deliberate, self-reliant living.',
  71:'Thoreau’s argument that conscience outranks the law — the essay that inspired Gandhi and King.',
  14209:'An accessible introduction to Hermetic philosophy and its seven principles — mentalism, correspondence, vibration, polarity, rhythm, cause & effect, and gender.',
};
for (const c of CLASSICS) {
  const file = join(OUT, 'texts', 'classics', `${slug(c.title)}.txt`);
  if (!existsSync(file)) continue;
  const body = readFileSync(file, 'utf8');
  const aid = slug(c.author);
  if (!catalog.authors.find(a => a.id === aid))
    catalog.authors.push({ id: aid, name: c.author, phase: 6, order: 100 + CLASSICS.indexOf(c), texts: 0, tagline: DESC[c.pg] || '', bio: '' });
  catalog.authors.find(a => a.id === aid).texts++;
  catalog.texts.push({ id: `${aid}--${slug(c.title)}`, authorId: aid, title: c.title,
    date: c.year, words: words(body), tags: c.tags, src: 'bundled',
    desc: DESC[c.pg] || null, preview: excerpt(body),
    path: `library/texts/classics/${slug(c.title)}.txt` });
}

/* ---------- 3b. "Your Bookshelf" — in-copyright books you own ----------
   We can’t legally host these texts. They appear as cards so you can import your own
   copy (personal format-shifting) or find a legitimate ebook. `src:'owned'`. */
const OWNED = [
  { title:'The Art of Impossible', author:'Steven Kotler', year:'2021', tags:['peak performance', 'flow'],
    desc:'A practical, science-backed guide to achieving the impossible — the biology of peak performance and flow.' },
  { title:'Flow', author:'Mihaly Csikszentmihalyi', year:'1990', tags:['flow', 'psychology'],
    desc:'The classic study of optimal experience — how to sustain deep enjoyment and engagement in your life.' },
  { title:'A Brief History of Everything', author:'Ken Wilber', year:'1996', tags:['integral', 'philosophy'],
    desc:'Ken Wilber’s integral map for making sense of the world — matter, life, mind and spirit — in a holistic way.' },
  { title:'Awareness', author:'Anthony de Mello', year:'1990', tags:['spirituality', 'awakening'],
    desc:'A refreshing, humorous series of lectures on waking up, seeing clearly, and not taking life so seriously.' },
  { title:'Becoming Supernatural', author:'Joe Dispenza', year:'2017', tags:['mind', 'transformation'],
    desc:'On changing your life by breaking the cycle of repetition in the familiar and the known.' },
  { title:'The Way of the Superior Man', author:'David Deida', year:'1997', tags:['masculine', 'growth'],
    desc:'A student of Ken Wilber on masculine and feminine dynamics and spiritual growth.' },
  // Dan Koe's book has NO legal free full text — only a free summary (already listed
  // under his essays). The full book is paid, so it lives here as an owned card. It
  // attaches to the existing dan-koe author (stays in Foundation).
  { title:'The Art of Focus', author:'Dan Koe', year:'2024', tags:['focus', 'meaning'],
    desc:'Dan Koe’s book on finding meaning, reinventing yourself and creating your ideal future. The full book is paid; his free official summary is listed under his essays.',
    url:'https://theartoffocusbook.com' },
];
for (const b of OWNED) {
  const aid = slug(b.author);
  if (!catalog.authors.find(a => a.id === aid))
    catalog.authors.push({ id: aid, name: b.author, phase: 8, order: 200 + OWNED.indexOf(b), texts: 0, tagline: b.desc, bio: '' });
  const a = catalog.authors.find(x => x.id === aid); a.texts++;
  catalog.texts.push({ id: `owned--${slug(b.title)}`, authorId: aid, title: b.title, date: b.year,
    words: null, tags: b.tags, desc: b.desc, src: 'owned',
    url: b.url || `https://www.google.com/search?q=${encodeURIComponent(b.title + ' ' + b.author + ' ebook')}` });
}

/* ---------- author images (Wikipedia thumbnails; --fetch-images) ---------- */
// Wikipedia page titles where they differ from our display name.
const WIKI_NAME = {
  'seneca': 'Seneca the Younger', 'laozi': 'Laozi', 'sun-tzu': 'Sun Tzu',
  'vyasa': 'Vyasa', 'confucius': 'Confucius', 'g-k-chesterton': 'G. K. Chesterton',
  'wallace-wattles': 'Wallace Wattles', 'russell-conwell': 'Russell Conwell',
  'shane-parrish': 'Shane Parrish', 'packy-mccormick': 'Packy McCormick',
};
for (const a of catalog.authors) if (prevAuthor[a.id]?.img) a.img = prevAuthor[a.id].img; // reuse cached
if (FETCH_IMAGES) {
  for (const a of catalog.authors) {
    if (a.img) continue;
    const img = await wikiImage(WIKI_NAME[a.id] || a.name);
    if (img) { a.img = img; process.stdout.write(`📷 ${a.name}\n`); } else process.stdout.write(`·  ${a.name}\n`);
    await sleep(350); // stay under Wikipedia's anonymous rate limit
  }
  console.log('images: ' + catalog.authors.filter(a => a.img).length + '/' + catalog.authors.length);
}

/* ---------- 4. collections (reading paths) ---------- */
for (const [phase, name] of Object.entries(PHASE_NAMES)) {
  const authorIds = catalog.authors.filter(a => a.phase === +phase).map(a => a.id);
  if (!authorIds.length) continue;
  catalog.collections.push({ id: `phase-${phase}`, title: name, phase: +phase, authorIds });
}

writeFileSync(join(OUT, 'catalog.json'), JSON.stringify(catalog, null, 1));
console.log(`catalog: ${catalog.authors.length} authors, ${catalog.texts.length} texts, ${catalog.collections.length} paths`);
console.log('modes:', Object.entries(catalog.texts.reduce((m, t) => (m[t.src] = (m[t.src] || 0) + 1, m), {})).map(([k, v]) => `${k}:${v}`).join(' '));
