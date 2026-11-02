// Android only (Capacitor): plugins come from the native bridge, so the web build loads nothing extra.
import { closeTopModal } from './ui.js';

const cap = () => globalThis.Capacitor;
export const isNative = () => !!(cap() && cap().isNativePlatform && cap().isNativePlatform());
const plugin = name => cap().Plugins[name];

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// Exports and PDFs open through the share sheet. The readable copy lasts only as long as the sheet.
export async function shareBytes(bytes, filename) {
  const { Filesystem, Share } = cap().Plugins;
  const path = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  const { uri } = await Filesystem.writeFile({ path, data: toB64(bytes), directory: 'CACHE' });
  try {
    await Share.share({ title: filename, url: uri, dialogTitle: filename });
  } catch (e) {
    // Closing the sheet without choosing reports an error; there's nothing to tell the user.
    if (!/cancel/i.test(e.message || '')) throw e;
  } finally {
    await Filesystem.deleteFile({ path, directory: 'CACHE' }).catch(() => {});
  }
}

// Back: close a modal -> go to Overview -> leave the app in the background.
export function handleBack() {
  if (closeTopModal()) return 'modal';
  if ((location.hash || '#overview') !== '#overview') {
    location.hash = '#overview';
    return 'overview';
  }
  return 'background';
}

// onActiveChange(isActive) feeds the auto-lock: WebView timers and page events can't be trusted once the app is paused.
export function initNative({ onActiveChange }) {
  if (!isNative()) return;
  const App = plugin('App');
  App.addListener('appStateChange', ({ isActive }) => onActiveChange(isActive));
  App.addListener('backButton', () => {
    if (handleBack() === 'background') App.minimizeApp();
  });
}
