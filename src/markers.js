// Built-in marker catalogue + normalisation. Phase 3 completes this list and adds
// matchMarker(nameAsPrinted) and toStd(value, unit, markerCode).
// toStd factors: multiply a value in that unit to get unitStd.
export const MARKER_GROUPS = ['Blood count', 'Lipids', 'Glucose', 'Liver', 'Kidney', 'Thyroid', 'Urine', 'Body'];

export const BUILTIN_MARKERS = {
  CHOL_TOTAL: { name: 'Total cholesterol', group: 'Lipids', unitStd: 'mmol/L', aliases: ['Total Cholesterol', 'T. Chol', 'Cholesterol'], toStd: { 'mg/dL': 0.02586 } },
  LDL:        { name: 'LDL cholesterol', group: 'Lipids', unitStd: 'mmol/L', aliases: ['LDL-C', 'LDL-Cholesterol', 'LDL Cholesterol'], toStd: { 'mg/dL': 0.02586 } },
  HDL:        { name: 'HDL cholesterol', group: 'Lipids', unitStd: 'mmol/L', aliases: ['HDL-C', 'HDL-Cholesterol', 'HDL Cholesterol'], toStd: { 'mg/dL': 0.02586 } },
  TG:         { name: 'Triglycerides', group: 'Lipids', unitStd: 'mmol/L', aliases: ['Triglyceride', 'TG'], toStd: { 'mg/dL': 0.01129 } },
  FBG:        { name: 'Fasting blood glucose', group: 'Glucose', unitStd: 'mmol/L', aliases: ['Glucose (Fasting)', 'FBS', 'Fasting Glucose'], toStd: { 'mg/dL': 0.0555 } },
  HBA1C:      { name: 'HbA1c', group: 'Glucose', unitStd: '%', aliases: ['Glycated Haemoglobin', 'HbA1c', 'A1C'], toStd: {} },
  ALT:        { name: 'ALT', group: 'Liver', unitStd: 'U/L', aliases: ['SGPT', 'Alanine Aminotransferase', 'ALT (SGPT)'], toStd: {} },
  AST:        { name: 'AST', group: 'Liver', unitStd: 'U/L', aliases: ['SGOT', 'Aspartate Aminotransferase', 'AST (SGOT)'], toStd: {} },
  CREAT:      { name: 'Creatinine', group: 'Kidney', unitStd: 'µmol/L', aliases: ['Creatinine', 'Serum Creatinine'], toStd: { 'mg/dL': 88.4 } },
  EGFR:       { name: 'eGFR', group: 'Kidney', unitStd: 'mL/min/1.73m²', aliases: ['eGFR', 'Estimated GFR'], toStd: {} },
  URIC:       { name: 'Uric acid', group: 'Kidney', unitStd: 'µmol/L', aliases: ['Uric Acid', 'Urate'], toStd: { 'mg/dL': 59.48 } },
  TSH:        { name: 'TSH', group: 'Thyroid', unitStd: 'mIU/L', aliases: ['TSH', 'Thyroid Stimulating Hormone'], toStd: { 'µIU/mL': 1 } },
  HB:         { name: 'Haemoglobin', group: 'Blood count', unitStd: 'g/dL', aliases: ['Hemoglobin', 'Haemoglobin', 'Hb'], toStd: { 'g/L': 0.1 } },
  WBC:        { name: 'White cells', group: 'Blood count', unitStd: '10^9/L', aliases: ['WBC', 'White Blood Cell', 'Total White Cell Count'], toStd: {} },
  PLT:        { name: 'Platelets', group: 'Blood count', unitStd: '10^9/L', aliases: ['Platelet', 'PLT', 'Platelet Count'], toStd: {} },
  WEIGHT:     { name: 'Weight', group: 'Body', unitStd: 'kg', aliases: ['Weight', 'Body Weight'], toStd: {} },
  BMI:        { name: 'BMI', group: 'Body', unitStd: 'kg/m²', aliases: ['BMI', 'Body Mass Index'], toStd: {} },
  SBP:        { name: 'Systolic BP', group: 'Body', unitStd: 'mmHg', aliases: ['Systolic', 'SBP'], toStd: {} },
  DBP:        { name: 'Diastolic BP', group: 'Body', unitStd: 'mmHg', aliases: ['Diastolic', 'DBP'], toStd: {} },
};

// Flag from the printed range when the report gives none.
export function computeFlag(value, refLow, refHigh) {
  if (value == null || Number.isNaN(Number(value))) return null;
  if (refLow != null && value < refLow) return 'L';
  if (refHigh != null && value > refHigh) return 'H';
  if (refLow == null && refHigh == null) return null;
  return 'N';
}
