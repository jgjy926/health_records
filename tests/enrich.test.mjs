import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnrichedJson, parseLabReply, cleanLabReply, buildPrompt, buildAttachPrompt, normalizeEnriched } from '../src/enrich.js';
import { groupLines } from '../src/parse.js';
import { isPdf } from '../src/add.js';

const REPLY = {
  report: { date: '2026-03-15', provider: 'Lab', type: 'Annual checkup', fasting: true },
  results: [{ nameAsPrinted: 'LDL-C', value: 3.4, unit: 'mmol/L', refLow: null, refHigh: 3, refText: '< 3.0', flag: 'H', confidence: 0.9 }],
};

test('forgiving parse: fences, prose, stray quotes, trailing commas', () => {
  assert.deepEqual(parseEnrichedJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseEnrichedJson('Here you go:\n{"a":1}\nDone.'), { a: 1 });
  assert.deepEqual(parseEnrichedJson('{"a":"say "hi" now"}'), { a: 'say "hi" now' });
  assert.deepEqual(parseEnrichedJson('{"a":[1,2,],}'), { a: [1, 2] });
  assert.deepEqual(parseEnrichedJson('[{"a":1}]'), [{ a: 1 }]);
  assert.throws(() => parseEnrichedJson(''), /Nothing to import/);
  assert.throws(() => parseEnrichedJson('sorry, no'), /No JSON/);
  assert.throws(() => parseEnrichedJson('{"a": nope}'), /Not valid JSON/);
});

test('a lab reply comes through with its fields and entryType ai', () => {
  const { report, results } = parseLabReply('```json\n' + JSON.stringify(REPLY) + '\n```');
  assert.deepEqual(report, { date: '2026-03-15', provider: 'Lab', type: 'Annual checkup', fasting: true });
  assert.equal(results[0].nameAsPrinted, 'LDL-C');
  assert.equal(results[0].refHigh, 3);
  assert.equal(results[0].entryType, 'ai');
});

test('bare array and records wrapper are accepted', () => {
  assert.equal(normalizeEnriched([{ a: 1 }]).results.length, 1);
  assert.equal(parseLabReply(JSON.stringify(REPLY.results)).results.length, 1);
  assert.equal(parseLabReply(JSON.stringify({ records: REPLY.results })).results.length, 1);
});

test('untrusted reply: unknown fields dropped, bad types cleaned, junk rows removed', () => {
  const { report, results } = cleanLabReply({
    report: { date: 'last week', provider: { a: 1 }, fasting: 'yes', evil: 1 },
    results: [
      { nameAsPrinted: 'X', value: 'Negative', flag: 'BAD', confidence: 'high', refLow: '1', evil: '<script>', marker: 'LDL' },
      { nameAsPrinted: '', value: 1 }, { nameAsPrinted: 'No value' }, null, 'text',
    ],
  });
  assert.equal(report.date, '');
  assert.equal(report.fasting, false);
  assert.equal(results.length, 1);
  assert.equal(results[0].flag, null);
  assert.equal(results[0].confidence, null);
  assert.equal(results[0].refLow, null);
  assert.ok(!('evil' in results[0]));
  assert.ok(!('marker' in results[0]));
});

test('a reply with no results is an error', () => {
  assert.throws(() => cleanLabReply({ report: {} }), /no "results"/);
  assert.throws(() => cleanLabReply({ results: [] }), /no results/);
});

test('the prompt carries the text inside markers and the schema', () => {
  const p = buildPrompt('LDL 3.4 [MASKED]');
  assert.ok(p.includes('<<<REPORT\nLDL 3.4 [MASKED]\nREPORT>>>'));
  assert.ok(p.includes('"nameAsPrinted"'));
  assert.ok(/only data/i.test(p));
});

const item = (str, x, y, width = 40, height = 10) => ({ str, width, height, transform: [1, 0, 0, 1, x, y] });

test('text lines group by y and read left to right', () => {
  const text = groupLines([
    item('mmol/L', 200, 700), item('LDL', 50, 700), item('3.4', 150, 700.5),
    item('Header', 50, 750), item('HDL', 50, 680), item('1.5', 150, 680),
  ]);
  assert.deepEqual(text.split('\n'), ['Header', 'LDL   3.4 mmol/L', 'HDL   1.5']);
});

test('text lines ignore blank items', () => {
  assert.equal(groupLines([item(' ', 10, 10), item('', 20, 10)]), '');
});

test('only real PDFs pass the header check', () => {
  assert.equal(isPdf(new TextEncoder().encode('%PDF-1.7 ...')), true);
  assert.equal(isPdf(new TextEncoder().encode('<html>')), false);
  assert.equal(isPdf(new Uint8Array(0)), false);
});

test('attach prompt asks Claude to drop identifiers and keeps the schema', () => {
  const p = buildAttachPrompt();
  assert.match(p, /attached as a PDF or image/);
  assert.match(p, /personal identifiers/);
  assert.match(p, /"nameAsPrinted"/);
  assert.match(p, /single ```json code block/);
  assert.doesNotMatch(p, /\[MASKED\]|<<<REPORT/);
});
