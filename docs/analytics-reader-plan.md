# Plan — Speed gesture · Topic analysis · Stats overhaul · Mark-as-read

Four connected features. All on-device (no network, no LLM) to keep the app offline & free.
Locked decisions (from the user):
- **Speed control** — draggable on **both edges**; the bottom WPM slider stays.
- **Topic analysis** — **both** an aggregate "Interests" view in Stats **and** a per-doc topic tag.
- **Finished docs** — reopening a finished text **shows it completed with "Read again"**; the ✓ read
  badge is permanent and never lost.

Build order (each independently testable, committed separately): **A → D → B → C**
(bug-fix first, then the stats it feeds, then the two new UI features).

---

## A. Mark-as-read — finished texts stay read, never silently reset to 0%

**Bug today:** `finishDoc` saves `progress=1`, but reopening runs `openReader` → `idx=min(total-1, round(1*total))=total-1` → line 1072 `if (idx>=total-1) idx=0`, and `play()` sets `done=false`. So re-opening/replaying wipes the finished state and the card drops toward 0%.

**Fix:**
- Persist a per-doc flag: `doc.finished = true`, `doc.finishedAt = Date.now()` (set in `finishDoc` /
  `writeProgress(true)`; for vault notes, on the note object).
- **Never lower it:** `writeProgress` keeps `finished` true once set, regardless of the re-read cursor.
- **Library** shows a permanent ✓ badge from `doc.finished` (not from `progress`). The "Finished"
  filter uses `doc.finished`.
- **openReader on a finished doc:** open in a *completed* state — show 100%, the final card, and do
  **not** auto-play or reset to 0. Surface a **"Read again"** button (in the reader + card actions)
  that restarts from 0 **without** clearing `finished`.
- `play()` no longer auto-restarts a finished doc; only "Read again" does.
- Migration: docs with `progress>=0.99` and no `finished` flag are treated as finished on load.

---

## B. Speed gesture (both edges) + inline speed readout

- Two thin vertical **drag strips** overlaying the left & right edges of `.rd-stage`
  (`.rd-speedstrip.l/.r`). Pointer handlers own their events and `stopPropagation()` so they never
  trigger tap-to-pause or the context tap.
- **Drag up = faster, down = slower.** `pointerdown` captures startY + startWPM; `pointermove` maps
  ΔY → WPM (~2px/step), clamps 100–1000, `setPointerCapture`. Haptic tick every ~25 WPM.
- Live-sync on drag: `state.settings.wpm`, the bottom slider, the WPM readout, and the inline label.
  Debounced `save()`.
- **Inline speed label** `.rd-speed` — a small "420 wpm" line **just under the word zone, above the
  context text**, so you read your speed without looking down. Always visible; pulses on change.
- Discoverability: faint edge affordance (a subtle vertical gradient + tiny ▲/▼ ticks) and a
  one-time coach hint on first reader open ("Drag the edges to change speed").
- Reduced-motion: no pulse animation.

---

## C. Topic / interest analysis (per-doc tags + aggregate Interests)

**On-device topic detection** (`analyzeTopics(text)` in a small `js/topics.js` or within rsvp.js):
- A keyword→category **taxonomy** (~14 categories: Technology, Science, Business, Finance, Health,
  Psychology, Philosophy, History, Politics, Arts, Culture, Sports, Self-improvement, Nature, Fiction…),
  each with a curated keyword list.
- Tokenize (lowercase, strip stopwords & punctuation), sample the first ~2500 words for big docs,
  count term freq, score each category by weighted keyword hits, pick **top 1–2 topics** + top
  keywords. Fallback topic "General" when no category clears a threshold.
- Store on the doc: `doc.topics = [...]`, `doc.keywords = [...]`. Compute in `makeDoc`; backfill
  lazily for old docs on open (from stored chapter text).

**Per-doc tag:** small topic chip on each library card (first topic).

**Aggregate "Interests" (Stats):** a section that sums topics across the library, weighted by
**words actually read** (progress × words, full for finished), shows the top interests as ranked
bars, plus a **trend** (this-period vs previous — ▲/▼). One-line summary: "Mostly Technology,
Science & Business."

---

## D. Stats overhaul

1. **Fix daily average** — divide by days actually elapsed, not the fixed window. `dailyAvg =
   total / clampedDays`, where `clampedDays = max(1, min(spanDays, daysSinceFirstActivity+1))`.
   Show a secondary "per active day" too.
2. **Line graph + trend line** — replace the bar chart with an SVG **line/area chart** of daily (or
   bucketed) words, with a dashed **linear-regression trend line** and a shaded area. Keep it
   readable on mobile. Bars remain an option for the coarse (year/all) buckets.
3. **Period delta** — ▲/▼ % vs the previous equal-length period on the headline KPIs.
4. **More KPIs / analysis** — add: total time read, **avg WPM** (not just best), avg session length,
   texts finished, longest-ever streak, consistency (active-day ratio), most-read topic, time saved,
   pages-equivalent. Grouped sensibly; no NaN (guard all divisors).
5. **More achievements** — expand from 8 to ~24 across tiers: word milestones (1k/10k/50k/100k/500k),
   WPM (300/400/500/600/800), finished texts (1/5/10/25/50), streaks (3/7/14/30/100), sessions,
   daily-goal hits, time-of-day ("Night Owl"/"Early Bird"), topic breadth ("Polymath — 5 topics"),
   and time-saved. Store definitions in one table with tiers; render grouped & sorted (earned first).

---

## Data model additions (all backward-compatible, lazy-migrated)
- Doc: `finished`, `finishedAt`, `topics[]`, `keywords[]`.
- Game: `totalSeconds` already exists (avg WPM/time); add `longestStreak`; achievements list grows.
- No breaking changes; old docs upgrade on open.

## Testing per phase (live preview + node where pure)
- A: finish a doc → ✓ persists across reopen; "Read again" restarts but keeps ✓; card never drops to 0%.
- B: drag both edges → wpm changes & clamps; inline label tracks; no accidental pause; slider syncs.
- C: `analyzeTopics` on known text returns sensible topics (node test); tags render; Interests aggregates.
- D: daily-avg divisor correct after 1 day; line graph + trend render; all KPIs non-NaN; achievements unlock.
