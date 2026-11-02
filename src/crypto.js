// Web Crypto helpers (see docs/DESIGN.md "Security"). Works in browsers and in Node's webcrypto for tests.
//
//   deriveKek(passcode, salt)          PBKDF2-SHA256, PBKDF2_ITERATIONS -> AES-KW key-encryption key
//   generateDataKey()                  random 256-bit AES-GCM key (extractable only for wrapping)
//   wrapKey(dataKey, kek) / unwrapKey(wrapped, kek)
//   encryptJson(obj, dataKey) -> { iv, ct }   AES-GCM, fresh 12-byte IV every call
//   decryptJson({ iv, ct }, dataKey) -> obj
//   encryptBytes(u8, dataKey) / decryptBytes(blob, dataKey)   for PDFs (blob = iv + ciphertext)
//   makeRecoveryKey() -> human-readable 24-char code (XXXX-XXXX-XXXX-XXXX-XXXX-XXXX)
//                        the data key is ALSO wrapped with a KEK derived from it.
// Rules: never log keys or plaintext; never store the passcode; base64 for storage.
import { PBKDF2_ITERATIONS } from './config.js';

const IV_BYTES = 12;
const SALT_BYTES = 16;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RECOVERY_LENGTH = 24;

const subtle = () => globalThis.crypto.subtle;
const randomBytes = n => globalThis.crypto.getRandomValues(new Uint8Array(n));

export function toB64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(b64) {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

export function makeSalt() { return toB64(randomBytes(SALT_BYTES)); }

// salt is base64. Passcode and recovery key both go through here, so both cost the same to guess.
export async function deriveKek(passcode, salt, iterations = PBKDF2_ITERATIONS) {
  const base = await subtle().importKey('raw', new TextEncoder().encode(String(passcode)), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(salt), iterations },
    base, { name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}

export function generateDataKey() {
  return subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function wrapKey(dataKey, kek) {
  return toB64(await subtle().wrapKey('raw', dataKey, kek, 'AES-KW'));
}

// Rejects when the KEK is wrong (AES-KW has a built-in integrity check).
// Keep extractable false unless the key is about to be wrapped again.
export function unwrapKey(wrapped, kek, extractable = false) {
  return subtle().unwrapKey('raw', fromB64(wrapped), kek, 'AES-KW', { name: 'AES-GCM' }, extractable, ['encrypt', 'decrypt']);
}

export async function encryptJson(obj, dataKey) {
  const iv = randomBytes(IV_BYTES);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, dataKey, new TextEncoder().encode(JSON.stringify(obj)));
  return { iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptJson({ iv, ct }, dataKey) {
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, dataKey, fromB64(ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

export async function encryptBytes(u8, dataKey) {
  const iv = randomBytes(IV_BYTES);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, dataKey, u8));
  const blob = new Uint8Array(IV_BYTES + ct.length);
  blob.set(iv);
  blob.set(ct, IV_BYTES);
  return blob;
}

export async function decryptBytes(blob, dataKey) {
  const iv = blob.subarray(0, IV_BYTES);
  return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv }, dataKey, blob.subarray(IV_BYTES)));
}

// 24 Crockford base32 chars = 120 random bits. A byte & 31 is unbiased (256 is a multiple of 32).
export function makeRecoveryKey() {
  const chars = Array.from(randomBytes(RECOVERY_LENGTH), b => CROCKFORD[b & 31]).join('');
  return chars.match(/.{4}/g).join('-');
}

// Forgiving when typed back: case, spaces and dashes don't matter; O/I/L read as 0/1 (Crockford).
// Returns the canonical grouped form, or null if it can't be a recovery key.
export function normalizeRecoveryKey(code) {
  const s = String(code).toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== RECOVERY_LENGTH || [...s].some(c => !CROCKFORD.includes(c))) return null;
  return s.match(/.{4}/g).join('-');
}
