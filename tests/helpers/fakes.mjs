// Stand-ins for the browser and for Koofr, so tests run the real vault, sync client and Worker with nothing deployed.

// One localStorage + IndexedDB per simulated device.
export function makeDevice() {
  return { local: new Map(), files: new Map() };
}

let device = makeDevice();

export function useDevice(d) { device = d; }

export function installBrowserFakes() {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: k => (device.local.has(k) ? device.local.get(k) : null),
      setItem: (k, v) => device.local.set(k, String(v)),
      removeItem: k => device.local.delete(k),
      get length() { return device.local.size; },
    },
  });
  // The small part of IndexedDB that vault.js uses.
  globalThis.indexedDB = {
    open() {
      const req = {};
      const db = {
        createObjectStore() {},
        close() {},
        transaction() {
          const tx = {};
          const finish = () => setTimeout(() => tx.oncomplete && tx.oncomplete());
          const request = fn => { const r = {}; r.result = fn(); setTimeout(() => { if (r.onsuccess) r.onsuccess(); finish(); }); return r; };
          tx.objectStore = () => ({
            put: (v, k) => request(() => { device.files.set(k, v); }),
            get: k => request(() => device.files.get(k)),
            delete: k => request(() => { device.files.delete(k); }),
          });
          return tx;
        },
      };
      setTimeout(() => { req.result = db; req.onsuccess(); });
      return req;
    },
  };
  globalThis.window = globalThis.window || { addEventListener() {} };
}

// In-memory WebDAV behaving like Koofr's: PUT, GET with ETag, MKCOL, MOVE, DELETE, Basic auth.
export function makeFakeKoofr(user = 'koofr-user', pass = 'koofr-pass') {
  const files = new Map();
  const dirs = new Set();
  const tag = bytes => `"${bytes.length}-${bytes.reduce((a, b) => (a * 31 + b) >>> 0, 7)}"`;
  const pathOf = url => new URL(url).pathname;
  const handle = async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    const auth = new Headers(init.headers).get('Authorization');
    if (auth !== `Basic ${btoa(`${user}:${pass}`)}`) return new Response('no', { status: 401 });
    const path = pathOf(url);
    if (method === 'MKCOL') {
      if (dirs.has(path)) return new Response(null, { status: 405 });
      dirs.add(path);
      return new Response(null, { status: 201 });
    }
    if (method === 'PUT') {
      const bytes = new Uint8Array(await new Response(init.body).arrayBuffer());
      files.set(path, bytes);
      return new Response(null, { status: 201, headers: { ETag: tag(bytes) } });
    }
    if (method === 'GET' || method === 'HEAD') {
      const bytes = files.get(path);
      if (!bytes) return new Response('missing', { status: 404 });
      return new Response(method === 'HEAD' ? null : bytes, { status: 200, headers: { ETag: tag(bytes) } });
    }
    if (method === 'MOVE') {
      const bytes = files.get(path);
      if (!bytes) return new Response(null, { status: 404 });
      files.set(pathOf(new Headers(init.headers).get('Destination')), bytes);
      files.delete(path);
      return new Response(null, { status: 201 });   // no ETag, like Koofr
    }
    if (method === 'DELETE') {
      return new Response(null, { status: files.delete(path) ? 204 : 404 });
    }
    return new Response(null, { status: 405 });
  };
  return { files, handle };
}
