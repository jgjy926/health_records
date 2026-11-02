// PHASE 4 — de-identification before AI.
//   maskText(text, profile) -> { masked, hits: [{ kind, start, end }] }
//   Masks: Malaysian IC (\d{6}-?\d{2}-?\d{4}), passport-like IDs, phone numbers (+60 / 01x),
//   emails, profile.displayName and every profile.maskNames entry (case-insensitive, any spacing),
//   lines that look like an address block, MRN / patient ID / lab number labels.
//   Replacement token: [MASKED].  The review UI lets the user tap to mask more.
export {};
