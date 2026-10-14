import {provideZonelessChangeDetection} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {NgTableColumn, NgTableComponent} from './ng-table.component';
import {matchesAllFilters, sortRows} from './row-pipeline';

/**
 * Performance du mode live (local) : 100 000 lignes triées et filtrées, recevant des
 * lots de mises à jour, comme un flux de cotations. Mesuré sous jsdom (plus lent qu'un
 * navigateur) : ce qui compte est le rapport entre le pipeline incrémental et un
 * recalcul complet, et le fait que le coût suive la taille du lot.
 */

interface Quote {
  id: number;
  symbol: string;
  sector: string;
  price: number;
  volume: number;
}

const SIZE = 100_000;
const SECTORS = ['Énergie', 'Banque', 'Santé', 'Industrie', 'Tech'];

const quoteAt = (i: number): Quote => ({
  id: i,
  symbol: `SYM${String(i).padStart(6, '0')}`,
  sector: SECTORS[i % SECTORS.length],
  price: ((i * 7919) % 100_000) / 100,
  volume: (i * 104729) % 1_000_000,
});

const columns: NgTableColumn<Quote>[] = [
  {id: 'symbol', header: 'Symbole', valueAccessor: (q) => q.symbol, sortable: true},
  {id: 'sector', header: 'Secteur', valueAccessor: (q) => q.sector, filter: {type: 'enum'}},
  {id: 'price', header: 'Prix', valueAccessor: (q) => q.price, sortable: true},
  {id: 'volume', header: 'Volume', valueAccessor: (q) => q.volume, sortable: true},
];

function report(message: string): void {
  const stdout = (globalThis as {process?: {stdout?: {write(text: string): void}}}).process?.stdout;
  stdout?.write(`[perf] ${message}\n`);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Générateur déterministe : mêmes lots à chaque exécution. */
function random(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

describe('NgTableComponent — performance du mode live (100 000 lignes)', () => {
  let fixture: ComponentFixture<NgTableComponent<Quote>>;
  let current: Quote[];
  const next = random(7);

  beforeEach(async () => {
    TestBed.configureTestingModule({providers: [provideZonelessChangeDetection()]});
    current = Array.from({length: SIZE}, (_, i) => quoteAt(i));
    fixture = TestBed.createComponent(NgTableComponent<Quote>);
    const inputs: Record<string, unknown> = {columns, rows: current, rowKeyAccessor: (q: Quote) => q.id, virtualScroll: true, flashCells: true};
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component['onHeaderSort'](columns[2]);
    component['onHeaderSort'](columns[2]); // prix décroissant
    component['commitFilterValue']('sector', 'Banque,Tech,Santé'); // 60 % des lignes
    await fixture.whenStable();
  });

  afterEach(() => TestBed.resetTestingModule());

  /** Lot de `size` mises à jour de prix aléatoires. */
  function batch(size: number): Quote[] {
    const updates: Quote[] = [];
    for (let k = 0; k < size; k++) {
      const quote = current[Math.floor(next() * SIZE)];
      const moved = {...quote, price: Math.round(quote.price * (0.98 + next() * 0.04) * 100) / 100};
      current[quote.id] = moved;
      updates.push(moved);
    }
    return updates;
  }

  /** Temps du pipeline seul (transaction + filtre/tri), hors rendu. */
  const pipelineTimes: number[] = [];

  async function tick(size: number): Promise<number> {
    const updates = batch(size);
    const started = performance.now();
    fixture.componentInstance.applyTransaction({update: updates});
    fixture.componentInstance.displayedRows();
    pipelineTimes.push(performance.now() - started);
    await fixture.whenStable();
    return performance.now() - started;
  }

  it('applique les lots de mises à jour sans recalcul complet, avec peu de lignes rendues', async () => {
    const component = fixture.componentInstance;
    for (let i = 0; i < 3; i++) {
      await tick(1000); // échauffement
    }
    const rebuildsBefore = component['pipeline'].stats.rebuilds;

    const times: number[] = [];
    pipelineTimes.length = 0;
    for (let i = 0; i < 15; i++) {
      times.push(await tick(1000));
    }
    const tickMs = median(times);
    const pipelineMs = median(pipelineTimes);

    // Référence : ce que faisait la table avant le mode live, filtre + tri complets à chaque lot.
    const filters = {sector: 'Banque,Tech,Santé'};
    const levels = [{column: columns[2], factor: -1}];
    const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
    const fullTimes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const started = performance.now();
      sortRows(current.filter((row) => matchesAllFilters(row, columns, filters)), levels, collator);
      fullTimes.push(performance.now() - started);
    }
    const fullMs = median(fullTimes);

    const rendered = (fixture.nativeElement as HTMLElement).querySelectorAll('tr.data-row').length;
    report(`lot de 1 000 mises à jour sur ${SIZE.toLocaleString('fr-FR')} lignes : ${tickMs.toFixed(1)} ms au total, ` +
      `dont pipeline ${pipelineMs.toFixed(1)} ms (recalcul complet : ${fullMs.toFixed(1)} ms), ${rendered} lignes rendues, ` +
      `~${Math.round(1000 / tickMs * 1000).toLocaleString('fr-FR')} mises à jour/s`);

    expect(component['pipeline'].stats.rebuilds).toBe(rebuildsBefore); // que des fusions
    expect(rendered).toBeLessThan(60);
    expect(tickMs).toBeLessThan(fullMs);
    // Ordre exact après tous les lots : identique à un recalcul complet.
    const expected = sortRows(current.filter((row) => matchesAllFilters(row, columns, filters)), levels, collator).map((q) => q.id);
    expect(component.displayedRows().map((q) => q.id)).toEqual(expected);
  });

  it('le coût suit la taille du lot : 10 mises à jour coûtent nettement moins que 5 000', async () => {
    for (let i = 0; i < 3; i++) {
      await tick(100);
    }
    const small: number[] = [];
    const large: number[] = [];
    for (let i = 0; i < 9; i++) {
      small.push(await tick(10));
      large.push(await tick(5000));
    }
    report(`lot de 10 : ${median(small).toFixed(1)} ms, lot de 5 000 : ${median(large).toFixed(1)} ms`);
    expect(median(small)).toBeLessThan(median(large));
  });
});
