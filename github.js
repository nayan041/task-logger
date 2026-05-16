// GitHub Contents API wrapper.
// Reads/writes files in a private repo using a fine-grained PAT.

const API = 'https://api.github.com';

function settings() {
  const repo = localStorage.getItem('taskLogger.repo') || '';
  const pat = localStorage.getItem('taskLogger.pat') || '';
  const branch = localStorage.getItem('taskLogger.branch') || 'main';
  return { repo, pat, branch };
}

function headers() {
  const { pat } = settings();
  if (!pat) throw new Error('No PAT configured. Open Settings.');
  return {
    'Authorization': `Bearer ${pat}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function repoUrl(path) {
  const { repo } = settings();
  if (!repo || !repo.includes('/')) throw new Error('Configure repo as owner/name in Settings.');
  return `${API}/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
}

function b64encode(bytes) {
  // bytes: Uint8Array
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64decode(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}
function utf8encode(str) { return new TextEncoder().encode(str); }
function utf8decode(bytes) { return new TextDecoder().decode(bytes); }

const shaCache = new Map();

export async function getFile(path) {
  const { branch } = settings();
  const url = `${repoUrl(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: headers() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${res.statusText}`);
  const json = await res.json();
  shaCache.set(path, json.sha);
  // Contents API returns content base64 with newlines.
  const cleanB64 = (json.content || '').replace(/\n/g, '');
  return { bytes: b64decode(cleanB64), sha: json.sha };
}

export async function putFile(path, bytes, message) {
  const { branch } = settings();
  const sha = shaCache.get(path);
  const body = {
    message: message || `Update ${path}`,
    content: b64encode(bytes),
    branch,
  };
  if (sha) body.sha = sha;
  const res = await fetch(repoUrl(path), {
    method: 'PUT',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error(`PUT ${path} → ${res.status}`);
    err.status = res.status;
    err.detail = await res.text();
    throw err;
  }
  const json = await res.json();
  shaCache.set(path, json.content.sha);
  return json.content;
}

// Month files live under a folder: 'logs' for notes, 'finance' for finance
// records. Both share the same JSON-array shape (objects with id + ts).
export async function loadMonth(yyyymm, folder = 'logs') {
  const path = `${folder}/${yyyymm}.json`;
  const file = await getFile(path);
  if (!file) return [];
  try {
    return JSON.parse(utf8decode(file.bytes));
  } catch (e) {
    console.error('Bad JSON in', path, e);
    return [];
  }
}

// `removedIds` lists entry ids that were deleted. On a conflict re-merge, the
// merge would otherwise resurrect a deleted entry from the remote copy, so we
// explicitly drop them after merging.
export async function saveMonth(yyyymm, entries, folder = 'logs', removedIds = []) {
  const path = `${folder}/${yyyymm}.json`;
  const sorted = [...entries].sort((a, b) => a.ts.localeCompare(b.ts));
  const bytes = utf8encode(JSON.stringify(sorted, null, 2) + '\n');
  try {
    return await putFile(path, bytes, `${folder}: ${entries.length} entries (${yyyymm})`);
  } catch (e) {
    if (e.status === 409 || e.status === 422) {
      // Conflict: re-fetch, merge by id, drop deleted ids, retry once.
      shaCache.delete(path);
      const remote = await loadMonth(yyyymm, folder);
      let merged = mergeById(remote, entries);
      if (removedIds.length) {
        const rm = new Set(removedIds);
        merged = merged.filter(x => !rm.has(x.id));
      }
      merged.sort((a, b) => a.ts.localeCompare(b.ts));
      const mergedBytes = utf8encode(JSON.stringify(merged, null, 2) + '\n');
      return await putFile(path, mergedBytes, `${folder}: merge conflict resolved (${yyyymm})`);
    }
    throw e;
  }
}

// ----- Categories config (single shared file, syncs across devices) -----
export async function loadCategories() {
  const file = await getFile('config/categories.json');
  if (!file) return {};
  try {
    return JSON.parse(utf8decode(file.bytes));
  } catch (e) {
    console.error('Bad categories.json', e);
    return {};
  }
}

export async function saveCategories(obj) {
  const bytes = utf8encode(JSON.stringify(obj, null, 2) + '\n');
  return putFile('config/categories.json', bytes, 'config: update categories');
}

// ----- Memory store (single key-value file, not tied to dates) -----
export async function loadMemory() {
  const file = await getFile('memory.json');
  if (!file) return [];
  try {
    return JSON.parse(utf8decode(file.bytes));
  } catch (e) {
    console.error('Bad memory.json', e);
    return [];
  }
}

export async function saveMemory(items) {
  const bytes = utf8encode(JSON.stringify(items, null, 2) + '\n');
  try {
    return await putFile('memory.json', bytes, 'memory: update');
  } catch (e) {
    if (e.status === 409 || e.status === 422) {
      // Another device saved first — refresh sha and overwrite (last write wins).
      shaCache.delete('memory.json');
      await getFile('memory.json');
      return await putFile('memory.json', bytes, 'memory: update (retry)');
    }
    throw e;
  }
}

function mergeById(remote, local) {
  const map = new Map();
  for (const e of remote) map.set(e.id, e);
  for (const e of local) map.set(e.id, e); // local wins on tie
  return [...map.values()];
}

export async function uploadImage(blob, filename) {
  const path = `images/${filename}`;
  const buf = new Uint8Array(await blob.arrayBuffer());
  try {
    await putFile(path, buf, `image: ${filename}`);
  } catch (e) {
    if (e.status === 409 || e.status === 422) {
      // File already exists (e.g. an offline upload that was retried).
      // Fetch its sha so the PUT counts as an update, then retry once.
      await getFile(path);
      await putFile(path, buf, `image: ${filename} (update)`);
    } else {
      throw e;
    }
  }
  return path;
}

export async function listMonths(folder = 'logs') {
  // Lists YYYY-MM month files under a folder. Returns strings, newest first.
  const { branch } = settings();
  const url = `${repoUrl(folder)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: headers() });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`LIST ${folder}/ → ${res.status}`);
  const items = await res.json();
  return items
    .filter(i => i.type === 'file' && /^\d{4}-\d{2}\.json$/.test(i.name))
    .map(i => i.name.replace('.json', ''))
    .sort((a, b) => b.localeCompare(a));
}

const imgCache = new Map();
export async function fetchImageBlob(path) {
  if (imgCache.has(path)) return imgCache.get(path);
  const { branch } = settings();
  const url = `${repoUrl(path)}?ref=${encodeURIComponent(branch)}`;
  // Raw media type returns the file bytes directly. The default JSON response
  // returns EMPTY content for files over 1MB — which most screenshots exceed.
  const res = await fetch(url, {
    headers: { ...headers(), 'Accept': 'application/vnd.github.raw' },
  });
  if (!res.ok) throw new Error(`Image fetch ${path} → ${res.status}`);
  const buf = await res.arrayBuffer();
  const ext = path.split('.').pop().toLowerCase();
  const mime = ext === 'png' ? 'image/png'
            : ext === 'gif' ? 'image/gif'
            : ext === 'webp' ? 'image/webp'
            : 'image/jpeg';
  const blob = new Blob([buf], { type: mime });
  const objUrl = URL.createObjectURL(blob);
  imgCache.set(path, objUrl);
  return objUrl;
}

export async function testConnection() {
  const { repo, branch } = settings();
  const url = `${API}/repos/${repo}/branches/${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Repo unreachable: ${res.status} ${res.statusText}`);
  return true;
}

export function isConfigured() {
  const { repo, pat } = settings();
  return !!(repo && pat && repo.includes('/'));
}

export function getSettings() { return settings(); }
export function setSettings({ repo, pat, branch }) {
  if (repo !== undefined) localStorage.setItem('taskLogger.repo', repo);
  if (pat !== undefined) localStorage.setItem('taskLogger.pat', pat);
  if (branch !== undefined) localStorage.setItem('taskLogger.branch', branch);
  shaCache.clear();
  imgCache.clear();
}
