// Copies pinned libraries from node_modules into ./vendor so the app never loads a CDN at runtime
// (a CDN script could read decrypted health data). Run after `npm install`:  npm run vendor
// ./vendor is committed, so GitHub Pages and the Android build serve these exact files.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'vendor');

const files = [
  // [source under node_modules, destination under vendor]
  ['chart.js/dist/chart.umd.min.js', 'chart/chart.umd.min.js'],
  ['pdfjs-dist/legacy/build/pdf.min.mjs', 'pdfjs/pdf.min.mjs'],
  ['pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'pdfjs/pdf.worker.min.mjs'],
  ['tesseract.js/dist/tesseract.min.js', 'tesseract/tesseract.min.js'],
  ['tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract/core/tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm', 'tesseract/core/tesseract-core-lstm.wasm'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract/core/tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm', 'tesseract/core/tesseract-core-simd-lstm.wasm'],
];

await rm(out, { recursive: true, force: true });
for (const [src, dst] of files) {
  await mkdir(dirname(join(out, dst)), { recursive: true });
  await cp(join(nm, src), join(out, dst));
  console.log('vendor/' + dst);
}
// Unpacked: the Android build strips ".gz" from asset names, so a .gz language file would 404 in the APK.
await mkdir(join(out, 'tesseract/lang'), { recursive: true });
await writeFile(join(out, 'tesseract/lang/eng.traineddata'),
  gunzipSync(await readFile(join(nm, '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'))));
console.log('vendor/tesseract/lang/eng.traineddata');
console.log('Done. Commit ./vendor.');
