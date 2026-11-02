// Vault: owns the encrypted blob in localStorage, the encrypted PDFs in IndexedDB,
// and the decrypted copy in state.vault (memory only).
//
// localStorage holds { v, salt, iterations, wrappedKeyPass, wrappedKeyRecovery, recoveryAt, iv, ct } and nothing readable.
// Keys are prefixed because GitHub Pages gives every repo of a user the same origin.
import { state, emptyVault } from './state.js';
import { PASSCODE_MIN_LENGTH, PBKDF2_ITERATIONS, RETRY_DELAYS_MS } from './config.js';
import {
  deriveKek, generateDataKey, wrapKey, unwrapKey, encryptJson, decryptJson, encryptBytes, decryptBytes,
  makeRecoveryKey, normalizeRecoveryKey, makeSalt, toB64, fromB64,
} from './crypto.js';

export const DEV_STUB = false;

export const VAULT_KEY = 'health_records.vault';
const ATTEMPTS_KEY = 'health_records.attempts';   // failed-unlock count only, no health data
const DB_NAME = 'health_records';
const DB_STORE = 'files';

let dataKey = null;          // non-extractable while unlocked
let recoveringKey = null;    // extractable copy, only between recovery unlock and the new passcode
let pendingSetup = null;     // first run: nothing is stored until the recovery key is acknowledged
let pendingJoin = null;      // new device: nothing is stored until it has its own passcode
let saveListener = () => {};
let writes = Promise.resolve();

const readBlob = () => JSON.parse(localStorage.getItem(VAULT_KEY));
const writeBlob = blob => localStorage.setItem(VAULT_KEY, JSON.stringify(blob));

// Writes run one at a time, so an older save can't land on top of a newer one.
function queued(fn) {
  const run = writes.then(fn, fn);
  writes = run.catch(() => {});
  return run;
}

function checkPasscode(passcode) {
  if (!/^\d+$/.test(String(passcode)) || String(passcode).length < PASSCODE_MIN_LENGTH) throw new Error('Passcode too short');
}

// true once a passcode has been set on this device (an encrypted blob exists in localStorage)
export function isSetUp() { return localStorage.getItem(VAULT_KEY) !== null; }

// First run: prepare the vault with this passcode, return the recovery key to show once.
// Nothing is stored until finishSetup(), so closing the app here just restarts the setup.
export async function create(passcode) {
  checkPasscode(passcode);
  const salt = makeSalt();
  const recoveryKey = makeRecoveryKey();
  const key = await generateDataKey();
  const kek = await deriveKek(passcode, salt);
  const wrappedKeyPass = await wrapKey(key, kek);
  const wrappedKeyRecovery = await wrapKey(key, await deriveKek(recoveryKey, salt));
  pendingSetup = { kek, blob: { v: 1, salt, iterations: PBKDF2_ITERATIONS, wrappedKeyPass, wrappedKeyRecovery, recoveryAt: new Date().toISOString() } };
  return recoveryKey;
}

// The user has confirmed saving the recovery key: write the vault and open it.
export async function finishSetup() {
  if (!pendingSetup) throw new Error('Nothing to finish');
  const { kek, blob } = pendingSetup;
  pendingSetup = null;
  dataKey = await unwrapKey(blob.wrappedKeyPass, kek);
  state.vault = emptyVault();
  state.vault.updatedAt = new Date().toISOString();
  writeBlob({ ...blob, ...await encryptJson(state.vault, dataKey) });
  clearAttempts();
}

function readAttempts() {
  try {
    const a = JSON.parse(localStorage.getItem(ATTEMPTS_KEY));
    return { failed: a.failed | 0, until: Number(a.until) || 0 };
  } catch { return { failed: 0, until: 0 }; }
}
function clearAttempts() { localStorage.removeItem(ATTEMPTS_KEY); }

// Milliseconds until another passcode attempt is allowed (0 = now). Survives reloads.
export function retryWaitMs() {
  const wait = readAttempts().until - Date.now();
  // A clock moved backwards must not extend the wait past the longest delay.
  return Math.min(Math.max(0, wait), Math.max(...RETRY_DELAYS_MS));
}

// Returns true on success, false on a wrong passcode or while the retry delay is running.
// The failure is counted before the slow key derivation, so closing the app mid-check doesn't dodge the delay.
export async function unlock(passcode) {
  if (!isSetUp() || retryWaitMs() > 0) return false;
  const failed = readAttempts().failed + 1;
  const delay = RETRY_DELAYS_MS[Math.min(failed, RETRY_DELAYS_MS.length - 1)];
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify({ failed, until: Date.now() + delay }));

  const blob = readBlob();
  let key;
  try {
    key = await unwrapKey(blob.wrappedKeyPass, await deriveKek(passcode, blob.salt, blob.iterations));
  } catch { return false; }
  clearAttempts();
  await open(blob, key);
  return true;
}

// Unlocks with the recovery key; the caller must then call setPasscodeAfterRecovery().
// No retry delay here: the key has 120 random bits, and a typo must not lock out someone who forgot the passcode.
export async function unlockWithRecoveryKey(code) {
  const normal = normalizeRecoveryKey(code);
  if (!normal || !isSetUp()) return false;
  const blob = readBlob();
  let key;
  try {
    key = await unwrapKey(blob.wrappedKeyRecovery, await deriveKek(normal, blob.salt, blob.iterations), true);
  } catch { return false; }
  clearAttempts();
  await open(blob, key);
  recoveringKey = key;
  return true;
}

async function open(blob, key) {
  try {
    state.vault = await decryptJson(blob, key);
  } catch {
    throw new Error('The vault on this device is damaged and cannot be read.');
  }
  dataKey = key;
}

export async function setPasscodeAfterRecovery(newCode) {
  checkPasscode(newCode);
  if (!recoveringKey) throw new Error('Not in recovery');
  const key = recoveringKey;
  await queued(async () => {
    const blob = pendingJoin || readBlob();
    const kek = await deriveKek(newCode, blob.salt, blob.iterations);
    blob.wrappedKeyPass = await wrapKey(key, kek);
    writeBlob(blob);
    dataKey = await unwrapKey(blob.wrappedKeyPass, kek);
  });
  recoveringKey = null;
  pendingJoin = null;
}

// ---------- sync: everything here is ciphertext ----------

export function setSaveListener(fn) { saveListener = fn; }

// What may leave the device: no wrappedKeyPass, so only the recovery key can open a stolen copy.
export function syncBlob() {
  const { wrappedKeyPass, ...rest } = readBlob();
  return rest;
}

// Decrypts a copy from sync or a backup with the open data key. Rejects if it's a different vault.
export function openSyncBlob(blob) { return decryptJson(blob, dataKey); }

// Takes a merged vault. A newer recovery key made on another device comes along, so a later upload can't bring the old one back.
export async function adoptMerged(merged, remoteBlob) {
  state.vault = merged;
  const key = dataKey;
  await queued(async () => {
    const blob = readBlob();
    if (String(remoteBlob.recoveryAt || '') > String(blob.recoveryAt || '')) {
      blob.wrappedKeyRecovery = remoteBlob.wrappedKeyRecovery;
      blob.recoveryAt = remoteBlob.recoveryAt;
    }
    writeBlob({ ...blob, ...await encryptJson(merged, key) });
  });
}

// New device: open a synced or backed-up copy with the recovery key. The caller then asks for a passcode (setPasscodeAfterRecovery).
export async function joinVault(remoteBlob, code) {
  const normal = normalizeRecoveryKey(code);
  if (!normal) throw new Error('That recovery key is not the right length.');
  let key;
  try {
    key = await unwrapKey(remoteBlob.wrappedKeyRecovery, await deriveKek(normal, remoteBlob.salt, remoteBlob.iterations), true);
  } catch {
    throw new Error("That recovery key didn't work.");
  }
  await open(remoteBlob, key);
  recoveringKey = key;
  pendingJoin = { ...remoteBlob };
}

export const bytesToB64 = toB64;
export const b64ToBytes = fromB64;

// Drop the decrypted vault and data key from memory.
export function lock() {
  state.vault = null;
  state.currentProfileId = null;
  state.add = null;
  dataKey = null;
  recoveringKey = null;
  pendingSetup = null;
  pendingJoin = null;
}

// Encrypt state.vault and write it to localStorage; Phase 6: mark dirty for sync.
export async function save() {
  const vault = state.vault;
  const key = dataKey;
  if (!vault || !key) return;
  vault.updatedAt = new Date().toISOString();
  await queued(async () => {
    const sealed = await encryptJson(vault, key);
    writeBlob({ ...readBlob(), ...sealed });
  });
  saveListener();
}

// Salt stays: the recovery wrap uses the same salt and can't be redone without the recovery key.
// Rejects (without counting a retry) when the old passcode is wrong.
export async function changePasscode(oldCode, newCode) {
  checkPasscode(newCode);
  await queued(async () => {
    const blob = readBlob();
    const key = await unlockExtractable(blob, oldCode);
    blob.wrappedKeyPass = await wrapKey(key, await deriveKek(newCode, blob.salt, blob.iterations));
    writeBlob(blob);
  });
}

// Replaces the recovery key (old one stops working). Returns the new one to show once.
export async function newRecoveryKey(passcode) {
  const code = makeRecoveryKey();
  await queued(async () => {
    const blob = readBlob();
    const key = await unlockExtractable(blob, passcode);
    blob.wrappedKeyRecovery = await wrapKey(key, await deriveKek(code, blob.salt, blob.iterations));
    blob.recoveryAt = new Date().toISOString();
    writeBlob(blob);
  });
  return code;
}

async function unlockExtractable(blob, passcode) {
  try {
    return await unwrapKey(blob.wrappedKeyPass, await deriveKek(passcode, blob.salt, blob.iterations), true);
  } catch {
    throw new Error('Wrong passcode');
  }
}

// ---------- encrypted PDFs in IndexedDB ----------
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, mode);
      const req = fn(tx.objectStore(DB_STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

// id is the report's filePath. Only ciphertext reaches IndexedDB.
export async function savePdf(id, bytes) {
  if (!dataKey) throw new Error('Locked');
  const blob = await encryptBytes(bytes, dataKey);
  await withStore('readwrite', s => s.put(blob, id));
}

// Returns the decrypted bytes, or null if this device doesn't have the file.
export async function loadPdf(id) {
  if (!dataKey) throw new Error('Locked');
  const key = dataKey;
  const blob = await withStore('readonly', s => s.get(id));
  return blob ? decryptBytes(blob, key) : null;
}

// The stored ciphertext as it is, for sync and backups.
export const readEncryptedFile = id => withStore('readonly', s => s.get(id));
export const writeEncryptedFile = (id, blob) => withStore('readwrite', s => s.put(blob, id));

export async function deletePdf(id) {
  await withStore('readwrite', s => s.delete(id));
}
