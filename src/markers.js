// Built-in marker catalogue + normalisation.
// toStd factors: multiply a value in that unit to get unitStd.
export const MARKER_GROUPS = ['Blood count', 'Lipids', 'Glucose', 'Liver', 'Kidney', 'Thyroid', 'Urine', 'Body', 'Other'];

const m = (name, group, unitStd, aliases = [], toStd = {}) => ({ name, group, unitStd, aliases, toStd });
const CHOL = { 'mg/dL': 0.02586 };
const CELLS = '10^9/L';

export const BUILTIN_MARKERS = {
  // Blood count
  HB:      m('Haemoglobin', 'Blood count', 'g/dL', ['Hemoglobin', 'Hb', 'Hgb'], { 'g/L': 0.1 }),
  RBC:     m('Red cells', 'Blood count', '10^12/L', ['RBC', 'Red Blood Cell', 'Red Blood Cells', 'Red Cell Count', 'RBC Count', 'Erythrocytes', 'Sel Darah Merah']),
  HCT:     m('Haematocrit', 'Blood count', '%', ['Hematocrit', 'HCT', 'PCV', 'Packed Cell Volume'], { 'L/L': 100 }),
  MCV:     m('MCV', 'Blood count', 'fL', ['Mean Corpuscular Volume', 'Mean Cell Volume']),
  MCH:     m('MCH', 'Blood count', 'pg', ['Mean Corpuscular Haemoglobin', 'Mean Corpuscular Hemoglobin', 'Mean Cell Haemoglobin']),
  MCHC:    m('MCHC', 'Blood count', 'g/dL', ['Mean Corpuscular Haemoglobin Concentration', 'Mean Corpuscular Hemoglobin Concentration'], { 'g/L': 0.1 }),
  RDW:     m('RDW', 'Blood count', '%', ['Red Cell Distribution Width', 'RDW-CV']),
  WBC:     m('White cells', 'Blood count', CELLS, ['WBC', 'White Blood Cell', 'White Blood Cells', 'White Cell Count', 'Total White Cell Count', 'TWC', 'Total WBC', 'Leucocytes', 'Leukocytes', 'Sel Darah Putih']),
  NEUT:    m('Neutrophils (count)', 'Blood count', CELLS, ['Neutrophils Abs', 'Absolute Neutrophil', 'Absolute Neutrophils', 'Neutrophil Count', 'ANC']),
  NEUT_PCT: m('Neutrophils %', 'Blood count', '%', ['Neutrophil', 'Neutrophils', 'Neutrophils pct', 'Neutrophil pct']),
  LYMPH:   m('Lymphocytes (count)', 'Blood count', CELLS, ['Lymphocytes Abs', 'Absolute Lymphocyte', 'Absolute Lymphocytes', 'Lymphocyte Count']),
  LYMPH_PCT: m('Lymphocytes %', 'Blood count', '%', ['Lymphocyte', 'Lymphocytes', 'Lymphocytes pct', 'Lymphocyte pct']),
  MONO:    m('Monocytes (count)', 'Blood count', CELLS, ['Monocytes Abs', 'Absolute Monocyte', 'Absolute Monocytes', 'Monocyte Count']),
  MONO_PCT: m('Monocytes %', 'Blood count', '%', ['Monocyte', 'Monocytes', 'Monocytes pct', 'Monocyte pct']),
  EOS:     m('Eosinophils (count)', 'Blood count', CELLS, ['Eosinophils Abs', 'Absolute Eosinophil', 'Absolute Eosinophils', 'Eosinophil Count']),
  EOS_PCT: m('Eosinophils %', 'Blood count', '%', ['Eosinophil', 'Eosinophils', 'Eosinophils pct', 'Eosinophil pct']),
  BASO:    m('Basophils (count)', 'Blood count', CELLS, ['Basophils Abs', 'Absolute Basophil', 'Absolute Basophils', 'Basophil Count']),
  BASO_PCT: m('Basophils %', 'Blood count', '%', ['Basophil', 'Basophils', 'Basophils pct', 'Basophil pct']),
  PLT:     m('Platelets', 'Blood count', CELLS, ['Platelet', 'PLT', 'Platelet Count', 'Thrombocytes', 'Platlet']),
  MPV:     m('MPV', 'Blood count', 'fL', ['Mean Platelet Volume']),
  ESR:     m('ESR', 'Blood count', 'mm/hr', ['Erythrocyte Sedimentation Rate'], { 'mm/h': 1 }),
  // Lipids
  CHOL_TOTAL: m('Total cholesterol', 'Lipids', 'mmol/L', ['Total Cholesterol', 'T. Chol', 'Cholesterol', 'Cholesterol Total', 'Kolesterol', 'Jumlah Kolesterol'], CHOL),
  LDL:     m('LDL cholesterol', 'Lipids', 'mmol/L', ['LDL', 'LDL-C', 'LDL-Cholesterol', 'LDL Cholesterol', 'LDL Chol', 'Kolesterol LDL'], CHOL),
  HDL:     m('HDL cholesterol', 'Lipids', 'mmol/L', ['HDL', 'HDL-C', 'HDL-Cholesterol', 'HDL Cholesterol', 'HDL Chol', 'Kolesterol HDL'], CHOL),
  NON_HDL: m('Non-HDL cholesterol', 'Lipids', 'mmol/L', ['Non HDL', 'Non-HDL', 'Non-HDL-C', 'Non HDL Cholesterol'], CHOL),
  TG:      m('Triglycerides', 'Lipids', 'mmol/L', ['Triglyceride', 'TG', 'Trigliserida'], { 'mg/dL': 0.01129 }),
  CHOL_HDL: m('Cholesterol / HDL ratio', 'Lipids', 'ratio', ['Chol/HDL Ratio', 'Total Cholesterol/HDL Ratio', 'TC/HDL Ratio', 'Cholesterol HDL Ratio', 'TC/HDL', 'Chol/HDL']),
  // Glucose
  FBG:     m('Fasting blood glucose', 'Glucose', 'mmol/L', ['Glucose (Fasting)', 'FBS', 'FBG', 'Fasting Glucose', 'Fasting Blood Sugar', 'Fasting Plasma Glucose', 'FPG', 'Gula Darah Puasa', 'Glukosa Puasa'], { 'mg/dL': 0.0555 }),
  RBG:     m('Random blood glucose', 'Glucose', 'mmol/L', ['Glucose (Random)', 'RBS', 'RBG', 'Random Glucose', 'Random Blood Sugar', 'Gula Darah Rawak'], { 'mg/dL': 0.0555 }),
  HBA1C:   m('HbA1c', 'Glucose', '%', ['Glycated Haemoglobin', 'Glycated Hemoglobin', 'Glycosylated Haemoglobin', 'Hb A1c', 'A1C']),
  // Liver
  ALT:     m('ALT', 'Liver', 'U/L', ['SGPT', 'Alanine Aminotransferase', 'Alanine Transaminase', 'ALT (SGPT)', 'ALAT'], { 'IU/L': 1 }),
  AST:     m('AST', 'Liver', 'U/L', ['SGOT', 'Aspartate Aminotransferase', 'Aspartate Transaminase', 'AST (SGOT)', 'ASAT'], { 'IU/L': 1 }),
  ALP:     m('ALP', 'Liver', 'U/L', ['Alkaline Phosphatase', 'Alk Phos', 'Alk. Phosphatase'], { 'IU/L': 1 }),
  GGT:     m('GGT', 'Liver', 'U/L', ['Gamma GT', 'Gamma-GT', 'Gamma Glutamyl Transferase', 'Gamma-Glutamyl Transferase', 'GGTP'], { 'IU/L': 1 }),
  TBIL:    m('Total bilirubin', 'Liver', 'µmol/L', ['Bilirubin', 'Total Bilirubin', 'Bilirubin Total', 'T. Bilirubin', 'T Bil', 'Bilirubin, Total'], { 'mg/dL': 17.1 }),
  DBIL:    m('Direct bilirubin', 'Liver', 'µmol/L', ['Direct Bilirubin', 'Bilirubin Direct', 'Conjugated Bilirubin', 'D. Bilirubin', 'Bilirubin, Direct'], { 'mg/dL': 17.1 }),
  ALB:     m('Albumin', 'Liver', 'g/L', ['Serum Albumin'], { 'g/dL': 10 }),
  GLOB:    m('Globulin', 'Liver', 'g/L', ['Serum Globulin'], { 'g/dL': 10 }),
  TP:      m('Total protein', 'Liver', 'g/L', ['Total Protein', 'Serum Total Protein', 'Protein Total'], { 'g/dL': 10 }),
  AG_RATIO: m('A/G ratio', 'Liver', 'ratio', ['A/G Ratio', 'Albumin/Globulin Ratio', 'AG Ratio']),
  // Kidney
  UREA:    m('Urea', 'Kidney', 'mmol/L', ['Blood Urea', 'Serum Urea'], { 'mg/dL': 0.1665 }),
  BUN:     m('BUN', 'Kidney', 'mmol/L', ['Blood Urea Nitrogen'], { 'mg/dL': 0.357 }),
  CREAT:   m('Creatinine', 'Kidney', 'µmol/L', ['Serum Creatinine', 'S. Creatinine', 'Kreatinin'], { 'mg/dL': 88.4 }),
  EGFR:    m('eGFR', 'Kidney', 'mL/min/1.73m²', ['Estimated GFR', 'Estimated Glomerular Filtration Rate', 'GFR'], { 'mL/min': 1 }),
  URIC:    m('Uric acid', 'Kidney', 'µmol/L', ['Uric Acid', 'Urate', 'Serum Uric Acid', 'Asid Urik'], { 'mg/dL': 59.48, 'mmol/L': 1000 }),
  NA:      m('Sodium', 'Kidney', 'mmol/L', ['Na', 'Na+', 'Serum Sodium', 'Natrium'], { 'mEq/L': 1 }),
  K:       m('Potassium', 'Kidney', 'mmol/L', ['K', 'K+', 'Serum Potassium', 'Kalium'], { 'mEq/L': 1 }),
  CL:      m('Chloride', 'Kidney', 'mmol/L', ['Cl', 'Cl-', 'Serum Chloride'], { 'mEq/L': 1 }),
  CA:      m('Calcium', 'Kidney', 'mmol/L', ['Ca', 'Serum Calcium', 'Kalsium'], { 'mg/dL': 0.2495 }),
  PHOS:    m('Phosphate', 'Kidney', 'mmol/L', ['Phosphorus', 'Inorganic Phosphate', 'Serum Phosphate'], { 'mg/dL': 0.3229 }),
  // Thyroid
  TSH:     m('TSH', 'Thyroid', 'mIU/L', ['Thyroid Stimulating Hormone', 'Thyrotropin', 'TSH (Ultrasensitive)'], { 'µIU/mL': 1, 'uIU/mL': 1 }),
  FT4:     m('Free T4', 'Thyroid', 'pmol/L', ['FT4', 'Free Thyroxine', 'Free T4'], { 'ng/dL': 12.87 }),
  FT3:     m('Free T3', 'Thyroid', 'pmol/L', ['FT3', 'Free Triiodothyronine', 'Free T3'], { 'pg/mL': 1.536 }),
  // Urine (dipstick results are usually words: value is text, valueStd null)
  U_PROTEIN: m('Urine protein', 'Urine', 'text', ['Urine Protein', 'Protein (Urine)', 'Urine Albumin', 'Albumin (Urine)', 'Protein Urine', 'UFEME Protein']),
  U_GLUCOSE: m('Urine glucose', 'Urine', 'text', ['Urine Glucose', 'Glucose (Urine)', 'Urine Sugar', 'Glucose Urine']),
  U_KETONE:  m('Urine ketones', 'Urine', 'text', ['Urine Ketone', 'Urine Ketones', 'Ketones', 'Ketone', 'Ketones (Urine)']),
  U_BLOOD:   m('Urine blood', 'Urine', 'text', ['Urine Blood', 'Blood (Urine)', 'Occult Blood', 'Blood Urine']),
  U_LEUC:    m('Urine leucocytes', 'Urine', 'text', ['Urine Leucocytes', 'Urine Leukocytes', 'Leucocyte Esterase', 'Leukocyte Esterase', 'Leucocytes (Urine)']),
  U_NITRITE: m('Urine nitrite', 'Urine', 'text', ['Urine Nitrite', 'Nitrite', 'Nitrites', 'Nitrite (Urine)']),
  U_BILI:    m('Urine bilirubin', 'Urine', 'text', ['Urine Bilirubin', 'Bilirubin (Urine)']),
  U_UROBIL:  m('Urine urobilinogen', 'Urine', 'text', ['Urobilinogen', 'Urine Urobilinogen']),
  U_PH:      m('Urine pH', 'Urine', 'pH', ['Urine pH', 'pH', 'pH (Urine)']),
  U_SG:      m('Urine specific gravity', 'Urine', 'SG', ['Specific Gravity', 'Urine Specific Gravity', 'SG', 'S.G.']),
  U_RBC:     m('Urine red cells', 'Urine', '/HPF', ['Urine RBC', 'RBC (Urine)', 'Red Cells (Urine)', 'Urine Red Blood Cells']),
  U_WBC:     m('Urine white cells', 'Urine', '/HPF', ['Urine WBC', 'WBC (Urine)', 'Pus Cells', 'White Cells (Urine)', 'Urine White Blood Cells']),
  U_ACR:     m('Urine albumin/creatinine ratio', 'Urine', 'mg/mmol', ['ACR', 'UACR', 'Microalbumin/Creatinine Ratio', 'Albumin Creatinine Ratio', 'Urine ACR']),
  // Body
  WEIGHT:  m('Weight', 'Body', 'kg', ['Body Weight', 'Berat', 'Berat Badan']),
  HEIGHT:  m('Height', 'Body', 'cm', ['Body Height', 'Tinggi'], { m: 100 }),
  BMI:     m('BMI', 'Body', 'kg/m²', ['Body Mass Index', 'BMI (kg/m2)', 'Indeks Jisim Badan']),
  SBP:     m('Systolic BP', 'Body', 'mmHg', ['Systolic', 'SBP', 'Systolic Blood Pressure', 'Tekanan Darah Sistolik']),
  DBP:     m('Diastolic BP', 'Body', 'mmHg', ['Diastolic', 'DBP', 'Diastolic Blood Pressure', 'Tekanan Darah Diastolik']),
  PULSE:   m('Pulse', 'Body', 'bpm', ['Heart Rate', 'Pulse Rate', 'HR', 'Nadi']),
};

// Simplified Chinese names, shown beside the English ones. Display only: not stored, not used for matching.
const MARKER_ZH = {
  HB: '血红蛋白', RBC: '红细胞', HCT: '红细胞压积', MCV: '平均红细胞体积', MCH: '平均红细胞血红蛋白量', MCHC: '平均红细胞血红蛋白浓度',
  RDW: '红细胞分布宽度', WBC: '白细胞', NEUT: '中性粒细胞计数', NEUT_PCT: '中性粒细胞百分比', LYMPH: '淋巴细胞计数', LYMPH_PCT: '淋巴细胞百分比',
  MONO: '单核细胞计数', MONO_PCT: '单核细胞百分比', EOS: '嗜酸性粒细胞计数', EOS_PCT: '嗜酸性粒细胞百分比',
  BASO: '嗜碱性粒细胞计数', BASO_PCT: '嗜碱性粒细胞百分比', PLT: '血小板', MPV: '平均血小板体积', ESR: '血沉',
  CHOL_TOTAL: '总胆固醇', LDL: '低密度脂蛋白胆固醇', HDL: '高密度脂蛋白胆固醇', NON_HDL: '非高密度脂蛋白胆固醇', TG: '甘油三酯', CHOL_HDL: '总胆固醇/高密度脂蛋白比值',
  FBG: '空腹血糖', RBG: '随机血糖', HBA1C: '糖化血红蛋白',
  ALT: '谷丙转氨酶', AST: '谷草转氨酶', ALP: '碱性磷酸酶', GGT: '谷氨酰转肽酶', TBIL: '总胆红素', DBIL: '直接胆红素',
  ALB: '白蛋白', GLOB: '球蛋白', TP: '总蛋白', AG_RATIO: '白蛋白/球蛋白比值',
  UREA: '尿素', BUN: '尿素氮', CREAT: '肌酐', EGFR: '估算肾小球滤过率', URIC: '尿酸', NA: '钠', K: '钾', CL: '氯', CA: '钙', PHOS: '磷',
  TSH: '促甲状腺激素', FT4: '游离甲状腺素', FT3: '游离三碘甲状腺原氨酸',
  U_PROTEIN: '尿蛋白', U_GLUCOSE: '尿糖', U_KETONE: '尿酮体', U_BLOOD: '尿潜血', U_LEUC: '尿白细胞酯酶', U_NITRITE: '尿亚硝酸盐', U_BILI: '尿胆红素',
  U_UROBIL: '尿胆原', U_PH: '尿酸碱度', U_SG: '尿比重', U_RBC: '尿红细胞', U_WBC: '尿白细胞', U_ACR: '尿白蛋白/肌酐比值',
  WEIGHT: '体重', HEIGHT: '身高', BMI: '身体质量指数', SBP: '收缩压', DBP: '舒张压', PULSE: '脉搏',
};
export const GROUP_ZH = {
  'Blood count': '血常规', Lipids: '血脂', Glucose: '血糖', Liver: '肝功能', Kidney: '肾功能', Thyroid: '甲状腺', Urine: '尿液', Body: '身体测量', Other: '其他',
};

// '' for a marker the user added or one the app doesn't know.
export function zhName(code) { return MARKER_ZH[code] || ''; }

// Built-ins plus the user's own (vault.markers), which win on the same code.
export function catalogue(custom = {}) { return { ...BUILTIN_MARKERS, ...custom }; }

const squash = s => String(s == null ? '' : s).toLowerCase().replace(/%/g, ' pct ').replace(/[^a-z0-9]/g, '');
const NOISE = /\b(serum|plasma|calculated|calc|direct method|enzymatic|ngsp|dcct)\b\.?|^s\.\s*/gi;

function buildIndex(custom) {
  const index = new Map();
  for (const [code, marker] of Object.entries(catalogue(custom))) {
    for (const name of [code, marker.name, ...(marker.aliases || [])]) {
      const key = squash(name);
      if (key && !index.has(key)) index.set(key, code);
    }
  }
  return index;
}

// nameAsPrinted -> catalogue code, or null when unknown. A bare "Glucose" or "Protein" stays unknown on purpose:
// guessing fasting vs random, or blood vs urine, would put wrong values on a trend.
// unit (optional) tells "Neutrophils 3.2 10^9/L" (count) from "Neutrophils 55 %".
export function matchMarker(name, custom = {}, unit = null) {
  const index = buildIndex(custom);
  const raw = String(name == null ? '' : name);
  const attempts = [raw, raw.replace(/\([^)]*\)/g, ' '), raw.replace(NOISE, ' '), raw.replace(/\([^)]*\)/g, ' ').replace(NOISE, ' ')];
  for (const attempt of attempts) {
    const code = index.get(squash(attempt));
    if (code) return pickCountOrPercent(code, unit);
  }
  return null;
}

function pickCountOrPercent(code, unit) {
  if (!unit || !code.endsWith('_PCT')) return code;
  return normalizeUnit(unit) === '%' ? code : code.slice(0, -4);
}

// Spelling differences only: mg/dl = mg/dL, umol/L = µmol/L, x10^9/L = 10e9/L = 109/L (superscript lost in PDF text).
export function normalizeUnit(unit) {
  const s = String(unit == null ? '' : unit).trim().toLowerCase()
    .replace(/[µμ]/g, 'u').replace(/²/g, '2').replace(/⁹/g, '9').replace(/¹²/g, '12').replace(/\s+/g, '').replace(/×/g, 'x');
  const power = /^x?10(?:\^|e|\*\*)?(9|12|3|6)\/(.+)$/.exec(s);
  if (power) {
    const canon = `10^${power[1]}/${power[2]}`;
    if (canon === '10^3/ul') return '10^9/l';
    if (canon === '10^6/ul') return '10^12/l';
    return canon;
  }
  if (s === 'k/ul') return '10^9/l';
  if (s === 'm/ul') return '10^12/l';
  return s;
}

// Value in unit -> value in the marker's standard unit, or null when it can't be converted (text value, unknown unit).
export function toStd(value, unit, code, custom = {}) {
  const marker = catalogue(custom)[code];
  const n = numericValue(value);
  if (!marker || n === null) return null;
  const u = normalizeUnit(unit);
  if (!u) return null;
  if (u === normalizeUnit(marker.unitStd)) return round4(n);
  for (const [from, factor] of Object.entries(marker.toStd || {})) {
    if (normalizeUnit(from) === u) return round4(n * factor);
  }
  return null;
}

const round4 = n => Number(n.toFixed(4));

// A finite number from a number or a plain numeric string ("1,200" counts); null for words like "Negative" or "<0.5".
export function numericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const s = value.trim().replace(/^(\d{1,3})((?:,\d{3})+)(\.\d+)?$/, (_, a, b, c = '') => a + b.replace(/,/g, '') + c);
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : null;
}

// Flag from the printed range when the report gives none.
export function computeFlag(value, refLow, refHigh) {
  const n = numericValue(value);
  if (n === null) return null;
  if (refLow != null && n < refLow) return 'L';
  if (refHigh != null && n > refHigh) return 'H';
  if (refLow == null && refHigh == null) return null;
  return 'N';
}

// "3.5 - 5.0" | "< 3.0" | "≥ 1.0" | "up to 40" -> { low, high }. Anything else (e.g. "Negative") -> both null.
export function parseRange(text) {
  const s = String(text == null ? '' : text).replace(/,/g, '').trim();
  const between = /(-?\d*\.?\d+)\s*(?:-|–|—|to)\s*(-?\d*\.?\d+)/i.exec(s);
  if (between) return { low: Number(between[1]), high: Number(between[2]) };
  const upper = /(?:<=?|≤|up\s*to|below|less\s*than)\s*(\d*\.?\d+)/i.exec(s);
  if (upper) return { low: null, high: Number(upper[1]) };
  const lower = /(?:>=?|≥|above|more\s*than|greater\s*than)\s*(\d*\.?\d+)/i.exec(s);
  if (lower) return { low: Number(lower[1]), high: null };
  return { low: null, high: null };
}

// Numbers stay numbers; text results ("Negative", "1+", "<0.5") stay text.
export function parseValue(raw) {
  const n = numericValue(raw);
  if (n !== null) return n;
  const s = String(raw == null ? '' : raw).trim();
  return s === '' ? null : s;
}

// Any partial result -> the full shape in docs/DESIGN.md. Keeps a flag the report printed, otherwise computes one.
export function normalizeResult(input, custom = {}) {
  const value = parseValue(input.value);
  const unit = String(input.unit == null ? '' : input.unit).trim();
  const nameAsPrinted = String(input.nameAsPrinted == null ? '' : input.nameAsPrinted).trim();
  const refText = String(input.refText == null ? '' : input.refText).trim();
  const parsed = parseRange(refText);
  const refLow = numericValue(input.refLow) ?? parsed.low;
  const refHigh = numericValue(input.refHigh) ?? parsed.high;
  const known = input.marker && catalogue(custom)[input.marker] ? input.marker : null;
  const marker = known || matchMarker(nameAsPrinted, custom, unit);
  const flag = ['L', 'N', 'H'].includes(input.flag) ? input.flag : computeFlag(value, refLow, refHigh);
  return {
    marker, nameAsPrinted, value, unit, refLow, refHigh, refText, flag,
    valueStd: marker ? toStd(value, unit, marker, custom) : null,
    unitStd: marker ? catalogue(custom)[marker].unitStd : null,
    confidence: typeof input.confidence === 'number' ? input.confidence : null,
    entryType: input.entryType || 'manual',
  };
}
