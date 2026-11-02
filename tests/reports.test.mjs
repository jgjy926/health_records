import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  },
});

const vault = await import('../src/vault.js');
const { state, currentProfile, reportsForCurrent, liveProfiles } = await import('../src/state.js');
const { saveProfile, deleteProfile, switchProfile, profileError } = await import('../src/profiles.js');
const { saveReport, deleteReport, flaggedCount, newReportId } = await import('../src/reports.js');
const { normalizeResult } = await import('../src/markers.js');

const person = name => ({ displayName: name, birthYear: 1990, sex: 'M', maskNames: [] });
const reportFor = (profileId, date) => saveReport({ profileId, date, provider: 'Lab' },
  [normalizeResult({ nameAsPrinted: 'LDL-C', value: 3.4, unit: 'mmol/L', refText: '< 3.0' })]);

beforeEach(async () => {
  vault.lock();
  store.clear();
  await vault.create('123456');
  await vault.finishSetup();
});

test('profiles: up to five, and validation', async () => {
  for (let i = 0; i < 5; i++) await saveProfile(person(`P${i}`));
  await assert.rejects(saveProfile(person('Sixth')), /Up to 5/);
  assert.equal(liveProfiles().length, 5);
  assert.match(profileError({ displayName: ' ', birthYear: null, sex: '' }), /name/);
  assert.match(profileError({ displayName: 'A', birthYear: 1500, sex: '' }), /Birth year/);
  assert.equal(profileError({ displayName: 'A', birthYear: null, sex: '' }), '');
});

test('last person is remembered inside the vault', async () => {
  const a = await saveProfile(person('A'));
  const b = await saveProfile(person('B'));
  assert.equal(currentProfile().id, a.id);
  await switchProfile(b.id);
  vault.lock();
  await vault.unlock('123456');
  assert.equal(state.currentProfileId, null);
  assert.equal(currentProfile().id, b.id);
  assert.equal(currentProfile().displayName, 'B');
});

test('a report is hand-entered with correct flags and survives lock/unlock', async () => {
  const p = await saveProfile(person('A'));
  const saved = await reportFor(p.id, '2026-01-02');
  assert.match(saved.id, /^rpt-2026-01-02-[0-9a-f]{6}$/);
  vault.lock();
  await vault.unlock('123456');
  const [r] = reportsForCurrent();
  assert.equal(r.results[0].flag, 'H');
  assert.equal(r.results[0].marker, 'LDL');
  assert.equal(r.results[0].entryType, 'manual');
  assert.equal(flaggedCount(r), 1);
});

test('reports: newest first, per person, edit keeps the id and createdAt', async () => {
  const a = await saveProfile(person('A'));
  const b = await saveProfile(person('B'));
  const older = await reportFor(a.id, '2024-05-01');
  await reportFor(a.id, '2026-05-01');
  await reportFor(b.id, '2025-05-01');
  assert.deepEqual(reportsForCurrent().map(r => r.date), ['2026-05-01', '2024-05-01']);
  const edited = await saveReport({ id: older.id, profileId: a.id, date: '2024-05-01', provider: 'New lab' }, older.results);
  assert.equal(edited.id, older.id);
  assert.equal(edited.createdAt, older.createdAt);
  assert.equal(state.vault.reports.filter(r => r.id === older.id).length, 1);
  assert.equal(state.vault.reports.find(r => r.id === older.id).provider, 'New lab');
});

test('report delete is soft', async () => {
  const p = await saveProfile(person('A'));
  const r = await reportFor(p.id, '2026-01-02');
  await deleteReport(r.id);
  assert.equal(reportsForCurrent().length, 0);
  assert.ok(state.vault.reports.find(x => x.id === r.id).deletedAt);
});

test('person delete soft-deletes their reports and wipes the name', async () => {
  const a = await saveProfile(person('Secret Name'));
  const b = await saveProfile(person('B'));
  await reportFor(a.id, '2026-01-02');
  const keep = await reportFor(b.id, '2026-01-03');
  await deleteProfile(a.id);
  assert.deepEqual(liveProfiles().map(p => p.id), [b.id]);
  assert.equal(currentProfile().id, b.id);
  const tomb = state.vault.profiles.find(p => p.id === a.id);
  assert.ok(tomb.deletedAt);
  assert.equal(tomb.displayName, '');
  assert.ok(state.vault.reports.find(r => r.profileId === a.id).deletedAt);
  assert.equal(state.vault.reports.find(r => r.id === keep.id).deletedAt, null);
  assert.ok(!JSON.stringify(state.vault).includes('Secret Name'));
  // A deleted slot frees up the limit of five.
  for (let i = 0; i < 4; i++) await saveProfile(person(`P${i}`));
  assert.equal(liveProfiles().length, 5);
});

test('report ids are unique for the same date', () => {
  const ids = new Set(Array.from({ length: 100 }, () => newReportId('2026-01-01')));
  assert.equal(ids.size, 100);
});
