# Roadmap — growing Discover into a vast library of meaningful authors

Synthesis of five deep-research reports (per-author copyright, Gutenberg policy/tech,
other PD/CC sources, read-later legal patterns, curation models). All source verdicts
were live-verified 2026-07-08.

---

## The three distribution modes (legal backbone)

| Mode | What | Who |
|---|---|---|
| **bundled** | Full text in our repo, served same-origin | Public domain (PG boilerplate stripped — explicitly permitted), CC0/CC-BY (attribution kept), Sivers ("© · Copy & share" footer) |
| **web** | User-initiated on-device fetch from the ORIGINAL url at download time (Instapaper/Pocket model — 15 years of industry precedent, zero lawsuits; never re-hosted) | Graham, Newport, Perell, Koe, Parrish*, Forte*, Naval (officially free site) |
| **link** | Open the original site in the browser | Housel (Collab Fund ToS bans automated fetching), McCormick (Substack ToS), Munger (→ authorized fs.blog copy) |

*Parrish/Forte ToS have anti-scraping clauses; a single user-initiated fetch is
browser-equivalent and the weakest possible target, but flip them to `link` if ever asked.
**Golden rule: never redistribute a living author's full text from our repo/CDN.**
Honor any removal request immediately. A metadata catalog (titles/authors/URLs/word
counts) is safe for everyone — facts aren't copyrightable (*Feist*, Circular 33).

## Verified source map

- **Project Gutenberg** [BUNDLE-OK]: strip the `*** START/END ***` boilerplate + PG
  branding → unrestricted use. Never hotlink from the browser (no CORS anywhere,
  ToS forbids deep-linking); fetch at build time via `/cache/epub/{id}/pg{id}.txt`.
  Whole-catalog metadata: `pg_catalog.csv.gz` (public domain). Search API: gutendex.com
  (CORS ✓, best-effort hobby server, self-hostable).
- **Standard Ebooks** [BUNDLE-OK]: their entire production is CC0. Per-book GitHub
  repos / `/text/single-page` XHTML → text. They grant full catalog-feed access to
  open-source projects — **worth one email**.
- **Wikisource** [FETCH-OK]: the only CORS-verified live-fetch source
  (`api.php?...&origin=*`); check the per-work license template (prefer PD-old/PD-US).
- **CC-licensed moderns** [BUNDLE-OK with attribution]: Gwern (CC0), Slate Star Codex
  (CC-BY, SSC era), Cory Doctorow/Pluralistic nonfiction (CC-BY, per-post colophon),
  PLOS (CC-BY). **Wait But Why**: link-only but "we'll almost always say yes" — email.
- **Traps confirmed** [AVOID]: MLK speeches (copyright to ~2058), Churchill (2035),
  Buffett letters (personal copyright), Poetry Foundation (ToS), un-cleared Internet
  Archive scans (post-*Hachette*), Munger (life+70), *Think and Grow Rich* (murky +
  trademarked title), Dan Koe's *Art of Focus* (not legally free — official summary
  letter only).

## Curation model (per Serial Reader / Standard Ebooks / Pocket study)

Serial Reader is the proven closest model: 800+ PD classics, solo dev, free +
$2.99 IAP, popularity rail + ~14 flat genres, texts split into ~20-minute daily
issues. Adopt its lessons plus SE's "authority collections":
1. **Shelves** (Blinkist-style emotional slicing): Stoicism (highest-demand PD niche
   per PG Top-100), Philosophy Classics, Essays & Letters, Wisdom & Self-Mastery,
   Mind & Psychology, Eastern Wisdom, Strategy & Power, Nature & Simple Living.
2. **Rails**: Most Popular (download counts—local, no server needed), New This Week.
3. **Bounded prestige collections**: "The Stoic Starter Path", "The Harvard Classics
   shelf" (PG Bookshelf #40).
4. **Serialization** (later, powerful): split classics into daily ~20-min issues —
   pairs perfectly with our streak/quest engine ("today's issue" = a quest).

## Phases

- **Phase 1 — DONE (v1.14.0)**: Discover tab; 37 authors / 253 texts; modes wired
  (Sivers + 34 classics bundled; 158 web; 39 link); Naval's Almanack chapter-level;
  reading paths from the Essay Library phases.
- **Phase 2 — first-100 canon**: expand `CLASSICS` from the verified 59-candidate
  list (PG IDs in the research report — Plato's Republic 1497, Montaigne 3600,
  Russell's Conquest of Happiness 77894 (PD 2026!), Nietzsche, Boethius, Gita, more
  Seneca…). Add shelf taxonomy above as catalog categories + a Stoic Starter Path.
  Manual-source flagged items via Wikisource (Seneca's Letters/Gummere, Gracián).
- **Phase 3 — open moderns**: Gwern/SSC/Doctorow shelves (bundled, attribution);
  email Sivers (formal ok), Standard Ebooks (feed access), Wait But Why (permission).
- **Phase 4 — browse-all**: optional Gutendex-powered search ("any of 75k books")
  with on-device fetch via a self-hosted proxy or GITenberg/jsDelivr (CORS ✓) —
  only if users ask; the curated shelves are the product, not the firehose.
