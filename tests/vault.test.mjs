import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// vault.js only needs localStorage here; PDFs (IndexedDB) are checked in the browser.
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
const { state } = await import('../src/state.js');
const { RETRY_DELAYS_MS } = await import('../src/config.js');

const SECRET = 'LDL-CHOLESTEROL-SECRET-NAME';

async function setUp(passcode = '123456') {
  const code = await vault.create(passcode);
  await vault.finishSetup();
  return code;
}

function expireDelay() {
  const a = JSON.parse(store.get('health_records.attempts'));
  a.until = 0;
  store.set('health_records.attempts', JSON.stringify(a));
}

beforeEach(() => { vault.lock(); store.clear(); });

test('nothing is stored until the recovery key is acknowledged', async () => {
  await vault.create('123456');
  assert.equal(vault.isSetUp(), false);
  assert.equal(store.size, 0);
  assert.equal(state.vault, null);
  await vault.finishSetup();
  assert.equal(vault.isSetUp(), true);
  assert.ok(state.vault);
});

test('storage holds only the documented fields and no plaintext', async () => {
  await setUp();
  state.vault.reports.push({ id: 'r1', provider: SECRET });
  await vault.save();
  assert.deepEqual([...store.keys()], [vault.VAULT_KEY]);
  const raw = store.get(vault.VAULT_KEY);
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(),
    ['ct', 'iterations', 'iv', 'recoveryAt', 'salt', 'v', 'wrappedKeyPass', 'wrappedKeyRecovery']);
  assert.ok(!raw.includes(SECRET));
  assert.ok(!raw.includes('reports'));
  assert.equal(JSON.parse(raw).iterations, 600000);
});

test('save then lock then unlock restores the data; lock clears memory', async () => {
  await setUp();
  state.vault.reports.push({ id: 'r1', provider: SECRET });
  await vault.save();
  vault.lock();
  assert.equal(state.vault, null);
  await assert.rejects(vault.savePdf('x', new Uint8Array(1)), /Locked/);
  assert.equal(await vault.unlock('123456'), true);
  assert.equal(state.vault.reports[0].provider, SECRET);
});

test('wrong passcode cannot open, and short passcodes are refused', async () => {
  await assert.rejects(vault.create('12345'));
  await setUp();
  vault.lock();
  assert.equal(await vault.unlock('000000'), false);
  assert.equal(state.vault, null);
});

test('retry delays follow the table and persist', async () => {
  await setUp();
  vault.lock();
  for (let failed = 1; failed <= 7; failed++) {
    assert.equal(await vault.unlock('000000'), false);
    const want = RETRY_DELAYS_MS[Math.min(failed, RETRY_DELAYS_MS.length - 1)];
    const wait = vault.retryWaitMs();
    assert.ok(wait <= want && wait > want - 5000, `after ${failed} failures: waited ${wait}, table says ${want}`);
    if (want > 0) {
      // The right passcode is refused while the delay runs, and the refusal isn't another failure.
      const before = store.get('health_records.attempts');
      assert.equal(await vault.unlock('123456'), false);
      assert.equal(store.get('health_records.attempts'), before);
      expireDelay();
    }
  }
  assert.equal(await vault.unlock('123456'), true);
  assert.equal(store.has('health_records.attempts'), false);
});

test('recovery key unlocks and forces a new passcode', async () => {
  const code = await setUp();
  state.vault.notes = SECRET;
  await vault.save();
  vault.lock();
  assert.equal(await vault.unlockWithRecoveryKey('0000-0000-0000-0000-0000-0000'), false);
  assert.equal(await vault.unlockWithRecoveryKey('nonsense'), false);
  assert.equal(await vault.unlockWithRecoveryKey(code.toLowerCase()), true);
  assert.equal(state.vault.notes, SECRET);
  await vault.setPasscodeAfterRecovery('987654');
  state.vault.notes = 'after';
  await vault.save();
  vault.lock();
  assert.equal(await vault.unlock('123456'), false);
  assert.equal(await vault.unlock('987654'), true);
  assert.equal(state.vault.notes, 'after');
});

test('new passcode needs recovery mode first', async () => {
  await setUp();
  await assert.rejects(vault.setPasscodeAfterRecovery('987654'), /Not in recovery/);
});

test('change passcode: old stops working, recovery key still works, data stays', async () => {
  const code = await setUp();
  state.vault.notes = SECRET;
  await vault.save();
  await assert.rejects(vault.changePasscode('000000', '222222'), /Wrong passcode/);
  await assert.rejects(vault.changePasscode('123456', '12'));
  await vault.changePasscode('123456', '222222');
  state.vault.notes = 'still open';
  await vault.save();
  vault.lock();
  assert.equal(await vault.unlock('123456'), false);
  assert.equal(await vault.unlock('222222'), true);
  assert.equal(state.vault.notes, 'still open');
  vault.lock();
  assert.equal(await vault.unlockWithRecoveryKey(code), true);
});

test('new recovery key replaces the old one', async () => {
  const oldCode = await setUp();
  await assert.rejects(vault.newRecoveryKey('000000'), /Wrong passcode/);
  const newCode = await vault.newRecoveryKey('123456');
  assert.notEqual(newCode, oldCode);
  vault.lock();
  assert.equal(await vault.unlockWithRecoveryKey(oldCode), false);
  assert.equal(await vault.unlockWithRecoveryKey(newCode), true);
});

test('damaged vault reports damage instead of "wrong passcode"', async () => {
  await setUp();
  vault.lock();
  const blob = JSON.parse(store.get(vault.VAULT_KEY));
  blob.ct = blob.ct.slice(4) + 'AAAA';
  store.set(vault.VAULT_KEY, JSON.stringify(blob));
  await assert.rejects(vault.unlock('123456'), /damaged/);
  assert.equal(state.vault, null);
});

test('overlapping saves keep the newest data', async () => {
  await setUp();
  state.vault.notes = 'first';
  const a = vault.save();
  state.vault.notes = 'second';
  const b = vault.save();
  await Promise.all([a, b]);
  vault.lock();
  await vault.unlock('123456');
  assert.equal(state.vault.notes, 'second');
});
