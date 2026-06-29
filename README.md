# ReadMaxx Free — Speed Reader

Read up to **3× faster**. A private, on-device **RSVP** speed reader you install
straight to your iPhone home screen — **no App Store, no $99 Apple fee, no account,
no tracking.** It's a Progressive Web App (PWA), so the same link works on iPhone,
iPad, Android, Mac, and Windows.

> RSVP = *Rapid Serial Visual Presentation*. Words flash one at a time in a fixed
> spot, each aligned on its **Optimal Recognition Point** (the red pivot letter), so
> your eyes never travel across the page. Remove the eye movement and your reading
> speed is limited only by how fast your brain recognises words — a trainable skill.

## Features

- **RSVP reader** with ORP pivot highlighting, adaptive timing (slows for long words,
  pauses at sentence / paragraph ends), and a smooth context line.
- **Everything adjustable:** speed (100–1000 WPM), words-per-flash (1–4), pivot on/off,
  context on/off, tap-to-pause, **reading font** (Lexend · Atkinson Hyperlegible ·
  OpenDyslexic · System · Serif), **reading size** (S/M/L/XL), and 5 accent themes.
- **Read anything:** paste/type · web articles by URL · `.txt` · `.md` (Obsidian / iOS
  Files) · `.epub` (spine-ordered) · built-in sample library.
- **ReadMaxx-style onboarding:** welcome → live speed demo → goals → personalized plan.
- **Motivation:** daily word goal, streaks, XP & levels, achievements, 7-day chart,
  time-saved stats.
- **Private & offline:** all text is processed on your device and cached for offline use.
  One-tap **backup / restore** (JSON) protects your library if iOS reclaims storage.

## Install on your iPhone (free, ~10 seconds)

1. Open the site URL in **Safari**.
2. Tap the **Share** button (the square with an up-arrow).
3. Tap **Add to Home Screen** → **Add**.
4. Launch it from the new icon — it runs full-screen like a native app.

> Same idea on Android (Chrome → ⋮ → *Install app*) and desktop (install icon in the
> address bar).

## Run / develop locally

No build step. Any static server works:

```bash
node scripts/serve.mjs 8124      # then open http://localhost:8124
```

Regenerate icons after editing `assets/icon.svg`:

```bash
npm install          # dev-only: sharp, for icon rasterizing
node scripts/gen-icons.mjs
```

## Deploy (free HTTPS, required for "Add to Home Screen")

The repo root **is** the site — push it to any static host:

- **GitHub Pages:** Settings → Pages → Deploy from branch → `main` / root.
- **Cloudflare Pages / Netlify / Vercel:** point at the repo, no build command,
  output dir = root.

Paths are all relative and `scope` is `"./"`, so it works from a project subpath
(e.g. `username.github.io/readmaxx-free/`).

## Honest limits

- **URL import** uses a public reader service (`r.jina.ai`, with a fallback) and needs
  a network connection; on failure it tells you to paste the text instead.
- **Obsidian on iPhone** is an *import snapshot*, not live sync — iOS Safari can't hold
  a persistent folder handle. Re-import a note to refresh it; progress is kept per note.
- **Haptics** use the Vibration API, which works on Android but **not iOS Safari** — the
  setting is hidden / disabled there rather than pretending to work.

## Tech

Vanilla ES modules, zero framework, zero build. `js/rsvp.js` (engine) · `js/store.js`
(state + IndexedDB) · `js/ui.js` (DOM helpers) · `js/app.js` (controller) ·
`sw.js` (offline cache) · self-hosted woff2 fonts.

Sample texts are public domain. Free forever.
