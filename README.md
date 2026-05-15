# TaskLog

A personal, timestamp-based task/diary logger PWA. Vanilla HTML/JS/CSS, no build step. Stores entries as JSON in a private GitHub repo so the same log is readable from any device (Android, iOS, desktop).

## What you get

- Timeline of timestamped entries grouped by day.
- Heading + Markdown body per entry.
- Image attachments (paste a screenshot into the body, or pick files).
- Inline `#hashtag` extraction with a click-to-filter tag bar.
- Full-text search across all months (`tag:foo`, `month:2026-05` operators).
- Multiple themes (Sakura, Monokai, Ember, Forest, Solarized).
- Installable PWA on Android Chrome and iOS Safari.

## One-time setup

### 1. Create the data repo

Create a **private** GitHub repo, e.g. `task-log-data`. Add an empty file `logs/.keep` so the folder exists.

```
task-log-data/
  logs/
    .keep
```

### 2. Generate a fine-grained Personal Access Token

1. Visit https://github.com/settings/tokens?type=beta → **Generate new token**.
2. **Repository access**: *Only select repositories* → pick `task-log-data`.
3. **Repository permissions**: `Contents` → *Read and write*.
4. Set expiration to the maximum (1 year). Re-issue annually.
5. Copy the token (starts with `github_pat_`).

### 3. Open the app

- **Locally** (for testing): from this directory, run
  ```sh
  python3 -m http.server 8000
  ```
  Then open http://localhost:8000 in Chrome.
- **Deployed**: see "Deployment" below for GitHub Pages.

In the app, click the **⚙ Settings** button. Enter:
- **GitHub repo**: `yourname/task-log-data`
- **Default branch**: `main` (or whatever you used)
- **Personal Access Token**: paste the `github_pat_…` value
- **Theme**: pick one

Click **Test connection** → it should report "OK — repo reachable." Click **Save**.

### 4. Install on your phone

- **Android (Chrome)**: tap the address bar menu → **Install app**.
- **iOS (Safari)**: a banner appears at the bottom — or use **Share → Add to Home Screen**. The app launches in standalone mode (no Safari chrome).

## Deployment

Push this directory to a public GitHub repo (e.g. `task-logger`). In repo Settings → **Pages**:
- Source: *Deploy from a branch*
- Branch: `main`, folder `/`

Visit `https://<yourname>.github.io/task-logger/`. HTTPS is required for PWA install on Android — GitHub Pages provides it by default.

The PWA never bundles your PAT — you enter it in Settings on each device, and it's stored in `localStorage`.

## Storage layout

Inside `task-log-data`:

```
logs/
  2026-05.json     ← all entries for May 2026
  2026-06.json
images/
  2026-05-16T10-33-12-abc123.png
  ...
```

Entries within each month JSON look like:

```json
[
  {
    "id": "2026-05-16T10:33:12.847Z-a1b2",
    "ts": "2026-05-16T10:33:12.847Z",
    "heading": "Drafted PWA plan",
    "body": "Decided on **GitHub repo** as backend.\n\n#planning #pwa",
    "tags": ["planning", "pwa"],
    "images": [{ "path": "images/2026-05-16T10-33-12-abc123.png", "alt": "" }]
  }
]
```

You can edit these files directly on github.com if needed; the app re-fetches and merges on next save.

## Keyboard shortcuts

- `n` — new entry
- `/` — focus the search box
- `Esc` — close the open dialog

## Known limitations

- Writes need network. There's no offline write queue in v1.
- iOS may evict service-worker caches and `localStorage` after ~7 days of disuse — you'd just re-paste the PAT in Settings.
- Search loads every month JSON into memory (lazily, on first search). Fine for thousands of entries; would want chunking past tens of thousands.

## Project layout

```
index.html             — PWA shell + iOS meta tags
app.js                 — UI controller (timeline, composer, settings)
github.js              — GitHub Contents API wrapper + conflict retry
markdown.js            — marked + DOMPurify + #hashtag linkify
search.js              — lazy in-memory full-text index
styles.css             — themes + layout + safe-area handling
manifest.webmanifest   — PWA manifest
sw.js                  — service worker (cache-first shell, network-only API)
icons/                 — generated PWA + iOS icons; _gen.py to regenerate
vendor/                — pinned marked.min.js and purify.min.js
```

To regenerate the placeholder icons (or replace with your own):
```sh
python3 icons/_gen.py
```
