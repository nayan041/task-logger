// TaskLog — main UI controller.

import * as gh from './github.js';
import { render, highlight, extractTags } from './markdown.js';
import * as searchMod from './search.js';

// ----- DOM refs -----
const $ = id => document.getElementById(id);
const els = {
  topbar: $('topbar'),
  prevMonth: $('prevMonth'),
  nextMonth: $('nextMonth'),
  monthLabel: $('monthLabel'),
  search: $('search'),
  newBtn: $('newBtn'),
  settingsBtn: $('settingsBtn'),
  tagbar: $('tagbar'),
  timeline: $('timeline'),
  emptyState: $('emptyState'),
  status: $('status'),
  iosHint: $('iosHint'),
  iosHintClose: $('iosHintClose'),
  composer: $('composer'),
  composerForm: $('composerForm'),
  composerHeading: $('composerHeading'),
  composerBody: $('composerBody'),
  composerThumbs: $('composerThumbs'),
  composerFiles: $('composerFiles'),
  composerCancel: $('composerCancel'),
  composerSave: $('composerSave'),
  composerTime: $('composerTime'),
  composerPreview: $('composerPreview'),
  composerPreviewPane: $('composerPreviewPane'),
  settings: $('settings'),
  settingsForm: $('settingsForm'),
  settingsRepo: $('settingsRepo'),
  settingsBranch: $('settingsBranch'),
  settingsPat: $('settingsPat'),
  settingsTheme: $('settingsTheme'),
  settingsCancel: $('settingsCancel'),
  settingsTest: $('settingsTest'),
  settingsRefreshIndex: $('settingsRefreshIndex'),
  settingsExport: $('settingsExport'),
  settingsStatus: $('settingsStatus'),
  lightbox: $('lightbox'),
  lightboxImg: $('lightboxImg'),
};

// ----- State -----
const state = {
  currentMonth: monthKey(new Date()),
  entries: [],            // entries for currentMonth
  activeTags: new Set(),
  searchQuery: '',
  pendingImages: [],      // [{blob, name, url}]
};

// ----- Utilities -----
function monthKey(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
function fmtMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return monthKey(d);
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}
function fmtDayHead(iso) {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0,0,0,0);
  const dd = new Date(d); dd.setHours(0,0,0,0);
  const days = Math.round((today - dd) / 86400000);
  const label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  if (days === 0) return `Today · ${label}`;
  if (days === 1) return `Yesterday · ${label}`;
  return label;
}
function dayKey(iso) { return iso.slice(0, 10); }
function uid(ts) {
  const r = Math.random().toString(36).slice(2, 6);
  return `${ts}-${r}`;
}
function toast(msg, kind = '') {
  els.status.textContent = msg;
  els.status.className = 'status' + (kind ? ' ' + kind : '');
  els.status.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { els.status.hidden = true; }, 3000);
}

// ----- Settings init / theme -----
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

// ----- Month navigation -----
function setMonth(key) {
  state.currentMonth = key;
  els.monthLabel.textContent = fmtMonth(key);
  loadCurrentMonth();
}
els.prevMonth.onclick = () => setMonth(shiftMonth(state.currentMonth, -1));
els.nextMonth.onclick = () => setMonth(shiftMonth(state.currentMonth, +1));
els.monthLabel.onclick = () => setMonth(monthKey(new Date()));

async function loadCurrentMonth() {
  if (!gh.isConfigured()) {
    renderEmpty('Not configured. Open Settings to add your repo + PAT.');
    return;
  }
  renderEmpty('Loading…');
  try {
    state.entries = await gh.loadMonth(state.currentMonth);
    renderTimeline();
  } catch (e) {
    console.error(e);
    renderEmpty('Failed to load. Check repo + PAT in Settings.');
    toast(e.message, 'error');
  }
}

// ----- Tag bar -----
function renderTagbar() {
  const allTags = new Set();
  for (const e of state.entries) for (const t of (e.tags || [])) allTags.add(t);
  if (!allTags.size && !state.activeTags.size) {
    els.tagbar.hidden = true; els.tagbar.innerHTML = ''; return;
  }
  els.tagbar.hidden = false;
  els.tagbar.innerHTML = '';
  const sorted = [...allTags].sort();
  for (const t of sorted) {
    const b = document.createElement('button');
    b.className = 'tagchip' + (state.activeTags.has(t) ? ' active' : '');
    b.textContent = '#' + t;
    b.onclick = () => {
      if (state.activeTags.has(t)) state.activeTags.delete(t);
      else state.activeTags.add(t);
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

// ----- Timeline render -----
function renderEmpty(msg) {
  els.timeline.innerHTML = `<div class="empty"><p>${msg}</p></div>`;
}

function renderTimeline() {
  // If a search query is active, render search results instead.
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
  if (!entries.length) {
    renderEmpty('No entries match.');
    return;
  }
  // Group by day descending; entries within a day descending too.
  const byDay = new Map();
  for (const e of entries) {
    const k = dayKey(e.ts);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(e);
  }
  const dayKeys = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
  const frag = document.createDocumentFragment();
  for (const k of dayKeys) {
    const head = document.createElement('div');
    head.className = 'dayhead';
    head.textContent = fmtDayHead(k);
    frag.appendChild(head);
    const dayEntries = byDay.get(k).sort((a, b) => b.ts.localeCompare(a.ts));
    for (const e of dayEntries) frag.appendChild(renderEntry(e));
  }
  els.timeline.innerHTML = '';
  els.timeline.appendChild(frag);
}

function renderEntry(entry, highlightTerm = '') {
  const div = document.createElement('article');
  div.className = 'entry';
  div.dataset.id = entry.id;
  let bodyHtml = render(entry.body || '');
  let headingHtml = render(entry.heading || '').replace(/^<p>|<\/p>$/g, '');
  if (highlightTerm) {
    bodyHtml = highlight(bodyHtml, highlightTerm);
    headingHtml = highlight(headingHtml, highlightTerm);
  }
  div.innerHTML = `
    <div class="ts">${fmtTime(entry.ts)}</div>
    <div>
      <h3 class="heading">${headingHtml}</h3>
      <div class="body">${bodyHtml}</div>
      ${entry.images && entry.images.length ? `<div class="imgs"></div>` : ''}
    </div>
  `;
  // Lazy-load images
  if (entry.images && entry.images.length) {
    const wrap = div.querySelector('.imgs');
    for (const img of entry.images) {
      const im = document.createElement('img');
      im.alt = img.alt || '';
      im.loading = 'lazy';
      im.dataset.path = img.path;
      gh.fetchImageBlob(img.path).then(url => { im.src = url; }).catch(e => {
        console.warn('image load failed', img.path, e);
        im.alt = '(image failed)';
      });
      im.onclick = () => openLightbox(im.src);
      wrap.appendChild(im);
    }
  }
  // Hashtag clicks
  div.addEventListener('click', ev => {
    const a = ev.target.closest('a.hashtag');
    if (a) {
      ev.preventDefault();
      const t = a.dataset.tag;
      if (state.activeTags.has(t)) state.activeTags.delete(t);
      else state.activeTags.add(t);
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

// ----- Search -----
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
    renderEmpty('Search index failed.'); toast(e.message, 'error'); return;
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

// ----- Composer -----
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
  els.composerTime.textContent = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  els.composer.showModal();
  setTimeout(() => els.composerHeading.focus(), 50);
}
els.newBtn.onclick = openComposer;
els.composerCancel.onclick = () => els.composer.close();

els.composerFiles.addEventListener('change', e => {
  for (const f of e.target.files) addPendingImage(f);
  e.target.value = '';
});

els.composerBody.addEventListener('paste', e => {
  if (!e.clipboardData) return;
  const items = e.clipboardData.items || [];
  for (const it of items) {
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) addPendingImage(f);
    }
  }
});

function addPendingImage(file) {
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const r = Math.random().toString(36).slice(2, 8);
  const name = `${ts}-${r}.${ext}`;
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
  els.composerThumbs.appendChild(wrap);
}

els.composerPreview.onclick = () => {
  const open = !els.composerPreviewPane.hidden;
  if (open) {
    els.composerPreviewPane.hidden = true;
    els.composerPreviewPane.innerHTML = '';
  } else {
    const md = `# ${els.composerHeading.value}\n\n${els.composerBody.value}`;
    els.composerPreviewPane.innerHTML = render(md);
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
    // 1) Upload images in parallel.
    const uploaded = [];
    for (const im of state.pendingImages) {
      const path = await gh.uploadImage(im.blob, im.name);
      uploaded.push({ path, alt: '' });
    }
    // 2) Build entry.
    const ts = new Date().toISOString();
    const tags = [...new Set([...extractTags(heading), ...extractTags(body)])];
    const entry = {
      id: uid(ts),
      ts,
      heading,
      body,
      tags,
      images: uploaded,
    };
    // 3) Append to month JSON and save. The month is decided by entry timestamp,
    //    not by the currently viewed month — that way late-night entries land in
    //    the right file.
    const targetMonth = ts.slice(0, 7);
    let monthEntries = state.currentMonth === targetMonth ? state.entries : await gh.loadMonth(targetMonth);
    monthEntries = [...monthEntries, entry];
    await gh.saveMonth(targetMonth, monthEntries);
    // 4) Update local state.
    if (targetMonth === state.currentMonth) {
      state.entries = monthEntries;
      renderTimeline();
    } else {
      // Switch to that month so the user sees the new entry.
      state.currentMonth = targetMonth;
      state.entries = monthEntries;
      els.monthLabel.textContent = fmtMonth(targetMonth);
      renderTimeline();
    }
    searchMod.upsertEntry(entry, targetMonth);
    // Cleanup blob URLs
    for (const im of state.pendingImages) URL.revokeObjectURL(im.url);
    state.pendingImages = [];
    els.composer.close();
    toast('Saved.', 'ok');
  } catch (e) {
    console.error(e);
    toast(e.message, 'error');
  } finally {
    els.composerSave.disabled = false;
  }
});

// ----- Settings -----
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
  loadCurrentMonth();
  toast('Settings saved.', 'ok');
});

els.settingsTest.onclick = async () => {
  // Save first so the test uses the new values.
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

els.settingsExport.onclick = () => {
  const blob = new Blob([JSON.stringify(state.entries, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${state.currentMonth}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ----- iOS install hint -----
function maybeShowIosHint() {
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const standalone = window.navigator.standalone === true;
  const dismissed = localStorage.getItem('taskLogger.iosHintDismissed') === '1';
  if (isIos && !standalone && !dismissed) {
    els.iosHint.hidden = false;
  }
}
els.iosHintClose.onclick = () => {
  localStorage.setItem('taskLogger.iosHintDismissed', '1');
  els.iosHint.hidden = true;
};

// ----- Keyboard shortcuts -----
document.addEventListener('keydown', ev => {
  if (ev.target.matches('input,textarea,select')) {
    if (ev.key === 'Escape' && ev.target === els.composerBody) return;
    return;
  }
  if (ev.key === 'n' || ev.key === 'N') { ev.preventDefault(); openComposer(); }
  if (ev.key === '/' && ev.target === document.body) { ev.preventDefault(); els.search.focus(); }
});

// ----- Boot -----
els.monthLabel.textContent = fmtMonth(state.currentMonth);
maybeShowIosHint();
loadCurrentMonth();
