// Copies pinned libraries from node_modules into ./vendor so the app never loads a CDN at runtime
// (a CDN script could read decrypted health data). Run after `npm install`:  npm run vendor
// ./vendor is committed, so GitHub Pages and the Android build serve these exact files.
import { cp, mkdir, rm } from 'node:fs/promises';
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
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'tesseract/lang/eng.traineddata.gz'],
];

await rm(out, { recursive: true, force: true });
for (const [src, dst] of files) {
  await mkdir(dirname(join(out, dst)), { recursive: true });
  await cp(join(nm, src), join(out, dst));
  console.log('vendor/' + dst);
}
console.log('Done. Commit ./vendor.');
