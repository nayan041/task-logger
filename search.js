// Lazy full-text search across all months.
// Builds an in-memory index on first query, caches in sessionStorage.

import * as gh from './github.js';

const CACHE_KEY = () => `taskLogger.searchIndex.${gh.getSettings().repo}`;
const CONCURRENCY = 6;

let indexState = {
  loaded: false,
  loading: null, // Promise while loading
  entries: [],   // flat array across months
  monthsLoaded: new Set(),
};

export function reset() {
  indexState = { loaded: false, loading: null, entries: [], monthsLoaded: new Set() };
  try { sessionStorage.removeItem(CACHE_KEY()); } catch {}
}

function loadFromCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY());
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.entries)) return null;
    return data;
  } catch { return null; }
}

function saveToCache() {
  try {
    sessionStorage.setItem(CACHE_KEY(), JSON.stringify({
      entries: indexState.entries,
      monthsLoaded: [...indexState.monthsLoaded],
    }));
  } catch (e) {
    // sessionStorage may be full; not fatal.
    console.warn('search index cache save failed', e);
  }
}

export async function ensureIndex(onProgress) {
  if (indexState.loaded) return indexState.entries;
  if (indexState.loading) return indexState.loading;

  indexState.loading = (async () => {
    const cached = loadFromCache();
    if (cached) {
      indexState.entries = cached.entries;
      indexState.monthsLoaded = new Set(cached.monthsLoaded);
      indexState.loaded = true;
      return indexState.entries;
    }

    const months = await gh.listMonths();
    if (onProgress) onProgress(0, months.length);
    let done = 0;
    const queue = [...months];
    const all = [];

    async function worker() {
      while (queue.length) {
        const m = queue.shift();
        try {
          const entries = await gh.loadMonth(m);
          for (const e of entries) all.push({ ...e, _month: m });
          indexState.monthsLoaded.add(m);
        } catch (e) {
          console.warn('search load month failed', m, e);
        } finally {
          done++;
          if (onProgress) onProgress(done, months.length);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, months.length || 1) }, worker));

    indexState.entries = all.sort((a, b) => b.ts.localeCompare(a.ts));
    indexState.loaded = true;
    saveToCache();
    return indexState.entries;
  })();

  return indexState.loading;
}

// Append/replace an entry without re-fetching (called after a save).
export function upsertEntry(entry, monthKey) {
  if (!indexState.loaded) return;
  const idx = indexState.entries.findIndex(e => e.id === entry.id);
  const tagged = { ...entry, _month: monthKey };
  if (idx >= 0) indexState.entries[idx] = tagged;
  else indexState.entries.unshift(tagged);
  indexState.entries.sort((a, b) => b.ts.localeCompare(a.ts));
  saveToCache();
}

// Tokenise: supports `tag:foo`, `month:YYYY-MM`, free text.
function parseQuery(q) {
  const out = { tag: null, month: null, terms: [] };
  for (const tok of q.trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok.startsWith('tag:')) out.tag = tok.slice(4).toLowerCase();
    else if (tok.startsWith('month:')) out.month = tok.slice(6);
    else out.terms.push(tok.toLowerCase());
  }
  return out;
}

export function search(q) {
  const parsed = parseQuery(q);
  return indexState.entries.filter(e => {
    if (parsed.tag && !(e.tags || []).map(t => t.toLowerCase()).includes(parsed.tag)) return false;
    if (parsed.month && e._month !== parsed.month) return false;
    if (parsed.terms.length) {
      const hay = `${e.heading || ''}\n${e.body || ''}\n${(e.tags || []).join(' ')}`.toLowerCase();
      for (const t of parsed.terms) if (!hay.includes(t)) return false;
    }
    return true;
  });
}

// Returns the first free-text term so the renderer can highlight it.
export function freeTerm(q) {
  const parsed = parseQuery(q);
  return parsed.terms[0] || '';
}
