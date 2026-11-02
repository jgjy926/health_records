# Health Records — Design (source of truth)

Living version: https://claude.ai/artifact/NocH8mWEf6J3XbE5krkoey (Claude Doc, 2026-11-02).
If this file and the code disagree, this file wins; if this file is wrong, update it in the same commit.

## Decisions
| Decision | Choice |
| --- | --- |
| Cost | Zero: free tiers only, no paid API |
| Input | PDF only; text read on the device (pdf.js, Tesseract.js for scans); no OCR service, no photos |
| AI | Copy/paste into the user's Claude chat (main); Workers AI on the gateway as a free fallback |
| Gateway | Separate Worker `health-gateway`, own APP_TOKEN, own Koofr folder `/health_records` |
| People | Up to 5 profiles in one vault, one passcode, switcher in the header |
| Hosting | Public GitHub Pages repo (code only, no data or secrets) + Android APK via Capacitor 8 |
| Runtime deps | None from a CDN. All libraries vendored into `./vendor` (npm run vendor). CSP in index.html |

## Architecture
Web app (browser) and Android app (Capacitor WebView) run the same `index.html` + `src/` + `styles/` + `vendor/`.
GitHub Pages serves the code. The device encrypts everything; `health-gateway` checks APP_TOKEN and proxies
ciphertext to Koofr (WebDAV), and runs Workers AI on already-masked text for the fallback. Nothing readable leaves the device.

## Security
1. **Passcode** (6+ digits). PBKDF2-SHA256, 600,000 iterations, 16-byte random salt -> KEK.
   KEK wraps a random 256-bit AES-GCM **data key**. The data key encrypts the vault JSON and every PDF (fresh 12-byte IV each time).
2. **Recovery key**: 24 random chars (Crockford base32, grouped `XXXX-XXXX-…`), shown once at setup. The data key is
   also wrapped by a KEK derived from it. Recovery -> must set a new passcode. Settings can replace the key (needs the passcode).
3. **Local storage**: localStorage holds only `{ v, salt, iterations, wrappedKeyPass, wrappedKeyRecovery, iv, ct }`.
   PDFs go to IndexedDB, encrypted. Decrypted data lives only in memory (`state.vault`).
4. **App token** for the gateway is stored inside the encrypted vault, never in plain localStorage, never in the APK.
5. **Auto-lock**: 1 min in background, 5 min idle (configurable). Lock clears `state.vault` and the data key.
6. **Retry delay** after wrong passcodes: 0,0,0,1s,5s,30s,5min (count and end time persisted in `health_records.attempts`, no health data).
7. **De-identification before AI**: mask IC (`\d{6}-?\d{2}-?\d{4}`), phones, emails, profile names + `maskNames`,
   address blocks, MRN/lab-number labels. User reviews masked text and can mask more.
8. **Android**: FLAG_SECURE (no screenshots / recents preview), WebView debugging off in release.
9. Never log plaintext health data, keys or passcodes. Escape all untrusted text before innerHTML (`esc()`).

| Risk | Protection |
| --- | --- |
| Phone lost/borrowed | Passcode, auto-lock, encrypted storage |
| Koofr or Worker breached | Only ciphertext stored |
| App token leaked | Attacker gets ciphertext only; rotate token |
| AI provider sees report | Identifiers masked first |
| Public code | No secrets or data in repo |
| Forgotten passcode | Recovery key (otherwise unrecoverable by design) |

## AI parse and enrich flow
1. Pick PDF + the person it belongs to.
2. Extract text on device: pdf.js (`vendor/pdfjs`). A page with < ~20 chars of text = scanned -> render page to canvas,
   Tesseract.js (`vendor/tesseract`, local `langPath`, `corePath`, `workerPath`; never CDN).
3. Mask identifiers (mask.js) -> user reviews/taps to mask more.
4. Enrich: (a) copy/paste panel (enrich.js) — prompt = instructions + masked text + result JSON schema;
   paste reply -> forgiving parse; or (b) POST masked text to gateway `/ai-extract` (Workers AI, JSON schema output).
5. Normalise: match `nameAsPrinted` to catalogue aliases (markers.js), convert units with `toStd`, compute flag if missing.
6. Review table: highlight confidence < 0.8, unknown markers, out-of-range. Every cell editable. Confirm to save.
7. Save: report + results into vault, PDF encrypted into IndexedDB, mark dirty for sync.

## Data model (vault JSON, schemaVersion 1)
```json
{
  "schemaVersion": 1,
  "profiles": [ { "id": "p1", "displayName": "Me", "birthYear": 1990, "sex": "M", "maskNames": ["FULL NAME AS ON IC"],
                  "updatedAt": "…", "deletedAt": null } ],
  "reports": [ {
    "id": "rpt-2025-05-10-a1", "profileId": "p1", "date": "2025-05-10", "provider": "Lab / clinic",
    "type": "Annual checkup", "fasting": true, "filePath": "files/rpt-2025-05-10-a1.pdf.enc",
    "source": "ai-paste", "notes": "",
    "results": [ { "marker": "LDL", "nameAsPrinted": "LDL-Cholesterol", "value": 3.4, "unit": "mmol/L",
      "refLow": null, "refHigh": 3.0, "refText": "< 3.0", "flag": "H", "valueStd": 3.4, "unitStd": "mmol/L",
      "confidence": 0.95, "entryType": "ai" } ],
    "createdAt": "…", "updatedAt": "…", "deletedAt": null } ],
  "markers": { "LDL": { "name": "LDL cholesterol", "group": "Lipids", "unitStd": "mmol/L",
               "aliases": ["LDL-C"], "toStd": { "mg/dL": 0.02586 } } },
  "settings": { "aiMode": "paste", "gatewayUrl": "", "appToken": "", "autoLockMinutes": 5, "lastProfileId": "p1" },
  "updatedAt": "…"
}
```
- `flag`: L | N | H | null. `entryType`: ai | manual | edited. `source`: ai-paste | ai-workers | manual.
- `value`: number, or text for results like "Negative", "Trace", "1+". Text results have `valueStd` null, appear in tables, and stay out of charts.
- `marker`: catalogue code, or null when the printed name is unknown (then `unitStd` and `valueStd` are null too).
- `vault.markers` holds user-added/overridden entries; built-ins are in `src/markers.js`.
- Deletes are soft (`deletedAt`) so sync merges cleanly. Deleting a person soft-deletes their reports and wipes the name fields.

## Screens
Lock (keypad, recovery link) · header profile switcher · bottom tabs:
Overview (latest checkup, flagged markers with 4-point sparkline) · Reports (newest first; detail = result table + open PDF) ·
Add (the flow above) · Trends (marker/group picker, line chart with shaded range, year table) ·
Settings (people, security, AI mode, sync, backup/CSV export, marker catalogue).
Phone width first; >= 900px uses list + detail split.
