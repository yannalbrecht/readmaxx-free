/* ============================================================
   rsvp.js — the speed-reading engine
   tokenizing · Optimal Recognition Point · adaptive timing
   ============================================================ */

/* ORP pivot: 0-indexed pivot char for a given visible word length.
   Standard Spritz-style table. */
export function pivotIndex(len) {
  if (len <= 1) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  if (len <= 13) return 3;
  return 4;
}

const RE_WS = /\s+/;

/* Per-word timing multiplier (relative to the base 60000/WPM). */
function wordMultiplier(w) {
  let m = 1;
  const len = w.length;
  if (len > 8) m += (len - 8) * 0.04;           // long words read slower
  if (len <= 3) m *= 0.9;                         // tiny words a touch faster
  const last = w[w.length - 1];
  if (',;:)—–'.includes(last)) m *= 1.5;          // mid-sentence pause
  if ('.!?…"'.includes(last)) m *= 2.2;           // end-of-sentence pause
  if (/^\d/.test(w) || /\d/.test(w)) m *= 1.25;   // numbers need a beat
  return m;
}

/* Split one chunk string into the 3 ORP parts for centred rendering. */
export function orpParts(text) {
  // pivot is computed on the (trimmed) core, ignoring leading quotes/brackets
  const i = pivotIndex(text.replace(/[^\p{L}\p{N}]/gu, '').length || text.length);
  // map that core index back to a position in the real string
  let seen = -1, pos = 0;
  for (let k = 0; k < text.length; k++) {
    if (/[\p{L}\p{N}]/u.test(text[k])) { seen++; if (seen === i) { pos = k; break; } }
    pos = k;
  }
  return { pre: text.slice(0, pos), pivot: text[pos] || text[0] || '', post: text.slice(pos + 1) };
}

/* Build the flat flash list from chapters.
   chapters: [{title, text}]
   chunk: words per flash (1-3)
   returns { flashes:[{text,chapter,paraEnd}], chapterRanges:[{title,start,end,words}] , words } */
// Build one chapter's flashes directly into `flashes` (single pass, low memory).
// Block-aware: a heading block becomes ONE "card" flash (shown as a title with a
// pause); other blocks split into word/chunk flashes. Falls back to paragraph
// splitting for old docs that have only chapter.text.
function buildChapter(ch, ci, chunk, flashes) {
  const start = flashes.length;
  let words = 0;
  // Old docs (only .text, no .blocks) must tokenize EXACTLY like the Text View's
  // chapterBlocks (mdToBlocks markdown:false) — otherwise flash word-index and span
  // word-index diverge and tap/resume/seek land on the wrong word.
  const blocks = ch.blocks?.length ? ch.blocks
    : mdToBlocks(ch.text || '', { markdown: false });
  for (const b of blocks) {
    const ws = b.text.split(RE_WS).filter(Boolean);
    if (!ws.length) continue;
    if (/^h[1-3]$/.test(b.type)) {
      flashes.push({ text: b.text, n: ws.length, chapter: ci, mul: 1, paraEnd: true, heading: +b.type[1], card: true });
    } else {
      for (let i = 0; i < ws.length; i += chunk) {
        const end = Math.min(i + chunk, ws.length);
        let txt = ws[i];
        for (let k = i + 1; k < end; k++) txt += ' ' + ws[k];
        const pe = end === ws.length; // paragraph break at the end of a block
        flashes.push({ text: txt, n: end - i, chapter: ci, mul: wordMultiplier(ws[end - 1]) * (pe ? 1.6 : 1), paraEnd: pe });
      }
    }
    words += ws.length;
  }
  return { words, start, end: flashes.length };
}

export function buildFlashes(chapters, chunk = 1) {
  const flashes = [], chapterRanges = [];
  let totalWords = 0;
  for (let ci = 0; ci < chapters.length; ci++) {
    const r = buildChapter(chapters[ci], ci, chunk, flashes);
    totalWords += r.words;
    chapterRanges.push({ title: chapters[ci].title || `Chapter ${ci + 1}`, start: r.start, end: r.end, words: r.words });
  }
  return { flashes, chapterRanges, words: totalWords };
}

// Same output, but yields between chapters so very large books build without freezing.
export async function buildFlashesAsync(chapters, chunk = 1) {
  const flashes = [], chapterRanges = [];
  let totalWords = 0;
  for (let ci = 0; ci < chapters.length; ci++) {
    const r = buildChapter(chapters[ci], ci, chunk, flashes);
    totalWords += r.words;
    chapterRanges.push({ title: chapters[ci].title || `Chapter ${ci + 1}`, start: r.start, end: r.end, words: r.words });
    if ((ci & 1) === 1) await new Promise(res => setTimeout(res));
  }
  return { flashes, chapterRanges, words: totalWords };
}

/* delay in ms for one flash at a given wpm */
export function flashDelay(flash, wpm) {
  if (flash.card) return 1100; // heading title-card pause
  const base = 60000 / Math.max(60, wpm);
  return Math.round(base * flash.n * flash.mul);
}

/* ---------- text → typed blocks → chapters ----------
   One parser for every source: mdToBlocks (text/markdown) and domToBlocks
   (HTML/EPUB, in app.js) both emit { type:'h1'|'h2'|'h3'|'p'|'li'|'quote', text }.
   blocksToOutline segments those into the { title, text } chapters the reader
   already consumes, and also returns a heading toc. */

// Strip inline markdown/markup noise from one run of text.
function inlineClean(s) {
  return (s || '')
    .replace(/`([^`]+)`/g, '$1')                                                 // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')                                        // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')                                      // links → text
    .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (_, a, b) => (b ? b.slice(1) : a))  // wikilinks
    .replace(/[*_~]{1,3}([^*_~\n]+)[*_~]{1,3}/g, '$1')                            // bold/italic/strike
    .replace(/\s+/g, ' ')
    .trim();
}

// Markdown / plain text → ordered typed blocks. markdown:false ⇒ paragraphs only.
export function mdToBlocks(raw, { markdown = false } = {}) {
  let text = (raw || '').replace(/\r/g, '').replace(/^---\n[\s\S]*?\n---\n/, ''); // drop YAML frontmatter
  text = text.replace(/```[\s\S]*?```/g, '\n\n');                                 // drop code fences
  const blocks = [];
  let para = [];
  const flush = () => { const t = inlineClean(para.join(' ')); if (t) blocks.push({ type: 'p', text: t }); para = []; };
  for (const line of text.split('\n')) {
    if (markdown) {
      const h = line.match(/^(#{1,6})\s+(.+)/);
      if (h) { flush(); blocks.push({ type: 'h' + Math.min(3, h[1].length), text: inlineClean(h[2]) }); continue; }
      const li = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)/);
      if (li) { flush(); const t = inlineClean(li[1]); if (t) blocks.push({ type: 'li', text: t }); continue; }
      const q = line.match(/^\s*>\s?(.*)/);
      if (q) { flush(); const t = inlineClean(q[1]); if (t) blocks.push({ type: 'quote', text: t }); continue; }
      if (/^\s*[-=*_]{3,}\s*$/.test(line)) { flush(); continue; }                 // horizontal rule
    }
    if (/^\s*$/.test(line)) { flush(); continue; }
    para.push(line);
  }
  flush();
  return blocks.filter(b => b.text);
}

const isHeading = (b) => /^h[1-3]$/.test(b.type);

// Segment blocks into chapters by heading outline (top heading level = chapter
// break). No headings → split long docs into ~target-word parts.
export function blocksToOutline(blocks, { title = '', target = 1400 } = {}) {
  const heads = blocks.filter(isHeading);
  const toc = [];
  let chapters = [];

  if (heads.length) {
    const topLvl = Math.min(...heads.map(b => +b.type[1]));
    let cur = null;
    for (const b of blocks) {
      if (isHeading(b)) toc.push({ level: +b.type[1], title: b.text });
      if (isHeading(b) && +b.type[1] === topLvl) {
        if (cur) chapters.push(cur);
        cur = { title: b.text, blocks: [b] };
      } else {
        if (!cur) cur = { title: title || '', blocks: [] };
        cur.blocks.push(b);
      }
    }
    if (cur) chapters.push(cur);
  } else {
    const parts = splitBlocksByLength(blocks, target);
    chapters = parts.map((bl, i) => ({ title: parts.length > 1 ? `Part ${i + 1}` : '', blocks: bl }));
  }

  for (const c of chapters) {
    c.text = c.blocks.map(b => b.text).join('\n\n');
    c.words = countWords(c.text);
  }
  return { chapters: chapters.filter(c => c.words || c.title), toc };
}

function splitBlocksByLength(blocks, target) {
  const total = blocks.reduce((s, b) => s + countWords(b.text), 0);
  if (total <= target * 1.4) return [blocks];
  const parts = []; let buf = [], n = 0;
  for (const b of blocks) {
    buf.push(b); n += countWords(b.text);
    if (n >= target) { parts.push(buf); buf = []; n = 0; }
  }
  if (buf.length) parts.push(buf);
  return parts;
}

export function countWords(text) {
  return (text.match(/\S+/g) || []).length;
}

/* ---------- on-device topic analysis (no network / no LLM) ----------
   A curated keyword→category taxonomy scored by term frequency. Returns the doc's
   top 1–2 topics plus its most frequent content words. Used for per-doc tags and the
   aggregate "Interests" view. */
const STOPWORDS = new Set(('the a an and or but if then else of to in on at for with by from as is are was were be been being this that these those it its it\'s they them their our your his her my me we you he she who what which when where why how not no yes do does did have has had will would can could should may might must about into over under out up down off then than so such also just very more most much many few some any all each every other another one two three new old good great like get got make made take take back way time year day people man woman thing things use used using need want know think see look come go going said say says because while during between after before again once here there both same own too only').split(' '));

const TOPIC_KEYWORDS = {
  'Technology': ['software','computer','app','code','coding','programming','tech','technology','digital','internet','algorithm','device','hardware','robot','machine','cloud','cyber','smartphone','developer','database','server','platform','interface'],
  'AI': ['ai','intelligence','neural','model','training','learning','gpt','llm','chatbot','automation','dataset','inference','prompt','agent'],
  'Science': ['science','scientific','research','experiment','physics','chemistry','biology','scientist','theory','quantum','molecule','universe','astronomy','evolution','particle','genetics','laboratory','hypothesis'],
  'Business': ['business','company','market','startup','entrepreneur','strategy','management','revenue','customer','product','sales','growth','industry','corporate','ceo','profit','venture','founder','scale'],
  'Finance': ['money','invest','investment','stock','finance','financial','economy','economic','bank','fund','capital','trading','crypto','bitcoin','wealth','portfolio','asset','dividend','inflation','budget'],
  'Health': ['health','medical','doctor','disease','patient','medicine','fitness','exercise','diet','nutrition','wellness','therapy','symptom','treatment','healthy','clinical','immune','hormone'],
  'Psychology': ['psychology','behavior','emotion','cognitive','mental','habit','motivation','personality','consciousness','perception','bias','memory','anxiety','psychological','mindset','mood'],
  'Philosophy': ['philosophy','ethics','moral','meaning','existence','truth','logic','reason','wisdom','virtue','metaphysics','philosopher','argument','belief','knowledge','philosophical'],
  'History': ['history','historical','ancient','century','empire','revolution','civilization','battle','dynasty','historian','medieval','war','kingdom','colonial'],
  'Politics': ['politics','political','government','policy','election','democracy','president','vote','congress','party','senate','citizen','legislation','diplomatic'],
  'Arts & Culture': ['art','music','film','movie','painting','artist','design','creative','culture','novel','poetry','literature','author','song','album','theatre','photography','fashion'],
  'Sports': ['sport','sports','team','player','football','basketball','soccer','athlete','championship','coach','tournament','league','olympic'],
  'Self-Improvement': ['productivity','discipline','focus','routine','goals','success','improve','confidence','procrastination','clarity','intentional','deliberate'],
  'Nature': ['nature','animal','plant','environment','ocean','forest','climate','wildlife','species','ecosystem','planet','natural','sustainability'],
  'Food': ['food','recipe','cook','cooking','meal','kitchen','ingredient','flavor','cuisine','chef','baking','vegetable'],
};

export function analyzeTopics(text) {
  const tokens = (text || '').toLowerCase().slice(0, 24000).match(/[a-z][a-z']{2,}/g) || [];
  if (tokens.length < 12) return { topics: [], keywords: [] };
  const freq = Object.create(null);
  for (const w of tokens) if (!STOPWORDS.has(w)) freq[w] = (freq[w] || 0) + 1;
  const scores = [];
  for (const [topic, kws] of Object.entries(TOPIC_KEYWORDS)) {
    let s = 0; for (const kw of kws) if (freq[kw]) s += freq[kw];
    if (s) scores.push([topic, s]);
  }
  scores.sort((a, b) => b[1] - a[1]);
  const threshold = Math.max(2, tokens.length * 0.0025); // need real signal, not one stray hit
  const topics = scores.filter(([, s]) => s >= threshold).slice(0, 2).map(([t]) => t);
  const keywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);
  return { topics: topics.length ? topics : ['General'], keywords };
}
