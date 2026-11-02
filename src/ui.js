// Small DOM helpers shared by every view.

import { isNative, shareBytes } from './native.js';

// Everything from a PDF, AI or the vault is untrusted text: escape before innerHTML.
export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer = null;
export function showToast(msg, ms = 2500) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

export function emptyState(title, body, actionHtml = '') {
  return `<div class="card empty"><h3>${esc(title)}</h3><p>${esc(body)}</p>${actionHtml}</div>`;
}

// ---------- modals (Android's Back button closes the top one) ----------
const modals = [];

export function openModal(html) {
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(wrap);
  const handle = {
    el: wrap,
    close: () => {
      const i = modals.indexOf(handle);
      if (i >= 0) modals.splice(i, 1);
      wrap.remove();
    },
  };
  modals.push(handle);
  return handle;
}

// Returns true if a modal was closed.
export function closeTopModal() {
  const top = modals[modals.length - 1];
  if (top) top.close();
  return !!top;
}

export function closeAllModals() { while (closeTopModal()); }

export function confirmDialog(message, { okLabel = 'OK', danger = false } = {}) {
  return new Promise(resolve => {
    const modal = openModal(`<p>${esc(message)}</p><p class="actions mt">
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(okLabel)}</button>
        <button type="button" class="btn" data-no>Cancel</button></p>`);
    const finish = yes => { modal.close(); resolve(yes); };
    modal.el.querySelector('[data-yes]').onclick = () => finish(true);
    modal.el.querySelector('[data-no]').onclick = () => finish(false);
  });
}

// Hand decrypted bytes to the browser's viewer. The object URL lives only as long as it's needed.
export async function openBytes(bytes, filename, mime) {
  if (isNative()) { await shareBytes(bytes, filename); return; }
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Save bytes as a file. Only for things the user asked to export.
export async function downloadFile(bytes, filename, mime) {
  if (isNative()) { await shareBytes(bytes, filename); return; }
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}
