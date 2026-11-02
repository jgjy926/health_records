// The five tab views. Each render(el) redraws its section from state.
// Shell: empty states + layout only. Later phases fill each one (see docs/BUILD_PLAN.md).
import { state, currentProfile, reportsForCurrent } from './state.js';
import { esc, emptyState, fmtDate } from './ui.js';
import { DEV_STUB } from './vault.js';

const devBanner = () => DEV_STUB
  ? `<div class="card" style="border-color:#5a4512"><strong style="color:var(--warn)">Shell build.</strong>
     <span class="muted">The vault is a dev stub: nothing is encrypted or saved yet (Phase 2).</span></div>` : '';

function needProfile() {
  return emptyState('Add a person first', 'Create a profile in Settings (up to 5 people).',
    '<a class="btn btn-primary" href="#settings">Open Settings</a>');
}

export function renderOverview(el) {
  const p = currentProfile();
  if (!p) { el.innerHTML = devBanner() + needProfile(); return; }
  const reports = reportsForCurrent();
  if (!reports.length) {
    el.innerHTML = devBanner() + emptyState(`No reports for ${p.displayName}`, 'Add a checkup PDF to get started.',
      '<a class="btn btn-primary" href="#add">Add a report</a>');
    return;
  }
  // Phase 5: latest checkup, flagged-marker cards with 4-point sparklines.
  el.innerHTML = devBanner() + `<h2>Overview</h2><p class="muted">Latest checkup ${esc(fmtDate(reports[0].date))}</p>`;
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
      <ol class="muted" style="margin:0;padding-left:20px">
        <li>Pick the PDF (stays on this device)</li><li>Check the masked text</li>
        <li>Enrich with AI (copy/paste into Claude, or Workers AI)</li><li>Review every value</li><li>Save</li>
      </ol>
      <p style="margin-top:12px"><button class="btn btn-primary" type="button" disabled>Pick PDF (Phase 4)</button></p>
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
  // Phase 2/3/6: passcode change, recovery key, auto-lock, profiles CRUD, AI mode, gateway URL + token, export.
  el.innerHTML = `<h2>Settings</h2>
    <div class="card"><h3>People (${n}/5)</h3><p class="muted">Add, edit and remove profiles. (Phase 3)</p></div>
    <div class="card"><h3>Security</h3><p class="muted">Change passcode, recovery key, auto-lock time. (Phase 2)</p></div>
    <div class="card"><h3>AI</h3><p class="muted">Copy/paste into Claude (default) or Workers AI fallback. (Phase 4)</p></div>
    <div class="card"><h3>Sync</h3><p class="muted">health-gateway URL and app token. (Phase 6)</p></div>
    <div class="card"><h3>Backup</h3><p class="muted">Encrypted backup file and CSV export. (Phase 6)</p></div>`;
}
