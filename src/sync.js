// PHASE 6 — encrypted sync with the health-gateway Worker.
//   push(): PUT /vault with the encrypted blob + If-Match ETag; PUT /file/:id for encrypted PDFs.
//   pull(): GET /vault; on ETag conflict, merge per report id by updatedAt (newest wins), never by whole file.
//   The gateway URL and app token come from state.vault.settings (stored inside the encrypted vault).
//   Ciphertext only — never send plaintext JSON.
export {};
