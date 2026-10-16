import {describe, expect, it} from 'vitest';
import {ComputeWorkerClient, ComputeWorkerLike} from './compute-worker-client';
import {compileFilters} from './filter-compile';
import {matchesSearchTerms, searchTerms} from './filter-matching';
import {sortRows} from './row-pipeline';
import type {NgTableColumn} from './ng-table.component';
import {FromWorker, isPackedStrings, packValues, ToWorker, WorkerComputeCore} from './worker-compute';

interface Row {
  id: number;
  name: string;
  amount: number | null;
  zone: string;
  when: Date | null;
}

const collatorOptions: Intl.CollatorOptions = {numeric: true, sensitivity: 'base'};
const collator = new Intl.Collator(undefined, collatorOptions);

const name: NgTableColumn<Row> = {id: 'name', header: 'Nom', valueAccessor: (r) => r.name, filter: {type: 'text'}};
const amount: NgTableColumn<Row> = {id: 'amount', header: 'Montant', valueAccessor: (r) => r.amount, filter: {type: 'number'}};
const zone: NgTableColumn<Row> = {id: 'zone', header: 'Zone', valueAccessor: (r) => r.zone, filter: {type: 'enum'}};
const when: NgTableColumn<Row> = {id: 'when', header: 'Date', valueAccessor: (r) => r.when, filter: {type: 'range'}};
const columns = [name, amount, zone, when];

function makeRows(count: number): Row[] {
  let seed = 11;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const zones = ['Nord', 'Sud', 'Est', 'Ouest'];
  return Array.from({length: count}, (_, id) => ({
    id,
    name: `Client ${Math.floor(next() * 200)} ${next() < 0.1 ? 'é' : 'e'}`,
    amount: next() < 0.05 ? null : Math.round(next() * 1000) / 10,
    zone: zones[Math.floor(next() * 4)],
    when: next() < 0.05 ? null : new Date(Date.UTC(2026, 0, 1 + Math.floor(next() * 120))),
  }));
}

/** Un « worker » qui exécute le cœur dans le même fil, de façon asynchrone : le protocole complet sans vrai Worker. */
function inProcessWorker(): ComputeWorkerLike & {messages: ToWorker[]} {
  const core = new WorkerComputeCore();
  const worker: ComputeWorkerLike & {messages: ToWorker[]} = {
    messages: [],
    onmessage: null,
    onerror: null,
    terminate: () => undefined,
    postMessage(message: ToWorker) {
      worker.messages.push(message);
      const reply = (answer: FromWorker) => setTimeout(() => worker.onmessage?.({data: answer}), 0);
      if (message.type === 'data') {
        core.addData(message.dataset, message.count, message.entries);
      } else if (message.type === 'drop') {
        core.drop(message.dataset);
      } else {
        try {
          reply({type: 'done', job: message.job, order: core.run(message.dataset, message.request)});
        } catch (error) {
          reply({type: 'error', job: message.job, message: String(error)});
        }
      }
    },
  };
  return worker;
}

/** Référence : ce que calcule le fil principal. */
function reference(rows: Row[], filters: Record<string, string>, levels: {column: NgTableColumn<Row>; factor: 1 | -1}[], search = ''): number[] {
  const predicate = compileFilters(columns, filters);
  const terms = searchTerms(search);
  const text = (row: Row) => `${row.name}\n${row.zone}`.toLowerCase();
  const matched = rows.filter((row) => (!predicate || predicate(row)) && (terms.length === 0 || matchesSearchTerms(text(row), terms)));
  return (levels.length ? sortRows(matched, levels, collator) : matched).map((row) => row.id);
}

describe('calcul en worker', () => {
  const rows = makeRows(3000);

  it('packValues : nombres finis en Float64Array, le reste (null, texte, dates) en tableau', () => {
    expect(packValues([{v: 1}, {v: 2.5}], (r) => (r as {v: number}).v)).toBeInstanceOf(Float64Array);
    expect(packValues([{v: 1}, {v: null}], (r) => (r as {v: number | null}).v)).toBeInstanceOf(Array);
    expect(packValues([{v: 'a'}], (r) => (r as {v: string}).v)).toEqual(['a']);
  });

  it('packValues : une grande colonne de textes part en un seul tampon, et revient identique dans le worker', () => {
    const texts = rows.map((row) => row.name);
    const packed = packValues(rows, ((row: Row) => row.name) as (row: never) => unknown);
    expect(isPackedStrings(packed)).toBe(true);
    const core = new WorkerComputeCore();
    core.addData(9, rows.length, {'s:name': packed});
    const order = core.run(9, {filters: {}, filterSpecs: {}, levels: [{columnId: 'name', factor: 1}], terms: [], collator: {options: collatorOptions}});
    expect([...order].map((index) => texts[index])).toEqual([...texts].sort((a, b) => collator.compare(a, b)));
    // Une valeur contenant le séparateur, ou une valeur vide, garde le tableau d'origine.
    expect(isPackedStrings(packValues([...rows.slice(0, 1500).map(() => 'a'), 'b\u0000c'].map((value) => ({value})), (r) => (r as {value: string}).value))).toBe(false);
    expect(isPackedStrings(packValues([...rows.slice(0, 1500).map(() => 'a'), null].map((value) => ({value})), (r) => (r as {value: string | null}).value))).toBe(false);
  });

  const scenarios: {label: string; filters: Record<string, string>; levels: {column: NgTableColumn<Row>; factor: 1 | -1}[]; search?: string}[] = [
    {label: 'tri numérique croissant, vides en dernier', filters: {}, levels: [{column: amount, factor: 1}]},
    {label: 'tri texte décroissant', filters: {}, levels: [{column: name, factor: -1}]},
    {label: 'tri sur deux niveaux (zone puis montant)', filters: {}, levels: [{column: zone, factor: 1}, {column: amount, factor: -1}]},
    {label: 'tri sur une date', filters: {}, levels: [{column: when, factor: 1}]},
    {label: 'filtre texte', filters: {name: 'client 1'}, levels: []},
    {label: 'filtre numérique', filters: {amount: '>50'}, levels: []},
    {label: 'filtre enum multiple', filters: {zone: 'Nord,Sud'}, levels: []},
    {label: 'filtre de période', filters: {when: '2026-02-01..2026-02-28'}, levels: []},
    {label: 'filtres combinés + tri', filters: {zone: 'Est', amount: '<=40'}, levels: [{column: amount, factor: -1}]},
    {label: 'recherche globale + tri', filters: {}, levels: [{column: name, factor: 1}], search: 'client 7 ouest'},
  ];

  for (const scenario of scenarios) {
    it(`même résultat que le fil principal : ${scenario.label}`, () => {
      const core = new WorkerComputeCore();
      const entries: Record<string, ReturnType<typeof packValues>> = {};
      for (const column of columns) {
        entries[`v:${column.id}`] = packValues(rows, column.valueAccessor as (row: never) => unknown);
        entries[`s:${column.id}`] = packValues(rows, ((row: Row) => {
          const value = column.valueAccessor(row);
          return value instanceof Date || typeof value === 'number' || typeof value === 'string' ? value : null;
        }) as (row: never) => unknown);
      }
      entries['h'] = rows.map((row) => `${row.name}\n${row.zone}`.toLowerCase());
      core.addData(1, rows.length, entries);

      const order = core.run(1, {
        filters: scenario.filters,
        filterSpecs: Object.fromEntries(columns.map((column) => [column.id, {type: column.filter?.type}])),
        levels: scenario.levels.map((level) => ({columnId: level.column.id, factor: level.factor})),
        terms: searchTerms(scenario.search ?? ''),
        collator: {options: collatorOptions},
      });
      expect([...order].map((index) => rows[index].id)).toEqual(reference(rows, scenario.filters, scenario.levels, scenario.search));
    });
  }

  it('le client n’envoie chaque colonne qu’une fois par jeu de données, puis seulement les réglages', async () => {
    const worker = inProcessWorker();
    const client = new ComputeWorkerClient(() => worker);
    const input = (filters: Record<string, string>, levels: {column: NgTableColumn<Row>; factor: 1 | -1}[]) => ({
      filterColumns: columns.filter((column) => filters[column.id]),
      filters,
      levels,
      search: null,
      collator: {options: collatorOptions},
    });
    const dataMessages = () => worker.messages.filter((message) => message.type === 'data').length;

    const first = await client.compute(rows, input({zone: 'Nord'}, [{column: amount, factor: 1}]));
    expect([...first.order].map((index) => rows[index].id)).toEqual(reference(rows, {zone: 'Nord'}, [{column: amount, factor: 1}]));
    expect(dataMessages()).toBe(1);

    await client.compute(rows, input({zone: 'Sud'}, [{column: amount, factor: -1}]));
    expect(dataMessages()).toBe(1); // mêmes colonnes, mêmes données : rien de renvoyé

    await client.compute(rows, input({}, [{column: name, factor: 1}]));
    expect(dataMessages()).toBe(2); // une colonne de plus

    const changed = [...rows];
    await client.compute(changed, input({}, [{column: amount, factor: 1}]));
    expect(worker.messages.some((message) => message.type === 'drop')).toBe(true);
    expect(dataMessages()).toBe(3); // autres données : on renvoie
    client.dispose();
  });

  it('une réponse périmée est reconnue par isLatest, une erreur du worker rejette la demande', async () => {
    const worker = inProcessWorker();
    const client = new ComputeWorkerClient(() => worker);
    const base = {filterColumns: [], filters: {}, search: null, collator: {options: collatorOptions}};
    const older = client.compute(rows, {...base, levels: [{column: amount, factor: 1}]});
    const newer = client.compute(rows, {...base, levels: [{column: amount, factor: -1}]});
    const [a, b] = await Promise.all([older, newer]);
    expect(client.isLatest(a.job)).toBe(false);
    expect(client.isLatest(b.job)).toBe(true);

    await expect(client.compute(rows, {...base, filterColumns: [name], filters: {name: 'x'}, levels: []}).then(() => 'ok')).resolves.toBe('ok');
    worker.onerror?.({message: 'plantage'});
    // Un nouveau worker est créé à la demande suivante.
    await expect(client.compute(rows, {...base, levels: []})).resolves.toBeDefined();
    client.dispose();
  });
});
