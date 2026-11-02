# CLAUDE.md — Health Records

Encrypted personal health-record app (checkup PDFs -> structured lab results -> trends) for up to 5 people.
Web (GitHub Pages) + Android (Capacitor 8). Zero cost. Owner is in Malaysia (MYR, Malaysian IC numbers, English/Malay reports).

Read first: `docs/DESIGN.md` (spec, source of truth) and `docs/BUILD_PLAN.md` (phases + checkboxes).

## Hard rules
- **Zero cost.** Free tiers only (GitHub Pages, Cloudflare Workers + Workers AI, Koofr). No paid APIs or services.
- **No runtime CDNs, fonts or third-party scripts.** Libraries come from `./vendor` (pinned in package.json, copied by
  `npm run vendor`). Keep the CSP in index.html strict; widen it only for a real need and say why.
- **Plaintext health data never leaves memory.** Encrypt before localStorage, IndexedDB or network. Never log it.
- **PDF only**; text extraction happens on the device. Only *masked* text may go to AI (paste or Workers AI).
- **Separate from cashback_sspn.** Copy code from `../cashback_sspn` when useful; never import from it or share its storage/gateway.
- Escape every untrusted string (`esc()` in ui.js) before innerHTML.
- No build step: plain ES modules served as-is. No frameworks.
- Keep exported function names in stub modules (their header comments are the contract).

## Working style
- One phase at a time from BUILD_PLAN.md. Finish with: tests (`npm test`), manual check at 390px wide and desktop,
  tick checkboxes, bump `APP_VERSION`, commit (`Phase N: …`), then report and wait.
- Ask before: deploying the Worker, setting secrets, deleting files, or changing the data model in DESIGN.md.
- Never commit real reports, exported vaults, tokens or `mobile/gateway.local.json` (see .gitignore).

## Run
- `npm run serve` -> http://localhost:8080 (ES modules need a server, not file://)
- `npm test` -> node --test tests/*.test.mjs
- Worker: `cd worker && npx wrangler dev` / `npx wrangler deploy` (ask first)
- Android: `cd mobile && npm install && npm run sync`, then build in Android Studio

## Layout
index.html · styles/app.css · src/ (main, config, state, ui, lock, vault, crypto, profiles, markers, reports, parse, mask,
enrich, sync, views) · vendor/ (generated) · worker/ · mobile/ · scripts/vendor.mjs · docs/ · tests/
