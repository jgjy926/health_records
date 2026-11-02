// For browser checks: serves the app with the real Worker at /gw (same origin, so the CSP stays as shipped),
// on top of an in-memory Koofr and a canned Workers AI. Nothing is sent anywhere.  node tests/e2e-server.mjs [port]
// Open http://localhost:PORT and http://127.0.0.1:PORT to act as two devices (separate browser storage, same gateway).
// GET /__koofr lists what the fake Koofr stored, so a check can read exactly what would be on Koofr.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFakeKoofr } from './helpers/fakes.mjs';
import worker from '../worker/worker.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || 8090);
const koofr = makeFakeKoofr();
const KOOFR_BASE = 'https://koofr.test/dav/Koofr/health_records';
const aiCalls = [];

globalThis.fetch = (url, init) => koofr.handle(String(url), init);

const AI = {
  run: async (model, input) => {
    aiCalls.push(input.messages[1].content);
    return {
      response: {
        report: { date: '2026-09-20', provider: 'Klinik Contoh', type: 'Blood test', fasting: false },
        results: [
          { nameAsPrinted: 'LDL-Cholesterol', value: 3.1, unit: 'mmol/L', refLow: null, refHigh: 3, refText: '< 3.0', flag: null, confidence: 0.95 },
          { nameAsPrinted: 'HDL Cholesterol', value: 1.4, unit: 'mmol/L', refLow: 1, refHigh: 2, refText: '1.0 - 2.0', flag: null, confidence: 0.95 },
          { nameAsPrinted: 'Creatinine', value: 90, unit: 'umol/L', refLow: 62, refHigh: 106, refText: '62 - 106', flag: null, confidence: 0.7 },
        ],
      },
    };
  },
};

const env = { APP_TOKEN: 'e2e-token', KOOFR_USER: 'koofr-user', KOOFR_PASS: 'koofr-pass', KOOFR_BASE, ALLOWED_ORIGIN: `http://localhost:${port}`, AI };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.json': 'application/json', '.pdf': 'application/pdf', '.gz': 'application/gzip' };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  try {
    if (url.pathname === '/__koofr') {
      const files = Object.fromEntries([...koofr.files].map(([k, v]) => [k, new TextDecoder('latin1').decode(v)]));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ files, aiCalls }));
      return;
    }
    if (url.pathname.startsWith('/gw/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const init = { method: req.method, headers: req.headers };
      if (chunks.length) init.body = Buffer.concat(chunks);
      const out = await worker.fetch(new Request(`http://gw${url.pathname.slice(3)}`, init), env);
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(Buffer.from(await out.arrayBuffer()));
      return;
    }
    const rel = url.pathname === '/' ? 'index.html' : normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
    const file = join(root, rel);
    if (!file.startsWith(root)) throw new Error('outside');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(port, () => console.log(`e2e server on http://localhost:${port}`));
