// App-wide constants. Bump APP_VERSION on every change you ship (shown under the title;
// also busts caches on GitHub Pages / the Android bundle).
export const APP_VERSION = '2026.11.02-phase2';
export const SCHEMA_VERSION = 1;
export const MAX_PROFILES = 5;
export const PASSCODE_MIN_LENGTH = 6;
export const AUTO_LOCK_BACKGROUND_MS = 60 * 1000;   // locked 1 min after the app goes to background
export const AUTO_LOCK_IDLE_MS = 5 * 60 * 1000;     // locked after 5 min with no interaction
export const RETRY_DELAYS_MS = [0, 0, 0, 1000, 5000, 30000, 300000]; // by failed-attempt count
export const PBKDF2_ITERATIONS = 600000;
