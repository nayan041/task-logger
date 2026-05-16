# Building TaskLog — A Beginner's Guide

This document explains, step by step, how this PWA was built. It is written for
someone who knows *a little* JavaScript (variables, functions, `if`) but has
never built a real app. No build tools, no frameworks — just files you can open
and read.

By the end you will understand **every file** in this project and **why** it
exists.

---

## Table of contents

1. [What we are building](#1-what-we-are-building)
2. [What a PWA actually is](#2-what-a-pwa-actually-is)
3. [The tools you need](#3-the-tools-you-need)
4. [Project structure — the big picture](#4-project-structure--the-big-picture)
5. [Step 1 — The HTML skeleton](#step-1--the-html-skeleton)
6. [Step 2 — Styling with CSS](#step-2--styling-with-css)
7. [Step 3 — JavaScript modules](#step-3--javascript-modules)
8. [Step 4 — Talking to GitHub (the "database")](#step-4--talking-to-github-the-database)
9. [Step 5 — Rendering Markdown safely](#step-5--rendering-markdown-safely)
10. [Step 6 — The main app logic](#step-6--the-main-app-logic)
11. [Step 7 — Search across months](#step-7--search-across-months)
12. [Step 8 — Making it installable (manifest + service worker)](#step-8--making-it-installable)
13. [Step 9 — Testing locally](#step-9--testing-locally)
14. [Step 10 — Deploying to the internet](#step-10--deploying-to-the-internet)
15. [JavaScript concepts cheat-sheet](#javascript-concepts-cheat-sheet)
16. [Common bugs we hit (and what they taught us)](#common-bugs-we-hit)

---

## 1. What we are building

A **personal task logger**: you write short timestamped notes (a heading + a
body), optionally attach screenshots, and they sync across all your devices.

Think of it as a diary where every entry is stamped with the exact time.

Key features:
- Notes grouped by day on a timeline
- Markdown formatting (bold, lists, links)
- `#hashtags` you can filter by
- Image attachments
- Search across everything
- Works offline, installs like a real app

---

## 2. What a PWA actually is

**PWA = Progressive Web App.**

It is just a normal website that has three extra ingredients:

| Ingredient | What it does | File in this project |
|---|---|---|
| **Manifest** | Tells the phone the app's name, icon, colors | `manifest.webmanifest` |
| **Service worker** | A background script that caches files so the app opens offline | `sw.js` |
| **HTTPS** | A secure connection — required for the above to work | provided by GitHub Pages |

When a website has all three, your phone offers to "Install" it. Once installed
it gets its own icon and opens without the browser bar — it *feels* native, but
under the hood it is still HTML, CSS, and JavaScript.

> **Why a PWA instead of a "real" Android/iOS app?**
> No app stores, no Swift/Kotlin, no review process. You write it once with web
> technology and it runs everywhere. Perfect for a personal tool.

---

## 3. The tools you need

You need surprisingly little:

1. **A text editor** — VS Code is free and great.
2. **A web browser** — Chrome has the best developer tools.
3. **A way to run a local server** — we use Python (already on macOS):
   ```sh
   python3 -m http.server 8000
   ```
4. **A GitHub account** — for storing data *and* hosting the app for free.

That's it. **No `npm install`, no webpack, no React.** This project is
deliberately "vanilla" — plain web technology — so you can read every line.

> **Why can't I just double-click `index.html`?**
> Modern JavaScript features (modules, service workers) are blocked when a page
> is opened directly as a file (`file://`). The browser requires a real server
> (`http://`). That's what the Python command above gives you.

---

## 4. Project structure — the big picture

```
task-logger/
├── index.html            ← the page itself (the "skeleton")
├── styles.css            ← all the visual styling
├── app.js                ← the brain: handles clicks, draws the timeline
├── github.js             ← talks to GitHub to save/load data
├── markdown.js            ← turns **markdown** into HTML
├── search.js             ← searches all your notes
├── manifest.webmanifest  ← PWA metadata (name, icon)
├── sw.js                 ← service worker (offline support)
├── icons/                ← app icons
└── vendor/               ← third-party libraries we downloaded
```

A useful way to think about it:

- **`index.html`** is the *stage*.
- **`styles.css`** is the *lighting and decoration*.
- **`app.js`** is the *director* — it tells everything what to do.
- **`github.js`, `markdown.js`, `search.js`** are *specialists* the director
  calls when it needs a specific job done.

This is called **separation of concerns**: each file has one job. When something
breaks, you know which file to open.

---

## Step 1 — The HTML skeleton

**File: `index.html`**

HTML describes *what is on the page*. It does not make anything work — it just
lays out the pieces.

Start with the required wrapper every HTML page needs:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>TaskLog</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <!-- everything visible goes here -->
</body>
</html>
```

- `<head>` holds *information about* the page (title, settings) — not visible.
- `<body>` holds everything the user actually sees.
- The `viewport` line makes the page size correctly on phones.

### Adding the visible pieces

Inside `<body>` we add the parts of our UI. Each gets an `id` so JavaScript can
find it later:

```html
<header id="topbar">
  <button id="newBtn">+ New</button>
  <button id="settingsBtn">⚙</button>
</header>

<main id="timeline">
  <!-- entries will be inserted here by JavaScript -->
</main>
```

> **Key idea:** `id="newBtn"` is a *name tag*. Later, JavaScript says
> "find the element named `newBtn`" and attaches a click action to it.

### Dialogs (pop-up windows)

For the "new entry" form and settings, we use the built-in `<dialog>` element —
the browser gives us a real pop-up for free:

```html
<dialog id="composer">
  <form>
    <input id="composerHeading" type="text" placeholder="Heading">
    <textarea id="composerBody" placeholder="Write here..."></textarea>
    <button type="submit">Save</button>
  </form>
</dialog>
```

A `<dialog>` is hidden until JavaScript calls `.showModal()` on it.

### Loading our JavaScript

At the bottom of `<body>`:

```html
<script src="vendor/marked.min.js"></script>
<script src="vendor/purify.min.js"></script>
<script type="module" src="app.js"></script>
```

- The first two load *libraries* (more on those in Step 5).
- `type="module"` is important — it lets `app.js` use modern `import`
  statements to pull in our other files.

---

## Step 2 — Styling with CSS

**File: `styles.css`**

CSS controls *how things look*: colors, sizes, spacing, layout.

### CSS variables (the smart part)

Instead of writing the color `#d83972` in 30 places, we define it once as a
**variable**:

```css
:root {
  --accent: #d83972;   /* define a variable called --accent */
  --bg: #fff7f9;
  --text: #2a1a1f;
}
```

Then use it anywhere:

```css
button {
  background: var(--accent);   /* use the variable */
}
```

**Why this matters:** to support multiple themes, we just redefine the variables:

```css
[data-theme="monokai"] {
  --accent: #a6e22e;
  --bg: #272822;
}
```

Now, when JavaScript sets `data-theme="monokai"` on the page, *every* color
changes at once. One line of JavaScript, whole-app re-skin. That is the power of
variables.

### Layout basics

Two layout tools do almost everything:

```css
/* Flexbox: arrange items in a row */
#topbar {
  display: flex;
  gap: 6px;          /* space between items */
  align-items: center;
}

/* Grid: precise columns — here, a 48px column then a flexible one */
.entry {
  display: grid;
  grid-template-columns: 48px 1fr;   /* 1fr = "the rest of the space" */
}
```

We use grid for each timeline entry: a narrow column for the timestamp, a wide
column for the text.

---

## Step 3 — JavaScript modules

JavaScript used to be one giant file. **Modules** let us split code into small
files that share what they need.

### Exporting

In `markdown.js`, we mark a function as shareable with `export`:

```js
export function render(text) {
  // ...turns markdown into HTML
}
```

### Importing

In `app.js`, we pull it in:

```js
import { render } from './markdown.js';

// now we can call render() here
const html = render('**hello**');
```

> **Analogy:** `export` is putting a tool on a shared shelf. `import` is taking
> it off the shelf in another room. The `./` means "a file next to me".

This is why `index.html` loads `app.js` with `type="module"` — that switch turns
on `import`/`export`.

---

## Step 4 — Talking to GitHub (the "database")

**File: `github.js`**

Most apps need a database to store data. We don't have a server, so we use a
clever trick: **a private GitHub repository is our database.** Each month's
notes are one JSON file (`logs/2026-05.json`).

### What is JSON?

JSON is just JavaScript data written as text. An entry looks like:

```json
{
  "id": "2026-05-16T10:33:00Z-a1b2",
  "ts": "2026-05-16T10:33:00Z",
  "heading": "Drafted the plan",
  "body": "Decided on the approach. #planning",
  "tags": ["planning"],
  "images": []
}
```

JavaScript converts between text and real objects with two functions:

```js
const text = JSON.stringify(myObject);  // object  → text (to save)
const obj  = JSON.parse(text);          // text    → object (to read)
```

### `fetch` — asking the internet for things

`fetch` is how JavaScript makes a web request. It is **asynchronous** — it takes
time, so we use `await` to wait for the answer:

```js
async function getFile(path) {
  const response = await fetch('https://api.github.com/...', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const data = await response.json();
  return data;
}
```

Breaking that down:
- `async` — marks a function that does slow work.
- `await` — "pause here until the answer arrives, then continue".
- `headers` — extra info sent with the request. The `Authorization` header is
  our password (a GitHub token) proving we're allowed in.

> **Why `async`/`await`?** Talking to the internet is slow (could be 1 second).
> Without `await`, JavaScript would race ahead and use data that hasn't arrived
> yet. `await` keeps things in order.

### Saving data

To save, we send the JSON *to* GitHub with a `PUT` request:

```js
async function saveMonth(month, entries) {
  const text = JSON.stringify(entries, null, 2);
  await putFile(`logs/${month}.json`, text);
}
```

GitHub stores files as **base64** (a way to write any data as plain letters),
so `github.js` also has small `b64encode` / `b64decode` helpers. You don't need
to understand base64 deeply — just know it is "encoding so binary data survives
as text".

---

## Step 5 — Rendering Markdown safely

**File: `markdown.js`**

When you type `**bold**`, we want it to appear as **bold**. That conversion is
called *rendering markdown*.

Writing a full markdown parser is hard, so we use a **library** — pre-written
code by someone else. We use two:

- **`marked`** — converts markdown text into HTML.
- **`DOMPurify`** — cleans HTML to remove anything dangerous.

These live in the `vendor/` folder (we downloaded them so the app doesn't depend
on the internet to load).

```js
export function render(md) {
  const html = marked.parse(md);          // markdown → HTML
  return DOMPurify.sanitize(html);        // HTML → SAFE HTML
}
```

> **Why DOMPurify? (Security!)**
> If someone wrote `<script>steal_passwords()</script>` in a note, and we showed
> it without cleaning, the browser would *run* it. That attack is called **XSS**
> (cross-site scripting). DOMPurify strips out scripts and other dangerous bits.
> **Rule: never put untrusted text directly into a page as HTML.**

### Finding hashtags

We also want `#planning` to become a clickable link. We use a **regular
expression** (a pattern-matching tool) to find hashtags:

```js
const pattern = /(^|\s)#([\p{L}\d_-]+)/gu;
```

That looks scary, but it just means: "a `#` followed by letters/numbers". When
we find one, we wrap it in a link.

---

## Step 6 — The main app logic

**File: `app.js`**

This is the biggest file — the "director". Its job has four parts.

### Part A — Find the HTML elements

First we grab references to everything we gave an `id`:

```js
const els = {
  newBtn: document.getElementById('newBtn'),
  timeline: document.getElementById('timeline'),
  // ...
};
```

`document.getElementById('newBtn')` means "find the element tagged `newBtn`".

### Part B — Keep track of "state"

**State** is the current situation of the app: which month we're viewing, the
entries loaded, the search text. We keep it in one object:

```js
const state = {
  currentMonth: '2026-05',
  entries: [],
  activeTags: new Set(),
};
```

> **Why one `state` object?** When all the changing data lives in one place, you
> always know where to look. Scattered variables cause bugs.

### Part C — Respond to clicks (event listeners)

An **event listener** says "when X happens, run this function":

```js
els.newBtn.onclick = () => {
  openComposer();   // when + New is clicked, open the form
};
```

The `() => { ... }` is an **arrow function** — a short way to write a function.

### Part D — Draw the screen (rendering)

"Rendering" means *building HTML from data*. The timeline render:

1. Takes `state.entries` (the data).
2. Groups them by day.
3. Builds an HTML element for each entry.
4. Puts them into `#timeline`.

```js
function renderTimeline() {
  els.timeline.innerHTML = '';                  // clear old content
  for (const entry of state.entries) {
    const div = renderEntry(entry);             // build one entry
    els.timeline.appendChild(div);              // add it to the page
  }
}
```

The golden loop of any app: **data changes → call render → screen updates.**

### Saving a new entry — the full flow

When you hit Save, `app.js` does this in order:

1. Read the heading and body from the form.
2. Upload any images to GitHub (`github.js` does the actual upload).
3. Build an entry object with a timestamp and extracted tags.
4. Add it to the month's list and save the list to GitHub.
5. Re-render the timeline so you see it immediately.

---

## Step 7 — Search across months

**File: `search.js`**

Searching needs *all* your notes, but loading every month every time the app
opens would be slow. The trick: **load lazily**.

- We do **not** load all months at startup.
- The first time you type in the search box, we fetch every month's file once,
  combine them into one big list in memory, and remember it.
- Future searches just filter that in-memory list — instant.

```js
let allEntries = [];   // filled on first search

async function ensureIndex() {
  if (allEntries.length) return;       // already loaded, skip
  const months = await listMonths();
  for (const m of months) {
    const entries = await loadMonth(m);
    allEntries.push(...entries);
  }
}
```

> **`...` (spread):** `push(...entries)` adds every item of `entries`
> individually, instead of adding the array as one nested item.

We also support `tag:planning` style searches by checking for that prefix before
matching.

---

## Step 8 — Making it installable

### The manifest

**File: `manifest.webmanifest`** — a small JSON file describing the app:

```json
{
  "name": "TaskLog",
  "start_url": ".",
  "display": "standalone",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" }
  ]
}
```

- `display: "standalone"` — open without the browser address bar.
- `icons` — what shows on the home screen.

`index.html` links to it: `<link rel="manifest" href="manifest.webmanifest">`.

### The service worker

**File: `sw.js`** — a script that runs *in the background*, even when the app is
closed. Its main job here: **cache the app's files so it opens offline.**

```js
const VERSION = 'tasklog-v2';
const SHELL = ['./', './index.html', './styles.css', './app.js', /* ... */];

// On install: save all the app's files into a cache
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION).then(c => c.addAll(SHELL))
  );
});

// On every request: serve from cache if we have it, else fetch from network
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request))
  );
});
```

> **The `VERSION` trick:** browsers cache the service worker hard. When you
> change app files, you must change `VERSION` (e.g. `v2` → `v3`). The new name
> makes the browser treat it as a brand-new worker and refresh everything.
> Forgetting this is the #1 "why aren't my changes showing?" mistake.

We register the worker from `index.html`:

```js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
```

---

## Step 9 — Testing locally

Before putting anything online, test on your own machine.

```sh
cd ~/Documents/task-logger
python3 -m http.server 8000
```

Open `http://localhost:8000` in Chrome.

### Use the DevTools

Press **F12** (or Cmd+Option+I) to open Chrome DevTools:

- **Console tab** — shows errors in red. *Always check this first when something
  breaks.* `console.log('here', someValue)` in your code prints to here.
- **Application tab** — inspect the manifest, service worker, and storage.
- **Network tab** — see every request the app makes.

> **Debugging mindset:** when something doesn't work, don't guess. Open the
> Console, read the error, note the file and line number it gives you, and look
> there. The error message is almost always telling you the truth.

---

## Step 10 — Deploying to the internet

GitHub Pages hosts websites for free with HTTPS — exactly what a PWA needs.

1. Put the project in a GitHub repository:
   ```sh
   git init
   git add .
   git commit -m "Initial version"
   git remote add origin https://github.com/YOURNAME/task-logger.git
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Source: `main` branch, `/` folder**.
3. Wait ~1 minute. Your app is live at
   `https://YOURNAME.github.io/task-logger/`.
4. Open that URL on your phone → "Add to Home Screen".

Every time you `git push` new changes, the live site updates automatically.

---

## JavaScript concepts cheat-sheet

A quick reference for the ideas used in this project:

| Concept | What it is | Example |
|---|---|---|
| **Variable** | A named box for a value | `const name = 'Sam';` |
| **`const` vs `let`** | `const` can't be reassigned; `let` can | `let count = 0;` |
| **Function** | Reusable block of code | `function greet() { ... }` |
| **Arrow function** | Short function syntax | `() => { ... }` |
| **Object** | Group of named values | `{ name: 'Sam', age: 9 }` |
| **Array** | Ordered list | `[1, 2, 3]` |
| **`for...of`** | Loop over an array | `for (const x of list) { }` |
| **`async`/`await`** | Wait for slow work (network) | `await fetch(url)` |
| **`import`/`export`** | Share code between files | `import { x } from './y.js'` |
| **Event listener** | "When X happens, do Y" | `btn.onclick = () => {}` |
| **DOM** | The page as objects JS can change | `document.getElementById(...)` |
| **`localStorage`** | Save small data in the browser | `localStorage.setItem('k','v')` |
| **JSON** | Data written as text | `JSON.stringify(obj)` |
| **Template literal** | String with `${}` slots | `` `Hi ${name}` `` |
| **Spread `...`** | Expand an array/object | `[...a, ...b]` |

---

## Common bugs we hit

Real bugs from building *this* app — and the lesson each one teaches.

### Bug 1 — The hidden banner that wouldn't hide

The iOS install banner showed even when told to hide. Cause: our CSS had
`display: flex` on it, which **overrode** the HTML `hidden` attribute.

**Lesson:** CSS `display` beats the `hidden` attribute. The fix was one line:
```css
[hidden] { display: none !important; }
```

### Bug 2 — Wrong dates near midnight

Notes written after midnight showed on the *previous* day. Cause: we grouped
entries using **UTC time**, but the user lives in UTC+6. At 2 AM local, UTC is
still "yesterday".

**Lesson:** store timestamps in UTC (good for sorting), but always *display* and
*group* them in the user's **local** time.

### Bug 3 — Images came back blank

Uploaded screenshots wouldn't display. Cause: the GitHub API we used returns
**empty content for files over 1 MB**, and most screenshots are bigger.

**Lesson:** read the API documentation's limits. The fix was to request the file
a different way ("raw media type") that has no size cap.

### Bug 4 — "Cannot access 'pad2' before initialization"

The whole app crashed on load. Cause: our `state` object called a function that
used a `const` defined *later* in the file. A `const` does not exist until the
line that defines it runs — this is the **Temporal Dead Zone**.

**Lesson:** define things *before* you use them. If function A runs during
startup and needs value B, B must be defined above the startup code.

---

## Where to go next

You now understand a complete, real PWA. To deepen your skills:

- **Read the actual files** in this project alongside this guide. Every concept
  above is in there, in context.
- **Break things on purpose.** Change a color, delete a line, see the error.
  Fixing your own breakage is the fastest way to learn.
- **Add a feature.** Try: an "edit entry" button, or a word count, or a new
  theme. Small additions teach more than tutorials.

Good references:
- [MDN Web Docs](https://developer.mozilla.org/) — the encyclopedia of web tech.
- [javascript.info](https://javascript.info/) — a thorough, free JS course.

Happy building.
