import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskText, maskMore, findLeaks, MASK_TOKEN } from '../src/mask.js';

const profile = { displayName: 'Me', maskNames: ['TAN AH KOW'] };
const out = (text, p = profile) => maskText(text, p).masked;

test('Malaysian IC with and without dashes', () => {
  for (const ic of ['880101-14-5678', '880101145678', '880101 14 5678']) {
    assert.ok(!out(`IC ${ic} here`).includes('5678'), ic);
  }
});

test('IC-shaped text inside a longer number is left alone', () => {
  assert.ok(out('Ref1234567890123456').includes('1234567890123456'));
});

test('phones', () => {
  for (const phone of ['012-345 6789', '0123456789', '+6012-345 6789', '+60 12 345 6789', '011-2345 6789', '03-1234 5678', '+65 6123 4567']) {
    const m = out(`call ${phone} now`);
    assert.ok(m.includes(MASK_TOKEN) && !/\d{4}/.test(m), `${phone} -> ${m}`);
  }
});

test('emails', () => {
  assert.equal(out('send to Someone.Else+x@mail.example.com.'), `send to ${MASK_TOKEN}.`);
});

test('passport-like ids', () => {
  assert.ok(!out('A12345678').includes('12345678'));
});

test('names with odd spacing and case', () => {
  for (const n of ['TAN AH KOW', 'Tan Ah Kow', 'tan  ah   kow', 'Tan\nAh Kow', 'TANAHKOW', 'T A N  A H  K O W', 'Tan. Ah. Kow']) {
    const m = out(`Results for ${n} attached`);
    assert.equal(m, `Results for ${MASK_TOKEN} attached`, n);
  }
});

test('parts of a name are masked; a short display name is skipped', () => {
  assert.ok(!out('Mr Kow came').includes('Kow'));
  assert.ok(out('Give me a call, me too').includes('me too'), '"Me" is too short to mask');
  assert.ok(!out('Results for Ahmad', { displayName: 'Ahmad', maskNames: [] }).includes('Ahmad'));
});

test('bin/binti do not get masked alone, but the whole name is', () => {
  const p = { displayName: 'Mum', maskNames: ['SITI AISHAH BINTI ABDULLAH'] };
  assert.ok(out('Bin number 4', p).includes('Bin number'));
  assert.equal(out('SITI AISHAH BINTI ABDULLAH', p), MASK_TOKEN);
  assert.ok(!out('Puan Aishah', p).includes('Aishah'));
});

test('names are not masked inside other words', () => {
  assert.ok(out('Tandem Kowloon').includes('Tandem Kowloon'));
});

test('address lines', () => {
  const lines = ['No. 12, Jalan Mawar 3', 'Taman Bunga Raya', 'Lot 45 Kampung Baru', '47301 Petaling Jaya', 'Selangor Darul Ehsan', '50450 Kuala Lumpur, Malaysia', 'Alamat: 8 Lorong Satu'];
  for (const line of lines) assert.ok(!out(`Header\n${line}\nFooter`).includes(line.split(' ').pop()), line);
  assert.ok(out('Header\nNo. 12, Jalan Mawar 3\nFooter').startsWith('Header\n'));
  assert.ok(out('Header\nNo. 12, Jalan Mawar 3\nFooter').endsWith('\nFooter'));
});

test('labelled identifiers', () => {
  const cases = ['MRN: H1234567', 'Patient Name: Someone Unknown', 'Patient ID : 998877', 'Lab No: 26-0099', 'Accession No: AX100',
    'NRIC: 123', 'Nama: Orang Lain', 'DOB: 01/02/1988', 'Date of Birth: 1 Feb 1988', 'Doctor: Lim Boon Keng', 'Ref No: 8765', 'Referred by: Klinik Sihat', 'Tel: 12345'];
  for (const line of cases) {
    const m = out(line);
    const value = line.split(':')[1].trim();
    assert.ok(!m.includes(value), `${line} -> ${m}`);
    assert.ok(m.includes(MASK_TOKEN), line);
  }
});

test('label value stops at the next column', () => {
  const m = out('Name: Someone Unknown     Report Date: 15/03/2026');
  assert.ok(!m.includes('Someone'));
  assert.ok(m.includes('Report Date: 15/03/2026'));
});

test('doctor titles', () => {
  assert.ok(!out('Reviewed by Dr. Lim Boon Keng').includes('Lim'));
  assert.ok(!out('Dr Lim').includes('Lim'));
});

test('lab results survive untouched', () => {
  const lines = [
    'LDL-Cholesterol   3.4   mmol/L   < 3.0   H',
    'HDL Cholesterol   1.5   mmol/L   1.0 - 2.0',
    'Glucose (Fasting)   5.2   mmol/L   3.9 - 6.0',
    'Creatinine   88   umol/L   62 - 106',
    'White Blood Cell   6.50   x10^9/L   4.0 - 11.0',
    'Platelet Count   250   x10^9/L   150 - 400',
    'HbA1c   5.6   %   4.0 - 6.0',
    'Urine Protein   Negative',
    'Report Date: 15/03/2026',
    'Fasting: Yes',
    'ALT (SGPT)  32  U/L  < 41',
    'TSH  1.25  mIU/L  0.27 - 4.20',
    'Specific Gravity  1.020  1.005 - 1.030',
  ];
  for (const line of lines) assert.equal(out(line), line, line);
});

test('hits give positions in the original text, and overlaps merge', () => {
  const text = 'IC 880101-14-5678 ok';
  const { hits, masked } = maskText(text, profile);
  assert.equal(hits.length, 1);
  assert.equal(text.slice(hits[0].start, hits[0].end), '880101-14-5678');
  assert.equal(hits[0].kind, 'ic');
  assert.equal(masked, `IC ${MASK_TOKEN} ok`);
  assert.equal(maskText('IC No: 880101-14-5678', profile).masked.split(MASK_TOKEN).length, 2);
});

test('masking is stable when run twice', () => {
  const once = out('Name: Someone  IC 880101-14-5678  TAN AH KOW  3.4 mmol/L');
  assert.equal(out(once), once);
});

test('empty input and no profile', () => {
  assert.deepEqual(maskText('', null), { masked: '', hits: [] });
  assert.equal(maskText(null, null).masked, '');
  assert.ok(!maskText('880101-14-5678', undefined).masked.includes('880101'));
});

test('tap to mask hits every whole occurrence only', () => {
  assert.equal(maskMore('Klinik Sihat, klinik, Sihat2 Sihat', 'Sihat'), `Klinik ${MASK_TOKEN}, klinik, Sihat2 ${MASK_TOKEN}`);
  assert.equal(maskMore('a.b (x)', 'a.b'), `${MASK_TOKEN} (x)`);
  assert.equal(maskMore(`x ${MASK_TOKEN}`, MASK_TOKEN), `x ${MASK_TOKEN}`);
});

test('findLeaks catches an identifier typed back in', () => {
  assert.deepEqual(findLeaks(`${MASK_TOKEN} LDL 3.4 mmol/L`, profile), []);
  assert.deepEqual(findLeaks('oops 880101-14-5678', profile), ['ic']);
  assert.deepEqual(findLeaks('Tan Ah Kow', profile), ['name']);
});
