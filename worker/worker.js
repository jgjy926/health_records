/**
 * health-gateway — Cloudflare Worker (module syntax). SEPARATE from cashback-gateway.
 *
 * Stores ciphertext only. It never sees a passcode, a key or readable health data.
 *
 * Routes (all require `Authorization: Bearer <APP_TOKEN>` except OPTIONS):
 *   GET  /ping            -> { ok: true }                         (shell: implemented)
 *   GET  /vault           -> encrypted vault blob + ETag           (PHASE 6)
 *   PUT  /vault           -> write with If-Match, one dated backup per day (PHASE 6)
 *   GET  /file/:id        -> encrypted PDF                         (PHASE 6)
 *   PUT  /file/:id        -> store encrypted PDF (<= 8 MB)         (PHASE 6)
 *   POST /ai-extract      -> Workers AI on ALREADY-MASKED text -> lab results JSON (PHASE 4)
 *
 * Port the Koofr WebDAV code (atomic write, ETag, daily backup) from cashback_sspn/worker/worker.js.
 * Secrets: KOOFR_USER, KOOFR_PASS, APP_TOKEN     Vars: ALLOWED_ORIGIN, KOOFR_BASE
 * Binding: AI (Workers AI)
 */
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

export default {
  async fetch(request, env) {
    try { return await handle(request, env); }
    catch (err) { return json({ error: 'Server error' }, 500, env); }  // never echo internals
  },
};

async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors(env) });

  if (!env.APP_TOKEN) return json({ error: 'Worker not configured' }, 500, env);
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!(await safeEqual(token, env.APP_TOKEN))) return json({ error: 'Unauthorized' }, 401, env);

  if (path === '/ping' && request.method === 'GET') return json({ ok: true }, 200, env);

  if (path === '/vault' || path.startsWith('/file/') || path === '/ai-extract') {
    if (path.startsWith('/file/') && !ID_RE.test(path.slice(6))) return json({ error: 'Bad id' }, 400, env);
    return json({ error: 'Not implemented yet' }, 501, env);
  }
  return json({ error: 'Not found' }, 404, env);
}

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || 'null',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match',
    'Access-Control-Expose-Headers': 'ETag',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(env) },
  });
}

// Constant-time compare via SHA-256 digests (equal length, no early exit).
async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b))),
  ]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0 && String(a).length > 0;
}
