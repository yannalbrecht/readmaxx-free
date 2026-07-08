# Plan — "Discover": a curated in-app library

Users browse meaningful authors & texts and one-tap download them into their local
library. Seed content: the Essay Library (10 authors, 178 essays, ~2.9 MB of clean
.txt with TITLE/AUTHOR/DATE/SOURCE_URL/TAGS headers + author profiles + a phased
reading order).

---

## 1. UI/UX — where does it live?

**Recommendation: a 4th tab, and promote Profile to a 5th — classic 5-slot bar with
the Read FAB dead-center:**

```
[ Library ]  [ Discover ]  [ ▶ Read ]  [ Stats ]  [ Profile ]
```

Why a tab (and not a row in the Import sheet):
- **Different mental model.** Import = "bring your own" (one-shot action). Discover =
  "we bring you content" (a browsing *destination* you return to). Every reading app
  separates these: Apple Books (Library / Book Store), Kindle (Library / Store),
  Serial Reader (Library / Discover). Burying a store inside an import sheet kills
  its retention value.
- **Balance.** The current 3-slot bar is sparse; 4 tabs + center FAB is the standard
  iOS layout, and making Profile a real tab fixes an existing discoverability gap
  (it's currently hidden behind the avatar chip; the avatar keeps working too).
- Secondary entries: empty-library state gets "Browse the free library"; the Import
  sheet gets a "Discover library" row at top; finishing a text can suggest "More by
  {author}" when the author is in the catalog.

**Discover screen layout** (top → bottom):
1. Search field (filters the whole catalog: title/author/tag).
2. **Reading paths** — horizontal cards from the library's 5 phases ("Foundation",
   "Organization & Leverage", …) + Cross-Theme collections. Tap → ordered list with
   "Add all" (the README's reading order becomes a first-class feature).
3. **Author shelves** — one row per author: avatar-style initial tile, name, tagline
   (from `00_Profile` first sentence), essay count, "chevron →" to the author page.
4. **Author page**: profile blurb (collapsible), "Add all N essays", essay rows —
   title · year · ~words · tag chip · state button: **↓ Get** → spinner → **✓** (tap
   ✓ = open the doc). Downloaded state is derived from `doc.libraryId` so it survives
   deletes/re-installs consistently.
5. Every downloaded text lands in the normal Library flow (topics auto-analyzed,
   author set, `type:'library'`), indistinguishable from any import afterwards.

---

## 2. Catalog architecture (static, serverless)

```
library/
  catalog.json          ← manifest: version + authors[] + texts[] + collections[]
  texts/<author>/<slug>.txt
scripts/build-catalog.mjs   ← scans the Essay Library folder → emits the above
```

- `catalog.json` entry: `{ id, authorId, title, date, words, tags[], src, path|url }`
  - **`src:'bundled'`** → fetch `library/texts/...` from our own origin (works
    offline-first, no third parties).
  - **`src:'web'`** → download-on-demand from the ORIGINAL source URL through the
    existing `fetchArticle()` (r.jina.ai) pipeline — the app never redistributes the
    text; the user fetches it themselves at download time (Instapaper/Pocket model).
- Author entries carry `{ id, name, tagline, bio, order, phase }` (from profile files).
- Collections: the 5 reading phases + 3 cross-theme files as ordered `textIds`.
- The build script strips each txt's metadata header into JSON fields, keeps the body,
  slugs filenames, counts words. Re-run any time the source folder grows; bump
  `catalog.version`.

**Caching / SW:** `library/texts/**` is NOT precached (2.9 MB now, more later);
`catalog.json` is fetched network-first with a localStorage fallback so Discover
works offline after first visit. Downloaded texts live in IndexedDB like all docs.

## 3. Copyright reality (must decide before shipping publicly)

These 10 seed authors are **living writers with copyrighted essays**. Options per
author (deep-research report will give per-author verdicts):
- Authors with permissive terms (e.g. Derek Sivers explicitly open-licenses his
  writing) → `src:'bundled'`.
- Everyone else → `src:'web'` (deep-link download via their real URL — legally the
  same as the user pasting the link today, which the app already supports), OR
  bundled only in a **private/personal deployment**.
- The public-domain expansion (Phase 2, separate research doc) is 100% bundleable.

## 4. Execution phases

| Phase | Scope | Effort |
|---|---|---|
| **D1** | `build-catalog.mjs` + generate catalog from the Essay Library folder | S |
| **D2** | 5-slot tabbar (Discover + Profile tabs), Discover view: search, author shelves, author pages, download pipeline (`bundled` + `web` modes), dedupe/✓ states | M–L |
| **D3** | Reading paths & collections, "Add all", empty-library + import-sheet entry points, "More by author" post-finish suggestion | M |
| **D4** | Public-domain expansion from the research roadmap (curated first ~50 classics), catalog categories/shelves ("Stoicism", "Essays", "Letters", "Speeches") | M |

Test per phase: catalog generates (counts match), tab nav + back behavior, download →
doc opens with correct title/author/topics, re-download dedupes, `web`-mode fetch
falls back gracefully offline, all 5 themes render Discover correctly.
