// Profiles: up to MAX_PROFILES people share one vault. The header switcher picks the current one.
// Phase 3: add/edit/delete profiles in Settings (displayName, birthYear, sex, maskNames).
import { state, currentProfile } from './state.js';
import { esc } from './ui.js';

export function renderSwitcher(onChange) {
  const sel = document.getElementById('profileSwitcher');
  const profiles = state.vault ? state.vault.profiles : [];
  if (!profiles.length) {
    sel.innerHTML = '<option>No person yet</option>';
    sel.disabled = true;
    return;
  }
  const cur = currentProfile();
  sel.disabled = false;
  sel.innerHTML = profiles.map(p =>
    `<option value="${esc(p.id)}" ${cur && cur.id === p.id ? 'selected' : ''}>${esc(p.displayName)}</option>`).join('');
  sel.onchange = () => { state.currentProfileId = sel.value; onChange(); };
}
