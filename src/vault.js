// Vault: owns the encrypted blob in localStorage and the decrypted copy in state.vault.
//
// SHELL STATUS: DEV STUB. Any passcode of PASSCODE_MIN_LENGTH digits "unlocks" an empty,
// in-memory vault. Nothing is encrypted and nothing is saved. Phase 2 replaces every function
// below with the real implementation on top of crypto.js — keep the same exported names.
import { state, emptyVault } from './state.js';
import { PASSCODE_MIN_LENGTH } from './config.js';

export const DEV_STUB = true;

// true once a passcode has been set on this device (Phase 2: an encrypted header exists in localStorage)
export function isSetUp() { return false; }

// First run: create the vault with this passcode, return the recovery key to show once.
export async function create(passcode) {
  if (String(passcode).length < PASSCODE_MIN_LENGTH) throw new Error('Passcode too short');
  state.vault = emptyVault();
  return 'DEV-STUB-NO-RECOVERY-KEY';
}

// Returns true on success. Phase 2: derive KEK, unwrap data key, decrypt vault, apply retry delay.
export async function unlock(passcode) {
  if (String(passcode).length < PASSCODE_MIN_LENGTH) return false;
  state.vault = state.vault || emptyVault();
  return true;
}

// Phase 2: also unlock with the recovery key, then force a new passcode.
export async function unlockWithRecoveryKey(_code) { return false; }

// Drop the decrypted vault and data key from memory.
export function lock() { state.vault = null; }

// Phase 2: encrypt state.vault and write it to localStorage; Phase 6: mark dirty for sync.
export async function save() { if (state.vault) state.vault.updatedAt = new Date().toISOString(); }

export async function changePasscode(_oldCode, _newCode) { throw new Error('Phase 2'); }
