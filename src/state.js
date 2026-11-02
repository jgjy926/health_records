// In-memory app state. The decrypted vault lives ONLY here (never in localStorage in plain text).
// Shape follows docs/DESIGN.md "Data model".
import { SCHEMA_VERSION } from './config.js';

export function emptyVault() {
  return {
    schemaVersion: SCHEMA_VERSION,
    profiles: [],            // up to MAX_PROFILES live: { id, displayName, birthYear, sex, maskNames: [], updatedAt, deletedAt }
    reports: [],             // { id, profileId, date, provider, type, fasting, filePath, source, notes, results: [...] }
    markers: {},             // custom/overridden catalogue entries; built-ins live in markers.js
    settings: { aiMode: 'paste', gatewayUrl: '', appToken: '', autoLockMinutes: 5, lastProfileId: null },
    updatedAt: null,
  };
}

export const state = {
  vault: null,              // decrypted vault while unlocked, null while locked
  currentProfileId: null,
  view: 'overview',
};

// People who haven't been deleted. Deleted ones stay as tombstones so sync can't bring them back.
export function liveProfiles() {
  return state.vault ? state.vault.profiles.filter(p => !p.deletedAt) : [];
}

export function currentProfile() {
  if (!state.vault) return null;
  const live = liveProfiles();
  const id = state.currentProfileId || state.vault.settings.lastProfileId;
  return live.find(p => p.id === id) || live[0] || null;
}

export function reportsForCurrent() {
  const p = currentProfile();
  if (!p) return [];
  return state.vault.reports.filter(r => r.profileId === p.id && !r.deletedAt).sort((a, b) => b.date.localeCompare(a.date));
}
