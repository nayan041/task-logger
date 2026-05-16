# TaskLog PWA — Feature Catalog & Technical Reference

All feature requests, implementation decisions, and technical terminology for
the TaskLog PWA project. Organized by version for traceability.

---

## Architecture overview

```
PWA (vanilla HTML/JS/CSS)              Private GitHub repo
hosted on GitHub Pages                 (task-log-data)
                                       
  index.html                             logs/
  app.js        <-- Contents API -->       2026-05.json
  github.js         (PAT auth)            2026-06.json
  markdown.js                            finance/
  search.js                                2026-05.json
  db.js                                  images/
  styles.css                               2026-05-16T10-33-*.png
  sw.js                                  config/
  manifest.webmanifest                     categories.json
                                         memory.json
```

**Two repos**: `task-logger` (public, PWA source on GitHub Pages) and
`task-log-data` (private, user data accessed via API).

---

## Technical glossary

| Term | Meaning |
|---|---|
| **PWA** | Progressive Web App — a website that installs like a native app via manifest + service worker + HTTPS |
| **Service Worker (SW)** | Background script (`sw.js`) that caches the app shell for offline use; versioned (e.g. `tasklog-v7`) to force cache invalidation on updates |
| **PAT** | Personal Access Token — a GitHub fine-grained token scoped to the data repo with `Contents: Read and write` permission; stored in `localStorage` |
| **Contents API** | GitHub REST API (`api.github.com/repos/.../contents/...`) for reading/writing files; uses base64 encoding and SHA-based conflict detection |
| **SHA caching** | Each file has a SHA hash; `github.js` caches it to enable updates (PUT requires the current SHA); cleared on settings change |
| **409 conflict** | HTTP status when two devices edit the same file simultaneously; resolved by re-fetching, merging entries by `id`, and retrying |
| **IndexedDB** | Browser database (`db.js`) used for the offline sync queue; stores entry objects + image blobs until network returns |
| **Offline queue** | Entries created while offline are stored in IndexedDB and flushed to GitHub when connectivity resumes |
| **FAB** | Floating Action Button — the circular `+` button at bottom-right on mobile |
| **Speed dial** | The popup menu above the FAB showing Note/Finance/Memory options |
| **Segmented control** | The row of tab-like buttons (Notes / Finance / Memory) for view switching |
| **`<dialog>`** | Native HTML element for modal pop-ups; used for all composers and settings |
| **DOMPurify** | Library that sanitizes HTML to prevent XSS attacks; used after markdown rendering |
| **marked.js** | Library that converts Markdown text to HTML |
| **`datetime-local`** | HTML input type for date + time picking; used for editable timestamps |
| **Canvas resize** | `<canvas>` element used to resize images before upload; respects the "Max image size" setting |
| **`env(safe-area-inset-*)`** | CSS function for iPhone notch/home-bar spacing; used on topbar and FAB |
| **CSS custom properties** | Variables like `--accent`, `--bg` that enable theme switching via `data-theme` attribute |
| **`sessionStorage`** | Per-tab browser storage used to cache the search index within a session |
| **`localStorage`** | Persistent browser storage for settings (PAT, repo, theme, prompt config, memory cache, categories cache) |

---

## Version history & features

### v1 — Core notes (initial release)

**Prompt**: "Create personal task logger PWA like notetimeapp.com/diary, with
images and cross-device sync via cloud JSON."

**Decisions made**:
- Vanilla HTML/JS/CSS (no frameworks, no build step)
- GitHub private repo as database (not Google Drive)
- One JSON file per month (`logs/YYYY-MM.json`)
- Images stored as separate files in `images/` folder
- ES Modules with vendored UMD libraries
- 5 themes via CSS custom properties (Sakura, Monokai, Ember, Forest, Solarized)

**Features**:
- Timestamp-based note entries (heading + Markdown body)
- Image attachments (file picker + clipboard paste)
- `#hashtag` extraction and filtering
- Full-text search across all months (lazy index, `sessionStorage` cache)
- Month navigation (previous/next/today)
- Settings dialog (repo, PAT, branch, theme)
- PWA installable (manifest + service worker + HTTPS)
- iOS install hint banner
- Keyboard shortcuts (`n` for new, `/` for search)

### v2 — Finance tracking + offline sync

**Prompt**: "Financial records (income/expense with categories), monthly finance
view, offline support, and printing."

**Decisions made**:
- Income/Expense toggle (segmented control)
- Categories + subcategories managed in Settings, stored in `config/categories.json`
- IndexedDB for offline sync queue
- Currency: Taka (BDT / ৳)

**Features**:
- Finance view with category/subcategory, amount, tags, notes, images
- Finance summary bar (income / expense / net totals)
- Category + tag filtering in finance view
- Offline entry creation (queued in IndexedDB, flushed on reconnect)
- Pending sync badge with manual flush button
- Print/export dialog with date range, notes/finance toggle
- Finance records stored in `finance/YYYY-MM.json`

### v3 — Memory store + edit/delete

**Prompt**: "Memory key-value store in a separate tab, plus edit and delete
for notes, finance, and memory items."

**Features**:
- Memory tab: key-value pairs with type (text / number / date)
- Memory searchable via the search bar
- `memory.json` in repo root (not month-based)
- Edit mode for notes, finance records, and memory items
- Delete with confirmation for all record types
- Conflict-safe delete via `removedIds` parameter (prevents resurrection on 409 merge)
- Edit/delete buttons (pencil / trash) on each entry

### v4 — Deployment to GitHub Pages

- Deployed PWA source to `github.com/nayan041/task-logger`
- Enabled GitHub Pages (main branch, root folder)
- Live at `https://nayan041.github.io/task-logger/`

### v5 — Mobile UI overhaul

**Prompt**: "FAB button, vertical view tabs on mobile, iOS scroll fix, Android
padding/print fix, editable timestamps, hidden actions, offline memory, daily
journal prompt."

**Features**:
- FAB (floating action button) replaces `+ New` on mobile
- View tabs stacked vertically on mobile
- `overflow-x: hidden` fixes iOS PWA horizontal scrolling
- Removed double `env(safe-area-inset-top)` (body + topbar) fixing Android padding
- Aggressive print CSS reset for Android PDF output
- Edit/delete buttons hidden by default (hover on desktop, tap to reveal on mobile)
- Editable date & time in note and finance composers (`datetime-local` input)
- Entries that change month during edit are moved automatically
- Memory items cached in `localStorage` for offline viewing
- Daily journal prompt: enable in Settings with configurable time, shows in-app banner

### v6 — Horizontal tabs, speed dial, image resize

**Prompt**: "Horizontal tab row on mobile, Android PDF still blank, image
resolution reduction, FAB popup for note/finance/memory."

**Features**:
- Mobile topbar: `[Notes] [Finance] [Memory] [settings]` in one horizontal scrollable row
  (CSS `::before` pseudo-element forces flex line break between month nav and tabs)
- FAB speed dial: tapping `+` shows popup with Note / Finance / Memory options;
  `+` rotates to `x` when open
- Image resize setting: Original / Large (2000px) / Medium (1200px) / Small (800px)
  — uses `<canvas>` to downscale before upload
- Stronger print CSS: `position: static`, `visibility: hidden`, `height: 0` on
  non-print elements to eliminate Android blank pages

### v7 — Polish

**Features**:
- Mobile finance summary uses CSS Grid (3 equal columns) so large amounts
  (6+ digits) stay aligned instead of wrapping oddly
- Today's date shown at the top of the Memory tab

---

## Future improvements (recorded for reference)

### Multi-user access via personal repos
**Question**: "If others use this PWA with their own repo and PAT, is it possible?"

**Answer**: Yes. The PWA is stateless — all configuration (repo name, PAT, branch,
theme) is stored in the user's browser `localStorage`. The deployed app at
`nayan041.github.io/task-logger` can be used by anyone who:

1. Creates their own private `task-log-data` repo
2. Generates a fine-grained PAT scoped to that repo
3. Opens the PWA and enters their own repo + PAT in Settings

Each user's data stays in their own GitHub repo. No server, no accounts, no
sharing of credentials. The PWA is just a static frontend.

**To formalize this for others**:
- Add a "Getting Started" page or onboarding flow in the app
- Document PAT creation steps with screenshots
- Consider a "Fork this app" button that creates both repos automatically
- Optional: allow users to deploy their own copy via GitHub Pages fork

### Other ideas noted
- Encryption at rest (currently relies on private repo as security boundary)
- Web Push notifications for daily journal prompt (requires a push server)
- Background sync API (writes while truly offline, syncs via SW)
- Drag-to-reorder entries
- Data export to CSV/JSON download
- Entry templates / quick-add presets
- Recurring finance entries
- Charts / spending visualizations in finance view
- Dark mode auto-detection via `prefers-color-scheme`

---

## File reference

| File | Purpose | Key exports / concepts |
|---|---|---|
| `index.html` | PWA shell, all dialog modals, iOS meta tags | `<dialog>`, `<meta name="apple-mobile-web-app-capable">` |
| `app.js` | UI controller: state, rendering, event handlers | `state`, `refresh()`, `openComposer()`, `commitEntry()` |
| `github.js` | GitHub Contents API wrapper | `loadMonth()`, `saveMonth()`, `uploadImage()`, `fetchImageBlob()` |
| `markdown.js` | Markdown rendering + hashtag linkification | `render()`, `extractTags()`, `highlight()` |
| `search.js` | Lazy full-text search index | `ensureIndex()`, `search()`, `upsertEntry()`, `removeEntry()` |
| `db.js` | IndexedDB offline sync queue | `queueAdd()`, `queueAll()`, `queueRemove()`, `queueCount()` |
| `styles.css` | Layout, themes (5), responsive, print | CSS custom properties, `@media (max-width: 540px)`, `@media print` |
| `sw.js` | Service worker: cache shell, skip API | `VERSION` constant, cache-first for shell, network-only for API |
| `manifest.webmanifest` | PWA metadata | `display: standalone`, icons with `purpose: any maskable` |

---

## Data model

### Note entry (`logs/YYYY-MM.json`)
```json
{
  "id": "2026-05-16T10:33:12.847Z-a1b2",
  "ts": "2026-05-16T10:33:12.847Z",
  "heading": "Drafted PWA plan",
  "body": "Markdown body with #tags",
  "tags": ["tags"],
  "images": [{"path": "images/2026-05-16T10-33-12-abc123.png", "alt": ""}]
}
```

### Finance record (`finance/YYYY-MM.json`)
```json
{
  "id": "2026-05-16T14:20:00.000Z-x9y8",
  "ts": "2026-05-16T14:20:00.000Z",
  "type": "expense",
  "category": "Food",
  "subcategory": "Groceries",
  "amount": 450.50,
  "note": "Weekly shopping",
  "tags": ["weekly"],
  "images": []
}
```

### Memory item (`memory.json`)
```json
{
  "id": "m1a2b3c4d5",
  "key": "WiFi password",
  "type": "text",
  "value": "MySecretPass123"
}
```

### Categories config (`config/categories.json`)
```json
{
  "Food": ["Groceries", "Restaurant", "Snacks"],
  "Transport": ["Uber", "Bus", "Fuel"],
  "Utilities": ["Electricity", "Internet", "Phone"]
}
```
