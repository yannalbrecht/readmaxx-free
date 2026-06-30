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
// Build one chapter's flashes directly into `flashes` (single pass — no
// intermediate per-word object array, so peak memory stays low on big books).
function buildChapter(text, ci, chunk, flashes) {
  const start = flashes.length;
  const paras = text.split(/\n{2,}/);
  const ws = [];
  const paraEndAt = new Set();
  for (let pi = 0; pi < paras.length; pi++) {
    let added = 0;
    for (const w of paras[pi].trim().split(RE_WS)) if (w) { ws.push(w); added++; }
    if (added && pi < paras.length - 1) paraEndAt.add(ws.length - 1);
  }
  for (let i = 0; i < ws.length; i += chunk) {
    const end = Math.min(i + chunk, ws.length);
    let txt = ws[i];
    for (let k = i + 1; k < end; k++) txt += ' ' + ws[k];
    const lastIdx = end - 1;
    const pe = paraEndAt.has(lastIdx);
    flashes.push({ text: txt, n: end - i, chapter: ci, mul: wordMultiplier(ws[lastIdx]) * (pe ? 1.6 : 1), paraEnd: pe });
  }
  return { words: ws.length, start, end: flashes.length };
}

export function buildFlashes(chapters, chunk = 1) {
  const flashes = [], chapterRanges = [];
  let totalWords = 0;
  for (let ci = 0; ci < chapters.length; ci++) {
    const r = buildChapter(chapters[ci].text, ci, chunk, flashes);
    totalWords += r.words;
    chapterRanges.push({ title: chapters[ci].title || `Chapter ${ci + 1}`, start: r.start, end: r.end, words: r.words });
  }
  return { flashes, chapterRanges, words: totalWords };
}

// Same output, but yields to the event loop between chapters so very large
// books build without freezing the UI.
export async function buildFlashesAsync(chapters, chunk = 1) {
  const flashes = [], chapterRanges = [];
  let totalWords = 0;
  for (let ci = 0; ci < chapters.length; ci++) {
    const r = buildChapter(chapters[ci].text, ci, chunk, flashes);
    totalWords += r.words;
    chapterRanges.push({ title: chapters[ci].title || `Chapter ${ci + 1}`, start: r.start, end: r.end, words: r.words });
    if ((ci & 1) === 1) await new Promise(res => setTimeout(res));
  }
  return { flashes, chapterRanges, words: totalWords };
}

/* delay in ms for one flash at a given wpm */
export function flashDelay(flash, wpm) {
  const base = 60000 / Math.max(60, wpm);
  return Math.round(base * flash.n * flash.mul);
}

/* ---------- text → chapters ---------- */

/* Strip markdown syntax to clean readable prose (keeps the words, drops the noise). */
export function stripMarkdown(md) {
  return md
    .replace(/```[\s\S]*?```/g, ' ')                 // code fences
    .replace(/`([^`]+)`/g, '$1')                       // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')             // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')           // links -> text
    .replace(/^>\s?/gm, '')                            // blockquotes
    .replace(/^\s*[-*+]\s+/gm, '')                     // bullets
    .replace(/^\s*\d+\.\s+/gm, '')                     // numbered lists
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1')   // bold/italic/strike
    .replace(/^#{1,6}\s*/gm, '')                       // (headings handled separately)
    .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (_, a, b) => (b ? b.slice(1) : a)) // obsidian wikilinks
    .replace(/^\s*[-=]{3,}\s*$/gm, '')                 // hr / frontmatter rules
    .replace(/\r/g, '')
    .trim();
}

/* Split into chapters using markdown headings (# / ##). Falls back to length-based. */
export function toChapters(rawText, { markdown = false } = {}) {
  let text = rawText.replace(/\r/g, '');

  // strip YAML frontmatter
  text = text.replace(/^---\n[\s\S]*?\n---\n/, '');

  if (markdown) {
    const lines = text.split('\n');
    const chapters = [];
    let cur = { title: '', buf: [] };
    const push = () => {
      const body = stripMarkdown(cur.buf.join('\n')).trim();
      if (body || cur.title) chapters.push({ title: cur.title || 'Intro', text: body });
    };
    for (const line of lines) {
      const m = line.match(/^(#{1,3})\s+(.*)/);
      if (m) {
        if (cur.buf.length || cur.title) push();
        cur = { title: m[2].replace(/[*_`#]/g,'').trim(), buf: [] };
      } else {
        cur.buf.push(line);
      }
    }
    push();
    const cleaned = chapters.filter(c => c.text.length);
    if (cleaned.length) return cleaned;
  }

  return splitByLength(stripMarkdown(text) || text);
}

/* For plain text with no structure, chunk into ~ chapter-sized pieces at sentence breaks. */
export function splitByLength(text, target = 1400) {
  const words = text.split(RE_WS).filter(Boolean);
  if (words.length <= target * 1.4) return [{ title: '', text }];
  const chapters = [];
  let buf = [], n = 0;
  for (const w of words) {
    buf.push(w); n++;
    if (n >= target && /[.!?]["')]?$/.test(w)) {
      chapters.push({ title: `Part ${chapters.length + 1}`, text: buf.join(' ') });
      buf = []; n = 0;
    }
  }
  if (buf.length) chapters.push({ title: `Part ${chapters.length + 1}`, text: buf.join(' ') });
  return chapters;
}

export function countWords(text) {
  return (text.match(/\S+/g) || []).length;
}
