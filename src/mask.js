// De-identification before AI.
//   maskText(text, profile) -> { masked, hits: [{ kind, start, end }] }   (hits are positions in the original text)
//   Masks: Malaysian IC, passport-like IDs, phone numbers (+60 / 01x / landlines), emails, profile.displayName and every
//   profile.maskNames entry (case-insensitive, any spacing), lines that look like an address block,
//   and values after labels such as MRN, patient ID, lab number, name, doctor, date of birth.
//   Replacement token: [MASKED].  The review UI lets the user tap to mask more (maskMore).
export const MASK_TOKEN = '[MASKED]';

const IC_RE = /(?<![\d-])\d{6}[-\s]?\d{2}[-\s]?\d{4}(?![\d-])/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+\s?@\s?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const PHONE_RES = [
  /(?<![\d.])(?:\+?\s?60[-\s]?|0)1\d[-\s]?\d{3,4}[-\s]?\d{4}(?![\d.])/g,        // mobile
  /(?<![\d.])(?:\+?\s?60[-\s]?|0)[3-9][-\s]?\d{3,4}[-\s]?\d{4}(?![\d.])/g,      // landline
  /(?<![\d.])\+\s?\d[\d\s-]{7,14}\d(?![\d.])/g,                                 // any international number
];
const PASSPORT_RE = /\b[A-Z]{1,2}\d{7,9}\b/g;

// Label, then a value up to the end of the line or a wide column gap.
const LABEL_RE = new RegExp(
  '(?:^|[\\s,;|(])(' +
  'patient\\s*(?:name|id|no\\.?|number)?|pt\\.?\\s*name|name|nama(?:\\s*pesakit)?|' +
  'mrn|m\\.?r\\.?n\\.?|medical\\s*record(?:\\s*(?:no\\.?|number))?|rn|hospital\\s*(?:no\\.?|number)|' +
  'lab(?:oratory)?\\s*(?:no\\.?|number|id|ref(?:erence)?)|accession\\s*(?:no\\.?|number)?|episode\\s*(?:no\\.?|number)?|' +
  'specimen\\s*(?:no\\.?|id)|sample\\s*(?:no\\.?|id)|ref(?:erence)?\\s*(?:no\\.?|number)|request\\s*(?:no\\.?|id)|visit\\s*(?:no\\.?|id)|' +
  'i\\.?c\\.?(?:\\s*(?:no\\.?|number))?|nric(?:\\s*(?:no\\.?|number))?|no\\.?\\s*k/?p|k/?p|passport(?:\\s*(?:no\\.?|number))?|' +
  'd\\.?o\\.?b\\.?|date\\s*of\\s*birth|birth\\s*date|tarikh\\s*lahir|' +
  'doctor|dr\\.?|physician|referr(?:ed|ing)(?:\\s*(?:by|doctor))?|requested\\s*by|ordered\\s*by|attending|consultant|doktor|' +
  'tel(?:ephone)?\\.?|phone|mobile|h/?p|fax|e-?mail|address|alamat|employer|company|syarikat' +
  ')\\s*[:#=]\\s*([^\\n]*?)(?=\\s{2,}|\\s*\\||\\s*$)', 'gim');
// The same labels often have no colon when the IC or MRN value follows at once.
const BARE_ID_RE = /\b(?:mrn|nric|i\/?c(?:\s*no\.?)?|lab\s*no\.?|accession\s*no\.?|episode\s*no\.?)\s+([A-Za-z0-9][A-Za-z0-9/-]{3,})/gi;
const DR_RE = /\b(?:[Dd][Rr]|[Pp]rof|[Dd]ato'?|[Dd]atin|[Tt]an\s*[Ss]ri)\.?[ \t]+(?:[A-Z][A-Za-z'.-]*[ \t]*){1,5}/g;

const ADDRESS_WORDS = /\b(?:jalan|jln|lorong|lrg|taman|tmn|kampung|kampong|kg|persiaran|lebuh(?:raya)?|bandar|seksyen|blok|block|apartment|apt|kondominium|condo|residen[cs]e?|flat|pangsapuri|bukit|desa|wisma|menara|tingkat|street|road|avenue|lot\s+\d+|no\.?\s*\d+[,/ ]|p\.?o\.?\s*box|peti\s*surat)\b/i;
const ADDRESS_STATE = /\b(?:johor|kedah|kelantan|melaka|malacca|negeri\s*sembilan|pahang|perak|perlis|pulau\s*pinang|penang|sabah|sarawak|selangor|terengganu|kuala\s*lumpur|putrajaya|labuan|wilayah\s*persekutuan|petaling\s*jaya|shah\s*alam|subang|klang|cheras|ampang|kajang|puchong|ipoh|seremban|kuching|kota\s*kinabalu|malaysia)\b/i;
const POSTCODE = /\b\d{5}\b/;
// A line with a printed unit or range is a result, even when a word looks like part of an address.
const RESULT_LINE = /\b(?:mmol\/l|mg\/dl|g\/dl|g\/l|u\/l|iu\/l|umol\/l|µmol\/l|fl|pg|mmhg)\b|10\^?\s*\d+\s*\/\s*l/i;

const NAME_SKIP = new Set(['bin', 'binti', 'bte', 'bt', 'bn', 'anak', 'and', 'the', 'mr', 'mrs', 'ms', 'dr']);
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Any spacing between the letters: "TAN AH KOW" also finds "Tan  Ah\nKow", "TANAHKOW" and "T A N  A H  K O W".
function spacedRe(words) {
  const letters = [...words.join('')].map(escapeRe).join('[\\s.\']*');
  return new RegExp(`(?<![\\p{L}\\p{N}])${letters}(?![\\p{L}\\p{N}])`, 'giu');
}

function nameRes(profile) {
  const res = [];
  const names = [profile && profile.displayName, ...((profile && profile.maskNames) || [])];
  for (const name of names) {
    const words = String(name || '').trim().split(/[\s,./]+/).filter(Boolean);
    if (!words.length || words.join('').length < 3) continue;
    res.push(spacedRe(words));
    // Each part alone too, because reports often print part of a name. Short parts and "bin" would hit ordinary words.
    if (words.length > 1) {
      for (const w of words) if (w.length >= 3 && !NAME_SKIP.has(w.toLowerCase())) res.push(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(w)}(?![\\p{L}\\p{N}])`, 'giu'));
    }
  }
  return res;
}

function looksLikeAddress(line) {
  if (RESULT_LINE.test(line)) return false;
  if (POSTCODE.test(line) && (ADDRESS_STATE.test(line) || ADDRESS_WORDS.test(line))) return true;
  return ADDRESS_WORDS.test(line) || ADDRESS_STATE.test(line);
}

export function maskText(text, profile) {
  const src = String(text == null ? '' : text);
  const raw = [];
  const addAll = (re, kind, group = 0) => {
    for (const m of src.matchAll(re)) {
      if (!m[0]) continue;
      if (group) {
        if (!m[group] || !m[group].trim()) continue;
        const start = m.index + m[0].lastIndexOf(m[group]);
        raw.push({ kind, start, end: start + m[group].length });
      } else raw.push({ kind, start: m.index, end: m.index + m[0].length });
    }
  };
  addAll(IC_RE, 'ic');
  addAll(EMAIL_RE, 'email');
  PHONE_RES.forEach(re => addAll(re, 'phone'));
  addAll(PASSPORT_RE, 'id');
  addAll(LABEL_RE, 'label', 2);
  addAll(BARE_ID_RE, 'id', 1);
  addAll(DR_RE, 'name');
  nameRes(profile).forEach(re => addAll(re, 'name'));
  let pos = 0;
  for (const line of src.split('\n')) {
    if (line.trim() && looksLikeAddress(line)) raw.push({ kind: 'address', start: pos, end: pos + line.length });
    pos += line.length + 1;
  }

  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  const hits = [];
  for (const h of raw) {
    const last = hits[hits.length - 1];
    if (last && h.start <= last.end) last.end = Math.max(last.end, h.end);
    else hits.push({ ...h });
  }
  let masked = '';
  let at = 0;
  for (const h of hits) {
    masked += src.slice(at, h.start) + MASK_TOKEN;
    at = h.end;
  }
  return { masked: masked + src.slice(at), hits };
}

// Tap-to-mask: every occurrence of this exact word, as a whole word.
export function maskMore(text, word) {
  if (!word || word === MASK_TOKEN) return text;
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(word)}(?![\\p{L}\\p{N}])`, 'gu'), MASK_TOKEN);
}

// Last check before anything leaves the device: IC, email or phone left in the text (e.g. typed in by hand).
export function findLeaks(text, profile) {
  const src = String(text || '');
  return maskText(src, profile).hits.filter(h => ['ic', 'email', 'phone', 'name'].includes(h.kind)).map(h => h.kind);
}
