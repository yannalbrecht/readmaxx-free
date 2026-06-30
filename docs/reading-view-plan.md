# Plan — Scrubbable text view + book-structured parsing

Two connected features:
1. **Text view / scrubber** — tap-or-drag the context line → the full article pops up as
   book-formatted text you can scroll; a marker shows where RSVP will resume and moves as you
   scroll; tap a word or release to continue from there.
2. **Real document parsing** — strip HTML/markdown to clean structured content, format like a
   book using the H1/H2/H3 hierarchy, and segment the document by that hierarchy.

They share one foundation, so build that first.

---

## 0. The shared foundation: a structured doc model + a single position

Today a doc is `chapters: [{title, text}]` — flat prose, no paragraphs, no heading levels, and
the RSVP position is a *flash index* (which changes with chunk size). That can't drive a faithful
text view. The fix is two model changes:

**A. Blocks.** A doc becomes an ordered list of typed blocks:
```js
{ type: 'h1'|'h2'|'h3'|'p'|'li'|'quote', text: '…' }
```
Headings keep their level; paragraphs/lists/quotes stay distinct. This is the source of truth for
both the text view (render blocks) and RSVP (flash the block text, with block boundaries as pauses).

**B. Position = word index.** One canonical cursor: the **global word index** (0…totalWords). RSVP
flashes derive from words; the text view renders words. Both map to the same index, so they stay in
sync and the marker is exact regardless of chunk size. (This is the word-index model the big-file
plan also needs — good time to land it.)

Mappings to maintain: `wordIndex ↔ (block, wordOffset)` and `wordIndex ↔ flashIndex` (flashIndex
depends on chunk). Seeking, the scrubber, per-chapter %, and the TOC all read from word index.

---

## 1. Feature 2 — Parse → structured blocks → book formatting

### Pipeline: any input → blocks
A single `parseToBlocks(raw, sourceType)` replacing the flatten-everything path:

| Source | How |
|---|---|
| **HTML** (URL fallback, any HTML) | `DOMParser` → drop `script/style/nav/aside/footer/header/figure-captions` → pick main content (`article`/`main`, else a Readability-style "largest text block" heuristic) → walk the DOM → emit blocks: `h1–h6 → h1/h2/h3` (clamped), `p → p`, `li → li`, `blockquote → quote`. Inline tags stripped, text kept. **This is the robust HTML stripping.** |
| **Markdown** (paste, `.md`, r.jina.ai) | Line parser: `#/##/### → h1/h2/h3`, blank-line groups → `p`, `-/*/1. → li`, `> → quote`; strip inline `**_~`` `code`, links→text, wikilinks, images. |
| **EPUB** | Per spine doc → `DOMParser` → same DOM walk as HTML; each spine file (or its `h1`) starts a chapter. |
| **Plain `.txt`** | Blank-line groups → `p`. No headings ⇒ one chapter (or length-split as a fallback). |
| **PDF** | pdf.js text per page → `p` blocks. Optional later: detect headings by font size (pdf.js exposes glyph height/transform) → promote short large-font lines to `h2`. v1: paragraphs only. |

`stripMarkdown` is kept only as an inline-cleanup helper *inside* block text — it no longer deletes
headings (they’re captured as `h*` blocks now).

### Heading hierarchy → chapters/sections ("sort based on H1/H2…")
Walk the blocks and build an **outline tree** from heading levels:
- `h1` → chapter · `h2` → section · `h3` → subsection.
- If a doc has no `h1`, promote `h2` to chapters (and so on) so there’s always a sensible top level.
- Produce `toc: [{ level, title, wordStart, wordEnd }]`. Chapters = top-level entries; the existing
  TOC sheet renders the hierarchy (indent `h2/h3`), and per-chapter % comes from word ranges.
- "Sort based on that" = **segment/structure** the document by its heading outline (not literally
  reordering sentences) so navigation and progress reflect the real outline. *(Confirm this reading.)*

### Book-style rendering & RSVP integration
- **Text view**: `h1/h2/h3` get distinct size/weight/spacing; `p` proper paragraph spacing; `quote`
  indented rule; `li` bulleted — all in the chosen reading font/size.
- **RSVP**: at each heading, show a brief **title card** ("Section · Protecting the flame") and a
  short pause before the section flashes; headings can render in the accent color while flashing.
  Sentence/paragraph auto-pauses already exist; heading pauses extend that.

### Data + migration
- Doc gains `blocks` and `toc`; `words` stays. Old docs (only `chapters`) are migrated lazily on
  open: each chapter → an `h2` block (title) + `p` blocks (paragraphs split on blank lines). Nothing
  re-imports; everything keeps working.

---

## 2. Feature 1 — The scrubbable Text View

### Interaction (matches "tap-and-drag → pops up → scroll → marker follows")
- The **context line becomes a handle**: **tap** it, or **drag up** on it, to open the **Text View**
  overlay (slides up, ~88% height). Drag distance can drive the open animation so it literally
  "pulls up."
- The overlay shows the **current chapter** as book-formatted text (blocks), in your reading font.
- A subtle fixed **read-line** sits ~40% down. The **word nearest the read-line is the resume
  marker** — highlighted (accent underline). On open it **auto-scrolls so the current RSVP word sits
  on the read-line** (you see exactly where you are).
- **Scroll** up/down → the marker (word at the read-line) updates live; a small chip tracks
  "Resume here · 47%". So scrolling moves the marker through the text, exactly as described.
- **Tap any word** → snaps it to the read-line (precise pick). 
- **Close** (swipe down / tap Resume / tap a word) → RSVP resumes from the marked word.

This one overlay is the **scrubber, the overview, and a plain reading view** in one — you can also
just read the article here, see its structure, find a spot, and resume RSVP there.

### Word mapping (technical)
- Render the chapter’s blocks with each word as `<span data-w="N">` (N = global word index). A
  ~1,400-word chapter ≈ 1,400 spans — fine. Big single chapters: word-wrap only a window around the
  viewport (virtualize) and resolve the rest by block offset.
- **Marker on scroll**: on scroll (rAF-throttled), find the word-span whose vertical center is
  closest to the read-line Y (binary search over cached offsets, or `IntersectionObserver` on a
  thin band at the read-line). Highlight it; update the % chip.
- **Tap**: read the span’s `data-w` → set marker.
- **Resume**: `wordIndex → flashIndex` (via chunk) → `seek()`; close overlay; play.
- **Scope**: render current chapter; scrolling past the top/bottom lazy-loads the adjacent chapter
  (consistent with the per-chapter big-file model). For most articles that’s the whole thing.

---

## 3. Execution phases (each independently testable)

| Phase | Scope | Effort |
|---|---|---|
| **1 — Foundation** | Block model + `parseToBlocks` for HTML/markdown/txt/epub/pdf; outline → chapters/toc; word-index position + mappings; migrate old docs; keep RSVP working off blocks. | **L** |
| **2 — Book rendering** | Render blocks book-style (text view container + the in-reader context use the same renderer); heading styles. | **M** |
| **3 — Text view overlay** | Tap/drag-to-open, render current chapter with word spans, highlight + auto-scroll to current word. | **M** |
| **4 — Scrub sync** | Read-line marker tracking on scroll, tap-to-place, resume-from-marker, % chip. | **M** |
| **5 — RSVP headings** | Title cards + heading pauses + accent heading flashes. | **S–M** |
| **6 — Polish** | Cross-chapter lazy scroll, drag-open animation, reduced-motion, a11y (the text view is also the accessible/screen-reader reading mode). | **M** |

Recommended order: 1 → 2 → 3 → 4 → 5 → 6. Phase 1 is the unlock; the visible payoff lands in 3–4.

## 4. Decisions (locked)
- **Marker model** — *auto-follow word at the read-line on scroll, plus tap-to-place.*
- **Text-view scope** — *current chapter, lazy-load the adjacent chapters on scroll.*
- **Headings in RSVP** — *brief "Section · <title>" title card + short pause; headings flash in accent.*
- **Structure** — *segment into chapters (H1) / sections (H2) / subsections (H3) by the heading
  outline; text order unchanged.*

### Still open / defaults
- **PDF headings**: paragraphs-only in v1; font-size heuristic to promote headings is a later add.
- **Migration**: existing docs upgrade lazily on open (chapter → `h2` + `p` blocks); no re-import.
- **Reduced motion / a11y**: the Text View doubles as the screen-reader-friendly reading mode.
