# Health Records — Build plan

Work one phase at a time. At the end of each phase: run the checks, update this file's checkboxes,
bump `APP_VERSION` in `src/config.js`, commit, and stop to report before the next phase.

## Phase 1 — Scaffold  ✅ done (shell)
- [x] index.html with CSP, lock screen, header (profile switcher, sync pill, lock button), 5 tabs
- [x] styles/app.css (no framework, no web fonts)
- [x] src/ modules with contracts as comments; vault.js is a DEV STUB
- [x] package.json + scripts/vendor.mjs (pinned libs -> ./vendor)
- [x] worker/ skeleton (auth, CORS, /ping), mobile/ skeleton (Capacitor 8 config, build-www)
- [x] enrich.js copied from cashback_sspn (still uses Tailwind classes — restyle in Phase 4)

## Phase 2 — Vault and lock
- [x] src/crypto.js per its contract (PBKDF2 600k, AES-GCM, key wrap, recovery key)
- [x] src/vault.js real implementation, same exports; remove DEV_STUB (set false) and the dev banner
- [x] Encrypted blob in localStorage; PDFs in IndexedDB (encrypted)
- [x] First run: set passcode -> confirm -> show recovery key (copy + "I've saved it" checkbox)
- [x] Unlock, retry delays (persisted), recovery-key unlock -> new passcode, change passcode in Settings
- [x] Auto-lock: visibilitychange/background 1 min, idle 5 min
- [x] tests/crypto.test.mjs (node --test, Node's webcrypto): round trip, wrong passcode fails, recovery works, IV unique
- Done when: storage shows only ciphertext; wrong passcode cannot open; tests pass.

## Phase 3 — Profiles, data model, manual entry
- [x] Settings > People: add/edit/delete up to 5 (displayName, birthYear, sex, maskNames); delete asks to confirm
- [x] Header switcher drives every view; remember last profile inside the vault
- [x] markers.js: complete catalogue (+ urine, more CBC), matchMarker(name), toStd(value, unit, code)
- [x] Reports list (date, provider, flagged count) + detail table; manual add/edit report and results; soft delete
- [x] tests/markers.test.mjs: alias matching, unit conversion, computeFlag
- Done when: a hand-entered report shows correct flags and survives lock/unlock.

## Phase 4 — PDF parse, masking, AI enrich, review
- [x] npm install && npm run vendor; commit ./vendor
- [x] parse.js: pdf.js text with line grouping by y-position; scanned detection; Tesseract fallback with progress
- [x] mask.js + tests/mask.test.mjs (IC, phone, email, names with odd spacing/case, address lines)
- [x] Masked-text review with tap-to-mask
- [x] enrich.js: lab-report prompt + schema; restyle the panel with app.css classes (no Tailwind)
- [x] Gateway /ai-extract (Workers AI, json_schema response) + client call when aiMode = workers
- [x] Review table (editable, highlights), normalise, save report + encrypted PDF
- Done when: one real de-identified PDF parses and every value is correct after review.

## Phase 5 — Overview and Trends
- [x] Overview: latest checkup, flagged markers, small sparkline per marker (inline SVG)
- [x] Trends: marker/group picker, line chart over time on valueStd with shaded ref band, year-to-year table
- [x] CSV export of the current person's results
- Done when: two reports of the same marker plot as a trend with the range band.

## Phase 6 — Gateway and encrypted sync
- [ ] worker.js: GET/PUT /vault (ETag, If-Match, daily backup), GET/PUT /file/:id — port Koofr code from cashback_sspn
- [ ] sync.js: push/pull ciphertext, conflict merge per report id by updatedAt, sync pill states
- [ ] Settings > Sync: gateway URL + token (stored in vault), "Test connection" (GET /ping)
- [ ] Encrypted backup file download/restore
- [ ] README deploy steps verified
- Done when: Koofr holds only .enc files; laptop and phone show the same data.

## Phase 7 — Android
- [ ] `cd mobile && npm install && npx cap add android`
- [ ] MainActivity: FLAG_SECURE; release build has WebView debugging off
- [ ] Lock on app pause (Capacitor App plugin), Back button: close modal -> Overview -> background
- [ ] PDF picking from Android file picker works; exports open the share sheet
- [ ] Build APK in Android Studio; install; check lock on background
- Done when: APK installs, locks on background, and the user can backfill 3–4 years of reports.
