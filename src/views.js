// The five tab views. Each render(el) redraws its section from state.
// Shell: empty states + layout only. Later phases fill each one (see docs/BUILD_PLAN.md).
import { state, currentProfile, reportsForCurrent } from './state.js';
import { esc, emptyState, fmtDate, showToast } from './ui.js';
import * as vault from './vault.js';
import { recoveryKeyHtml, wireRecoveryKey } from './lock.js';
import { APP_VERSION, PASSCODE_MIN_LENGTH } from './config.js';

const AUTO_LOCK_CHOICES = [1, 2, 5, 10, 15];

function needProfile() {
  return emptyState('Add a person first', 'Create a profile in Settings (up to 5 people).',
    '<a class="btn btn-primary" href="#settings">Open Settings</a>');
}

export function renderOverview(el) {
  const p = currentProfile();
  if (!p) { el.innerHTML = needProfile(); return; }
  const reports = reportsForCurrent();
  if (!reports.length) {
    el.innerHTML = emptyState(`No reports for ${p.displayName}`, 'Add a checkup PDF to get started.',
      '<a class="btn btn-primary" href="#add">Add a report</a>');
    return;
  }
  // Phase 5: latest checkup, flagged-marker cards with 4-point sparklines.
  el.innerHTML = `<h2>Overview</h2><p class="muted">Latest checkup ${esc(fmtDate(reports[0].date))}</p>`;
}

export function renderReports(el) {
  const p = currentProfile();
  if (!p) { el.innerHTML = needProfile(); return; }
  const reports = reportsForCurrent();
  // Phase 3: list (date, provider, flagged count) + detail with result table; manual add/edit.
  el.innerHTML = `<h2>Reports</h2>` + (reports.length ? '' :
    emptyState('No reports yet', 'Reports you add or enter by hand appear here, newest first.',
      '<a class="btn btn-primary" href="#add">Add a report</a>'));
}

export function renderAdd(el) {
  const p = currentProfile();
  if (!p) { el.innerHTML = needProfile(); return; }
  // Phase 4: pick PDF -> extract on device -> mask -> AI enrich (paste / Workers AI) -> review -> save.
  el.innerHTML = `<h2>Add a report</h2>
    <div class="card">
      <ol class="muted steps">
        <li>Pick the PDF (stays on this device)</li><li>Check the masked text</li>
        <li>Enrich with AI (copy/paste into Claude, or Workers AI)</li><li>Review every value</li><li>Save</li>
      </ol>
      <p class="mt"><button class="btn btn-primary" type="button" disabled>Pick PDF (Phase 4)</button></p>
    </div>`;
}

export function renderTrends(el) {
  const p = currentProfile();
  if (!p) { el.innerHTML = needProfile(); return; }
  // Phase 5: marker/group picker, line chart with shaded normal range (vendored Chart.js), year-to-year table.
  el.innerHTML = `<h2>Trends</h2>` + emptyState('Nothing to chart yet', 'Trends appear once a marker has two or more results.');
}

export function renderSettings(el) {
  const n = state.vault ? state.vault.profiles.length : 0;
  const minutes = state.vault.settings.autoLockMinutes;
  // Phase 3/6: profiles CRUD, AI mode, gateway URL + token, export.
  el.innerHTML = `<h2>Settings</h2>
    <div class="card"><h3>People (${n}/5)</h3><p class="muted">Add, edit and remove profiles. (Phase 3)</p></div>
    <div class="card"><h3>Security</h3>
      <div class="field"><label for="autoLock">Lock after no activity</label>
        <select id="autoLock">${AUTO_LOCK_CHOICES.map(m =>
          `<option value="${m}" ${m === minutes ? 'selected' : ''}>${m} min</option>`).join('')}</select></div>
      <p class="muted">The app also locks 1 minute after it goes to the background.</p>
      <details class="mt"><summary>Change passcode</summary>
        <form id="changePasscode" class="mt">
          <div class="field"><label for="pcOld">Current passcode</label><input id="pcOld" type="password" inputmode="numeric" autocomplete="off" required></div>
          <div class="field"><label for="pcNew">New passcode (${PASSCODE_MIN_LENGTH}+ digits)</label><input id="pcNew" type="password" inputmode="numeric" autocomplete="off" required></div>
          <div class="field"><label for="pcNew2">New passcode again</label><input id="pcNew2" type="password" inputmode="numeric" autocomplete="off" required></div>
          <p id="pcError" class="form-error" role="alert"></p>
          <button type="submit" class="btn btn-primary">Change passcode</button>
        </form></details>
      <details class="mt"><summary>New recovery key</summary>
        <form id="newRecovery" class="mt">
          <p class="muted">Your current recovery key stops working as soon as you make a new one.</p>
          <div class="field"><label for="rkPass">Current passcode</label><input id="rkPass" type="password" inputmode="numeric" autocomplete="off" required></div>
          <p id="rkError" class="form-error" role="alert"></p>
          <button type="submit" class="btn btn-primary">Make new recovery key</button>
        </form>
        <div id="rkShow" class="mt" hidden></div></details>
    </div>
    <div class="card"><h3>AI</h3><p class="muted">Copy/paste into Claude (default) or Workers AI fallback. (Phase 4)</p></div>
    <div class="card"><h3>Sync</h3><p class="muted">health-gateway URL and app token. (Phase 6)</p></div>
    <div class="card"><h3>Backup</h3><p class="muted">Encrypted backup file and CSV export. (Phase 6)</p></div>
    <p class="muted">Version ${esc(APP_VERSION)}</p>`;
  wireSecurity(el);
}

function wireSecurity(el) {
  const q = id => el.querySelector(`#${id}`);
  q('autoLock').onchange = async e => {
    state.vault.settings.autoLockMinutes = Number(e.target.value);
    await vault.save();
    showToast('Saved');
  };
  q('changePasscode').onsubmit = async e => {
    e.preventDefault();
    const form = e.target;
    const [oldCode, a, b] = [q('pcOld').value, q('pcNew').value, q('pcNew2').value];
    const error = !/^\d+$/.test(a) || a.length < PASSCODE_MIN_LENGTH ? `Use ${PASSCODE_MIN_LENGTH} or more digits.`
      : a !== b ? "The new passcodes don't match." : '';
    q('pcError').textContent = error;
    if (error) return;
    try {
      await vault.changePasscode(oldCode, a);
      form.reset();
      form.closest('details').open = false;
      showToast('Passcode changed');
    } catch (err) { q('pcError').textContent = err.message; }
  };
  q('newRecovery').onsubmit = async e => {
    e.preventDefault();
    const form = e.target;
    q('rkError').textContent = '';
    try {
      const code = await vault.newRecoveryKey(q('rkPass').value);
      form.reset();
      form.hidden = true;
      const show = q('rkShow');
      show.hidden = false;
      show.innerHTML = recoveryKeyHtml(code);
      wireRecoveryKey(show, code, () => {
        show.innerHTML = '';
        show.hidden = true;
        form.hidden = false;
        form.closest('details').open = false;
      });
    } catch (err) { q('rkError').textContent = err.message; }
  };
}
