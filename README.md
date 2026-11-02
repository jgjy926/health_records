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
Status: **Phase 6 done** (not yet deployed). Android comes in Phase 7.

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

## Publish the web app
Push this repo to GitHub and turn on Pages for the root of `main`. It holds code only: `.gitignore` keeps out reports, vaults and tokens.
