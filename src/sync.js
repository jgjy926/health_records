// Encrypted sync with the health-gateway Worker, and encrypted backup files.
//   push: PUT /vault with the encrypted blob + If-Match ETag; PUT /file/:id for encrypted PDFs.
//   pull: GET /vault; a different ETag means merge per report id by updatedAt (newest wins), never by whole file.
//   The gateway URL and app token come from state.vault.settings (stored inside the encrypted vault).
//   Ciphertext only — never send plaintext JSON. The upload leaves out wrappedKeyPass: a stolen copy can only be
//   attacked through the recovery key (120 random bits), never through a short passcode.
//   A new device joins with the gateway URL, the token and the recovery key, then sets its own passcode.
import { state } from './state.js';
import * as vault from './vault.js';

const SYNC_KEY = 'health_records.sync';     // { etag, dirty, lastAt } — no health data
const UPLOADED_KEY = 'sync/uploaded';       // encrypted list of PDFs already on the gateway (ids carry report dates)
const DEBOUNCE_MS = 4000;
const MAX_ATTEMPTS = 3;
const BACKUP_KIND = 'health-records-backup';

let listener = () => {};
let status = { state: 'off', detail: '' };
let running = null;
let again = false;
let timer = null;
let saves = 0;
let onRemoteChange = () => {};

function readLocal() {
  try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch { return {}; }
}
function writeLocal(patch) { localStorage.setItem(SYNC_KEY, JSON.stringify({ ...readLocal(), ...patch })); }

function setStatus(next, detail = '') {
  status = { state: next, detail };
  listener(status);
}

export const syncStatus = () => status;
export function setSyncListener(fn) { listener = fn; listener(status); }

const configured = () => !!(state.vault && state.vault.settings.gatewayUrl && state.vault.settings.appToken);

// ---------- gateway calls ----------

async function gateway(settings, path, init = {}) {
  const url = `${settings.gatewayUrl.replace(/\/+$/, '')}${path}`;
  return fetch(url, { ...init, headers: { Authorization: `Bearer ${settings.appToken}`, ...(init.headers || {}) } });
}

async function failure(res) {
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) return new Error('The gateway refused the app token.');
  return new Error(body.error || `The gateway answered ${res.status}`);
}

export async function testConnection(settings) {
  let res;
  try { res = await gateway(settings, '/ping'); } catch { throw new Error('Could not reach the gateway.'); }
  if (!res.ok) throw await failure(res);
  return true;
}

// -> { empty: true } or { etag, blob }
async function pullBlob(settings) {
  const res = await gateway(settings, '/vault');
  if (!res.ok) throw await failure(res);
  const etag = res.headers.get('ETag') || '';
  const blob = await res.json();
  return blob.empty ? { empty: true } : { etag, blob };
}

// ---------- merge ----------

const byId = list => new Map((list || []).map(x => [x.id, x]));

function mergeList(a, b) {
  const merged = byId(a);
  for (const [id, other] of byId(b)) {
    const mine = merged.get(id);
    if (!mine || String(other.updatedAt || '') > String(mine.updatedAt || '')) merged.set(id, other);
  }
  return [...merged.values()];
}

// Newest copy of each report and person wins (a delete is just a newer copy). Gateway details and the last person stay this device's.
export function mergeVaults(local, remote) {
  const newer = String(remote.updatedAt || '') > String(local.updatedAt || '') ? remote : local;
  return {
    ...local,
    profiles: mergeList(local.profiles, remote.profiles),
    reports: mergeList(local.reports, remote.reports),
    markers: { ...remote.markers, ...local.markers },
    settings: {
      ...newer.settings,
      gatewayUrl: local.settings.gatewayUrl, appToken: local.settings.appToken, lastProfileId: local.settings.lastProfileId,
    },
    updatedAt: newer.updatedAt,
  };
}

function content(v) {
  const sorted = list => [...(list || [])].sort((a, b) => a.id.localeCompare(b.id));
  const sortedKeys = obj => Object.keys(obj || {}).sort().map(k => [k, obj[k]]);
  return JSON.stringify([sorted(v.profiles), sorted(v.reports), sortedKeys(v.markers)]);
}

export const sameContent = (a, b) => content(a) === content(b);

// ---------- PDFs ----------

async function readUploaded() {
  try {
    const bytes = await vault.loadPdf(UPLOADED_KEY);
    return new Set(bytes ? JSON.parse(new TextDecoder().decode(bytes)) : []);
  } catch { return new Set(); }
}
const writeUploaded = set => vault.savePdf(UPLOADED_KEY, new TextEncoder().encode(JSON.stringify([...set])));
const fileId = filePath => filePath.replace(/^files\//, '').replace(/\.pdf\.enc$/, '');

// Files first, so the vault never lists a PDF the gateway doesn't have yet.
async function pushFiles(settings) {
  const uploaded = await readUploaded();
  let changed = false;
  for (const r of state.vault.reports) {
    if (!r.filePath) continue;
    const id = fileId(r.filePath);
    if (r.deletedAt) {
      if (uploaded.has(id)) {
        const res = await gateway(settings, `/file/${id}`, { method: 'DELETE' });
        if (res.ok || res.status === 404) { uploaded.delete(id); changed = true; }
      }
    } else if (!uploaded.has(id)) {
      const blob = await vault.readEncryptedFile(r.filePath);
      if (!blob) continue;     // made on another device, and not downloaded here
      const res = await gateway(settings, `/file/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: blob });
      if (!res.ok) throw await failure(res);
      uploaded.add(id);
      changed = true;
    }
  }
  if (changed) await writeUploaded(uploaded);
}

// Fetch a report's encrypted PDF from the gateway into this device. Returns false if the gateway doesn't have it.
export async function fetchFile(filePath) {
  if (!configured()) return false;
  const res = await gateway(state.vault.settings, `/file/${fileId(filePath)}`);
  if (res.status === 404) return false;
  if (!res.ok) throw await failure(res);
  await vault.writeEncryptedFile(filePath, new Uint8Array(await res.arrayBuffer()));
  const uploaded = await readUploaded();
  uploaded.add(fileId(filePath));
  await writeUploaded(uploaded);
  return true;
}

// ---------- one sync ----------

async function syncOnce() {
  const settings = state.vault.settings;
  const startedAt = saves;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const local = readLocal();
    const remote = await pullBlob(settings);
    if (!state.vault) return;
    let mustPush = !!local.dirty || remote.empty;
    if (!remote.empty && remote.etag !== local.etag) {
      let theirs;
      try { theirs = await vault.openSyncBlob(remote.blob); }
      catch { throw new Error('The gateway holds a different vault. To use it here, reset this device and join it.'); }
      const merged = mergeVaults(state.vault, theirs);
      const changedHere = !sameContent(merged, state.vault);
      if (!sameContent(merged, theirs)) mustPush = true;
      await vault.adoptMerged(merged, remote.blob);
      if (changedHere) onRemoteChange();
    }
    if (!mustPush) {
      writeLocal({ etag: remote.etag || local.etag, lastAt: new Date().toISOString(), ...(saves === startedAt ? { dirty: false } : {}) });
      return;
    }
    await pushFiles(settings);
    if (!state.vault) return;
    const headers = { 'Content-Type': 'application/json' };
    if (!remote.empty) headers['If-Match'] = remote.etag;
    const put = await gateway(settings, '/vault', { method: 'PUT', headers, body: JSON.stringify(vault.syncBlob()) });
    if (put.status === 409) continue;     // someone else wrote in between: merge again
    if (!put.ok) throw await failure(put);
    writeLocal({ etag: put.headers.get('ETag') || '', lastAt: new Date().toISOString(), ...(saves === startedAt ? { dirty: false } : {}) });
    return;
  }
  throw new Error('Too many changes at once. It will try again.');
}

// Runs one sync at a time; a request during a run queues one more. Never throws: the state goes to the status pill.
export function syncNow() {
  if (!configured()) { setStatus('off'); return Promise.resolve(); }
  if (running) { again = true; return running; }
  running = (async () => {
    setStatus('syncing');
    try {
      do {
        again = false;
        await syncOnce();
      } while (again && state.vault);
      if (!state.vault) return;
      setStatus(readLocal().dirty ? 'pending' : 'synced', readLocal().lastAt || '');
    } catch (err) {
      if (!state.vault) return;
      const offline = err instanceof TypeError;
      setStatus(offline ? 'offline' : 'error', offline ? 'Will try again when you are online.' : err.message);
    } finally {
      running = null;
    }
  })();
  return running;
}

// ---------- when it runs ----------

export function startSync(remoteChanged) {
  if (remoteChanged) onRemoteChange = remoteChanged;
  vault.setSaveListener(() => {
    saves++;
    if (!configured()) { setStatus('off'); return; }
    writeLocal({ dirty: true });
    setStatus('pending');
    clearTimeout(timer);
    timer = setTimeout(syncNow, DEBOUNCE_MS);
  });
  window.addEventListener('online', () => { if (state.vault) syncNow(); });
}

export function stopSyncTimer() { clearTimeout(timer); }

// ---------- join a device ----------

export async function joinFromGateway(gatewayUrl, appToken, recoveryCode) {
  const settings = { gatewayUrl, appToken };
  await testConnection(settings);
  const remote = await pullBlob(settings);
  if (remote.empty) throw new Error('The gateway has no vault yet. Set up this device as new instead.');
  await vault.joinVault(remote.blob, recoveryCode);
  // This device reached the gateway with these, whatever the other device's copy says.
  Object.assign(state.vault.settings, settings);
  writeLocal({ etag: remote.etag, dirty: true });
}

// ---------- encrypted backup file ----------

// The vault + every PDF on this device, all still encrypted. Like the upload, it opens with the recovery key only.
export async function buildBackup() {
  const files = {};
  for (const r of state.vault.reports) {
    if (!r.filePath || r.deletedAt) continue;
    const blob = await vault.readEncryptedFile(r.filePath);
    if (blob) files[r.filePath] = vault.bytesToB64(blob);
  }
  return new TextEncoder().encode(JSON.stringify({ kind: BACKUP_KIND, createdAt: new Date().toISOString(), vault: vault.syncBlob(), files }));
}

function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('That is not a backup file.'); }
  if (!data || data.kind !== BACKUP_KIND || !data.vault || !data.vault.ct) throw new Error('That is not a backup file.');
  return data;
}

async function restoreFiles(files) {
  for (const [path, b64] of Object.entries(files || {})) {
    if (/^files\/[A-Za-z0-9_-]+\.pdf\.enc$/.test(path)) await vault.writeEncryptedFile(path, vault.b64ToBytes(b64));
  }
}

// Into the open vault: merges, so nothing newer here is lost.
export async function restoreIntoOpenVault(text) {
  const data = parseBackup(text);
  let theirs;
  try { theirs = await vault.openSyncBlob(data.vault); }
  catch { throw new Error('This backup belongs to a different vault.'); }
  await vault.adoptMerged(mergeVaults(state.vault, theirs), data.vault);
  await restoreFiles(data.files);
  await vault.save();
}

// New device: the recovery key opens the backup, then the caller asks for a passcode.
export async function joinFromBackup(text, recoveryCode) {
  const data = parseBackup(text);
  await vault.joinVault(data.vault, recoveryCode);
  await restoreFiles(data.files);
}
