import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveKek, generateDataKey, wrapKey, unwrapKey, encryptJson, decryptJson, encryptBytes, decryptBytes,
  makeRecoveryKey, normalizeRecoveryKey, makeSalt,
} from '../src/crypto.js';

const RECOVERY_FORMAT = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){5}$/;

test('JSON round trip through a wrapped data key', async () => {
  const salt = makeSalt();
  const key = await generateDataKey();
  const wrapped = await wrapKey(key, await deriveKek('123456', salt));
  const key2 = await unwrapKey(wrapped, await deriveKek('123456', salt));
  const sealed = await encryptJson({ ldl: 3.4, name: 'Me' }, key);
  assert.deepEqual(await decryptJson(sealed, key2), { ldl: 3.4, name: 'Me' });
  assert.ok(!atob(sealed.ct).includes('ldl'));
});

test('wrong passcode cannot unwrap the data key', async () => {
  const salt = makeSalt();
  const wrapped = await wrapKey(await generateDataKey(), await deriveKek('123456', salt));
  await assert.rejects(async () => unwrapKey(wrapped, await deriveKek('654321', salt)));
});

test('same passcode with another salt gives another key', async () => {
  const wrapped = await wrapKey(await generateDataKey(), await deriveKek('123456', makeSalt()));
  await assert.rejects(async () => unwrapKey(wrapped, await deriveKek('123456', makeSalt())));
});

test('recovery key opens the same data', async () => {
  const salt = makeSalt();
  const key = await generateDataKey();
  const code = makeRecoveryKey();
  const wrapped = await wrapKey(key, await deriveKek(code, salt));
  const sealed = await encryptJson({ ok: true }, key);
  const key2 = await unwrapKey(wrapped, await deriveKek(normalizeRecoveryKey(code.toLowerCase()), salt));
  assert.deepEqual(await decryptJson(sealed, key2), { ok: true });
});

test('recovery key format and forgiving input', () => {
  const code = makeRecoveryKey();
  assert.match(code, RECOVERY_FORMAT);
  assert.notEqual(makeRecoveryKey(), code);
  assert.equal(normalizeRecoveryKey(code.replace(/-/g, ' ').toLowerCase()), code);
  assert.equal(normalizeRecoveryKey('OIL0-0000-0000-0000-0000-0000'), '0110-0000-0000-0000-0000-0000');
  assert.equal(normalizeRecoveryKey('too-short'), null);
  assert.equal(normalizeRecoveryKey('UUUU-0000-0000-0000-0000-0000'), null);
});

test('IV is fresh on every encryption', async () => {
  const key = await generateDataKey();
  const ivs = new Set();
  const cts = new Set();
  for (let i = 0; i < 50; i++) {
    const s = await encryptJson({ same: 'value' }, key);
    ivs.add(s.iv);
    cts.add(s.ct);
  }
  assert.equal(ivs.size, 50);
  assert.equal(cts.size, 50);

  const bytes = new Uint8Array([1, 2, 3]);
  const a = await encryptBytes(bytes, key);
  const b = await encryptBytes(bytes, key);
  assert.notDeepEqual(a.subarray(0, 12), b.subarray(0, 12));
});

test('bytes round trip, large enough to need chunked base64 elsewhere', async () => {
  const key = await generateDataKey();
  const bytes = new Uint8Array(200000).map((_, i) => i % 251);
  assert.deepEqual(await decryptBytes(await encryptBytes(bytes, key), key), bytes);
});

test('large JSON survives base64 encoding', async () => {
  const key = await generateDataKey();
  const big = { text: 'x'.repeat(300000) };
  assert.deepEqual(await decryptJson(await encryptJson(big, key), key), big);
});

test('tampered ciphertext is rejected', async () => {
  const key = await generateDataKey();
  const blob = await encryptBytes(new Uint8Array([1, 2, 3]), key);
  blob[blob.length - 1] ^= 1;
  await assert.rejects(decryptBytes(blob, key));
});
