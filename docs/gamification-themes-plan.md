# Plan — Icon refresh · Duolingo-grade goals & streaks · Kindle-style themes

Three workstreams, executed in order (small → large), each committed and tested separately.

---

## Phase 1 — Icon refresh (S)

Every `ICON` in ui.js is redrawn on a consistent 24×24 grid, stroke-width 2, rounded caps
(Lucide-style geometry — clean gear with even teeth, balanced optical weight). Same names,
drop-in replacement; the global `svg{}` CSS already handles stroke styling.

New icons added for later phases: `flame` (streak — needs grey/lit states, emoji can't),
`snowflake` (streak freeze), `calendar`, `target` (quests), `sun`/`moon`/`contrast` (themes).

Test: screenshot every surface (tabbar, reader transport, library rows, settings, sheets).

---

## Phase 2 — Kindle-style display themes (M)

**Token pass first:** the ~12 hardcoded colors (body/reader/textview/vault radials, `#fff`
fills, `.gbadge`, update-banner) move into tokens: `--bg-deep`, `--stage-1/2`, `--on-accent`,
`--knob`. Then five palettes via `[data-theme]` on `<html>`:

| Theme | Idea | Key values |
|---|---|---|
| **Nebula** (default) | current dark violet | unchanged |
| **Paper** | Kindle day — white page, dark ink | light surfaces, dark text, soft accent |
| **Sepia** | Kindle sepia — warm cream | cream bg, brown ink, warm accent |
| **Mono** | pure black & white, zero saturation ("less harsh") | black bg, white text, grey accents, white ORP pivot, covers `grayscale(1)` |
| **Night Red** | melatonin-safe red-on-black | near-black bg, dim red text/accents/pivot, covers desaturated + red tint |

- Picker: Profile → new "Display" group (swatch row with live preview) + a quick theme row in
  the reader settings sheet. Persisted as `settings.theme`; applied in `applyTheme()`.
- `<meta name="theme-color">` updates per theme. Accent picker hidden on Mono/Night Red
  (those themes own their accent). `--grad` goes flat/tinted per theme.
- Reduced scope honesty: splash + canvas share card stay branded (Nebula) — they're marketing
  surfaces, not reading surfaces.

Test: switch each theme live; check reader, Text View, library, stats, sheets for unreadable
combos; verify persistence across reload; contrast-check Paper/Sepia text.

---

## Phase 3 — Duolingo-grade goals, streaks & live feedback (L)

Grounded in researched Duolingo mechanics (600+ streak experiments; key finding: streak =
one session, goal = separate meter, celebration polish is load-bearing).

### 3a. Truthful streak + flame states
- Streak day earned by **any session ≥ 250 words or ≥ 60s** (the "one lesson" rule) —
  decoupled from the daily word goal.
- Home flame: **grey until earned today, ignites with a pop** when earned. Displayed streak
  computed from `lastActiveDay` (shows 0 when broken — fixes the current stale/lying pill).
- **Streak-at-risk state**: app opened after 17:00 with streak > 0 and today unearned →
  warning-styled pill "🔥 12 — read today to keep your streak".

### 3b. Streak freezes + calendar
- Hold **max 2 freezes**; **earn 1 per 7 consecutive days** (no currency — consistency is
  the price). Auto-consume silently on a 1-day gap; next open shows "❄️ A Streak Freeze
  saved your 23-day streak", and that day shows a snowflake in the calendar.
- **Tap the streak pill → streak calendar sheet**: month grid — flame days, snowflake days,
  today ring, equipped-freeze pips, next milestone callout.

### 3c. Milestones
- Full-screen celebration ONLY at **3, 7, 30, 100, 365 days**: flame burst + counter tick-up
  (n-1 → n) + confetti + share card (existing canvas share). Regular days: 1s counter tick
  inside the session summary. `milestonesSeen[]` guards repeats.

### 3d. Daily quests (3/day, date-seeded)
- Deterministic PRNG from `dayKey` picks 3 escalating quests from a pool: read N words ·
  read N minutes · finish a text · 2 sessions · hit 400+ WPM session avg. Bronze/silver/gold.
- Quest #1 sized so one normal session nearly completes it (goal-gradient).
- Rendered under the goal card with progress bars; complete-all bonus → +1 freeze (capped)
  else +XP. Bars animate on return from a session.

### 3e. Post-session choreography (the live feedback loop)
On finish — and on reader close after ≥ 250 words — a summary sequence replaces the bare toast:
1. "Session complete!" flourish
2. Stat cards deal in with count-up: **Words** (gold) · **WPM** (blue, rating word) ·
   **Time** (green) · **+XP**
3. Quest bars fill with easing; chest pop on completion
4. First session of the day → streak tick screen (grey flame ignites, count increments)
5. Milestone day → full celebration takeover
6. Goal met → explicit exit signal: "You're done for today ✓" (the thing Duolingo lacks)

### 3f. Goal picker in minutes + commit framing
- Goal sheet reframed as **minutes/day**: Casual 5 · Regular 10 · Serious 15 · Intense 20
  (mapped to words via the user's current WPM) + a custom words stepper. CTA: **"Commit to
  my goal"**. Goal card on home becomes tappable → this sheet.

### Data model (game.*, all backward-compatible)
`freezes`, `frozenDays{}`, `questsDay`, `quests[]`, `milestonesSeen[]`, `sessionsToday`,
`streakEarnedDay` — plus existing `streak/longestStreak/history/goalHits`.

### Explicitly skipped (serverless/no-push reality)
Leagues/leaderboards, friend quests, paid streak repair, push/widget nagging (in-app
at-risk banner does that job), gem economy.

Test per sub-phase: streak earn/ignite; freeze auto-consume (simulate day gap); calendar
render; quest determinism (same day = same quests) + progress + rewards; summary choreography
(count-up, bars, streak tick); milestone overlay at day 3; goal sheet mapping; regression
sweep of reader/stats/library; zero console errors.
