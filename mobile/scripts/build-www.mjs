// Builds mobile/www from the same files GitHub Pages serves (no forked code).
// Libraries are already local in ../vendor (npm run vendor at the repo root), so nothing is downloaded here.
// Unlike cashback_sspn, NO gateway token is ever baked into the APK: it lives inside the encrypted vault.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(mobile, '..');
const www = join(mobile, 'www');

await rm(www, { recursive: true, force: true });
await mkdir(www, { recursive: true });
for (const dir of ['src', 'styles', 'icons', 'vendor']) await cp(join(repo, dir), join(www, dir), { recursive: true });

let html = await readFile(join(repo, 'index.html'), 'utf8');
html = html.replace('content="width=device-width, initial-scale=1.0"',
  'content="width=device-width, initial-scale=1.0, viewport-fit=cover"');
await writeFile(join(www, 'index.html'), html);
console.log('mobile/www built from', repo);
