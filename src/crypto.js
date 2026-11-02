// PHASE 2 — Web Crypto helpers. Not implemented in the shell.
//
// Contract (see docs/DESIGN.md "Security"):
//   deriveKek(passcode, salt)          PBKDF2-SHA256, PBKDF2_ITERATIONS, -> AES-KW or AES-GCM key-encryption key
//   generateDataKey()                  random 256-bit AES-GCM key (extractable only for wrapping)
//   wrapKey(dataKey, kek) / unwrapKey(wrapped, kek)
//   encryptJson(obj, dataKey) -> { iv, ct }   AES-GCM, fresh 12-byte IV every call
//   decryptJson({ iv, ct }, dataKey) -> obj
//   encryptBytes(u8, dataKey) / decryptBytes(blob, dataKey)   for PDFs
//   makeRecoveryKey() -> human-readable 24-char code (e.g. XXXX-XXXX-XXXX-XXXX-XXXX-XXXX)
//                        the data key is ALSO wrapped with a KEK derived from it.
// Rules: never log keys or plaintext; never store the passcode; base64 for storage.
export {};
