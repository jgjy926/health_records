// PHASE 4 — text extraction, on the device only.
//   extractPdfText(file) -> { pages: [string], scanned: boolean }
//     pdf.js from ./vendor/pdfjs (worker from ./vendor/pdfjs too). If a page has < ~20 chars of text,
//     treat the PDF as scanned and run Tesseract.js from ./vendor/tesseract (eng; local langPath, no CDN).
// Never upload the PDF or its text anywhere from this module.
export {};
