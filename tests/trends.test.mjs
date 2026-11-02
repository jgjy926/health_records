import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeResult } from '../src/markers.js';
import {
  markerSeries, latestBand, yearRows, chartableMarkers, resultsCsv, flaggedCards, sparklineSvg, lineChartSvg,
} from '../src/trends.js';

const rep = (date, ...results) => ({ id: `r-${date}`, date, provider: 'Lab', type: 'Blood test', fasting: false, results: results.map(r => normalizeResult(r)) });
const ldl = (value, unit = 'mmol/L', refText = '< 3.0') => ({ nameAsPrinted: 'LDL-C', value, unit, refText });

const REPORTS = [
  rep('2026-03-01', ldl(3.9), { nameAsPrinted: 'Urine Protein', value: 'Trace' }),
  rep('2024-05-10', ldl(116, 'mg/dL', '< 100')),
  rep('2025-02-20', ldl(3.0), { nameAsPrinted: 'HDL-C', value: 1.4, unit: 'mmol/L' }),
  rep('2025-11-20', ldl(3.2)),
];

test('series: oldest first, standard units, text results stay out', () => {
  const s = markerSeries(REPORTS, 'LDL');
  assert.deepEqual(s.map(p => p.date), ['2024-05-10', '2025-02-20', '2025-11-20', '2026-03-01']);
  assert.equal(s[0].value, 2.9998, 'mg/dL converted');
  assert.equal(s[0].refHigh, 2.586, 'range converted too');
  assert.equal(s[3].flag, 'H');
  assert.deepEqual(markerSeries(REPORTS, 'U_PROTEIN'), []);
});

test('band comes from the newest report with a range', () => {
  assert.deepEqual(latestBand(markerSeries(REPORTS, 'LDL')), { low: null, high: 3 });
  assert.equal(latestBand(markerSeries(REPORTS, 'HDL')), null);
  assert.equal(latestBand([]), null);
});

test('year table: last value of each year, change from the year before', () => {
  const rows = yearRows(markerSeries(REPORTS, 'LDL'));
  assert.deepEqual(rows.map(r => r.year), ['2024', '2025', '2026']);
  assert.deepEqual(rows.map(r => r.value), [2.9998, 3.2, 3.9]);
  assert.equal(rows[0].change, null);
  assert.equal(rows[2].change, 0.7);
});

test('chartable markers: numeric only, most results first', () => {
  assert.deepEqual(chartableMarkers(REPORTS), ['LDL', 'HDL']);
});

test('CSV: header, oldest first, quoting and formula guard', () => {
  const csv = resultsCsv([rep('2026-01-01', { nameAsPrinted: '=HYPERLINK("x"), bad', value: 'a"b', unit: '' }), rep('2025-01-01', ldl(3))]);
  const lines = csv.trim().split('\r\n');
  assert.ok(lines[0].startsWith('date,provider,type,fasting,marker'));
  assert.ok(lines[1].startsWith('2025-01-01,Lab,Blood test,no,LDL cholesterol,LDL-C,3,mmol/L'));
  assert.ok(lines[2].includes(`"'=HYPERLINK(""x""), bad"`));
  assert.ok(lines[2].includes('"a""b"'));
});

test('CSV: a negative number is not treated as a formula', () => {
  assert.ok(resultsCsv([rep('2026-01-01', { nameAsPrinted: 'X', value: -1 })]).includes(',-1,'));
});

test('Overview cards: latest report flags with up to four points', () => {
  const sorted = [...REPORTS].sort((a, b) => b.date.localeCompare(a.date));
  const cards = flaggedCards(sorted);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].name, 'LDL cholesterol');
  assert.equal(cards[0].points.length, 4);
  assert.deepEqual(flaggedCards([]), []);
});

test('charts draw, with the range band, and a single point has no line', () => {
  const s = markerSeries(REPORTS, 'LDL');
  const svg = lineChartSvg(s, latestBand(s), 'LDL', 600);
  assert.ok(svg.includes('c-band'));
  assert.ok(svg.includes('c-line'));
  assert.ok(svg.includes('>H</text>'));
  assert.ok(!svg.includes('NaN'));
  const one = lineChartSvg(s.slice(0, 1), null, 'x', 600);
  assert.ok(!one.includes('c-line'));
  assert.ok(!one.includes('NaN'));
  assert.ok(!sparklineSvg(s, latestBand(s)).includes('NaN'));
  assert.equal(sparklineSvg([], null), '');
});

test('chart label is escaped', () => {
  assert.ok(lineChartSvg(markerSeries(REPORTS, 'LDL'), null, '<b>', 600).includes('&lt;b&gt;'));
});
