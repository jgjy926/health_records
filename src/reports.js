// Reports tab: list + detail, the manual form, and the editable results table (the Add flow reuses it for review).
import { state, currentProfile, reportsForCurrent } from './state.js';
import { esc, emptyState, fmtDate, showToast, confirmDialog, openBytes } from './ui.js';
import * as vault from './vault.js';
import { fetchFile } from './sync.js';
import { catalogue, computeFlag, normalizeResult, parseRange, parseValue, zhName } from './markers.js';

export const REPORT_TYPES = ['Annual checkup', 'Blood test', 'Urine test', 'Follow-up', 'Other'];
const LOW_CONFIDENCE = 0.8;

// ---------- data ----------

const randomHex = n => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');

export function newReportId(date) { return `rpt-${date}-${randomHex(3)}`; }

export function flaggedCount(report) {
  return (report.results || []).filter(r => r.flag === 'L' || r.flag === 'H').length;
}

// Insert or update a report in the open vault, and save. Returns the stored report.
export async function saveReport(fields, results) {
  const now = new Date().toISOString();
  const reports = state.vault.reports;
  const existing = fields.id ? reports.find(r => r.id === fields.id) : null;
  const report = {
    id: fields.id || newReportId(fields.date),
    profileId: fields.profileId,
    date: fields.date,
    provider: fields.provider || '',
    type: fields.type || '',
    fasting: !!fields.fasting,
    filePath: fields.filePath ?? (existing ? existing.filePath : null),
    source: fields.source || (existing ? existing.source : 'manual'),
    notes: fields.notes || '',
    results,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
    deletedAt: null,
  };
  if (existing) reports[reports.indexOf(existing)] = report;
  else reports.push(report);
  await vault.save();
  return report;
}

// Soft delete, so sync merges cleanly. The encrypted PDF goes now; the record stays as a tombstone.
export async function deleteReport(id) {
  const report = state.vault.reports.find(r => r.id === id);
  if (!report) return;
  report.deletedAt = report.updatedAt = new Date().toISOString();
  await vault.save();
  if (report.filePath) { try { await vault.deletePdf(report.filePath); } catch { /* the tombstone is what counts */ } }
}

// ---------- duplicates ----------

const rowKey = r => r.marker || String(r.nameAsPrinted || '').trim().toLowerCase();

// Indexes of rows repeating a test already listed above them (a report can print a test on two pages).
export function duplicateRows(results) {
  const seen = new Set();
  const dups = new Set();
  results.forEach((r, i) => {
    const key = rowKey(r);
    if (key && seen.has(key)) dups.add(i);
    seen.add(key);
  });
  return dups;
}

// The saved report this one most looks like, or null: the same person and date with mostly the same tests
// (two reports on one day with different tests are fine), or mostly the same values on another date (a misread date).
export function findDuplicateReport({ date, results }, reports, profileId) {
  const fresh = new Map(results.map(r => [rowKey(r), r]));
  fresh.delete('');
  let best = null;
  for (const report of reports) {
    if (report.profileId !== profileId || report.deletedAt) continue;
    const saved = new Map((report.results || []).map(r => [rowKey(r), r]));
    const total = Math.min(fresh.size, saved.size);
    if (!total) continue;
    const shared = [...fresh.keys()].filter(k => saved.has(k));
    const sameValues = shared.filter(k => String(fresh.get(k).value) === String(saved.get(k).value)).length;
    const sameDate = report.date === date;
    if (!(sameDate ? shared.length / total >= 0.5 : total >= 5 && sameValues / total >= 0.9)) continue;
    if (!best || sameDate > best.sameDate || (sameDate === best.sameDate && sameValues > best.sameValues)) best = { report, sameDate, sameValues, total };
  }
  return best;
}

export function duplicateMessage({ report, sameDate, sameValues, total }) {
  const label = `${fmtDate(report.date)}${report.provider ? ` (${report.provider})` : ''}`;
  return `${sameDate ? 'You already have a report from' : 'These results match the report from'} ${label}: ${sameValues} of ${total} results are the same.`;
}

// ---------- editable results table ----------

export function rangeText(r) {
  if (r.refText) return r.refText;
  if (r.refLow != null && r.refHigh != null) return `${r.refLow} - ${r.refHigh}`;
  if (r.refHigh != null) return `< ${r.refHigh}`;
  if (r.refLow != null) return `> ${r.refLow}`;
  return '';
}

function rowHints(r, repeated) {
  const hints = [];
  if (repeated) hints.push(['hint-dup', 'Same test as a row above']);
  if (!r.marker && r.nameAsPrinted) hints.push(['hint-unknown', 'Unknown marker']);
  if (typeof r.confidence === 'number' && r.confidence < LOW_CONFIDENCE) hints.push(['hint-low', `Low confidence (${Math.round(r.confidence * 100)}%)`]);
  if (r.flag === 'L' || r.flag === 'H') hints.push(['hint-range', r.flag === 'H' ? 'Above range' : 'Below range']);
  return hints;
}

function resultRowHtml(r = {}, repeated = false) {
  const auto = computeFlag(r.value, r.refLow ?? null, r.refHigh ?? null);
  const flag = r.flag && r.flag !== auto ? r.flag : '';
  const hints = rowHints(r, repeated);
  return `<div class="result-row ${hints.map(h => h[0]).join(' ')}" data-row data-orig="${esc(JSON.stringify(r))}">
    <label class="rr-name"><span>Marker <span class="zh" data-zh>${esc(zhName(r.marker))}</span></span><input data-f="name" list="markerList" value="${esc(r.nameAsPrinted ?? '')}" placeholder="e.g. LDL Cholesterol" autocomplete="off"></label>
    <label><span>Value</span><input data-f="value" value="${esc(r.value ?? '')}" inputmode="decimal" autocomplete="off"></label>
    <label><span>Unit</span><input data-f="unit" value="${esc(r.unit ?? '')}" autocomplete="off"></label>
    <label><span>Range</span><input data-f="range" value="${esc(rangeText(r))}" placeholder="3.5 - 5.0" autocomplete="off"></label>
    <label><span>Flag</span><select data-f="flag">
      ${[['', 'Auto'], ['L', 'Low'], ['N', 'Normal'], ['H', 'High']].map(([v, l]) => `<option value="${v}" ${v === flag ? 'selected' : ''}>${l}</option>`).join('')}
    </select></label>
    <button type="button" class="btn rr-del" data-del-row aria-label="Remove this result">&times;</button>
    ${hints.length ? `<p class="rr-hints">${hints.map(h => esc(h[1])).join(' · ')}</p>` : ''}
  </div>`;
}

export function resultsEditorHtml(results) {
  const options = Object.entries(catalogue(state.vault.markers)).map(([code, m]) => `<option value="${esc(m.name)}" label="${esc(zhName(code))}"></option>`).join('');
  const repeats = duplicateRows(results);
  return `<datalist id="markerList">${options}</datalist>
    <div data-rows>${results.map((r, i) => resultRowHtml(r, repeats.has(i))).join('')}</div>
    <p class="mt"><button type="button" class="btn" data-add-row>Add a result</button></p>`;
}

export function wireResultsEditor(root) {
  const rows = root.querySelector('[data-rows]');
  root.querySelector('[data-add-row]').onclick = () => {
    rows.insertAdjacentHTML('beforeend', resultRowHtml());
    rows.lastElementChild.querySelector('input').focus();
  };
  rows.addEventListener('click', e => { const b = e.target.closest('[data-del-row]'); if (b) b.closest('[data-row]').remove(); });
  // A known marker fills its standard unit when the unit is still blank.
  rows.addEventListener('change', e => {
    if (e.target.dataset.f !== 'name') return;
    const row = e.target.closest('[data-row]');
    const unit = row.querySelector('[data-f="unit"]');
    const code = normalizeResult({ nameAsPrinted: e.target.value }, state.vault.markers).marker;
    const std = code && catalogue(state.vault.markers)[code].unitStd;
    row.querySelector('[data-zh]').textContent = zhName(code);
    if (std && std !== 'text' && !unit.value) unit.value = std;
  });
}

// Reads every row with a name and a value. entryType: a changed AI row becomes "edited", a new row "manual".
export function readResults(root) {
  return [...root.querySelectorAll('[data-row]')].map(row => {
    const field = f => row.querySelector(`[data-f="${f}"]`).value.trim();
    const orig = JSON.parse(row.dataset.orig);
    const range = parseRange(field('range'));
    const value = parseValue(field('value'));
    const changed = field('name') !== (orig.nameAsPrinted ?? '') || value !== parseValue(orig.value)
      || field('unit') !== (orig.unit ?? '') || field('range') !== rangeText(orig);
    const sameRange = field('range') === rangeText(orig);
    return normalizeResult({
      nameAsPrinted: field('name'), value, unit: field('unit'), refText: field('range'),
      refLow: sameRange ? orig.refLow : range.low, refHigh: sameRange ? orig.refHigh : range.high,
      flag: field('flag'),
      // The catalogue code goes only when the name is untouched; a new name is matched again.
      marker: field('name') === (orig.nameAsPrinted ?? '') ? orig.marker : null,
      confidence: orig.confidence,
      entryType: !orig.entryType ? 'manual' : changed && orig.entryType === 'ai' ? 'edited' : orig.entryType,
    }, state.vault.markers);
  }).filter(r => r.nameAsPrinted && r.value !== null);
}

// ---------- screens ----------

export function renderReports(el, args = []) {
  const [id, action] = args;
  const reports = reportsForCurrent();
  if (id === 'new') { renderForm(el, null); return; }
  const report = id ? reports.find(r => r.id === id) : null;
  if (report && action === 'edit') { renderForm(el, report); return; }

  const list = reports.map(r => {
    const n = flaggedCount(r);
    return `<a class="card report-row ${report && report.id === r.id ? 'selected' : ''}" href="#reports/${esc(r.id)}">
      <span><strong>${esc(fmtDate(r.date))}</strong><br><span class="muted">${esc(r.provider || r.type || 'Report')}</span></span>
      <span class="badge ${n ? 'flag-H' : 'flag-N'}">${n ? `${n} flagged` : 'All in range'}</span></a>`;
  }).join('');

  el.innerHTML = `<div class="view-head"><h2>Reports</h2><a class="btn" href="#reports/new">Enter by hand</a></div>` + (reports.length
    ? `<div class="split ${report ? 'has-detail' : ''}">
        <div class="split-list">${list}</div>
        <div class="split-detail">${report ? detailHtml(report) : '<div class="card empty">Pick a report to see its results.</div>'}</div>
      </div>`
    : emptyState('No reports yet', 'Reports you add or enter by hand appear here, newest first.',
      '<a class="btn btn-primary" href="#add">Add a report</a>'));
  if (report) wireDetail(el, report);
}

function detailHtml(r) {
  const cat = catalogue(state.vault.markers);
  const rows = (r.results || []).map(x => `<tr>
      <td>${esc(x.marker && cat[x.marker] ? cat[x.marker].name : x.nameAsPrinted)} <span class="zh">${esc(zhName(x.marker))}</span></td>
      <td>${esc(x.value)} <span class="muted">${esc(x.unit)}</span></td>
      <td>${x.flag ? `<span class="badge flag-${esc(x.flag)}">${esc(x.flag)}</span>` : ''}</td><td class="muted">${esc(rangeText(x))}</td></tr>`).join('');
  return `<div class="card">
      <p class="only-phone"><a href="#reports">&larr; All reports</a></p>
      <h3>${esc(fmtDate(r.date))}</h3>
      <p class="muted">${[r.provider, r.type, r.fasting ? 'Fasting' : ''].filter(Boolean).map(esc).join(' · ')}</p>
      ${r.notes ? `<p class="report-notes">${esc(r.notes)}</p>` : ''}
      <div class="table-wrap"><table class="results"><thead><tr><th>Marker</th><th>Value</th><th>Flag</th><th>Range</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="actions mt">
        ${r.filePath ? '<button type="button" class="btn" data-open-pdf>Open PDF</button>' : ''}
        <a class="btn" href="#reports/${esc(r.id)}/edit">Edit</a>
        <button type="button" class="btn btn-danger" data-delete>Delete</button>
      </p></div>`;
}

function wireDetail(el, report) {
  const open = el.querySelector('[data-open-pdf]');
  if (open) {
    open.onclick = async () => {
      try {
        let bytes = await vault.loadPdf(report.filePath);
        if (!bytes && await fetchFile(report.filePath)) bytes = await vault.loadPdf(report.filePath);
        if (bytes) await openBytes(bytes, `${report.id}.pdf`, 'application/pdf');
        else showToast('This PDF is not on this device or the gateway.');
      } catch (e) { showToast(e.message); }
    };
  }
  el.querySelector('[data-delete]').onclick = async () => {
    if (!await confirmDialog(`Delete the report from ${fmtDate(report.date)}?`, { okLabel: 'Delete', danger: true })) return;
    await deleteReport(report.id);
    showToast('Report deleted');
    location.hash = '#reports';
  };
}

// Shared by the manual form and the Add review step.
export function reportFieldsHtml(r = {}) {
  return `<div class="form-grid">
      <div class="field"><label for="rDate">Date</label><input id="rDate" type="date" value="${esc(r.date || '')}" required></div>
      <div class="field"><label for="rProvider">Lab / clinic</label><input id="rProvider" value="${esc(r.provider || '')}" autocomplete="off"></div>
      <div class="field"><label for="rType">Type</label><select id="rType">${REPORT_TYPES.map(t =>
        `<option ${t === (r.type || REPORT_TYPES[0]) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      <label class="check field-check"><input id="rFasting" type="checkbox" ${r.fasting ? 'checked' : ''}> Fasting</label>
    </div>
    <div class="field"><label for="rNotes">Notes</label><textarea id="rNotes" rows="${r.notes ? 6 : 2}">${esc(r.notes || '')}</textarea></div>`;
}

export function readReportFields(root) {
  return {
    date: root.querySelector('#rDate').value,
    provider: root.querySelector('#rProvider').value.trim(),
    type: root.querySelector('#rType').value,
    fasting: root.querySelector('#rFasting').checked,
    notes: root.querySelector('#rNotes').value.trim(),
  };
}

function renderForm(el, report) {
  const results = report ? report.results : [{}, {}, {}];
  el.innerHTML = `<h2>${report ? 'Edit report' : 'Enter a report by hand'}</h2>
    <form class="card" id="reportForm">
      ${reportFieldsHtml(report || { date: new Date().toISOString().slice(0, 10) })}
      <h3 class="mt">Results</h3>
      ${resultsEditorHtml(results)}
      <p id="reportError" class="form-error" role="alert"></p>
      <p class="actions"><button type="submit" class="btn btn-primary">Save report</button>
        <a class="btn" href="#reports${report ? `/${esc(report.id)}` : ''}">Cancel</a></p>
    </form>`;
  wireResultsEditor(el);
  el.querySelector('#reportForm').onsubmit = async e => {
    e.preventDefault();
    const fields = readReportFields(el);
    const results2 = readResults(el);
    const error = !/^\d{4}-\d{2}-\d{2}$/.test(fields.date) ? 'Pick the report date.'
      : !results2.length ? 'Add at least one result with a marker and a value.' : '';
    el.querySelector('#reportError').textContent = error;
    if (error) return;
    const dup = report ? null : findDuplicateReport({ date: fields.date, results: results2 }, state.vault.reports, currentProfile().id);
    if (dup && !await confirmDialog(`${duplicateMessage(dup)} Save this one anyway?`, { okLabel: 'Save anyway' })) return;
    const saved = await saveReport({ ...fields, id: report ? report.id : null, profileId: report ? report.profileId : currentProfile().id }, results2);
    showToast('Report saved');
    location.hash = `#reports/${saved.id}`;
  };
}
