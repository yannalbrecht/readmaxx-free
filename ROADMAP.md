# ReadMaxx Free — Deep Analysis & Improvement Roadmap

Synthesis of three independent investigations: a **competitive/product gap analysis**, an
**evidence-based reading-science review**, and an **adversarial code audit**. Items are
prioritized by impact × effort, with an **evidence flag** where reading science is relevant.

---

## 0. The strategic throughline (read this first)

The single biggest decision isn't a feature — it's **positioning honesty**.

The science is blunt: the reading bottleneck is *language processing, not eye movement*
([Rayner et al. 2016](https://journals.sagepub.com/doi/full/10.1177/1529100615623267)). So:
- "Read **3× faster** with full comprehension" is **not true** above ~400 WPM — comprehension
  drops, the more so for connected prose.
- The **red ORP letter** is sound *word-positioning* science (OVP) but has **no evidence** of
  boosting comprehension in continuous prose — it's Spritz marketing layered on isolated-word lab data.
- **OpenDyslexic** and **Bionic Reading** both show **null/contested** independent evidence.

This is an *opportunity*, not a problem. The defensible, differentiated story is:

> **ReadMaxx is a focus + skimming tool with honest, measurable comprehension tradeoffs —
> private, offline, and built for knowledge workers (Obsidian/notes).**

Lean into the three things that are genuinely ours: **privacy-first (no accounts/tracking)**,
the **Obsidian-vault wedge**, and **measured progress with comprehension feedback**. Reframe
high speeds as *skim/gist*, not deep reading. This costs almost nothing and builds trust that the
hype-merchants can't match.

---

## P0 — Fix what's broken or risky (do first)

| # | Item | Why | Effort |
|---|------|-----|--------|
| 1 | **EPUB robustness** | Headline import fails on a large share of real books: assumes fixed `container.xml` path, no XML-namespace handling for `dc:title`/`dc:creator`, no null guards, no `\`→`/` normalization, no `linear="no"`/nav filtering. Query by `localName`/`getElementsByTagNameNS`, guard every `zip.file(...)`, resolve hrefs with proper path-join. | M |
| 2 | **`bestWpm` records the slider, not actual speed** 🐛 | `accrue()` passes `state.settings.wpm` into `addReading`, so "best WPM" and the 400/600-WPM achievements reflect a dragged slider, not measured throughput. Compute `sessionWords / (secs/60)`. Makes all speed stats meaningful. | S |
| 3 | **Honesty pass on copy** | Remove/soften "3× faster with full comprehension"; reframe ≥400 WPM as skim/gist; stop implying the red letter or OpenDyslexic boost comprehension. Trust + legal safety, near-zero effort. ⚑evidence | S |
| 4 | **Data safety** | IndexedDB opens at fixed `version 1` with no migration path; `importData` writes unvalidated JSON over live state (a bad backup can poison/brick the library). Add `onupgradeneeded` migration, per-record validation (skip-with-count), `QuotaExceededError` handling. | M |
| 5 | **Large-book memory → see [Spec A](#spec-a--handling-very-large-files-architecture)** | `buildFlashes` materializes the entire book as per-word + per-flash objects synchronously on the main thread at every open and chunk change — multi-second freeze / OOM on big epubs. Full windowed/lazy + Web-Worker architecture specced below. Fully offline. | M–L |
| 6 | **Stop full-doc write churn** | `putDoc(R.doc)` rewrites the whole document (megabytes of `chapters`) into IndexedDB on *every* pause/seek/skip/visibility-hide. Store progress in a small separate keyed record (`{id, idx, progress}`) or debounce. | S–M |

---

## P1 — High-impact product features (why users stay & pay)

| # | Item | Why | Effort | Evidence |
|---|------|-----|--------|----------|
| 7 | **Comprehension quiz** + per-WPM accuracy → see [Spec B](#spec-b--comprehension-quizzes-offline-first) | The #1 objection to RSVP and the dominant 2026 competitor pattern. **Works offline** via local heuristic generation (no AI/account needed); BYO-key AI is an optional upgrade. Lets users *see* comprehension fall as speed rises → honesty becomes a feature. | M | ⚑strong |
| 8 | **Expose & strengthen dynamic pacing** | We *already* slow at punctuation/long words (`rsvp.js wordMultiplier`) — but it's invisible & always-on. Add a "Dynamic pacing" toggle + intensity, a **speed warm-up ramp**, and longer clause pauses. Biggest comprehension lever in RSVP. | S–M | ⚑strong |
| 9 | **Goal-based modes: Skim / Read / Study** | Each presets WPM cap, chunk size, ORP, pauses. Matches purpose-setting evidence and onboarding "goals" we already collect. | M | ⚑strong |
| 10 | **Rewind-clause tap** | One tap replays the last clause — partially restores the *functional* regressions RSVP removes (rereading to repair misparses). | S | ⚑strong |
| 11 | **Default to 2-word chunks for prose** | Single-word RSVP suppresses parafoveal preview (a real cost). Default "Read" mode to 2; keep configurable; add a one-line explainer. | S | ⚑moderate |
| 12 | **Library management** | No search/sort/tags/recents — fine at 6 items, painful at 60. Add search, sort (recent/progress/title), and tags or collections. | M | — |
| 13 | **PDF import** | Table stakes (Redd, Spreeder, Outread, ReadMaxxing all support it); the most common long-form format. Via `pdf.js`, lazy-loaded. | M | — |

---

## P2 — Growth, retention & differentiation

| # | Item | Why | Effort |
|---|------|-----|--------|
| 14 | **Baseline WPM + comprehension test in onboarding** | Capture a real "before" number to anchor the personalized plan and progress story (Headway/Spreeder pattern). | S–M |
| 15 | **Challenge-a-friend share link / leaderboard** | Our share PNG is passive; a "beat my WPM/comprehension" link is *actively* viral. | M |
| 16 | **Spaced-repetition flashcards / highlights** from what you read | Strongest retention loop in the category (Readwise, Headway); converts speed-reading into learning. | L |
| 17 | **Read-later sync** (Readwise, Pocket, Instapaper) | Removes the "what do I read" friction; reinforces the knowledge-worker wedge alongside Obsidian. | M–L |
| 18 | **BYO-key AI** (summaries / TL;DR / auto-quiz) | Optional, user supplies their own API key → genuinely **zero tracking, zero server cost**, monetizable, and a real wedge vs. account-walled Headway/Speechify. | M |
| 19 | **Monetization: one-time "Pro" unlock + tip jar** | The proven privacy-friendly indie model (QuickReader, ReadQuick, Spreeder lifetime). Gate training drills, AI, PDF, advanced themes via a **local** license — keeps "no accounts, no tracking" intact. | M |
| 20 | **Training curriculum / drills** | Peripheral-expansion, chunking, metaguiding, spaced practice — what users actually *pay* for (Spreeder, AceReader). Justifies retention beyond novelty. | L |
| 21 | **Web-push streak nudges** | PWAs support web push; Headway's gamification team drove huge retention. Underused by us. | M |

---

## P3 — Accessibility, correctness & infra polish

| # | Item | Why | Effort |
|---|------|-----|--------|
| 22 | **Accessibility** | RSVP word has no `aria-live`/role (screen readers get nothing); sheets don't trap/move focus and Esc doesn't close them; `--faint #6b6680` ~3:1 fails WCAG AA; no `prefers-reduced-motion`; `user-scalable=no` blocks zoom. Add a screen-reader reading mode, focus management, contrast fix, reduced-motion, allow zoom. | M | 
| 23 | **RSVP timing drift** | Chained `setTimeout(tick, delay)` accumulates drift and is throttled in background tabs. Schedule against an absolute target time + rAF self-correction. | S |
| 24 | **Accessibility/letter-spacing controls** | Adjustable letter-spacing, line-length, and contrast have **better evidence** than any special font. Add them; label OpenDyslexic "some users prefer." | S | ⚑moderate |
| 25 | **URL import: timeout + privacy disclosure** | No `AbortController` (hangs forever on a dead proxy); every imported URL is sent to two third-party proxies — disclose this in the UI (contradicts "100% private" otherwise) and add a timeout. | S |
| 26 | **Vault % vs chunk size** | `vaultProgress` mixes flash-fraction with word counts; with chunk>1 the vault % drifts from reality. Track word-based progress consistently. | S |
| 27 | **`controllerchange` reload gating** | Auto-reload on SW activation can interrupt an active read. Gate behind "not currently reading." | S |
| 28 | **Code hygiene** | Empty `catch {}` swallow errors; `R`/`ob`/`statsRange` global mutable state with `rebuildFlashes→renderReader→setTimeout(play)` re-entrancy; memoize `orpParts`; remove legacy `bigFont`; `setTimeout(play,350)` auto-plays even after a manual seek-open. | S–M |

---

## Suggested sequencing (plain language)

**Sprint 1 — Trust & stability.** Fix what's silently broken or risky before building on top:
EPUB import, the `bestWpm` bug, large-file handling (Spec A below), data safety/migrations,
write-churn, and the honest-copy pass. Nothing here is glamorous; all of it is load-bearing.

**Sprint 2 — The comprehension story.** Turn honest positioning into a *product*: comprehension
quizzes (Spec B below), exposed dynamic pacing, Skim/Read/Study modes, rewind-clause, and a
2-word default. This is the differentiator — "we measure whether you actually understood."

**Sprint 3 — Scale & reach.** Make it usable with lots of content and for everyone: library
search/sort/tags, PDF import, and accessibility.

**Sprint 4 — Growth & money (what it actually means).** Everything so far makes the app *good*;
Sprint 4 makes it *spread and sustain itself* — **without breaking the no-account, no-tracking
promise**. Concretely:
- **Baseline test (#14):** a 60-second reading test during onboarding to capture a "before"
  WPM + comprehension number, so progress later feels real and motivating → **retention**.
- **Challenge-a-friend link (#15):** a share URL that encodes your score ("I read 420 WPM at 85% —
  beat me"). Your friend taps it, the PWA opens, they try → **free growth/virality**. No accounts:
  the challenge is encoded in the link itself.
- **BYO-key AI (#18):** users paste *their own* AI API key (stored only on their device) to unlock
  summaries/smarter quizzes. **We pay nothing and track nothing** — it's their key, their data.
- **One-time "Pro" unlock (#19):** instead of subscriptions/accounts, a single purchase unlocks
  premium features (training drills, AI, PDF, themes). Licensed **locally** with a key/receipt on
  device — the privacy-first indie model. (Caveat: as a PWA outside the App Store, payment goes
  through a web checkout + license key; that plumbing is the only real cost here.)
- **Web-push streak nudges (#21):** gentle "keep your streak" reminders (PWAs support web push).

In short, **Sprint 4 = retention + virality + optional revenue, all account-free.** It's optional
and can be deferred indefinitely if you just want a great free tool.

**Ongoing:** P3 correctness/infra as you touch each area.

## Quick wins (cheap, high value — could ship today)
**#2** bestWpm fix · **#3** honesty copy · **#8** expose dynamic pacing toggle ·
**#11** default 2-word chunks · **#22/#24** contrast + letter-spacing + allow zoom.

---

## Spec A — Handling very large files (architecture)

**Problem.** `buildFlashes` (rsvp.js) currently materializes the *entire* book up front: a per-word
object array **and** a full `flashes[]` of `{text,n,chapter,mul,paraEnd}` for every word —
synchronously, on the main thread, at every reader open and on every chunk-size change. A 5–10 MB
EPUB (~1–2M words) → millions of objects → multi-second freeze or out-of-memory crash. On top of
that, `putDoc(R.doc)` rewrites the whole document (megabytes of `chapters`) to IndexedDB on every
pause/seek/skip. This is the #1 thing standing between us and "open any book."

**Target architecture (incremental, each step independently shippable):**

1. **Store text, never pre-built flashes.** Keep `chapters: [{title, text}]` as the source of truth
   (already do). Stop persisting flash objects.
2. **Build flashes per *chapter*, lazily.** The reader only needs the current chapter (plus a
   one-chapter look-ahead). Build that window on demand; release it when you leave. A 300-page book
   becomes ~30 small builds instead of one giant one.
3. **Tokenize in segments for huge single chapters.** If one chapter is itself massive, tokenize in
   ~5k-word segments and stitch as you go.
4. **Flat position model for seeking.** Represent reading position as a global *word index*; map it
   to (chapter, offset) so the scrubber and "X% / N words left" work without a flat array of every
   word. Store chapter word-counts once at import for O(1) mapping.
5. **Separate, tiny progress store.** Add a `progress` IndexedDB object store keyed by `docId`:
   `{wordIdx, progress, updatedAt}`. Write *that* on pause/seek (a few bytes), never the whole doc.
6. **Parse & tokenize off the main thread.** Do EPUB unzip + tokenization in a **Web Worker**, so the
   UI never freezes; stream chapters into the reader as they're ready (show a progress bar on import).
7. **Cache the active window** on the in-memory reader; on chunk-size change, rebuild only the current
   window and preserve the word index — no full-book rebuild.

**Result:** memory stays ~O(one chapter) regardless of book size; opens are instant; seeking is
O(1); disk writes are tiny. **Fully offline** — this is pure client-side engineering, no backend.
*Effort: M–L. Belongs in Sprint 1 (it's the foundation everything else reads through).*

---

## Spec B — Comprehension quizzes (offline-first)

**Your concern is exactly right:** good AI-generated quizzes need either a backend or the user's own
key. So the design is **tiered**, and the default tier is **100% offline with no AI and no account.**

### Tier 1 — Local heuristic quiz (default, offline, free)
Generated on-device from the text the user just read. No network, no key. Question types:

1. **Cloze (fill-the-blank) MCQ** — take a sentence from the section, blank out its most salient
   content word (heuristic: capitalized entity, number, or the lowest-frequency / longest non-stopword
   using a small built-in stopword list), and offer 4 choices: the real word + 3 distractors sampled
   from other content words of the same type elsewhere in the doc. *Auto-graded.* Cloze is a classic,
   validated comprehension measure — crude vs. AI but a real signal.
2. **"Did it appear?" recognition** — show 5 words; ask which appeared in the passage (mix true
   passage words with plausible distractors). *Auto-graded.*
3. **Sentence ordering** — show 3 shuffled sentences from the section; reorder them. *Auto-graded.*
4. **Self-rated recall (metacognition)** — "In one line, what was this about?" → free text → user
   rates themselves 1–3. *Not* scored into accuracy; tracked as a separate "recall confidence" metric.

**Why it's good enough:** the goal isn't an exam — it's a *retention signal* and, crucially, the data
to draw a **WPM-vs-comprehension curve** so users *see* the tradeoff the science predicts. That makes
our honesty a feature competitors can't copy.

### Tier 2 — BYO-key AI quiz (optional, needs network + user's key)
If the user pastes their own API key (stored only on device), generate 3 richer questions —
inference, main-idea, detail — with short explanations. Clearly labeled **AI** and **requires
internet**. We run no server and store nothing. This is the "smart quiz" upsell, not the baseline.

### Tier 3 — Authored quizzes for built-in samples
Ship 3 hand-written questions per bundled sample. High quality, offline, great for onboarding/demo.

### UX & data
- **Setting:** "Comprehension checks" (Off / End of chapter / Every N minutes). Default: end of chapter, opt-in via onboarding.
- **Flow:** finish section → quiz card slides up → answer → score + 1-line "comprehension at this
  speed" feedback → continue.
- **Stored:** only a small history `{date, docId, wpm, score}` in stats (no question text persisted).
- **Powers:** a **WPM × comprehension** chart in Stats, and an achievement like
  *"Read at 400 WPM with 80%+ comprehension."*
- **Privacy:** Tier 1 sends nothing, ever. Tier 2 discloses that text goes to the user's chosen
  provider. Honest by construction.

*Effort: Tier 1 = M (the valuable default). Tier 2 = S once BYO-key plumbing exists. Tier 3 = S.*

---

### Evidence appendix (reading science)
- Rayner, Schotter, Masson, Potter, Treiman (2016), *Psych. Science in the Public Interest* — eye movement isn't the bottleneck; comprehension drops with speed; regressions are functional: https://journals.sagepub.com/doi/full/10.1177/1529100615623267
- RSVP inferential-comprehension degradation: https://centerforinquiry.org/blog/does-speed-reading-improve-reading-comprehension/
- Spritz/ORP critique & OVP (isolated-word only): https://theconversation.com/spritz-and-other-speed-reading-apps-prose-and-cons-24467
- Parafoveal preview / multi-word: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12863487/
- Subvocalization aids comprehension (don't eliminate): https://en.wikipedia.org/wiki/Subvocalization
- OpenDyslexic null (Wery & Diliberto 2017): https://pmc.ncbi.nlm.nih.gov/articles/PMC5629233/
- Bionic Reading null: https://blog.readwise.io/bionic-reading-results/

### Competitive sources
- Speed Reading Lounge 2026: https://www.speedreadinglounge.com/speed-reading-apps
- SliceRead 2026 roundup: https://sliceread.pro/blog/9-best-speed-reading-apps-for-2026
- Redd (Rolling Chunk): https://apps.apple.com/us/app/redd-speed-reader/id6757965939
- Reedy (smart pacing): https://reedy-reader.com/
