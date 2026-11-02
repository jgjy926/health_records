// Lock screen: keypad, first-run passcode setup, recovery key, retry delays, auto-lock timers.
import * as vault from './vault.js';
import { joinFromGateway, joinFromBackup } from './sync.js';
import { state } from './state.js';
import { esc, showToast, closeAllModals } from './ui.js';
import { AUTO_LOCK_BACKGROUND_MS, AUTO_LOCK_IDLE_MS, PASSCODE_MIN_LENGTH } from './config.js';

const PASSCODE_MAX_LENGTH = 12;
const AUTO_LOCK_CHECK_MS = 5000;

// enter: unlock · set/confirm: choose a passcode (first run or after recovery)
// showKey: recovery key on screen · typeKey: typing a recovery key
let mode = 'enter';
let afterRecovery = false;
let entry = '';
let firstEntry = '';
let busy = false;
let countdown = null;
let onUnlocked = () => {};

const $ = id => document.getElementById(id);

function renderDots() {
  const n = Math.max(PASSCODE_MIN_LENGTH, entry.length);
  $('lockDots').innerHTML = Array.from({ length: n }, (_, i) => `<span class="${i < entry.length ? 'on' : ''}"></span>`).join('');
}

function setMode(next, error = '') {
  mode = next;
  entry = '';
  const keypad = ['enter', 'set', 'confirm'].includes(mode);
  $('lockDots').hidden = !keypad;
  $('lockPad').hidden = !keypad;
  $('lockPanel').hidden = keypad;
  $('lockRecover').hidden = mode !== 'enter';
  $('lockJoin').hidden = mode !== 'set' || afterRecovery;
  $('lockError').textContent = error;
  $('lockHint').textContent = {
    enter: 'Enter your passcode',
    set: afterRecovery ? `Set a new passcode (${PASSCODE_MIN_LENGTH}+ digits)` : `Set a passcode (${PASSCODE_MIN_LENGTH}+ digits)`,
    confirm: 'Enter the same passcode again',
    showKey: 'Save your recovery key',
    typeKey: 'Enter your recovery key',
    join: 'Join your existing vault',
  }[mode];
  if (keypad) $('lockPanel').innerHTML = '';
  renderDots();
  startCountdown();
}

// While a retry delay runs: show the time left and refuse submits.
function startCountdown() {
  clearInterval(countdown);
  if (mode !== 'enter') return;
  const tick = () => {
    const ms = vault.retryWaitMs();
    if (ms > 0) {
      $('lockHint').textContent = `Too many tries. Wait ${fmtWait(ms)}`;
    } else {
      $('lockHint').textContent = 'Enter your passcode';
      clearInterval(countdown);
    }
  };
  if (vault.retryWaitMs() > 0) { tick(); countdown = setInterval(tick, 1000); }
}

function fmtWait(ms) {
  const s = Math.ceil(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

function open() {
  firstEntry = '';
  afterRecovery = false;
  hideLock();
  onUnlocked();
}

async function submit() {
  if (busy) return;
  const code = entry;
  if (mode === 'set') {
    firstEntry = code;
    setMode('confirm');
    return;
  }
  if (mode === 'confirm') {
    if (code !== firstEntry) {
      firstEntry = '';
      setMode('set', "Those didn't match. Try again.");
      return;
    }
    await guarded(async () => {
      if (afterRecovery) {
        await vault.setPasscodeAfterRecovery(code);
        await vault.save();
        open();
        showToast('New passcode set');
      } else {
        showRecoveryKey(await vault.create(code));
      }
    });
    return;
  }
  // mode === 'enter'
  if (vault.retryWaitMs() > 0) return;
  entry = '';
  renderDots();
  await guarded(async () => {
    if (await vault.unlock(code)) {
      $('lockError').textContent = '';
      open();
    } else {
      $('lockError').textContent = 'Wrong passcode';
      startCountdown();
    }
  });
}

// One slow key derivation at a time; a damaged vault shows its message instead of failing silently.
async function guarded(fn) {
  busy = true;
  $('lockError').textContent = '';
  $('lockHint').textContent = 'Checking…';
  try {
    await fn();
    if (mode === 'enter' && vault.retryWaitMs() === 0) $('lockHint').textContent = 'Enter your passcode';
  } catch (e) {
    $('lockError').textContent = e.message;
    if (mode === 'enter') $('lockHint').textContent = 'Enter your passcode';
  } finally {
    busy = false;
  }
}

function press(key) {
  if (key === 'del') entry = entry.slice(0, -1);
  else if (key === 'ok') { if (entry.length >= PASSCODE_MIN_LENGTH) submit(); return; }
  else if (entry.length < PASSCODE_MAX_LENGTH) entry += key;
  renderDots();
}

// Shared with Settings: the key, a Copy button, and an "I've saved it" gate before Continue.
export function recoveryKeyHtml(code) {
  return `<p class="muted">This is the only way in if you forget your passcode. It is shown once and can't be recovered.
      Keep it somewhere safe, away from this device.</p>
    <p class="recovery-key" data-recovery-key>${esc(code)}</p>
    <p><button type="button" class="btn" data-copy-key>Copy</button></p>
    <label class="check"><input type="checkbox" data-saved-key> I've saved it</label>
    <p class="mt"><button type="button" class="btn btn-primary" data-done-key disabled>Continue</button></p>`;
}

export function wireRecoveryKey(el, code, onDone) {
  el.querySelector('[data-copy-key]').onclick = async () => {
    try {
      await navigator.clipboard.writeText(code);
      showToast('Copied');
    } catch {
      showToast('Copy failed. Write it down instead.');
    }
  };
  el.querySelector('[data-saved-key]').onchange = e => { el.querySelector('[data-done-key]').disabled = !e.target.checked; };
  el.querySelector('[data-done-key]').onclick = onDone;
}

function showRecoveryKey(code) {
  setMode('showKey');
  const panel = $('lockPanel');
  panel.innerHTML = recoveryKeyHtml(code);
  wireRecoveryKey(panel, code, async () => {
    await vault.finishSetup();
    open();
  });
}

function showRecoveryEntry() {
  setMode('typeKey');
  const panel = $('lockPanel');
  panel.innerHTML = `<form data-recovery-form>
      <div class="field"><label for="recoveryInput">Recovery key</label>
        <input id="recoveryInput" type="text" class="mono" autocomplete="off" autocapitalize="characters" spellcheck="false"
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"></div>
      <p><button type="submit" class="btn btn-primary">Unlock</button>
        <button type="button" class="btn" data-recovery-cancel>Back</button></p>
    </form>`;
  panel.querySelector('[data-recovery-cancel]').onclick = () => setMode('enter');
  panel.querySelector('form').onsubmit = async e => {
    e.preventDefault();
    if (busy) return;
    const input = $('recoveryInput');
    busy = true;
    $('lockError').textContent = '';
    $('lockHint').textContent = 'Checking…';
    try {
      if (await vault.unlockWithRecoveryKey(input.value)) {
        afterRecovery = true;
        setMode('set');
      } else {
        $('lockHint').textContent = 'Enter your recovery key';
        $('lockError').textContent = "That recovery key didn't work";
      }
    } catch (err) {
      $('lockHint').textContent = 'Enter your recovery key';
      $('lockError').textContent = err.message;
    } finally {
      busy = false;
    }
  };
  $('recoveryInput').focus();
}

// New device: gateway + recovery key, or a backup file + recovery key. Then a passcode for this device.
function showJoin() {
  setMode('join');
  const panel = $('lockPanel');
  panel.innerHTML = `<form data-join-form>
      <div class="field"><label for="joinKey">Recovery key</label>
        <input id="joinKey" class="mono" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"></div>
      <div class="field"><label for="joinUrl">Gateway URL</label><input id="joinUrl" type="url" inputmode="url" autocomplete="off" spellcheck="false"></div>
      <div class="field"><label for="joinToken">App token</label><input id="joinToken" type="password" autocomplete="off"></div>
      <p class="actions"><button type="submit" class="btn btn-primary">Join from sync</button>
        <label class="btn" for="joinFile">Use a backup file</label>
        <button type="button" class="btn" data-join-cancel>Back</button></p>
      <input id="joinFile" class="sr-only" type="file">
    </form>`;
  const attempt = async fn => {
    if (busy) return;
    busy = true;
    $('lockError').textContent = '';
    $('lockHint').textContent = 'Checking…';
    try {
      await fn();
      afterRecovery = true;
      setMode('set');
    } catch (err) {
      $('lockHint').textContent = 'Join your existing vault';
      $('lockError').textContent = err instanceof TypeError ? 'Could not reach the gateway.' : err.message;
    } finally {
      busy = false;
    }
  };
  panel.querySelector('[data-join-cancel]').onclick = () => setMode('set');
  panel.querySelector('form').onsubmit = e => {
    e.preventDefault();
    attempt(() => joinFromGateway($('joinUrl').value.trim().replace(/\/+$/, ''), $('joinToken').value.trim(), $('joinKey').value));
  };
  $('joinFile').onchange = e => {
    const file = e.target.files[0];
    if (file) attempt(async () => joinFromBackup(await file.text(), $('joinKey').value));
  };
}

export function initLock(unlockedCallback) {
  onUnlocked = unlockedCallback;
  const pad = $('lockPad');
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
  pad.innerHTML = keys.map(k => `<button type="button" data-k="${k}" class="${k.length > 1 ? 'ghost' : ''}" ${
    k === 'del' ? 'aria-label="Delete"' : ''}>${k === 'del' ? '&#9003;' : k === 'ok' ? 'OK' : k}</button>`).join('');
  pad.addEventListener('click', e => { const b = e.target.closest('button'); if (b) press(b.dataset.k); });
  document.addEventListener('keydown', e => {
    if ($('lockScreen').hidden || !['enter', 'set', 'confirm'].includes(mode)) return;
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('del');
    else if (e.key === 'Enter') press('ok');
    else return;
    e.preventDefault();   // otherwise Enter also clicks whichever keypad button has focus
  });
  $('lockRecover').addEventListener('click', showRecoveryEntry);
  $('lockJoin').addEventListener('click', showJoin);
  setMode(vault.isSetUp() ? 'enter' : 'set');
  startAutoLock();
}

export function showLock() {
  vault.lock();
  closeAllModals();
  // The rendered views hold decrypted values too.
  document.querySelectorAll('.view').forEach(v => { v.innerHTML = ''; });
  $('profileSwitcher').innerHTML = '';
  firstEntry = '';
  afterRecovery = false;
  $('app').hidden = true;
  $('lockScreen').hidden = false;
  setMode(vault.isSetUp() ? 'enter' : 'set');
}

function hideLock() {
  clearInterval(countdown);
  $('lockScreen').hidden = true;
  $('app').hidden = false;
}

// ---------- auto-lock: 1 min in background, N min idle (Settings, default 5) ----------
let lastActivity = Date.now();
let hiddenSince = null;

function idleLimitMs() {
  const minutes = state.vault && state.vault.settings && Number(state.vault.settings.autoLockMinutes);
  return minutes > 0 ? minutes * 60 * 1000 : AUTO_LOCK_IDLE_MS;
}

function checkAutoLock() {
  if (!state.vault) return;
  const now = Date.now();
  // Timers stall in the background, so this also runs when the app comes back.
  if ((hiddenSince !== null && now - hiddenSince >= AUTO_LOCK_BACKGROUND_MS) || now - lastActivity >= idleLimitMs()) showLock();
}

const touch = () => { lastActivity = Date.now(); };

// Page visibility on the web, the App plugin on Android (src/native.js).
export function appActiveChanged(isActive) {
  if (!isActive) {
    if (hiddenSince === null) hiddenSince = Date.now();
    return;
  }
  checkAutoLock();
  hiddenSince = null;
  touch();
}

function startAutoLock() {
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev =>
    document.addEventListener(ev, touch, { passive: true, capture: true }));
  document.addEventListener('visibilitychange', () => appActiveChanged(!document.hidden));
  window.addEventListener('pageshow', checkAutoLock);
  setInterval(checkAutoLock, AUTO_LOCK_CHECK_MS);
  // Another tab wrote the vault: this tab's copy is stale and a save here would overwrite that change.
  window.addEventListener('storage', e => {
    if (e.key === vault.VAULT_KEY && state.vault) { showLock(); showToast('Locked: the vault changed in another tab'); }
  });
}
