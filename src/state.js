// In-memory app state. The decrypted vault lives ONLY here (never in localStorage in plain text).
// Shape follows docs/DESIGN.md "Data model".
import { SCHEMA_VERSION } from './config.js';

export function emptyVault() {
  return {
    schemaVersion: SCHEMA_VERSION,
    profiles: [],            // up to MAX_PROFILES: { id, displayName, birthYear, sex, maskNames: [] }
    reports: [],             // { id, profileId, date, provider, type, fasting, filePath, source, notes, results: [...] }
    markers: {},             // custom/overridden catalogue entries; built-ins live in markers.js
    settings: { aiMode: 'paste', gatewayUrl: '', appToken: '', autoLockMinutes: 5 },
    updatedAt: null,
  };
}

export const state = {
  vault: null,              // decrypted vault while unlocked, null while locked
  currentProfileId: null,
  view: 'overview',
};

export function currentProfile() {
  if (!state.vault) return null;
  return state.vault.profiles.find(p => p.id === state.currentProfileId) || state.vault.profiles[0] || null;
}

export function reportsForCurrent() {
  const p = currentProfile();
  if (!p) return [];
  return state.vault.reports.filter(r => r.profileId === p.id).sort((a, b) => b.date.localeCompare(a.date));
}
