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

const words = (t) => (t.match(/\S+/g) || []).length;
const slug = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

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
const PHASE_NAMES = { 1:'Foundation', 2:'Organization & Leverage', 3:'Deeper Perspectives', 4:'Creative Expression', 5:'Big Picture', 6:'Timeless Classics', 7:'Free Books' };

const catalog = { version: 1, updated: new Date().toISOString().slice(0, 10), authors: [], texts: [], collections: [] };

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
        src: mode, url: url || null,
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
NAVAL.forEach(([title, path, part], i) => catalog.texts.push({
  id: `naval--${slug(title)}`, authorId: 'naval-ravikant', title, date: '2020',
  words: null, tags: [part], src: 'web', url: NAVAL_BASE + path, seq: i,
}));

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
const CLASSICS = [
  { pg: 2680,  title: 'Meditations', author: 'Marcus Aurelius', year: '180', tags: ['stoicism', 'philosophy'] },
  { pg: 45109, title: 'The Enchiridion', author: 'Epictetus', year: '125', tags: ['stoicism', 'philosophy'] },
  { pg: 205,   title: 'Walden', author: 'Henry David Thoreau', year: '1854', tags: ['nature', 'simplicity'] },
  { pg: 16643, title: 'Essays — First Series', author: 'Ralph Waldo Emerson', year: '1841', tags: ['essays', 'self-reliance'] },
  { pg: 132,   title: 'The Art of War', author: 'Sun Tzu', year: '-500', tags: ['strategy'] },
  { pg: 4507,  title: 'As a Man Thinketh', author: 'James Allen', year: '1903', tags: ['mindset'] },
  { pg: 58585, title: 'The Prophet', author: 'Kahlil Gibran', year: '1923', tags: ['poetry', 'wisdom'] },
  { pg: 20203, title: 'Autobiography of Benjamin Franklin', author: 'Benjamin Franklin', year: '1791', tags: ['biography'] },
  { pg: 1656,  title: 'Apology (The Trial of Socrates)', author: 'Plato', year: '-399', tags: ['philosophy'] },
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
  body = body.replace(/Project Gutenberg/gi, '').replace(/\[Illustration[^\]]*\]/g, '');
  // older files put transcriber credits AFTER the start marker — drop those paragraphs
  const paras = body.split(/\n\s*\n/);
  while (paras.length && (!paras[0].trim() || /^(Produced by|E-text prepared by|This etext was prepared by|HTML version by|Distributed Proofread|Transcribed from)/i.test(paras[0].trim()))) paras.shift();
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
for (const c of CLASSICS) {
  const file = join(OUT, 'texts', 'classics', `${slug(c.title)}.txt`);
  if (!existsSync(file)) continue;
  const body = readFileSync(file, 'utf8');
  const aid = slug(c.author);
  if (!catalog.authors.find(a => a.id === aid))
    catalog.authors.push({ id: aid, name: c.author, phase: 6, order: 100 + CLASSICS.indexOf(c), texts: 0, tagline: '', bio: '' });
  catalog.authors.find(a => a.id === aid).texts++;
  catalog.texts.push({ id: `${aid}--${slug(c.title)}`, authorId: aid, title: c.title,
    date: c.year, words: words(body), tags: c.tags, src: 'bundled',
    path: `library/texts/classics/${slug(c.title)}.txt` });
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
