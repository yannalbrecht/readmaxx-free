# Library + Large-File Reading — UI & Execution Plan

Covers: usability for big books (chapter skip, % of chapter, switch book), a cleaner
searchable/sortable library, smarter organization at scale, easier imports (incl. PDF and
Safari/link sharing), and the PWA storage realities. **Quizzes are explicitly out of scope here.**

---

## A. Smart UI decisions (the "plan it smartly" part)

1. **One `+ Import` entry, not five source tiles.** Replace the Paste/Link/File/Vault row with a
   single Import button → a sheet (Paste · Web link · Upload file `.txt/.md/.epub/.pdf` · Import
   folder/vault · "Set up Safari sharing"). Scales as sources grow (PDF added); declutters home.
2. **Progressive disclosure for organize features.** Search + filter chips are always visible
   (cheap, high value). **Collections/tags are secondary** — reached via long-press → "Add to
   collection" and a Collections chip/section. Don't make the default view busy.
3. **View toggle (list / compact / grid) remembers your choice.** Default = **rich list**; compact
   for power users with 50+ items; grid for the visual. Switchable via the little header icons.
4. **"Continue reading" row only appears when there's in-progress content** (empty-state aware).
5. **Generated cover tiles** = color from a title hash + a type icon (book / article / note / vault).
   Consistent and intentional without real artwork.
6. **Filter chips group status then type:** `All · Reading · Unread · Finished | Books · Articles ·
   Notes · Vaults`. Sort lives behind the sort icon (Recent · Progress · Title · Added · Type).
7. **Per-chapter % and jump-to-chapter depend on chapter-level position tracking** — which is why
   the big-file foundation (Section D) ships *before* the fancy reader nav.
8. **Switch book in 2 taps:** TOC sheet → "Switch book" opens a quick library overlay; plus the
   Continue-reading row makes resuming another book one tap from home.

See mockups: **Library redesign** and **Reader chapter-nav (TOC sheet)**.

---

## B. Imports — easier + PDF + Safari sharing

**PDF import** (new): `pdf.js` (lazy-loaded, SW-cached). Extract text per page; use detected headings
(or page groups) as chapters. Large PDFs flow through the same windowed pipeline (Section D).

**Sharing a link from Safari — the honest situation & fix.** Apple does **not** let a PWA register
as a share target (Web Share Target API unsupported on iOS). So we provide:
- **Launch-link importer** — the app reads `?add=<url>` / `?text=<...>` on open, imports it, then
  clears the param. This is the shared backbone for every method below.
- **iOS Shortcut** — a one-time "Share to ReadMaxx" Shortcut (we host an iCloud link + a 10-sec
  setup card in the Import sheet). It appears in Safari's Share Sheet and runs *Open URL →
  `…/?add=<shared URL>`* → effectively one-tap on iPhone.
- **Android** gets the *real* share sheet for free via a manifest `share_target` (GET → `?add`).
- "Open in ReadMaxx" deep links work anywhere (e.g. paste into Notes, tap later).

---

## C. PWA storage reality & smart organization at scale

- **Capacity:** installed to the home screen, the app gets **durable** storage (`persist()` granted
  by WebKit heuristics) and up to ~**60% of free disk**, IndexedDB realistically **hundreds of MB –
  ~500MB+**. A book's text ≈ 0.5–1 MB → **~200–500+ books** before capacity matters.
- **Real risk = eviction, not size:** if *not* installed, Safari wipes script storage after ~7 days
  unused. We already `persist()` + you install → durable bucket. ([WebKit policy](https://webkit.org/blog/14403/updates-to-storage-policy/))
- **Plan:** a **storage meter** in Settings (`navigator.storage.estimate()` → used / quota), a soft
  warning at ~80%, **never auto-delete**, prompt **export** near the limit, and a "manage storage"
  view listing the largest items.
- **Organized smartly at scale:** search + sort + status/type filters + collections cover hundreds
  of items; the list is **virtualized** (render only visible rows) so 500 items stay smooth.

---

## D. Foundation — big-file handling (must land first)

Today `buildFlashes` materializes the whole book in memory on every open, and `putDoc` rewrites the
entire doc on every pause — so big books freeze and per-chapter tracking is impossible. The fix
(client-side, fully offline):

1. **Store text only** (`chapters[{title,text}]`); never persist pre-built flashes.
2. **Build flashes per chapter, lazily** (current + 1 look-ahead); release on leave.
3. **Word-index position model** → map a global word index to `(chapter, offset)` for O(1) seek and
   **per-chapter %** (store chapter word-ranges once at import). *This is what powers the TOC sheet.*
4. **Separate tiny progress store** keyed by docId `{wordIdx, progress}` — written on pause/seek
   instead of the whole doc.
5. **Parse/tokenize in a Web Worker** (EPUB + PDF) with an import progress bar; stream chapters in.
6. **Cache the active window**; on chunk-size change rebuild only that window, preserving position.

---

## E. Execution plan (phased)

| Phase | Scope | Depends on | Effort |
|------|-------|-----------|--------|
| **1 — Foundation** | Big-file pipeline (Section D): per-chapter lazy build, word-index progress, separate progress store, Web-Worker parsing, windowed memory. | — | **L** |
| **2 — Reader chapter nav** | TOC sheet (chapters + per-chapter %), prev/next chapter, "% of chapter" in header, switch-book overlay. | Phase 1 (chapter ranges + word-index) | **M** |
| **3 — Library redesign** | Single Import entry, search, sort menu, status+type filter chips, Continue-reading row, view toggle (list/compact/grid), generated cover tiles, list virtualization, storage meter. | independent (parallel with 2) | **M–L** |
| **4 — Collections** | Manual collections/tags, long-press → add to collection, Collections chip/section. | Phase 3 | **M** |
| **5 — Import expansion** | PDF import (pdf.js); `?add`/`?text` launch handler; Android `share_target`; iOS Shortcut + setup card. | Phase 1 (PDF via windowed pipeline) | **M** |

**Recommended order:** 1 → (2 ∥ 3) → 5 → 4. Phase 1 is the unlock for everything large; Phases 2 and
3 can run in parallel; PDF/sharing (5) slots in once the pipeline exists; Collections (4) last as the
power-user layer.

**Quick, independent wins shippable now (before Phase 1):** the Import sheet consolidation, search +
sort + filter chips on the *current* (small) data model, the view toggle, and generated cover tiles —
none of these need the big-file refactor and they make the library feel better immediately.
