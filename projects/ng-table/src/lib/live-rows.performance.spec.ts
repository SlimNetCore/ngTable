import {describe, expect, it} from 'vitest';
import {IncrementalPipeline, PipelineConfig, RowStore} from './live-rows';
import type {NgTableColumn} from './ng-table.component';

interface Row {
  id: number;
  montant: number;
}

const keyOf = (row: Row) => row.id;
const collator = new Intl.Collator('fr', {numeric: true});
const montant: NgTableColumn<Row> = {id: 'montant', header: 'Montant', valueAccessor: (row) => row.montant};
const SIZE = 1_000_000;

function report(message: string): void {
  const stdout = (globalThis as {process?: {stdout?: {write(text: string): void}}}).process?.stdout;
  stdout?.write(`[perf] ${message}\n`);
}

function batch(rows: readonly Row[], run: number): Row[] {
  const updates: Row[] = [];
  for (let k = 0; k < 1000; k++) {
    const row = rows[(k * 97 + run * 13) % rows.length];
    updates.push({...row, montant: row.montant + 1});
  }
  return updates;
}

describe('live-rows : lots de mises à jour sur 1 000 000 de lignes', () => {
  const rows: Row[] = Array.from({length: SIZE}, (_, id) => ({id, montant: (id * 7919) % 100_000}));
  const sums = [{id: 'montant', value: (row: Row) => row.montant}];

  function measure(label: string, cfg: PipelineConfig<Row>, expectedOrder: (a: Row[]) => Row[]) {
    const store = new RowStore(keyOf);
    const pipeline = new IncrementalPipeline<Row>();
    store.replaceAll(rows);
    pipeline.compute(store, cfg);

    const timings: number[] = [];
    const current = rows.slice();
    for (let run = 0; run < 4; run++) {
      const updates = batch(rows, run);
      const start = performance.now();
      store.applyTransaction({update: updates});
      const result = pipeline.compute(store, cfg);
      timings.push(performance.now() - start);
      for (const row of updates) {
        current[row.id] = row;
      }
      if (run === 3) {
        // Le résultat doit rester celui d'un recalcul complet.
        const expected = expectedOrder(current);
        for (const index of [0, 1, 500_000, SIZE - 1]) {
          expect(result[index]).toBe(expected[index]);
        }
        expect(result.length).toBe(expected.length);
      }
    }
    report(`lot de 1 000 mises à jour sur 1 M de lignes (${label}) : 1er ${timings[0].toFixed(0)} ms, suivants ${timings.slice(1).map((t) => t.toFixed(0)).join(' / ')} ms`);
    return timings;
  }

  it('sans tri ni filtre', () => {
    const cfg: PipelineConfig<Row> = {matches: () => true, levels: [], collator, deps: [], sums};
    measure('sans tri', cfg, (all) => all);
  }, 120_000);

  it('avec un tri numérique', () => {
    const cfg: PipelineConfig<Row> = {matches: () => true, levels: [{column: montant, factor: 1}], collator, deps: ['tri'], sums};
    measure('tri numérique', cfg, (all) => all.slice().sort((a, b) => a.montant - b.montant || a.id - b.id));
  }, 120_000);
});
