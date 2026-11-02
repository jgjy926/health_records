// Lock screen: keypad, first-run passcode setup, auto-lock timers.
// Phase 2 adds: confirm-passcode step, recovery-key screen, retry delays (RETRY_DELAYS_MS),
// background/idle auto-lock (AUTO_LOCK_*), and wiring the "Forgot passcode" button.
import * as vault from './vault.js';
import { PASSCODE_MIN_LENGTH } from './config.js';

let entry = '';
let onUnlocked = () => {};

function renderDots() {
  const dots = document.getElementById('lockDots');
  const n = Math.max(PASSCODE_MIN_LENGTH, entry.length);
  dots.innerHTML = Array.from({ length: n }, (_, i) => `<span class="${i < entry.length ? 'on' : ''}"></span>`).join('');
}

async function submit() {
  const err = document.getElementById('lockError');
  const ok = vault.isSetUp() ? await vault.unlock(entry) : (await vault.create(entry), true);
  entry = '';
  renderDots();
  if (ok) { err.textContent = ''; hideLock(); onUnlocked(); }
  else err.textContent = 'Wrong passcode';
}

function press(key) {
  if (key === 'del') entry = entry.slice(0, -1);
  else if (key === 'ok') { if (entry.length >= PASSCODE_MIN_LENGTH) submit(); return; }
  else if (entry.length < 12) entry += key;
  renderDots();
}

export function initLock(unlockedCallback) {
  onUnlocked = unlockedCallback;
  const pad = document.getElementById('lockPad');
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
  pad.innerHTML = keys.map(k => `<button type="button" data-k="${k}" class="${k.length > 1 ? 'ghost' : ''}">${
    k === 'del' ? '&#9003;' : k === 'ok' ? 'OK' : k}</button>`).join('');
  pad.addEventListener('click', e => { const b = e.target.closest('button'); if (b) press(b.dataset.k); });
  document.addEventListener('keydown', e => {
    if (document.getElementById('lockScreen').hidden) return;
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('del');
    else if (e.key === 'Enter') press('ok');
  });
  document.getElementById('lockHint').textContent = vault.isSetUp()
    ? 'Enter your passcode' : `Set a passcode (${PASSCODE_MIN_LENGTH}+ digits)`;
  renderDots();
}

export function showLock() {
  vault.lock();
  document.getElementById('app').hidden = true;
  document.getElementById('lockScreen').hidden = false;
}

function hideLock() {
  document.getElementById('lockScreen').hidden = true;
  document.getElementById('app').hidden = false;
}
