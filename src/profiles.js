// Profiles: up to MAX_PROFILES people share one vault. The header switcher picks the current one.
import { state, currentProfile, liveProfiles } from './state.js';
import { esc, openModal, confirmDialog, showToast } from './ui.js';
import * as vault from './vault.js';
import { MAX_PROFILES } from './config.js';

const randomHex = n => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');

let onSwitch = () => {};

export function renderSwitcher(onChange) {
  if (onChange) onSwitch = onChange;
  const sel = document.getElementById('profileSwitcher');
  const profiles = liveProfiles();
  if (!profiles.length) {
    sel.innerHTML = '<option>No person yet</option>';
    sel.disabled = true;
    return;
  }
  const cur = currentProfile();
  sel.disabled = false;
  sel.innerHTML = profiles.map(p =>
    `<option value="${esc(p.id)}" ${cur && cur.id === p.id ? 'selected' : ''}>${esc(p.displayName)}</option>`).join('');
  sel.onchange = async () => {
    await switchProfile(sel.value);
    // A report open in the old person's view doesn't belong to the new one.
    if (location.hash.startsWith('#reports/')) location.hash = '#reports';
    else onSwitch();
  };
}

export async function switchProfile(id) {
  state.currentProfileId = id;
  state.vault.settings.lastProfileId = id;
  await vault.save();
}

// ---------- data ----------

// Returns an error message, or '' if fine.
export function profileError({ displayName, birthYear, sex }) {
  if (!String(displayName || '').trim()) return 'Enter a name.';
  const year = new Date().getFullYear();
  if (birthYear !== null && (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > year)) return `Birth year must be between 1900 and ${year}.`;
  if (sex && !['M', 'F'].includes(sex)) return 'Pick a sex.';
  return '';
}

export async function saveProfile(fields) {
  const profiles = state.vault.profiles;
  const existing = fields.id ? profiles.find(p => p.id === fields.id) : null;
  if (!existing && liveProfiles().length >= MAX_PROFILES) throw new Error(`Up to ${MAX_PROFILES} people.`);
  const error = profileError(fields);
  if (error) throw new Error(error);
  const profile = {
    id: existing ? existing.id : `p-${randomHex(4)}`,
    displayName: fields.displayName.trim(),
    birthYear: fields.birthYear,
    sex: fields.sex || '',
    maskNames: (fields.maskNames || []).map(s => s.trim()).filter(Boolean),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };
  if (existing) profiles[profiles.indexOf(existing)] = profile;
  else profiles.push(profile);
  if (!state.currentProfileId || !existing && liveProfiles().length === 1) state.currentProfileId = state.vault.settings.lastProfileId = profile.id;
  await vault.save();
  return profile;
}

// Soft delete of the person and their reports. Names are wiped now; the ids stay so sync can't bring them back.
export async function deleteProfile(id) {
  const profile = state.vault.profiles.find(p => p.id === id);
  if (!profile) return;
  const now = new Date().toISOString();
  Object.assign(profile, { displayName: '', birthYear: null, sex: '', maskNames: [], deletedAt: now, updatedAt: now });
  const files = [];
  for (const r of state.vault.reports) {
    if (r.profileId === id && !r.deletedAt) {
      r.deletedAt = r.updatedAt = now;
      if (r.filePath) files.push(r.filePath);
    }
  }
  if (state.currentProfileId === id) state.currentProfileId = null;
  if (state.vault.settings.lastProfileId === id) state.vault.settings.lastProfileId = null;
  await vault.save();
  for (const f of files) { try { await vault.deletePdf(f); } catch { /* the tombstone is what counts */ } }
}

// ---------- Settings > People ----------

export function renderPeople(el) {
  const profiles = liveProfiles();
  el.innerHTML = `<h3>People (${profiles.length}/${MAX_PROFILES})</h3>
    ${profiles.map(p => `<div class="person-row"><span><strong>${esc(p.displayName)}</strong>
        <span class="muted">${[p.birthYear, p.sex].filter(Boolean).map(esc).join(' · ')}</span></span>
      <span class="actions"><button type="button" class="btn" data-edit="${esc(p.id)}">Edit</button>
        <button type="button" class="btn btn-danger" data-remove="${esc(p.id)}">Delete</button></span></div>`).join('')}
    ${profiles.length ? '' : '<p class="muted">Add yourself first. Reports belong to a person.</p>'}
    <p class="mt"><button type="button" class="btn btn-primary" data-add ${profiles.length >= MAX_PROFILES ? 'disabled' : ''}>Add a person</button></p>`;
  const refresh = () => { renderPeople(el); renderSwitcher(); };
  el.querySelector('[data-add]').onclick = () => profileForm(null, refresh);
  el.querySelectorAll('[data-edit]').forEach(b => {
    b.onclick = () => profileForm(profiles.find(p => p.id === b.dataset.edit), refresh);
  });
  el.querySelectorAll('[data-remove]').forEach(b => {
    b.onclick = async () => {
      const p = profiles.find(x => x.id === b.dataset.remove);
      const count = state.vault.reports.filter(r => r.profileId === p.id && !r.deletedAt).length;
      if (!await confirmDialog(`Delete ${p.displayName} and their ${count} report(s)? This can't be undone.`, { okLabel: 'Delete', danger: true })) return;
      await deleteProfile(p.id);
      refresh();
      showToast('Person deleted');
    };
  });
}

function profileForm(p, done) {
  const modal = openModal(`<h3>${p ? 'Edit person' : 'Add a person'}</h3>
    <form data-profile-form>
      <div class="field"><label for="pName">Name shown in the app</label><input id="pName" value="${esc(p ? p.displayName : '')}" autocomplete="off" required></div>
      <div class="form-grid">
        <div class="field"><label for="pYear">Birth year</label><input id="pYear" inputmode="numeric" value="${esc(p && p.birthYear ? p.birthYear : '')}" autocomplete="off"></div>
        <div class="field"><label for="pSex">Sex</label><select id="pSex">${[['', '-'], ['M', 'Male'], ['F', 'Female']].map(([v, l]) =>
          `<option value="${v}" ${p && p.sex === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="pMask">Names to hide before AI (one per line, as printed on reports)</label>
        <textarea id="pMask" rows="3" autocomplete="off">${esc(p ? p.maskNames.join('\n') : '')}</textarea></div>
      <p class="form-error" data-error role="alert"></p>
      <p class="actions"><button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn" data-cancel>Cancel</button></p>
    </form>`);
  const q = s => modal.el.querySelector(s);
  q('[data-cancel]').onclick = modal.close;
  q('[data-profile-form]').onsubmit = async e => {
    e.preventDefault();
    const year = q('#pYear').value.trim();
    try {
      await saveProfile({
        id: p ? p.id : null, displayName: q('#pName').value, birthYear: year ? Number(year) : null,
        sex: q('#pSex').value, maskNames: q('#pMask').value.split('\n'),
      });
      modal.close();
      done();
    } catch (err) { q('[data-error]').textContent = err.message; }
  };
  q('#pName').focus();
}
