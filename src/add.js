// Add tab: pick PDF -> extract on device -> review masked text -> AI (paste or Workers AI) -> review results -> save.
// The flow lives in state.add (memory only). The AI step survives a lock, because going to Claude and waiting for its reply
// can take longer than the 1-minute background lock: that draft is encrypted with the data key, like a PDF.
import { state, currentProfile, liveProfiles } from './state.js';
import { esc, emptyState, openModal, showToast, confirmDialog } from './ui.js';
import * as vault from './vault.js';
import { extractPdfText } from './parse.js';
import { maskText, maskMore, findLeaks, MASK_TOKEN } from './mask.js';
import { buildPrompt, buildAttachPrompt, enrichWithWorkers, openEnrichPanel } from './enrich.js';
import { normalizeResult } from './markers.js';
import {
  newReportId, saveReport, reportFieldsHtml, readReportFields, resultsEditorHtml, wireResultsEditor, readResults,
} from './reports.js';

const MAX_PDF_BYTES = 8 * 1024 * 1024;     // the gateway's limit per file
const DRAFT_PDF = 'draft/pdf';
const DRAFT_META = 'draft/meta';

export function isPdf(bytes) {
  return bytes.length > 4 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';
}

let viewEl = null;
const refresh = () => { if (viewEl) renderAdd(viewEl); };

export async function renderAdd(el) {
  viewEl = el;
  const p = currentProfile();
  if (!p) {
    el.innerHTML = emptyState('Add a person first', 'Create a profile in Settings (up to 5 people).',
      '<a class="btn btn-primary" href="#settings">Open Settings</a>');
    return;
  }
  if (!state.add) await resumeDraft();
  if (viewEl !== el) return;
  const step = state.add ? state.add.step : 'pick';
  ({ pick: renderPick, mask: renderMask, enrich: renderEnrich, review: renderReview }[step])(el, p);
}

// ---------- draft ----------

async function saveDraft() {
  const a = state.add;
  await vault.savePdf(DRAFT_PDF, a.bytes);
  await vault.savePdf(DRAFT_META, new TextEncoder().encode(JSON.stringify({ profileId: a.profileId, masked: a.masked, name: a.name })));
}

async function resumeDraft() {
  try {
    const meta = await vault.loadPdf(DRAFT_META);
    const bytes = meta && await vault.loadPdf(DRAFT_PDF);
    if (!state.vault || !bytes) return;
    const d = JSON.parse(new TextDecoder().decode(meta));
    if (!liveProfiles().some(p => p.id === d.profileId)) { await clearDraft(); return; }
    state.add = { step: 'enrich', bytes, profileId: d.profileId, masked: d.masked, name: d.name, resumed: true };
  } catch { /* no usable draft: start fresh */ }
}

async function clearDraft() {
  try { await vault.deletePdf(DRAFT_PDF); await vault.deletePdf(DRAFT_META); } catch { /* nothing to clear */ }
}

async function cancelFlow() {
  state.add = null;
  await clearDraft();
  refresh();
}

// ---------- 1. pick ----------

function renderPick(el, p) {
  el.innerHTML = `<h2>Add a report</h2>
    <div class="card">
      <ol class="muted steps">
        <li>Pick the PDF (it stays on this device)</li><li>Check the masked text</li>
        <li>Read it with AI (copy/paste into Claude, or Workers AI)</li><li>Review every value</li><li>Save</li>
      </ol>
      <div class="field mt"><label for="addPerson">Whose report is it?</label>
        <select id="addPerson">${liveProfiles().map(x => `<option value="${esc(x.id)}" ${x.id === p.id ? 'selected' : ''}>${esc(x.displayName)}</option>`).join('')}</select></div>
      <p class="actions"><label class="btn btn-primary" for="addFile">Pick PDF</label>
        <button type="button" class="btn" data-reply>Paste AI reply</button>
        <a class="btn" href="#reports/new">Enter by hand</a></p>
      <p class="muted">PDF too big, or already read in Claude? Use <strong>Paste AI reply</strong>: copy the prompt,
        attach the report to Claude yourself, then paste the reply back. The PDF isn't stored with the report.</p>
      <input id="addFile" class="sr-only" type="file" accept="application/pdf,.pdf">
      <p id="addStatus" class="muted mt" role="status"></p>
      <p id="addError" class="form-error" role="alert"></p>
    </div>`;
  el.querySelector('#addFile').onchange = e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) handleFile(el, file, el.querySelector('#addPerson').value);
  };
  el.querySelector('[data-reply]').onclick = () => {
    const profileId = el.querySelector('#addPerson').value;
    openEnrichPanel({
      title: 'Paste AI reply',
      prompt: buildAttachPrompt(),
      hint: 'Copy this prompt into Claude and attach the report there. Remove your name and IC number from it if you can.',
      importReply: reply => {
        state.add = {
          step: 'review', bytes: null, profileId, name: '', source: 'ai-paste', report: reply.report,
          results: reply.results.map(r => normalizeResult(r, state.vault.markers)),
        };
        refresh();
      },
    });
  };
}

function askPassword(wrongBefore) {
  return new Promise(resolve => {
    const modal = openModal(`<h3>This PDF has a password</h3>
      <p class="muted">${wrongBefore ? 'That password was wrong. Try again.' : 'Labs often use your IC number. It is used only on this device.'}</p>
      <form data-pw><div class="field"><label for="pdfPw">Password</label><input id="pdfPw" type="password" autocomplete="off"></div>
      <p class="actions"><button type="submit" class="btn btn-primary">Open</button><button type="button" class="btn" data-cancel>Cancel</button></p></form>`);
    modal.el.querySelector('[data-cancel]').onclick = () => { modal.close(); resolve(null); };
    modal.el.querySelector('[data-pw]').onsubmit = e => {
      e.preventDefault();
      const value = modal.el.querySelector('#pdfPw').value;
      modal.close();
      resolve(value);
    };
    modal.el.querySelector('#pdfPw').focus();
  });
}

async function handleFile(el, file, profileId) {
  const status = el.querySelector('#addStatus');
  const error = el.querySelector('#addError');
  error.textContent = '';
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isPdf(bytes)) throw new Error('That file is not a PDF. Only PDF reports are supported.');
    if (bytes.length > MAX_PDF_BYTES) throw new Error('That PDF is over 8 MB, the most the app can store and sync. Use Paste AI reply instead.');
    status.textContent = 'Opening the PDF…';
    const { pages, scanned } = await extractPdfText(file, { onProgress: m => { status.textContent = m; }, askPassword });
    if (!state.vault) return;   // locked while reading
    const fullText = pages.join('\n\n');
    const profile = state.vault.profiles.find(p => p.id === profileId);
    state.add = { step: 'mask', bytes, profileId, masked: maskText(fullText, profile).masked, name: file.name, scanned, undo: [] };
    refresh();
  } catch (e) {
    status.textContent = '';
    // After a cancelled password prompt pdf.js reports a destroyed task; that's not an error for the user.
    if (!/destroy|PasswordException/i.test(`${e.name} ${e.message}`)) error.textContent = e.message;
    else error.textContent = 'The PDF stays locked without its password.';
  }
}

// ---------- 2. masked-text review ----------

function renderMask(el) {
  const a = state.add;
  el.innerHTML = `<h2>Check the masked text</h2>
    <div class="card">
      <p class="muted">Only this text can go to AI. Tap any word to hide it everywhere${a.scanned ? '. This PDF was scanned, so check for reading mistakes too' : ''}.</p>
      <div class="masked-text" data-text></div>
      <p class="actions mt"><button type="button" class="btn btn-primary" data-next>Looks right, continue</button>
        <button type="button" class="btn" data-undo ${a.undo.length ? '' : 'disabled'}>Undo</button>
        <button type="button" class="btn" data-cancel>Cancel</button></p>
      <p data-error class="form-error" role="alert"></p>
    </div>`;
  const box = el.querySelector('[data-text]');
  // Words become tappable; whitespace (the line breaks and columns) stays as it is.
  box.innerHTML = a.masked.split(/(\s+)/).map(part => {
    if (!part || /^\s+$/.test(part)) return esc(part);
    if (part.includes(MASK_TOKEN)) return `<span class="masked">${esc(part)}</span>`;
    return `<button type="button" class="word" data-w="${esc(part.replace(/^[(,;:]+|[),;:.]+$/g, '') || part)}">${esc(part)}</button>`;
  }).join('');
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-w]');
    if (!b) return;
    a.undo.push(a.masked);
    a.masked = maskMore(a.masked, b.dataset.w);
    renderMask(el);
  });
  el.querySelector('[data-undo]').onclick = () => { a.masked = a.undo.pop(); renderMask(el); };
  el.querySelector('[data-cancel]').onclick = cancelFlow;
  el.querySelector('[data-next]').onclick = async () => {
    const profile = state.vault.profiles.find(p => p.id === a.profileId);
    const leaks = findLeaks(a.masked, profile);
    if (leaks.length) { el.querySelector('[data-error]').textContent = `Still contains: ${[...new Set(leaks)].join(', ')}.`; return; }
    a.step = 'enrich';
    await saveDraft();
    refresh();
  };
}

// ---------- 3. AI ----------

function renderEnrich(el) {
  const a = state.add;
  const workersFirst = state.vault.settings.aiMode === 'workers';
  const btnClass = first => `btn ${first ? 'btn-primary' : ''}`;
  el.innerHTML = `<h2>Read it with AI</h2>
    <div class="card">
      ${a.resumed ? `<p>Picked up where you left off: <strong>${esc(a.name)}</strong>.</p>` : ''}
      <p class="muted">Only the masked text goes out. The PDF never leaves this device unencrypted.</p>
      <p class="actions mt">
        <button type="button" class="${btnClass(!workersFirst)}" data-paste>Copy/paste with Claude</button>
        <button type="button" class="${btnClass(workersFirst)}" data-workers>Use Workers AI</button>
        <button type="button" class="btn" data-hand>Type results by hand</button>
        <button type="button" class="btn" data-cancel>Cancel</button></p>
      <p data-status class="muted" role="status"></p>
      <p data-error class="form-error" role="alert"></p>
    </div>`;
  const toReview = (reply, source) => {
    a.step = 'review';
    a.source = source;
    a.report = reply.report;
    a.results = reply.results.map(r => normalizeResult(r, state.vault.markers));
    refresh();
  };
  el.querySelector('[data-paste]').onclick = () => openEnrichPanel({
    title: 'Copy/paste with Claude', prompt: buildPrompt(a.masked), importReply: reply => toReview(reply, 'ai-paste'),
  });
  el.querySelector('[data-workers]').onclick = async e => {
    const status = el.querySelector('[data-status]');
    const error = el.querySelector('[data-error]');
    error.textContent = '';
    status.textContent = 'Asking Workers AI…';
    e.target.disabled = true;
    try {
      toReview(await enrichWithWorkers(a.masked, state.vault.settings), 'ai-workers');
    } catch (err) {
      error.textContent = err.message;
      status.textContent = '';
      e.target.disabled = false;
    }
  };
  el.querySelector('[data-hand]').onclick = () => toReview({ report: {}, results: [{ nameAsPrinted: '' }] }, 'manual');
  el.querySelector('[data-cancel]').onclick = cancelFlow;
}

// ---------- 4. review + save ----------

function renderReview(el) {
  const a = state.add;
  const needsLook = a.results.filter(r => !r.marker || (typeof r.confidence === 'number' && r.confidence < 0.8)).length;
  el.innerHTML = `<h2>Review every value</h2>
    <form class="card" id="reviewForm">
      <p class="muted">Compare with the ${a.bytes ? 'PDF' : 'report'}. Nothing is saved until you confirm.${needsLook ? ` <strong class="warn-text">${needsLook} row(s) need a closer look.</strong>` : ''}</p>
      ${reportFieldsHtml(a.report)}
      <h3 class="mt">Results (${a.results.length})</h3>
      ${resultsEditorHtml(a.results)}
      <p id="reviewError" class="form-error" role="alert"></p>
      <p class="actions"><button type="submit" class="btn btn-primary">Confirm and save</button>
        <button type="button" class="btn" data-cancel>Cancel</button></p>
    </form>`;
  wireResultsEditor(el);
  el.querySelector('[data-cancel]').onclick = async () => {
    if (await confirmDialog('Throw away this report?', { okLabel: 'Throw away', danger: true })) cancelFlow();
  };
  el.querySelector('#reviewForm').onsubmit = async e => {
    e.preventDefault();
    const fields = readReportFields(el);
    const results = readResults(el);
    const error = !/^\d{4}-\d{2}-\d{2}$/.test(fields.date) ? 'Pick the report date.'
      : !results.length ? 'Add at least one result with a marker and a value.' : '';
    el.querySelector('#reviewError').textContent = error;
    if (error) return;
    const id = newReportId(fields.date);
    // Paste AI reply has no PDF, so the report has no file.
    const filePath = a.bytes ? `files/${id}.pdf.enc` : null;
    // The PDF first: a report must never point at a file that didn't get stored.
    if (filePath) await vault.savePdf(filePath, a.bytes);
    await saveReport({ ...fields, id, profileId: a.profileId, filePath, source: a.source }, results);
    state.add = null;
    await clearDraft();
    showToast('Report saved');
    location.hash = `#reports/${id}`;
  };
}
