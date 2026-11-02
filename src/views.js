// The five tab views. Each render(el) redraws its section from state.
// Shell: empty states + layout only. Later phases fill each one (see docs/BUILD_PLAN.md).
import { state, currentProfile, reportsForCurrent } from './state.js';
import { renderPeople } from './profiles.js';
import { catalogue, MARKER_GROUPS } from './markers.js';
import { flaggedCards, sparklineSvg, exportCsv } from './trends.js';
import { esc, emptyState, fmtDate, showToast, openModal } from './ui.js';
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
  const latest = reports[0];
  const cards = flaggedCards(reports, state.vault.markers);
  el.innerHTML = `<h2>Overview</h2>
    <a class="card report-row" href="#reports/${esc(latest.id)}">
      <span><span class="muted">Latest checkup</span><br><strong>${esc(fmtDate(latest.date))}</strong><br>
        <span class="muted">${esc(latest.provider || latest.type || '')}</span></span>
      <span class="badge ${cards.length ? 'flag-H' : 'flag-N'}">${cards.length ? `${cards.length} flagged` : 'All in range'}</span></a>
    <h3 class="mt">${cards.length ? 'Outside the range' : 'Nothing outside the range'}</h3>
    <div class="grid">${cards.map(c => `<a class="card flag-card" ${c.code ? `href="#trends/${esc(c.code)}"` : ''}>
        <span class="flag-card-head"><strong>${esc(c.name)}</strong><span class="badge flag-${esc(c.flag)}">${c.flag === 'H' ? 'High' : 'Low'}</span></span>
        <span>${esc(c.value)} <span class="muted">${esc(c.unit)}</span></span>
        <span class="muted">Range ${esc(c.range) || 'not printed'}</span>
        ${sparklineSvg(c.points, c.band)}</a>`).join('')}</div>
    <p class="muted mt">This shows what the lab printed. It isn't medical advice, so talk to your doctor about anything flagged.</p>`;
}

export function renderSettings(el) {
  const settings = state.vault.settings;
  const minutes = settings.autoLockMinutes;
  // Phase 6: test connection, sync, export.
  el.innerHTML = `<h2>Settings</h2>
    <div class="card" id="peopleCard"></div>
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
    <div class="card"><h3>AI</h3>
      <div class="field"><label for="aiMode">First choice when reading a report</label>
        <select id="aiMode">
          <option value="paste" ${settings.aiMode === 'paste' ? 'selected' : ''}>Copy/paste into Claude</option>
          <option value="workers" ${settings.aiMode === 'workers' ? 'selected' : ''}>Workers AI (free fallback, needs the gateway)</option>
        </select></div>
      <p class="muted">Identifiers are masked before either one sees the text.</p></div>
    <div class="card" id="syncCard"><h3>Sync</h3>
      <div class="field"><label for="gwUrl">Gateway URL</label><input id="gwUrl" type="url" inputmode="url" placeholder="https://health-gateway.you.workers.dev" autocomplete="off" spellcheck="false" value="${esc(settings.gatewayUrl)}"></div>
      <div class="field"><label for="gwToken">App token (kept inside the encrypted vault)</label><input id="gwToken" type="password" autocomplete="off" value="${esc(settings.appToken)}"></div>
      <p class="actions" data-sync-actions><button type="button" class="btn" id="gwSave">Save</button></p>
      <p class="muted" id="gwStatus" role="status"></p></div>
    <div class="card" id="backupCard"><h3>Backup</h3>
      <p class="actions"><button type="button" class="btn" id="csvExport">Export this person's results (CSV)</button></p>
      <p class="muted">The CSV is not encrypted.</p></div>
    <div class="card" id="markerCard"></div>
    <p class="muted">Version ${esc(APP_VERSION)}</p>`;
  renderPeople(el.querySelector('#peopleCard'));
  wireSecurity(el);
  renderMarkerCard(el.querySelector('#markerCard'));
  el.querySelector('#csvExport').onclick = () => exportCsv();
  el.querySelector('#aiMode').onchange = async e => {
    settings.aiMode = e.target.value;
    await vault.save();
    showToast('Saved');
  };
  el.querySelector('#gwSave').onclick = async () => {
    settings.gatewayUrl = el.querySelector('#gwUrl').value.trim().replace(/\/+$/, '');
    settings.appToken = el.querySelector('#gwToken').value.trim();
    await vault.save();
    showToast('Saved');
  };
}

// ---------- marker catalogue: built-ins are read-only, your own live in vault.markers ----------
function renderMarkerCard(el) {
  const custom = state.vault.markers;
  const all = catalogue(custom);
  el.innerHTML = `<h3>Marker catalogue</h3>
    <p class="muted">${Object.keys(all).length} markers, ${Object.keys(custom).length} of them yours. Add one when a report uses a test the app doesn't know.</p>
    <details><summary>Show all</summary>${MARKER_GROUPS.map(g => {
      const names = Object.entries(all).filter(([, m]) => m.group === g);
      return names.length ? `<h4>${esc(g)}</h4><p class="muted">${names.map(([, m]) => `${esc(m.name)} (${esc(m.unitStd)})`).join(', ')}</p>` : '';
    }).join('')}</details>
    <p class="mt"><button type="button" class="btn" data-add-marker>Add a marker</button></p>`;
  el.querySelector('[data-add-marker]').onclick = () => {
    const modal = openModal(`<h3>Add a marker</h3><form data-marker-form>
      <div class="field"><label for="mName">Name</label><input id="mName" required autocomplete="off"></div>
      <div class="form-grid">
        <div class="field"><label for="mGroup">Group</label><select id="mGroup">${MARKER_GROUPS.map(g => `<option ${g === 'Other' ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
        <div class="field"><label for="mUnit">Standard unit</label><input id="mUnit" required autocomplete="off"></div>
      </div>
      <div class="field"><label for="mAliases">Other names on reports (one per line)</label><textarea id="mAliases" rows="2"></textarea></div>
      <p class="actions"><button type="submit" class="btn btn-primary">Save</button><button type="button" class="btn" data-cancel>Cancel</button></p></form>`);
    const q = s => modal.el.querySelector(s);
    q('[data-cancel]').onclick = modal.close;
    q('[data-marker-form]').onsubmit = async e => {
      e.preventDefault();
      const name = q('#mName').value.trim();
      const code = `C_${name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 30)}`;
      state.vault.markers[code] = {
        name, group: q('#mGroup').value, unitStd: q('#mUnit').value.trim(),
        aliases: q('#mAliases').value.split('\n').map(x => x.trim()).filter(Boolean), toStd: {},
      };
      await vault.save();
      modal.close();
      renderMarkerCard(el);
      showToast('Marker added');
    };
  };
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
