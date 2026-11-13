import assert from 'node:assert/strict';
import {test} from 'node:test';
import {checkBudgets, parseMeasures} from './perf-check.mjs';

const OUTPUT = `
[perf] tri texte (ref), première fois : 277 ms sans cache, 257 ms avec
[perf] inversion du sens : 334 ms sans cache, 25 ms avec
bruit
[perf] pivot 2 champs : 119 ms
`;

test('lit les deux séries de chaque mesure, ignore le reste', () => {
  const measures = parseMeasures(OUTPUT);
  assert.equal(measures.size, 2);
  assert.deepEqual(measures.get('inversion du sens'), {without: 334, with: 25});
});

test('budget tenu, dépassé, mesure introuvable, seuil sous lequel on ne juge pas', () => {
  const measures = parseMeasures(OUTPUT);
  const ratio = (maxRatio, extra = {}) => ({
    name: 'inversion / premier tri',
    numerator: {label: 'inversion du sens', series: 'with'},
    denominator: {label: 'tri texte (ref), première fois', series: 'with'},
    maxRatio,
    ...extra,
  });
  assert.equal(checkBudgets(measures, [ratio(0.5)]).failures, 0);
  assert.equal(checkBudgets(measures, [ratio(0.05)]).failures, 1);
  assert.equal(checkBudgets(measures, [ratio(0.05, {ignoreBelowMs: 30})]).failures, 0);
  const missing = checkBudgets(measures, [{...ratio(0.5), numerator: {label: 'inconnu', series: 'with'}}]);
  assert.equal(missing.failures, 1);
  assert.match(missing.lines[0], /introuvable/);
});
