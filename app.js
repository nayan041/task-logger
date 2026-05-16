// TaskLog — main UI controller.
// Handles two views (Notes + Finance), an offline sync queue, and printing.

import * as gh from './github.js';
import { render, highlight, extractTags } from './markdown.js';
import * as searchMod from './search.js';
import * as db from './db.js';

// ----- DOM refs -----
const $ = id => document.getElementById(id);
const els = {
  prevMonth: $('prevMonth'), monthLabel: $('monthLabel'), nextMonth: $('nextMonth'),
  viewSwitch: $('viewSwitch'), search: $('search'), pendingBadge: $('pendingBadge'),
  newBtn: $('newBtn'), settingsBtn: $('settingsBtn'),
  tagbar: $('tagbar'),
  financebar: $('financebar'), financeSummary: $('financeSummary'), financeFilters: $('financeFilters'),
  timeline: $('timeline'), status: $('status'),
  iosHint: $('iosHint'), iosHintClose: $('iosHintClose'),
  // note composer
  composer: $('composer'), composerForm: $('composerForm'),
  composerHeading: $('composerHeading'), composerBody: $('composerBody'),
  composerThumbs: $('composerThumbs'), composerFiles: $('composerFiles'),
  composerCancel: $('composerCancel'), composerSave: $('composerSave'),
  composerTime: $('composerTime'), composerPreview: $('composerPreview'),
  composerPreviewPane: $('composerPreviewPane'),
  // finance composer
  financeComposer: $('financeComposer'), financeForm: $('financeForm'),
  financeTime: $('financeTime'), financeCancel: $('financeCancel'),
  financeType: $('financeType'),
  financeCategorySel: $('financeCategorySel'), financeSubcategorySel: $('financeSubcategorySel'),
  financeAmount: $('financeAmount'), financeTagsInput: $('financeTagsInput'),
  financeNote: $('financeNote'), financeThumbs: $('financeThumbs'),
  financeFiles: $('financeFiles'), financeHint: $('financeHint'), financeSave: $('financeSave'),
  // categories manager
  categories: $('categories'), categoriesForm: $('categoriesForm'),
  categoriesList: $('categoriesList'), newCategoryInput: $('newCategoryInput'),
  addCategoryBtn: $('addCategoryBtn'), categoriesStatus: $('categoriesStatus'),
  categoriesCancel: $('categoriesCancel'), categoriesSave: $('categoriesSave'),
  // print
  printDialog: $('printDialog'), printForm: $('printForm'),
  printFrom: $('printFrom'), printTo: $('printTo'),
  printNotes: $('printNotes'), printFinance: $('printFinance'),
  printStatus: $('printStatus'), printGo: $('printGo'), printCancel: $('printCancel'),
  printArea: $('printArea'),
  // settings
  settings: $('settings'), settingsForm: $('settingsForm'),
  settingsRepo: $('settingsRepo'), settingsBranch: $('settingsBranch'),
  settingsPat: $('settingsPat'), settingsTheme: $('settingsTheme'),
  settingsStatus: $('settingsStatus'), settingsCancel: $('settingsCancel'),
  settingsTest: $('settingsTest'), settingsCategories: $('settingsCategories'),
  settingsPrint: $('settingsPrint'), settingsRefreshIndex: $('settingsRefreshIndex'),
  // lightbox
  lightbox: $('lightbox'), lightboxImg: $('lightboxImg'),
};

// ----- State -----
const state = {
  view: 'notes',                  // 'notes' | 'finance'
  currentMonth: monthKey(new Date()),
  entries: [],                    // note entries for currentMonth
  financeRecords: [],             // finance records for currentMonth
  activeTags: new Set(),          // notes tag filter
  financeCategoryFilter: '',      // finance category filter
  financeTags: new Set(),         // finance tag filter
  financeType: 'expense',         // composer income/expense toggle
  categories: {},                 // { category: [subcategory, ...] }
  searchQuery: '',
  pendingImages: [],              // [{blob, name, url}] for the open composer
  pendingCount: 0,
};

// ----- Utilities -----
// Timestamps are stored as UTC ISO strings (sortable); all day/month grouping
// derives from LOCAL time so entries land on the day the user sees.
const pad2 = n => String(n).padStart(2, '0');

// Self-contained (no pad2 dep) — runs during `state` initialization.
function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthOf(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function ymd(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function fmtMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
}
function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}
function fmtClock() {
  return new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}
function fmtDayHead(dayStr) {
  const [y, m, dd] = dayStr.split('-').map(Number);
  const d = new Date(y, m - 1, dd);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((today - d) / 86400000);
  const label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  if (days === 0) return `Today · ${label}`;
  if (days === 1) return `Yesterday · ${label}`;
  return label;
}
function fmtTaka(n) {
  const v = Number(n) || 0;
  return '৳' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function uid(ts) {
  return `${ts}-${Math.random().toString(36).slice(2, 6)}`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function toast(msg, kind = '') {
  els.status.textContent = msg;
  els.status.className = 'status' + (kind ? ' ' + kind : '');
  els.status.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { els.status.hidden = true; }, 3200);
}
// A network error (vs. a real HTTP error response like 401/409).
function isNetworkError(e) {
  return !navigator.onLine || (e && e.name === 'TypeError');
}

// ----- Theme -----
function applyTheme(t) {
  document.body.dataset.theme = t || 'sakura';
  localStorage.setItem('taskLogger.theme', t || 'sakura');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim();
    if (bg) meta.setAttribute('content', bg);
  }
}
applyTheme(localStorage.getItem('taskLogger.theme') || 'sakura');

// ----- View + month navigation -----
function setView(v) {
  state.view = v;
  localStorage.setItem('taskLogger.view', v);
  els.viewSwitch.querySelectorAll('button').forEach(b =>
    b.classList.toggle('active', b.dataset.view === v));
  els.search.hidden = (v !== 'notes');
  els.financebar.hidden = (v !== 'finance');
  els.tagbar.hidden = true;
  els.search.value = '';
  state.searchQuery = '';
  refresh();
}
function setMonth(key) {
  state.currentMonth = key;
  els.monthLabel.textContent = fmtMonth(key);
  refresh();
}
function refresh() {
  if (state.view === 'finance') loadCurrentFinance();
  else loadCurrentMonth();
}
els.viewSwitch.querySelectorAll('button').forEach(b => {
  b.onclick = () => setView(b.dataset.view);
});
els.prevMonth.onclick = () => setMonth(shiftMonth(state.currentMonth, -1));
els.nextMonth.onclick = () => setMonth(shiftMonth(state.currentMonth, +1));
els.monthLabel.onclick = () => setMonth(monthKey(new Date()));

// ----- Pending (offline) entries for a month -----
async function pendingFor(kind, month) {
  let all = [];
  try { all = await db.queueAll(); } catch (e) { console.warn('queue read failed', e); }
  return all
    .filter(q => q.kind === kind && q.month === month)
    .map(q => ({ ...q.entry, _pending: true, _pendingImages: q.images || [], _queueId: q.queueId }));
}

// ===================================================================
// NOTES VIEW
// ===================================================================
async function loadCurrentMonth() {
  if (!gh.isConfigured()) {
    renderEmpty('Not configured. Open Settings to add your repo + PAT.');
    return;
  }
  renderEmpty('Loading…');
  try {
    const remote = await gh.loadMonth(state.currentMonth);
    const pending = await pendingFor('note', state.currentMonth);
    state.entries = [...remote, ...pending];
    renderTimeline();
  } catch (e) {
    console.error(e);
    const pending = await pendingFor('note', state.currentMonth);
    if (pending.length) {
      state.entries = pending;
      renderTimeline();
      toast('Offline — showing unsynced notes only.', '');
    } else {
      renderEmpty('Could not load. You may be offline, or check repo + PAT in Settings.');
    }
  }
}

function renderEmpty(msg) {
  els.timeline.innerHTML = `<div class="empty"><p>${escapeHtml(msg)}</p></div>`;
}

function renderTagbar() {
  const allTags = new Set();
  for (const e of state.entries) for (const t of (e.tags || [])) allTags.add(t);
  if (!allTags.size && !state.activeTags.size) {
    els.tagbar.hidden = true; els.tagbar.innerHTML = ''; return;
  }
  els.tagbar.hidden = false;
  els.tagbar.innerHTML = '';
  for (const t of [...allTags].sort()) {
    const b = document.createElement('button');
    b.className = 'tagchip' + (state.activeTags.has(t) ? ' active' : '');
    b.textContent = '#' + t;
    b.onclick = () => {
      state.activeTags.has(t) ? state.activeTags.delete(t) : state.activeTags.add(t);
      renderTimeline();
    };
    els.tagbar.appendChild(b);
  }
  if (state.activeTags.size) {
    const clear = document.createElement('button');
    clear.className = 'tagchip';
    clear.textContent = 'clear ×';
    clear.onclick = () => { state.activeTags.clear(); renderTimeline(); };
    els.tagbar.appendChild(clear);
  }
}

function renderTimeline() {
  if (state.searchQuery.trim()) return renderSearchResults();
  renderTagbar();
  let entries = state.entries;
  if (state.activeTags.size) {
    entries = entries.filter(e => {
      const tags = (e.tags || []).map(t => t.toLowerCase());
      for (const t of state.activeTags) if (!tags.includes(t)) return false;
      return true;
    });
  }
  if (!entries.length) { renderEmpty('No notes yet for this month.'); return; }
  const byDay = new Map();
  for (const e of entries) {
    const k = dayKey(e.ts);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(e);
  }
  const frag = document.createDocumentFragment();
  for (const k of [...byDay.keys()].sort((a, b) => b.localeCompare(a))) {
    const head = document.createElement('div');
    head.className = 'dayhead';
    head.textContent = fmtDayHead(k);
    frag.appendChild(head);
    for (const e of byDay.get(k).sort((a, b) => b.ts.localeCompare(a.ts)))
      frag.appendChild(renderEntry(e));
  }
  els.timeline.innerHTML = '';
  els.timeline.appendChild(frag);
}

// Shared image helpers (used by both note entries and finance records).
function entryImages(entry) {
  return (entry._pending ? entry._pendingImages : entry.images) || [];
}
function attachImages(wrap, entry) {
  for (const img of entryImages(entry)) {
    const im = document.createElement('img');
    im.alt = img.alt || '';
    im.loading = 'lazy';
    if (entry._pending) {
      im.src = URL.createObjectURL(img.blob);
    } else {
      gh.fetchImageBlob(img.path)
        .then(url => { im.src = url; })
        .catch(e => { console.warn('image load failed', img.path, e); im.alt = '(image failed)'; });
    }
    im.onclick = () => openLightbox(im.src);
    wrap.appendChild(im);
  }
}

function renderEntry(entry, highlightTerm = '') {
  const div = document.createElement('article');
  div.className = 'entry';
  div.dataset.id = entry.id;
  let bodyHtml = render(entry.body || '');
  let headingHtml = render(entry.heading || '').replace(/^<p>|<\/p>\s*$/g, '');
  if (highlightTerm) {
    bodyHtml = highlight(bodyHtml, highlightTerm);
    headingHtml = highlight(headingHtml, highlightTerm);
  }
  const flag = entry._pending ? '<span class="pendingflag">⏳ not synced</span>' : '';
  div.innerHTML = `
    <div class="ts">${fmtTime(entry.ts)}</div>
    <div>
      <h3 class="heading">${headingHtml}${flag}</h3>
      <div class="body">${bodyHtml}</div>
      ${entryImages(entry).length ? '<div class="imgs"></div>' : ''}
    </div>`;
  if (entryImages(entry).length) attachImages(div.querySelector('.imgs'), entry);
  div.addEventListener('click', ev => {
    const a = ev.target.closest('a.hashtag');
    if (a) {
      ev.preventDefault();
      const t = a.dataset.tag;
      state.activeTags.has(t) ? state.activeTags.delete(t) : state.activeTags.add(t);
      els.search.value = ''; state.searchQuery = '';
      renderTimeline();
    }
    const im = ev.target.closest('.body img');
    if (im) openLightbox(im.src);
  });
  return div;
}

function openLightbox(src) {
  els.lightboxImg.src = src;
  els.lightbox.showModal();
}
els.lightbox.onclick = () => els.lightbox.close();

// ----- Search (notes only) -----
let searchTimer = null;
els.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.searchQuery = els.search.value;
    if (state.searchQuery.trim()) renderSearchResults();
    else renderTimeline();
  }, 250);
});

async function renderSearchResults() {
  if (!gh.isConfigured()) { renderEmpty('Not configured.'); return; }
  els.tagbar.hidden = true;
  renderEmpty('Building search index…');
  try {
    await searchMod.ensureIndex((done, total) => {
      renderEmpty(`Building search index… (${done}/${total})`);
    });
  } catch (e) {
    renderEmpty('Search needs a connection.'); toast(e.message, 'error'); return;
  }
  const results = searchMod.search(state.searchQuery);
  const term = searchMod.freeTerm(state.searchQuery);
  if (!results.length) { renderEmpty('No matches.'); return; }
  const frag = document.createDocumentFragment();
  let lastDay = '';
  for (const e of results) {
    const k = dayKey(e.ts);
    if (k !== lastDay) {
      lastDay = k;
      const head = document.createElement('div');
      head.className = 'dayhead';
      head.textContent = fmtDayHead(k);
      frag.appendChild(head);
    }
    frag.appendChild(renderEntry(e, term));
  }
  els.timeline.innerHTML = '';
  els.timeline.appendChild(frag);
}

// ===================================================================
// FINANCE VIEW
// ===================================================================
async function loadCurrentFinance() {
  if (!gh.isConfigured()) {
    els.financeSummary.innerHTML = '';
    els.financeFilters.innerHTML = '';
    renderEmpty('Not configured. Open Settings to add your repo + PAT.');
    return;
  }
  renderEmpty('Loading…');
  try {
    const remote = await gh.loadMonth(state.currentMonth, 'finance');
    const pending = await pendingFor('finance', state.currentMonth);
    state.financeRecords = [...remote, ...pending];
    renderFinanceView();
  } catch (e) {
    console.error(e);
    const pending = await pendingFor('finance', state.currentMonth);
    if (pending.length) {
      state.financeRecords = pending;
      renderFinanceView();
      toast('Offline — showing unsynced records only.', '');
    } else {
      renderEmpty('Could not load. You may be offline, or check repo + PAT in Settings.');
    }
  }
}

function renderFinanceView() {
  let recs = state.financeRecords;
  if (state.financeCategoryFilter)
    recs = recs.filter(r => r.category === state.financeCategoryFilter);
  if (state.financeTags.size) {
    recs = recs.filter(r => {
      const t = (r.tags || []).map(x => x.toLowerCase());
      for (const x of state.financeTags) if (!t.includes(x)) return false;
      return true;
    });
  }
  let inc = 0, exp = 0;
  for (const r of recs) {
    const a = Number(r.amount) || 0;
    if (r.type === 'income') inc += a; else exp += a;
  }
  renderFinanceBar(inc, exp);

  if (!recs.length) { renderEmpty('No finance records match.'); return; }
  const byDay = new Map();
  for (const r of recs) {
    const k = dayKey(r.ts);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(r);
  }
  const frag = document.createDocumentFragment();
  for (const k of [...byDay.keys()].sort((a, b) => b.localeCompare(a))) {
    const head = document.createElement('div');
    head.className = 'dayhead';
    head.textContent = fmtDayHead(k);
    frag.appendChild(head);
    for (const r of byDay.get(k).sort((a, b) => b.ts.localeCompare(a.ts)))
      frag.appendChild(renderFinanceRecord(r));
  }
  els.timeline.innerHTML = '';
  els.timeline.appendChild(frag);
}

function renderFinanceBar(inc, exp) {
  els.financeSummary.innerHTML =
    `<span><span class="lbl">Income</span><span class="amt-income">${fmtTaka(inc)}</span></span>` +
    `<span><span class="lbl">Expense</span><span class="amt-expense">${fmtTaka(exp)}</span></span>` +
    `<span><span class="lbl">Net</span><span class="amt-net">${fmtTaka(inc - exp)}</span></span>`;

  els.financeFilters.innerHTML = '';
  const sel = document.createElement('select');
  sel.add(new Option('All categories', ''));
  const cats = [...new Set(state.financeRecords.map(r => r.category).filter(Boolean))].sort();
  for (const c of cats) {
    const o = new Option(c, c);
    if (c === state.financeCategoryFilter) o.selected = true;
    sel.add(o);
  }
  sel.onchange = () => { state.financeCategoryFilter = sel.value; renderFinanceView(); };
  els.financeFilters.appendChild(sel);

  const tags = [...new Set(state.financeRecords.flatMap(r => r.tags || []))].sort();
  for (const t of tags) {
    const b = document.createElement('button');
    b.className = 'tagchip' + (state.financeTags.has(t) ? ' active' : '');
    b.textContent = '#' + t;
    b.onclick = () => {
      state.financeTags.has(t) ? state.financeTags.delete(t) : state.financeTags.add(t);
      renderFinanceView();
    };
    els.financeFilters.appendChild(b);
  }
  if (state.financeTags.size || state.financeCategoryFilter) {
    const clear = document.createElement('button');
    clear.className = 'tagchip';
    clear.textContent = 'clear ×';
    clear.onclick = () => {
      state.financeTags.clear();
      state.financeCategoryFilter = '';
      renderFinanceView();
    };
    els.financeFilters.appendChild(clear);
  }
}

function renderFinanceRecord(r) {
  const div = document.createElement('article');
  div.className = 'frecord';
  div.dataset.id = r.id;
  const sign = r.type === 'income' ? '+' : '−';
  const catLine = escapeHtml(r.category || '') +
    (r.subcategory ? ` <span class="sub">› ${escapeHtml(r.subcategory)}</span>` : '');
  const flag = r._pending ? '<span class="pendingflag">⏳ not synced</span>' : '';
  const noteHtml = r.note ? render(r.note) : '';
  const tagsHtml = (r.tags || []).map(t => `<span class="ftag">#${escapeHtml(t)}</span>`).join('');
  div.innerHTML = `
    <div class="ts">${fmtTime(r.ts)}</div>
    <div class="fmeta">
      <div class="fcat">${catLine}${flag}</div>
      ${noteHtml ? `<div class="fnote">${noteHtml}</div>` : ''}
      ${tagsHtml ? `<div class="ftags">${tagsHtml}</div>` : ''}
      ${entryImages(r).length ? '<div class="imgs"></div>' : ''}
    </div>
    <div class="famount ${r.type === 'income' ? 'income' : 'expense'}">${sign}${fmtTaka(r.amount)}</div>`;
  if (entryImages(r).length) attachImages(div.querySelector('.imgs'), r);
  div.addEventListener('click', ev => {
    const a = ev.target.closest('a.hashtag');
    if (a) {
      ev.preventDefault();
      const t = a.dataset.tag;
      state.financeTags.has(t) ? state.financeTags.delete(t) : state.financeTags.add(t);
      renderFinanceView();
    }
    const im = ev.target.closest('.fnote img');
    if (im) openLightbox(im.src);
  });
  return div;
}

// ===================================================================
// CATEGORIES
// ===================================================================
async function loadCategoriesConfig() {
  const cached = localStorage.getItem('taskLogger.categories');
  if (cached) { try { state.categories = JSON.parse(cached); } catch {} }
  if (!gh.isConfigured() || !navigator.onLine) return;
  try {
    state.categories = await gh.loadCategories();
    localStorage.setItem('taskLogger.categories', JSON.stringify(state.categories));
  } catch (e) {
    console.warn('categories load failed', e);
  }
}

let catDraft = {};
function openCategories() {
  catDraft = JSON.parse(JSON.stringify(state.categories || {}));
  els.categoriesStatus.textContent = '';
  els.categoriesStatus.className = 'settingsStatus';
  els.newCategoryInput.value = '';
  renderCategoriesList();
  els.categories.showModal();
}
function renderCategoriesList() {
  els.categoriesList.innerHTML = '';
  const cats = Object.keys(catDraft).sort();
  if (!cats.length) {
    els.categoriesList.innerHTML = '<p class="hint">No categories yet. Add one below.</p>';
    return;
  }
  for (const cat of cats) {
    const row = document.createElement('div');
    row.className = 'catrow';
    row.innerHTML = `
      <div class="catname">
        <span>${escapeHtml(cat)}</span>
        <button type="button" class="iconbtn delcat" aria-label="Delete category">🗑</button>
      </div>
      <div class="subs"></div>
      <input class="addsub" type="text" placeholder="Add subcategory, press Enter">`;
    const subsEl = row.querySelector('.subs');
    for (const s of (catDraft[cat] || [])) {
      const chip = document.createElement('span');
      chip.className = 'subchip';
      chip.innerHTML = `${escapeHtml(s)} <button type="button" aria-label="Remove">×</button>`;
      chip.querySelector('button').onclick = () => {
        catDraft[cat] = catDraft[cat].filter(x => x !== s);
        renderCategoriesList();
      };
      subsEl.appendChild(chip);
    }
    row.querySelector('.delcat').onclick = () => { delete catDraft[cat]; renderCategoriesList(); };
    const addInput = row.querySelector('.addsub');
    addInput.onkeydown = ev => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      const v = addInput.value.trim();
      if (v && !(catDraft[cat] || []).includes(v)) {
        catDraft[cat] = [...(catDraft[cat] || []), v];
        renderCategoriesList();
      }
    };
    els.categoriesList.appendChild(row);
  }
}
els.addCategoryBtn.onclick = () => {
  const v = els.newCategoryInput.value.trim();
  if (!v) return;
  if (!catDraft[v]) catDraft[v] = [];
  els.newCategoryInput.value = '';
  renderCategoriesList();
};
els.categoriesCancel.onclick = () => els.categories.close();
els.categoriesForm.addEventListener('submit', async ev => {
  ev.preventDefault();
  els.categoriesSave.disabled = true;
  els.categoriesStatus.textContent = 'Saving…';
  els.categoriesStatus.className = 'settingsStatus';
  try {
    await gh.saveCategories(catDraft);
    state.categories = catDraft;
    localStorage.setItem('taskLogger.categories', JSON.stringify(catDraft));
    els.categories.close();
    toast('Categories saved.', 'ok');
  } catch (e) {
    els.categoriesStatus.textContent = e.message;
    els.categoriesStatus.className = 'settingsStatus error';
  } finally {
    els.categoriesSave.disabled = false;
  }
});

// ===================================================================
// IMAGE INPUT (shared by both composers)
// ===================================================================
function addPendingImage(file, thumbsEl) {
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `${ts}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const url = URL.createObjectURL(file);
  const item = { blob: file, name, url };
  state.pendingImages.push(item);
  const wrap = document.createElement('div');
  wrap.className = 'thumb';
  wrap.innerHTML = `<img src="${url}" alt=""><button type="button" aria-label="Remove">×</button>`;
  wrap.querySelector('button').onclick = () => {
    URL.revokeObjectURL(url);
    state.pendingImages = state.pendingImages.filter(x => x !== item);
    wrap.remove();
  };
  thumbsEl.appendChild(wrap);
}
function handleImagePaste(e, thumbsEl) {
  if (!e.clipboardData) return;
  for (const it of e.clipboardData.items || []) {
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) addPendingImage(f, thumbsEl);
    }
  }
}
els.composerFiles.addEventListener('change', e => {
  for (const f of e.target.files) addPendingImage(f, els.composerThumbs);
  e.target.value = '';
});
els.composerBody.addEventListener('paste', e => handleImagePaste(e, els.composerThumbs));
els.financeFiles.addEventListener('change', e => {
  for (const f of e.target.files) addPendingImage(f, els.financeThumbs);
  e.target.value = '';
});
els.financeNote.addEventListener('paste', e => handleImagePaste(e, els.financeThumbs));

// ===================================================================
// COMMIT (online → upload + save, offline → queue)
// ===================================================================
async function commitEntry(kind, entry, pendingImages, targetMonth) {
  const folder = kind === 'finance' ? 'finance' : 'logs';
  if (navigator.onLine) {
    try {
      const uploaded = [];
      for (const im of pendingImages) {
        const path = await gh.uploadImage(im.blob, im.name);
        uploaded.push({ path, alt: '' });
      }
      entry.images = uploaded;
      const monthEntries = await gh.loadMonth(targetMonth, folder);
      monthEntries.push(entry);
      await gh.saveMonth(targetMonth, monthEntries, folder);
      return 'synced';
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      // network died mid-save → fall through and queue it
    }
  }
  await db.queueAdd({
    kind, month: targetMonth, entry,
    images: pendingImages.map(im => ({ name: im.name, blob: im.blob })),
  });
  return 'queued';
}

function afterCommit(kind, targetMonth, result) {
  state.currentMonth = targetMonth;
  els.monthLabel.textContent = fmtMonth(targetMonth);
  const wantView = kind === 'finance' ? 'finance' : 'notes';
  if (state.view !== wantView) setView(wantView);
  else refresh();
  updatePendingBadge();
  if (result === 'synced') { toast('Saved.', 'ok'); flushQueue(); }
  else toast('Saved offline — will sync when back online.', '');
}

// ----- Offline sync queue -----
let flushing = false;
async function flushQueue() {
  if (flushing || !navigator.onLine || !gh.isConfigured()) return;
  flushing = true;
  let synced = 0;
  try {
    const items = await db.queueAll();
    for (const item of items) {
      try {
        const folder = item.kind === 'finance' ? 'finance' : 'logs';
        const uploaded = [];
        for (const im of (item.images || [])) {
          const path = await gh.uploadImage(im.blob, im.name);
          uploaded.push({ path, alt: '' });
        }
        const entry = { ...item.entry, images: uploaded };
        const monthEntries = await gh.loadMonth(item.month, folder);
        monthEntries.push(entry);
        await gh.saveMonth(item.month, monthEntries, folder);
        await db.queueRemove(item.queueId);
        if (item.kind === 'note') searchMod.upsertEntry(entry, item.month);
        synced++;
      } catch (e) {
        // Keep this and remaining items; retry on the next online event.
        console.warn('Queue flush paused:', e);
        break;
      }
    }
  } finally {
    flushing = false;
    await updatePendingBadge();
    if (synced > 0) { toast(`Synced ${synced} offline record(s).`, 'ok'); refresh(); }
  }
}
async function updatePendingBadge() {
  let n = 0;
  try { n = await db.queueCount(); } catch {}
  state.pendingCount = n;
  els.pendingBadge.hidden = n === 0;
  els.pendingBadge.textContent = `⏳ ${n}`;
}
els.pendingBadge.onclick = () => {
  if (!navigator.onLine) { toast('Still offline — will sync automatically later.', ''); return; }
  toast('Syncing…', '');
  flushQueue();
};
window.addEventListener('online', () => { toast('Back online — syncing…', 'ok'); flushQueue(); });
window.addEventListener('offline', () => toast('Offline — new entries will be saved on this device.', ''));

// ===================================================================
// NOTE COMPOSER
// ===================================================================
function openComposer() {
  if (!gh.isConfigured()) {
    toast('Configure repo + PAT in Settings first.', 'error');
    openSettings(); return;
  }
  els.composerHeading.value = '';
  els.composerBody.value = '';
  els.composerThumbs.innerHTML = '';
  els.composerPreviewPane.hidden = true;
  els.composerPreviewPane.innerHTML = '';
  state.pendingImages = [];
  els.composerTime.textContent = fmtClock();
  els.composer.showModal();
  setTimeout(() => els.composerHeading.focus(), 50);
}
els.composerCancel.onclick = () => els.composer.close();
els.composerPreview.onclick = () => {
  if (!els.composerPreviewPane.hidden) {
    els.composerPreviewPane.hidden = true;
    els.composerPreviewPane.innerHTML = '';
  } else {
    els.composerPreviewPane.innerHTML =
      render(`# ${els.composerHeading.value}\n\n${els.composerBody.value}`);
    els.composerPreviewPane.hidden = false;
  }
};
els.composerForm.addEventListener('submit', async ev => {
  ev.preventDefault();
  const heading = els.composerHeading.value.trim();
  const body = els.composerBody.value.trim();
  if (!heading) return;
  els.composerSave.disabled = true;
  try {
    const ts = new Date().toISOString();
    const tags = [...new Set([...extractTags(heading), ...extractTags(body)])];
    const entry = { id: uid(ts), ts, heading, body, tags, images: [] };
    const targetMonth = monthOf(ts);
    const result = await commitEntry('note', entry, state.pendingImages, targetMonth);
    if (result === 'synced') searchMod.upsertEntry(entry, targetMonth);
    for (const im of state.pendingImages) URL.revokeObjectURL(im.url);
    state.pendingImages = [];
    els.composer.close();
    afterCommit('note', targetMonth, result);
  } catch (e) {
    console.error(e);
    toast(e.message, 'error');
  } finally {
    els.composerSave.disabled = false;
  }
});

// ===================================================================
// FINANCE COMPOSER
// ===================================================================
function updateTypeSeg() {
  els.financeType.querySelectorAll('button').forEach(b =>
    b.classList.toggle('active', b.dataset.ftype === state.financeType));
}
els.financeType.querySelectorAll('button').forEach(b => {
  b.onclick = () => { state.financeType = b.dataset.ftype; updateTypeSeg(); };
});
function populateFinanceCategories() {
  const sel = els.financeCategorySel;
  sel.innerHTML = '';
  const cats = Object.keys(state.categories || {}).sort();
  if (!cats.length) {
    sel.add(new Option('— no categories —', ''));
  } else {
    sel.add(new Option('Select…', ''));
    for (const c of cats) sel.add(new Option(c, c));
  }
  populateFinanceSubcategories();
}
function populateFinanceSubcategories() {
  const sel = els.financeSubcategorySel;
  sel.innerHTML = '';
  sel.add(new Option('—', ''));
  for (const s of ((state.categories || {})[els.financeCategorySel.value] || []))
    sel.add(new Option(s, s));
}
els.financeCategorySel.onchange = populateFinanceSubcategories;

function openFinanceComposer() {
  if (!gh.isConfigured()) {
    toast('Configure repo + PAT in Settings first.', 'error');
    openSettings(); return;
  }
  state.financeType = 'expense';
  updateTypeSeg();
  populateFinanceCategories();
  els.financeAmount.value = '';
  els.financeTagsInput.value = '';
  els.financeNote.value = '';
  els.financeThumbs.innerHTML = '';
  state.pendingImages = [];
  els.financeTime.textContent = fmtClock();
  const hasCats = Object.keys(state.categories || {}).length > 0;
  els.financeHint.textContent = hasCats ? '' : 'No categories yet — add some in Settings → Manage categories.';
  els.financeHint.className = 'settingsStatus' + (hasCats ? '' : ' error');
  els.financeComposer.showModal();
}
els.financeCancel.onclick = () => els.financeComposer.close();
els.financeForm.addEventListener('submit', async ev => {
  ev.preventDefault();
  const category = els.financeCategorySel.value;
  const subcategory = els.financeSubcategorySel.value;
  const amount = parseFloat(els.financeAmount.value);
  const note = els.financeNote.value.trim();
  if (!category) { toast('Pick a category.', 'error'); return; }
  if (!(amount > 0)) { toast('Enter an amount greater than 0.', 'error'); return; }
  els.financeSave.disabled = true;
  try {
    const ts = new Date().toISOString();
    const inputTags = els.financeTagsInput.value
      .split(/[\s,]+/).map(t => t.replace(/^#/, '').toLowerCase()).filter(Boolean);
    const tags = [...new Set([...inputTags, ...extractTags(note)])];
    const record = {
      id: uid(ts), ts, type: state.financeType,
      category, subcategory, amount, note, tags, images: [],
    };
    const targetMonth = monthOf(ts);
    const result = await commitEntry('finance', record, state.pendingImages, targetMonth);
    for (const im of state.pendingImages) URL.revokeObjectURL(im.url);
    state.pendingImages = [];
    els.financeComposer.close();
    afterCommit('finance', targetMonth, result);
  } catch (e) {
    console.error(e);
    toast(e.message, 'error');
  } finally {
    els.financeSave.disabled = false;
  }
});

function openNew() {
  if (state.view === 'finance') openFinanceComposer();
  else openComposer();
}
els.newBtn.onclick = openNew;

// ===================================================================
// PRINT / EXPORT
// ===================================================================
function monthRange(from, to) {
  const out = [];
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4)), endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${pad2(m)}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}
function openPrint() {
  const today = new Date();
  els.printFrom.value = ymd(new Date(today.getFullYear(), today.getMonth(), 1));
  els.printTo.value = ymd(today);
  els.printNotes.checked = true;
  els.printFinance.checked = true;
  els.printStatus.textContent = '';
  els.printStatus.className = 'settingsStatus';
  els.printDialog.showModal();
}
els.printCancel.onclick = () => els.printDialog.close();
els.printForm.addEventListener('submit', async ev => {
  ev.preventDefault();
  const from = els.printFrom.value, to = els.printTo.value;
  if (!from || !to) {
    els.printStatus.textContent = 'Pick both dates.';
    els.printStatus.className = 'settingsStatus error'; return;
  }
  if (from > to) {
    els.printStatus.textContent = 'From date must not be after To date.';
    els.printStatus.className = 'settingsStatus error'; return;
  }
  if (!els.printNotes.checked && !els.printFinance.checked) {
    els.printStatus.textContent = 'Select notes, finance, or both.';
    els.printStatus.className = 'settingsStatus error'; return;
  }
  els.printGo.disabled = true;
  els.printStatus.textContent = 'Preparing…';
  els.printStatus.className = 'settingsStatus';
  try {
    await doPrint(from, to, els.printNotes.checked, els.printFinance.checked);
    els.printDialog.close();
  } catch (e) {
    console.error(e);
    els.printStatus.textContent = e.message || 'Failed to prepare.';
    els.printStatus.className = 'settingsStatus error';
  } finally {
    els.printGo.disabled = false;
  }
});

async function doPrint(from, to, wantNotes, wantFinance) {
  const months = monthRange(from, to);
  const notes = [], finance = [];
  let queued = [];
  try { queued = await db.queueAll(); } catch {}

  for (const m of months) {
    if (wantNotes) {
      try { notes.push(...await gh.loadMonth(m, 'logs')); } catch (e) { console.warn('print load logs', m, e); }
    }
    if (wantFinance) {
      try { finance.push(...await gh.loadMonth(m, 'finance')); } catch (e) { console.warn('print load finance', m, e); }
    }
  }
  if (wantNotes) notes.push(...queued.filter(q => q.kind === 'note').map(q => q.entry));
  if (wantFinance) finance.push(...queued.filter(q => q.kind === 'finance').map(q => q.entry));

  const inRange = e => { const d = dayKey(e.ts); return d >= from && d <= to; };
  const fNotes = notes.filter(inRange).sort((a, b) => a.ts.localeCompare(b.ts));
  const fFin = finance.filter(inRange).sort((a, b) => a.ts.localeCompare(b.ts));

  buildPrintArea(from, to, fNotes, fFin, wantNotes, wantFinance);
  window.print();
}

function buildPrintArea(from, to, notes, finance, wantNotes, wantFinance) {
  let html = `<h1>TaskLog records</h1><div class="prange">${from} to ${to}</div>`;

  if (wantNotes) {
    html += `<h2>Notes (${notes.length})</h2>`;
    if (!notes.length) {
      html += '<p>No notes in this range.</p>';
    } else {
      let lastDay = '';
      for (const e of notes) {
        const d = dayKey(e.ts);
        if (d !== lastDay) { lastDay = d; html += `<div class="pday">${escapeHtml(fmtDayHead(d))}</div>`; }
        const imgN = (e.images || []).length;
        html += `<div class="pentry"><span class="ptime">${fmtTime(e.ts)}</span> ` +
          `<h3>${escapeHtml(e.heading || '')}</h3>` +
          `<div>${render(e.body || '')}</div>` +
          (imgN ? `<div class="ptime">📎 ${imgN} image(s) — view in app</div>` : '') +
          `</div>`;
      }
    }
  }

  if (wantFinance) {
    html += `<h2>Finance (${finance.length})</h2>`;
    if (!finance.length) {
      html += '<p>No finance records in this range.</p>';
    } else {
      html += '<table><thead><tr><th>Date</th><th>Time</th><th>Type</th>' +
        '<th>Category</th><th>Subcategory</th><th>Tags</th>' +
        '<th>Amount (৳)</th><th>Note</th></tr></thead><tbody>';
      let inc = 0, exp = 0;
      for (const r of finance) {
        const amt = Number(r.amount) || 0;
        if (r.type === 'income') inc += amt; else exp += amt;
        const amtStr = (r.type === 'income' ? '+' : '−') +
          amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        html += `<tr><td>${dayKey(r.ts)}</td><td>${fmtTime(r.ts)}</td>` +
          `<td>${escapeHtml(r.type || '')}</td>` +
          `<td>${escapeHtml(r.category || '')}</td>` +
          `<td>${escapeHtml(r.subcategory || '')}</td>` +
          `<td>${(r.tags || []).map(escapeHtml).join(', ')}</td>` +
          `<td class="num">${amtStr}</td>` +
          `<td>${escapeHtml(r.note || '')}</td></tr>`;
      }
      html += '</tbody></table>';
      html += `<div class="ptotals">` +
        `<div><strong>Total income</strong> ${fmtTaka(inc)}</div>` +
        `<div><strong>Total expense</strong> ${fmtTaka(exp)}</div>` +
        `<div><strong>Net</strong> ${fmtTaka(inc - exp)}</div></div>`;
    }
  }
  els.printArea.innerHTML = html;
}
window.addEventListener('afterprint', () => { els.printArea.innerHTML = ''; });

// ===================================================================
// SETTINGS
// ===================================================================
function openSettings() {
  const s = gh.getSettings();
  els.settingsRepo.value = s.repo || '';
  els.settingsBranch.value = s.branch || 'main';
  els.settingsPat.value = s.pat || '';
  els.settingsTheme.value = localStorage.getItem('taskLogger.theme') || 'sakura';
  els.settingsStatus.textContent = '';
  els.settingsStatus.className = 'settingsStatus';
  els.settings.showModal();
}
els.settingsBtn.onclick = openSettings;
els.settingsCancel.onclick = () => els.settings.close();
els.settingsForm.addEventListener('submit', ev => {
  ev.preventDefault();
  gh.setSettings({
    repo: els.settingsRepo.value.trim(),
    pat: els.settingsPat.value.trim(),
    branch: els.settingsBranch.value.trim() || 'main',
  });
  applyTheme(els.settingsTheme.value);
  searchMod.reset();
  els.settings.close();
  loadCategoriesConfig().then(refresh);
  flushQueue();
  toast('Settings saved.', 'ok');
});
els.settingsTest.onclick = async () => {
  gh.setSettings({
    repo: els.settingsRepo.value.trim(),
    pat: els.settingsPat.value.trim(),
    branch: els.settingsBranch.value.trim() || 'main',
  });
  els.settingsStatus.textContent = 'Testing…';
  els.settingsStatus.className = 'settingsStatus';
  try {
    await gh.testConnection();
    els.settingsStatus.textContent = 'OK — repo reachable.';
    els.settingsStatus.className = 'settingsStatus ok';
  } catch (e) {
    els.settingsStatus.textContent = e.message;
    els.settingsStatus.className = 'settingsStatus error';
  }
};
els.settingsRefreshIndex.onclick = () => {
  searchMod.reset();
  els.settingsStatus.textContent = 'Search index cleared. Type to rebuild.';
  els.settingsStatus.className = 'settingsStatus ok';
};
els.settingsCategories.onclick = () => { els.settings.close(); openCategories(); };
els.settingsPrint.onclick = () => { els.settings.close(); openPrint(); };

// ----- iOS install hint -----
function maybeShowIosHint() {
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const standalone = window.navigator.standalone === true;
  const dismissed = localStorage.getItem('taskLogger.iosHintDismissed') === '1';
  if (isIos && !standalone && !dismissed) els.iosHint.hidden = false;
}
els.iosHintClose.onclick = () => {
  localStorage.setItem('taskLogger.iosHintDismissed', '1');
  els.iosHint.hidden = true;
};

// ----- Keyboard shortcuts -----
document.addEventListener('keydown', ev => {
  if (ev.target.matches('input,textarea,select')) return;
  if (ev.key === 'n' || ev.key === 'N') { ev.preventDefault(); openNew(); }
  if (ev.key === '/' && state.view === 'notes') { ev.preventDefault(); els.search.focus(); }
});

// ----- Boot -----
els.monthLabel.textContent = fmtMonth(state.currentMonth);
maybeShowIosHint();
(async () => {
  await loadCategoriesConfig();
  await updatePendingBadge();
  setView(localStorage.getItem('taskLogger.view') || 'notes');
  flushQueue();
})();
