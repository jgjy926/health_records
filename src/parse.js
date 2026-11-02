// Text extraction, on the device only. Never upload the PDF or its text anywhere from this module.
//   extractPdfText(file, opts) -> { pages: [string], scanned: boolean }
//     pdf.js from ./vendor/pdfjs (worker from ./vendor/pdfjs too). A page with < ~20 chars of text is treated as
//     scanned: it is rendered to a canvas and read by Tesseract.js from ./vendor/tesseract (eng; local paths, no CDN).
const MIN_PAGE_CHARS = 20;
const OCR_SCALE = 2.5;
const vendorUrl = path => new URL(`../vendor/${path}`, import.meta.url).href;

// pdf.js text items -> reading-order lines. Items on the same line differ by a little in y (superscripts, font changes).
export function groupLines(items) {
  const parts = items.filter(it => it.str && it.str.trim()).map(it => ({
    str: it.str, x: it.transform[4], y: it.transform[5], width: it.width || 0, height: Math.abs(it.height) || Math.abs(it.transform[3]) || 10,
  }));
  parts.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const part of parts) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - part.y) <= Math.min(line.height, part.height) * 0.5) line.parts.push(part);
    else lines.push({ y: part.y, height: part.height, parts: [part] });
  }
  return lines.map(line => {
    line.parts.sort((a, b) => a.x - b.x);
    let text = '';
    let end = null;
    for (const p of line.parts) {
      // Keep the column gap visible: it separates value, unit and range, for the masker and for the AI.
      if (end !== null) {
        const gap = p.x - end;
        if (gap > p.height * 1.2) text += '   ';
        else if (gap > p.height * 0.15 && !text.endsWith(' ') && !p.str.startsWith(' ')) text += ' ';
      }
      text += p.str;
      end = p.x + p.width;
    }
    return text.trimEnd();
  }).join('\n');
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the OCR library'));
    document.head.appendChild(s);
  });
}

async function ocrWorker(onProgress) {
  if (!globalThis.Tesseract) await loadScript(vendorUrl('tesseract/tesseract.min.js'));
  // createWorker's own promise never settles when a file fails to load; only errorHandler hears about it.
  return new Promise((resolve, reject) => {
    globalThis.Tesseract.createWorker('eng', 1, {
      workerPath: vendorUrl('tesseract/worker.min.js'),
      corePath: vendorUrl('tesseract/core/'),
      langPath: vendorUrl('tesseract/lang/'),
      workerBlobURL: false,
      gzip: false,
      cacheMethod: 'none',    // nothing about the report stays in browser storage
      logger: m => { if (m.status === 'recognizing text') onProgress(m.progress); },
      errorHandler: () => reject(new Error('The scanned-PDF reader could not start. Enter this report by hand.')),
    }).then(resolve, reject);
  });
}

async function renderPage(page) {
  const viewport = page.getViewport({ scale: OCR_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas;
}

// opts.onProgress(message) · opts.askPassword(wrongBefore) -> password or null (Malaysian labs often lock PDFs with the IC)
export async function extractPdfText(file, { onProgress = () => {}, askPassword = null } = {}) {
  const pdfjs = await import(vendorUrl('pdfjs/pdf.min.mjs'));
  pdfjs.GlobalWorkerOptions.workerSrc = vendorUrl('pdfjs/pdf.worker.min.mjs');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true });
  task.onPassword = async (update, reason) => {
    const password = askPassword ? await askPassword(reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD) : null;
    if (password == null) task.destroy();
    else update(password);
  };
  const doc = await task.promise;
  let worker = null;
  try {
    const pages = [];
    let scanned = false;
    for (let n = 1; n <= doc.numPages; n++) {
      onProgress(`Reading page ${n} of ${doc.numPages}`);
      const page = await doc.getPage(n);
      let text = groupLines((await page.getTextContent()).items);
      if (text.replace(/\s/g, '').length < MIN_PAGE_CHARS) {
        scanned = true;
        worker = worker || await ocrWorker(p => onProgress(`Reading scanned page ${n} of ${doc.numPages}: ${Math.round(p * 100)}%`));
        const canvas = await renderPage(page);
        text = (await worker.recognize(canvas)).data.text.trim();
        canvas.width = canvas.height = 0;
      }
      pages.push(text);
      page.cleanup();
    }
    return { pages, scanned };
  } finally {
    if (worker) await worker.terminate();
    await doc.destroy();
  }
}
