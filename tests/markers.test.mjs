import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFlag, BUILTIN_MARKERS, MARKER_GROUPS, GROUP_ZH, zhName, matchMarker, toStd, normalizeUnit, parseRange, parseValue, normalizeResult, numericValue,
} from '../src/markers.js';

test('computeFlag uses the printed range', () => {
  assert.equal(computeFlag(3.4, null, 3.0), 'H');
  assert.equal(computeFlag(2.0, 2.5, 5.0), 'L');
  assert.equal(computeFlag(4.0, 2.5, 5.0), 'N');
  assert.equal(computeFlag(4.0, null, null), null);
  assert.equal(computeFlag(5.0, 2.5, 5.0), 'N', 'the limit itself is in range');
});

test('computeFlag: text and empty values have no flag', () => {
  assert.equal(computeFlag('Negative', 1, 2), null);
  assert.equal(computeFlag('', 1, 2), null);
  assert.equal(computeFlag(null, 1, 2), null);
  assert.equal(computeFlag('3.4', null, 3), 'H');
});

test('every built-in marker has a group and a standard unit', () => {
  for (const [code, m] of Object.entries(BUILTIN_MARKERS)) {
    assert.ok(m.group && m.unitStd, code);
    assert.ok(MARKER_GROUPS.includes(m.group), code);
  }
});

test('no alias points at two markers', () => {
  const seen = new Map();
  const squash = s => s.toLowerCase().replace(/%/g, ' pct ').replace(/[^a-z0-9]/g, '');
  for (const [code, m] of Object.entries(BUILTIN_MARKERS)) {
    for (const name of new Set([code, m.name, ...m.aliases].map(squash))) {
      assert.ok(!seen.has(name) || seen.get(name) === code, `${name}: ${seen.get(name)} and ${code}`);
      seen.set(name, code);
    }
  }
});

test('alias matching ignores case, spacing and punctuation', () => {
  const cases = {
    'LDL-Cholesterol': 'LDL', 'ldl cholesterol': 'LDL', 'LDL  CHOLESTEROL': 'LDL', 'LDL Cholesterol (calculated)': 'LDL',
    'HDL-C': 'HDL', 'Total Cholesterol': 'CHOL_TOTAL', 'Cholesterol': 'CHOL_TOTAL', 'Kolesterol': 'CHOL_TOTAL',
    'Triglycerides': 'TG', 'Trigliserida': 'TG', 'ALT (SGPT)': 'ALT', 'S.G.P.T': 'ALT', 'SGOT': 'AST',
    'Serum Creatinine': 'CREAT', 'S. Creatinine': 'CREAT', 'Haemoglobin': 'HB', 'HEMOGLOBIN': 'HB',
    'HbA1c (NGSP)': 'HBA1C', 'Fasting Blood Sugar': 'FBG', 'Total White Cell Count': 'WBC', 'Platelet Count': 'PLT',
    'Urine Protein': 'U_PROTEIN', 'Protein (Urine)': 'U_PROTEIN', 'Specific Gravity': 'U_SG', 'Pus Cells': 'U_WBC',
    'MCV': 'MCV', 'Gamma GT': 'GGT', 'Free T4': 'FT4', 'Berat': 'WEIGHT',
  };
  for (const [name, code] of Object.entries(cases)) assert.equal(matchMarker(name), code, name);
});

test('ambiguous or unknown names stay unmatched', () => {
  for (const name of ['Glucose', 'Protein', 'Vitamin Z', '', null, 'Blood']) assert.equal(matchMarker(name), null, String(name));
});

test('HDL and LDL never match plain cholesterol', () => {
  assert.equal(matchMarker('HDL Cholesterol'), 'HDL');
  assert.equal(matchMarker('Non HDL Cholesterol'), 'NON_HDL');
  assert.equal(matchMarker('Chol/HDL Ratio'), 'CHOL_HDL');
});

test('differential: the unit picks count or percent', () => {
  assert.equal(matchMarker('Neutrophils', {}, '%'), 'NEUT_PCT');
  assert.equal(matchMarker('Neutrophils', {}, '10^9/L'), 'NEUT');
  assert.equal(matchMarker('Neutrophils'), 'NEUT_PCT');
  assert.equal(matchMarker('Neutrophils %'), 'NEUT_PCT');
  assert.equal(matchMarker('Absolute Neutrophils'), 'NEUT');
});

test('custom markers match and win over built-ins', () => {
  const custom = { VITD: { name: 'Vitamin D', group: 'Other', unitStd: 'nmol/L', aliases: ['25-OH Vitamin D'], toStd: { 'ng/mL': 2.496 } } };
  assert.equal(matchMarker('25-OH Vitamin D', custom), 'VITD');
  assert.equal(toStd(20, 'ng/mL', 'VITD', custom), 49.92);
});

test('unit conversion to the standard unit', () => {
  assert.equal(toStd(100, 'mg/dL', 'LDL'), 2.586);
  assert.equal(toStd(3.4, 'mmol/L', 'LDL'), 3.4);
  assert.equal(toStd(3.4, 'MMOL/L', 'LDL'), 3.4);
  assert.equal(toStd(150, 'mg/dl', 'TG'), 1.6935);
  assert.equal(toStd(1, 'mg/dL', 'CREAT'), 88.4);
  assert.equal(toStd(88, 'umol/L', 'CREAT'), 88);
  assert.equal(toStd(88, 'μmol/L', 'CREAT'), 88, 'Greek mu');
  assert.equal(toStd(140, 'g/L', 'HB'), 14);
  assert.equal(toStd(6.5, 'x10^9/L', 'WBC'), 6.5);
  assert.equal(toStd(6.5, '10e9/L', 'WBC'), 6.5);
  assert.equal(toStd(6.5, '109/L', 'WBC'), 6.5, 'superscript lost in PDF text');
  assert.equal(toStd('1,200', 'mg/dL', 'CHOL_TOTAL'), 31.032);
});

test('conversion that cannot be done is null, not a guess', () => {
  assert.equal(toStd(3.4, 'furlongs', 'LDL'), null);
  assert.equal(toStd(3.4, '', 'LDL'), null);
  assert.equal(toStd(3.4, 'mmol/L', 'NOPE'), null);
  assert.equal(toStd('Negative', 'mg/dL', 'U_PROTEIN'), null);
  assert.equal(toStd('<0.5', 'mg/dL', 'LDL'), null);
});

test('unit spellings', () => {
  assert.equal(normalizeUnit('×10⁹/L'), '10^9/l');
  assert.equal(normalizeUnit('10^3/uL'), '10^9/l');
  assert.equal(normalizeUnit('K/uL'), '10^9/l');
  assert.equal(normalizeUnit('x10^12/L'), '10^12/l');
  assert.equal(normalizeUnit('mL/min/1.73m²'), 'ml/min/1.73m2');
});

test('printed ranges', () => {
  assert.deepEqual(parseRange('3.5 - 5.0'), { low: 3.5, high: 5 });
  assert.deepEqual(parseRange('3.5–5.0'), { low: 3.5, high: 5 });
  assert.deepEqual(parseRange('3.5 to 5.0'), { low: 3.5, high: 5 });
  assert.deepEqual(parseRange('< 3.0'), { low: null, high: 3 });
  assert.deepEqual(parseRange('<=40'), { low: null, high: 40 });
  assert.deepEqual(parseRange('≥ 1.0'), { low: 1, high: null });
  assert.deepEqual(parseRange('Up to 40'), { low: null, high: 40 });
  assert.deepEqual(parseRange('Negative'), { low: null, high: null });
  assert.deepEqual(parseRange(''), { low: null, high: null });
});

test('values: numbers stay numbers, words stay text', () => {
  assert.equal(parseValue('3.4'), 3.4);
  assert.equal(parseValue(' 1,200.5 '), 1200.5);
  assert.equal(parseValue('Negative'), 'Negative');
  assert.equal(parseValue('1+'), '1+');
  assert.equal(parseValue('<0.5'), '<0.5');
  assert.equal(parseValue(''), null);
  assert.equal(numericValue('1.2.3'), null);
});

test('normalizeResult fills the documented shape', () => {
  const r = normalizeResult({ nameAsPrinted: 'LDL-Cholesterol', value: '130', unit: 'mg/dL', refText: '< 100', confidence: 0.95, entryType: 'ai' });
  assert.deepEqual(r, {
    marker: 'LDL', nameAsPrinted: 'LDL-Cholesterol', value: 130, unit: 'mg/dL', refLow: null, refHigh: 100, refText: '< 100',
    flag: 'H', valueStd: 3.3618, unitStd: 'mmol/L', confidence: 0.95, entryType: 'ai',
  });
});

test('normalizeResult: urine words, unknown markers, printed flag wins', () => {
  const urine = normalizeResult({ nameAsPrinted: 'Urine Protein', value: 'Trace', refText: 'Negative', flag: 'H' });
  assert.equal(urine.value, 'Trace');
  assert.equal(urine.valueStd, null);
  assert.equal(urine.flag, 'H');
  const neg = normalizeResult({ nameAsPrinted: 'Urine Glucose', value: 'Negative' });
  assert.equal(neg.flag, null);
  const unknown = normalizeResult({ nameAsPrinted: 'Vitamin Z', value: 5, unit: 'x', refLow: 1, refHigh: 3 });
  assert.equal(unknown.marker, null);
  assert.equal(unknown.unitStd, null);
  assert.equal(unknown.flag, 'H');
});

test('every built-in marker and group has a Chinese name', () => {
  for (const code of Object.keys(BUILTIN_MARKERS)) assert.ok(zhName(code), code);
  for (const g of MARKER_GROUPS) assert.ok(GROUP_ZH[g], g);
  assert.equal(zhName('LDL'), '低密度脂蛋白胆固醇');
  assert.equal(zhName(null), '');
  assert.equal(zhName('MY_OWN'), '');
});
