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

export async function loadMonth(yyyymm) {
  const path = `logs/${yyyymm}.json`;
  const file = await getFile(path);
  if (!file) return [];
  try {
    return JSON.parse(utf8decode(file.bytes));
  } catch (e) {
    console.error('Bad JSON in', path, e);
    return [];
  }
}

export async function saveMonth(yyyymm, entries) {
  const path = `logs/${yyyymm}.json`;
  const sorted = [...entries].sort((a, b) => a.ts.localeCompare(b.ts));
  const bytes = utf8encode(JSON.stringify(sorted, null, 2) + '\n');
  try {
    return await putFile(path, bytes, `log: ${entries.length} entries (${yyyymm})`);
  } catch (e) {
    if (e.status === 409 || e.status === 422) {
      // Conflict: re-fetch, merge by id, retry once.
      shaCache.delete(path);
      const remote = await loadMonth(yyyymm);
      const merged = mergeById(remote, entries);
      const mergedSorted = merged.sort((a, b) => a.ts.localeCompare(b.ts));
      const mergedBytes = utf8encode(JSON.stringify(mergedSorted, null, 2) + '\n');
      return await putFile(path, mergedBytes, `log: merge conflict resolved (${yyyymm})`);
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
  await putFile(path, buf, `image: ${filename}`);
  return path;
}

export async function listMonths() {
  // Lists files under logs/. Returns array of YYYY-MM strings, descending.
  const { branch } = settings();
  const url = `${repoUrl('logs')}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: headers() });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`LIST logs/ → ${res.status}`);
  const items = await res.json();
  return items
    .filter(i => i.type === 'file' && /^\d{4}-\d{2}\.json$/.test(i.name))
    .map(i => i.name.replace('.json', ''))
    .sort((a, b) => b.localeCompare(a));
}

export function rawImageUrl(path) {
  // Returns a URL we can fetch and turn into an object URL via blob (auth'd).
  // For private repos, raw.githubusercontent.com requires the PAT. We use the
  // Contents API instead and decode the base64 to a blob.
  return path; // resolved on demand by fetchImageBlob
}

const imgCache = new Map();
export async function fetchImageBlob(path) {
  if (imgCache.has(path)) return imgCache.get(path);
  const file = await getFile(path);
  if (!file) throw new Error(`Image not found: ${path}`);
  const ext = path.split('.').pop().toLowerCase();
  const mime = ext === 'png' ? 'image/png'
            : ext === 'gif' ? 'image/gif'
            : ext === 'webp' ? 'image/webp'
            : 'image/jpeg';
  const blob = new Blob([file.bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  imgCache.set(path, url);
  return url;
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
