import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserFakes, makeDevice, useDevice, makeFakeKoofr } from './helpers/fakes.mjs';

installBrowserFakes();

const worker = (await import('../worker/worker.js')).default;
const vault = await import('../src/vault.js');
const { state } = await import('../src/state.js');
const sync = await import('../src/sync.js');
const { saveProfile } = await import('../src/profiles.js');
const { saveReport, deleteReport } = await import('../src/reports.js');
const { normalizeResult } = await import('../src/markers.js');

const GW = 'https://gw.test';
const KOOFR_BASE = 'https://koofr.test/dav/Koofr/health_records';
const TOKEN = 'test-app-token';
const SECRET = 'SECRET-PERSON-NAME';
const env = { APP_TOKEN: TOKEN, KOOFR_USER: 'koofr-user', KOOFR_PASS: 'koofr-pass', KOOFR_BASE, ALLOWED_ORIGIN: 'https://app.test' };

let koofr;
let requests;

// Client -> real Worker -> fake Koofr
function installNetwork() {
  koofr = makeFakeKoofr();
  requests = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith(GW)) {
      requests.push({ url: u, method: init.method || 'GET' });
      return worker.fetch(new Request(u, init), env);
    }
    return koofr.handle(u, init);
  };
}

const koofrText = () => [...koofr.files.values()].map(b => new TextDecoder().decode(b)).join('\n');

async function setUpDevice(passcode = '123456') {
  const code = await vault.create(passcode);
  await vault.finishSetup();
  state.vault.settings.gatewayUrl = GW;
  state.vault.settings.appToken = TOKEN;
  await vault.save();
  return code;
}

const report = (profileId, date, ldl) => saveReport({ profileId, date, provider: 'Lab' }, [normalizeResult({ nameAsPrinted: 'LDL', value: ldl, unit: 'mmol/L' })]);

beforeEach(() => {
  vault.lock();
  installNetwork();
  useDevice(makeDevice());
  sync.startSync();
});

test('Koofr only ever gets ciphertext, and never the passcode-wrapped key', async () => {
  await setUpDevice();
  const p = await saveProfile({ displayName: SECRET, birthYear: 1990, sex: 'M', maskNames: [] });
  const r = await report(p.id, '2026-01-02', 3.4);
  r.filePath = `files/${r.id}.pdf.enc`;
  await vault.savePdf(r.filePath, new TextEncoder().encode('%PDF-SECRET-BODY'));
  await vault.save();
  await sync.syncNow();
  assert.equal(sync.syncStatus().state, 'synced', sync.syncStatus().detail);
  const names = [...koofr.files.keys()];
  assert.ok(names.includes('/dav/Koofr/health_records/vault.enc'));
  assert.ok(names.some(n => n.startsWith('/dav/Koofr/health_records/backups/vault.') && n.endsWith('.enc')));
  assert.ok(names.includes(`/dav/Koofr/health_records/files/${r.id}.pdf.enc`));
  assert.ok(names.every(n => n.endsWith('.enc')), names.join());
  const all = koofrText();
  for (const bad of [SECRET, 'LDL', '%PDF', TOKEN, 'wrappedKeyPass', 'mmol']) assert.ok(!all.includes(bad), bad);
  assert.ok(all.includes('wrappedKeyRecovery'));
});

test('the Worker refuses a blob with the passcode-wrapped key, or a non-JSON body', async () => {
  const put = body => worker.fetch(new Request(`${GW}/vault`, { method: 'PUT', headers: { Authorization: `Bearer ${TOKEN}` }, body }), env);
  assert.equal((await put(JSON.stringify({ iv: 'x', ct: 'y', wrappedKeyPass: 'z' }))).status, 400);
  assert.equal((await put('')).status, 400);
  assert.equal((await put('{"iv":"x"')).status, 400);
  assert.equal(koofr.files.size, 0);
});

test('a new device joins with the recovery key, has its own passcode, and sees the same data', async () => {
  const code = await setUpDevice('111111');
  const p = await saveProfile({ displayName: 'A', birthYear: null, sex: '', maskNames: [] });
  const r = await report(p.id, '2026-01-02', 3.4);
  r.filePath = `files/${r.id}.pdf.enc`;
  await vault.savePdf(r.filePath, new TextEncoder().encode('%PDF-BYTES'));
  await vault.save();
  await sync.syncNow();
  vault.lock();

  useDevice(makeDevice());
  await assert.rejects(sync.joinFromGateway(GW, TOKEN, '0000-0000-0000-0000-0000-0000'), /recovery key/i);
  await assert.rejects(sync.joinFromGateway(GW, 'wrong-token', code), /token/);
  await sync.joinFromGateway(GW, TOKEN, code);
  assert.equal(vault.isSetUp(), false, 'nothing stored until the passcode is set');
  await vault.setPasscodeAfterRecovery('222222');
  await vault.save();
  assert.equal(state.vault.reports[0].results[0].value, 3.4);
  vault.lock();
  assert.equal(await vault.unlock('111111'), false);
  assert.equal(await vault.unlock('222222'), true);

  // The PDF arrives on request, then opens.
  assert.equal(await vault.loadPdf(r.filePath), null);
  assert.equal(await sync.fetchFile(r.filePath), true);
  assert.equal(new TextDecoder().decode(await vault.loadPdf(r.filePath)), '%PDF-BYTES');
  assert.equal(await sync.fetchFile('files/rpt-none.pdf.enc'), false);
});

test('two devices: edits on both merge per report, newest wins, deletes propagate', async () => {
  const a = makeDevice();
  useDevice(a);
  const code = await setUpDevice('111111');
  const p = await saveProfile({ displayName: 'A', birthYear: null, sex: '', maskNames: [] });
  const shared = await report(p.id, '2026-01-01', 1);
  const gone = await report(p.id, '2026-01-02', 2);
  await sync.syncNow();
  vault.lock();

  const b = makeDevice();
  useDevice(b);
  await sync.joinFromGateway(GW, TOKEN, code);
  await vault.setPasscodeAfterRecovery('222222');
  await vault.save();
  await sync.syncNow();

  // B edits a report and adds another; offline as far as A knows.
  await new Promise(r => setTimeout(r, 5));
  await saveReport({ id: shared.id, profileId: p.id, date: shared.date, provider: 'Edited on B' }, shared.results);
  const fromB = await report(p.id, '2026-02-02', 5);
  await sync.syncNow();
  assert.equal(sync.syncStatus().state, 'synced', sync.syncStatus().detail);
  vault.lock();

  // A hasn't seen that; it deletes one and adds its own, then syncs: the ETag differs, so it merges.
  useDevice(a);
  assert.equal(await vault.unlock('111111'), true);
  await new Promise(r => setTimeout(r, 5));
  await deleteReport(gone.id);
  const fromA = await report(p.id, '2026-03-03', 6);
  await sync.syncNow();
  assert.equal(sync.syncStatus().state, 'synced', sync.syncStatus().detail);
  const byId = id => state.vault.reports.find(r => r.id === id);
  assert.equal(byId(shared.id).provider, 'Edited on B');
  assert.ok(byId(fromB.id));
  assert.ok(byId(fromA.id));
  assert.ok(byId(gone.id).deletedAt);
  vault.lock();

  // B pulls and ends up identical.
  useDevice(b);
  assert.equal(await vault.unlock('222222'), true);
  await sync.syncNow();
  assert.equal(state.vault.reports.length, 4);
  assert.ok(state.vault.reports.find(r => r.id === fromA.id));
  assert.ok(state.vault.reports.find(r => r.id === gone.id).deletedAt);
});

test('a stale write gets 409, is merged, and nothing is lost', async () => {
  await setUpDevice();
  await saveProfile({ displayName: 'A', birthYear: null, sex: '', maskNames: [] });
  await sync.syncNow();
  const headers = { Authorization: `Bearer ${TOKEN}` };
  const current = await worker.fetch(new Request(`${GW}/vault`, { headers }), env);
  const etag = current.headers.get('ETag');
  const body = await current.text();
  const put = (h = {}) => worker.fetch(new Request(`${GW}/vault`, { method: 'PUT', headers: { ...headers, ...h }, body }), env);
  assert.equal((await put({ 'If-Match': '"stale"' })).status, 409);
  assert.equal((await put()).status, 409, 'no If-Match must not overwrite an existing vault');
  assert.equal((await put({ 'If-Match': etag })).status, 200);
});

test('a different vault on the gateway is never overwritten', async () => {
  await setUpDevice();
  await saveProfile({ displayName: 'A', birthYear: null, sex: '', maskNames: [] });
  await sync.syncNow();
  const before = koofrText();
  vault.lock();
  useDevice(makeDevice());
  await setUpDevice();
  await saveProfile({ displayName: 'B', birthYear: null, sex: '', maskNames: [] });
  await sync.syncNow();
  assert.equal(sync.syncStatus().state, 'error');
  assert.match(sync.syncStatus().detail, /different vault/);
  assert.equal(koofrText(), before);
});

test('offline: keeps the change and reports it', async () => {
  await setUpDevice();
  await saveProfile({ displayName: 'A', birthYear: null, sex: '', maskNames: [] });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('network'); };
  await sync.syncNow();
  assert.equal(sync.syncStatus().state, 'offline');
  globalThis.fetch = realFetch;
  await sync.syncNow();
  assert.equal(sync.syncStatus().state, 'synced');
  assert.ok(koofr.files.has('/dav/Koofr/health_records/vault.enc'));
});

test('conflict checks work even if the storage sends no ETag at all', async () => {
  const realHandle = koofr.handle;
  koofr.handle = async (u, i) => {
    const res = await realHandle(u, i);
    const headers = new Headers(res.headers);
    headers.delete('ETag');
    return new Response(res.body, { status: res.status, headers });
  };
  await setUpDevice();
  await saveProfile({ displayName: 'A', birthYear: null, sex: '', maskNames: [] });
  await sync.syncNow();
  await saveProfile({ displayName: 'B', birthYear: null, sex: '', maskNames: [] });
  await sync.syncNow();
  assert.equal(sync.syncStatus().state, 'synced', sync.syncStatus().detail);
  koofr.handle = realHandle;
});

test('nothing to push means no write', async () => {
  await setUpDevice();
  await saveProfile({ displayName: 'A', birthYear: null, sex: '', maskNames: [] });
  await sync.syncNow();
  requests.length = 0;
  await sync.syncNow();
  assert.deepEqual(requests.map(r => r.method), ['GET']);
});

test('deleting a report removes its PDF from the gateway', async () => {
  await setUpDevice();
  const p = await saveProfile({ displayName: 'A', birthYear: null, sex: '', maskNames: [] });
  const r = await report(p.id, '2026-01-02', 3.4);
  r.filePath = `files/${r.id}.pdf.enc`;
  await vault.savePdf(r.filePath, new Uint8Array([1, 2, 3]));
  await vault.save();
  await sync.syncNow();
  const key = `/dav/Koofr/health_records/files/${r.id}.pdf.enc`;
  assert.ok(koofr.files.has(key));
  await deleteReport(r.id);
  await sync.syncNow();
  assert.equal(sync.syncStatus().state, 'synced', sync.syncStatus().detail);
  assert.ok(!koofr.files.has(key));
});

test('a recovery key made on one device reaches the others and replaces the old one', async () => {
  const oldCode = await setUpDevice('111111');
  await saveProfile({ displayName: 'A', birthYear: null, sex: '', maskNames: [] });
  await sync.syncNow();
  const newCode = await vault.newRecoveryKey('111111');
  await vault.save();
  await sync.syncNow();
  vault.lock();
  useDevice(makeDevice());
  await assert.rejects(sync.joinFromGateway(GW, TOKEN, oldCode));
  await sync.joinFromGateway(GW, TOKEN, newCode);
});

test('encrypted backup: holds no plaintext, restores on a new device with the recovery key, and merges into an open vault', async () => {
  const code = await setUpDevice();
  const p = await saveProfile({ displayName: SECRET, birthYear: null, sex: '', maskNames: [] });
  const r = await report(p.id, '2026-01-02', 3.4);
  r.filePath = `files/${r.id}.pdf.enc`;
  await vault.savePdf(r.filePath, new TextEncoder().encode('%PDF-BYTES'));
  await vault.save();
  const backup = new TextDecoder().decode(await sync.buildBackup());
  for (const bad of [SECRET, 'mmol', 'wrappedKeyPass', '%PDF']) assert.ok(!backup.includes(bad), bad);

  await deleteReport(r.id);
  await sync.restoreIntoOpenVault(backup);
  assert.ok(state.vault.reports[0].deletedAt, 'the newer delete wins over the older backup');
  await assert.rejects(sync.restoreIntoOpenVault('{"kind":"nope"}'), /not a backup/);
  vault.lock();

  useDevice(makeDevice());
  await assert.rejects(sync.joinFromBackup('junk', code), /not a backup/);
  await assert.rejects(sync.joinFromBackup(backup, '0000-0000-0000-0000-0000-0000'));
  await sync.joinFromBackup(backup, code);
  await vault.setPasscodeAfterRecovery('333333');
  await vault.save();
  assert.equal(state.vault.reports[0].id, r.id);
  assert.equal(new TextDecoder().decode(await vault.loadPdf(r.filePath)), '%PDF-BYTES');
});

test('merge: newest copy wins per id; this device keeps its gateway details', () => {
  const local = { updatedAt: '2', profiles: [{ id: 'p', updatedAt: '2', displayName: 'new' }], reports: [{ id: 'a', updatedAt: '1' }, { id: 'b', updatedAt: '5' }],
    markers: { X: 1 }, settings: { gatewayUrl: 'mine', appToken: 'mine', lastProfileId: 'p', aiMode: 'paste' } };
  const remote = { updatedAt: '9', profiles: [{ id: 'p', updatedAt: '1', displayName: 'old' }, { id: 'q', updatedAt: '1' }], reports: [{ id: 'a', updatedAt: '3' }, { id: 'b', updatedAt: '4' }, { id: 'c', updatedAt: '1' }],
    markers: { Y: 2 }, settings: { gatewayUrl: 'theirs', appToken: 'theirs', lastProfileId: 'q', aiMode: 'workers' } };
  const m = sync.mergeVaults(local, remote);
  assert.deepEqual(Object.fromEntries(m.reports.map(r => [r.id, r.updatedAt])), { a: '3', b: '5', c: '1' });
  assert.equal(m.profiles.find(p => p.id === 'p').displayName, 'new');
  assert.ok(m.profiles.find(p => p.id === 'q'));
  assert.deepEqual(m.markers, { X: 1, Y: 2 });
  assert.equal(m.settings.gatewayUrl, 'mine');
  assert.equal(m.settings.lastProfileId, 'p');
  assert.equal(m.settings.aiMode, 'workers');
  assert.equal(m.updatedAt, '9');
  assert.equal(sync.sameContent(m, m), true);
  assert.equal(sync.sameContent(m, remote), false);
});

test('Worker: auth, id checks, size limit', async () => {
  const call = (path, init = {}) => worker.fetch(new Request(`${GW}${path}`, init), env);
  const auth = { Authorization: `Bearer ${TOKEN}` };
  assert.equal((await call('/ping')).status, 401);
  assert.equal((await call('/ping', { headers: { Authorization: 'Bearer nope' } })).status, 401);
  assert.equal((await call('/ping', { headers: auth })).status, 200);
  assert.equal((await call('/file/..%2Fx', { headers: auth })).status, 400);
  assert.equal((await call('/file/ok', { headers: auth })).status, 404);
  assert.equal((await call('/file/ok', { method: 'PUT', headers: auth, body: new Uint8Array(9 * 1024 * 1024) })).status, 413);
  assert.equal((await call('/vault', { headers: auth })).status, 200);
  assert.deepEqual(await (await call('/vault', { headers: auth })).json(), { empty: true });
  assert.equal((await call('/nope', { headers: auth })).status, 404);
});

test('Worker /ai-extract: passes masked text, handles string answers and failures', async () => {
  const call = (body, ai) => worker.fetch(new Request(`${GW}/ai-extract`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body) }), { ...env, AI: ai });
  let seen;
  const ok = { run: async (model, input) => { seen = { model, input }; return { response: { report: { date: '2026-01-01' }, results: [{ nameAsPrinted: 'LDL', value: 3 }] } }; } };
  const res = await call({ text: 'LDL 3 [MASKED]' }, ok);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).results[0].value, 3);
  assert.equal(seen.input.response_format.type, 'json_schema');
  assert.equal(seen.input.messages[1].content, 'LDL 3 [MASKED]');
  const str = await call({ text: 'x' }, { run: async () => ({ response: '{"results":[{"nameAsPrinted":"a","value":1}]}' }) });
  assert.equal(str.status, 200);
  assert.equal((await call({ text: 'x' }, { run: async () => { throw new Error('JSON Mode couldn\'t be met'); } })).status, 502);
  assert.equal((await call({ text: 'x' }, { run: async () => ({ response: 'oops' }) })).status, 502);
  assert.equal((await call({ text: '' }, ok)).status, 400);
  assert.equal((await call({ text: 'x'.repeat(50000) }, ok)).status, 413);
  assert.equal((await call({ text: 'x' }, undefined)).status, 500);
});
