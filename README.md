# Health Records

Encrypted checkup-report tracker for up to 5 people. Web + Android, zero cost.
Spec: `docs/DESIGN.md` · Plan: `docs/BUILD_PLAN.md` · Rules for Claude Code: `CLAUDE.md`

## Quick start
```bash
npm install          # pinned libraries (dev only)
npm run vendor       # copy them into ./vendor (commit the result)
npm run serve        # http://localhost:8080
npm test
```
Status: **Phase 7 done.** Live at https://jgjy926.github.io/health_records/ with the gateway deployed.

## Deploy the gateway (free tier)
1. Koofr: create an app password (Account > Preferences > Password > App passwords). The Worker makes the `/health_records` folder itself.
2. `cd worker`, then `npx wrangler login`
3. Check `ALLOWED_ORIGIN` in `wrangler.toml`: it must be the origin the app is served from (for GitHub Pages, `https://<user>.github.io`).
4. Set the secrets. Use a new long random `APP_TOKEN`, different from cashback-gateway's:
   ```bash
   npx wrangler secret put KOOFR_USER
   npx wrangler secret put KOOFR_PASS
   npx wrangler secret put APP_TOKEN
   ```
5. `npx wrangler deploy`, and note the `https://health-gateway.<you>.workers.dev` URL.
6. In the app: Settings > Sync, enter the URL and token, press Test connection, then Sync now.

A second device: on first run choose "Already use this on another device? Join it", and enter the recovery key, URL and token.

## Android
```bash
cd mobile
npm install
npm run sync
```
Then build in Android Studio, or `cd android && gradlew assembleDebug` with `JAVA_HOME` set to Android Studio's `jbr` folder. Run `npm run sync` after every change to the web code.

### Release build
`node mobile/scripts/setup-signing.mjs` creates the signing key once, in `~/.keystores`, outside the repo. Back that folder up: without it Android won't accept updates to the installed app. Then `npm run sync` in `mobile`, and `gradlew assembleRelease` in `mobile/android`; the APK is `app/build/outputs/apk/release/app-release.apk`.

## Browser test without deploying
`python tests/fixtures/make_fixtures.py` writes made-up PDFs. `node tests/e2e-server.mjs` then serves the app with the real Worker on a fake Koofr at http://localhost:8090 (gateway URL `http://localhost:8090/gw`, token `e2e-token`).

## Publish the web app
Push this repo to GitHub and turn on Pages for the root of `main`. It holds code only: `.gitignore` keeps out reports, vaults and tokens.
