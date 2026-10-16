import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  computed,
  createComponent,
  EnvironmentInjector,
  inject,
  signal,
} from '@angular/core';
import {DecimalPipe} from '@angular/common';
import {AllCommunityModule, ColDef, createGrid, GridApi, ModuleRegistry} from 'ag-grid-community';
import {NgTableColumn, NgTableComponent} from '@sbourahla/ng-table';

ModuleRegistry.registerModules([AllCommunityModule]);

interface Row {
  id: number;
  ref: string;
  client: string;
  statut: string;
  montant: number;
  date: string;
  actif: boolean;
}

const CLIENTS = Array.from({length: 500}, (_, i) => `Client ${String(i).padStart(3, '0')}`);
const STATUTS = ['Brouillon', 'Validée', 'Expédiée', 'Annulée'];

function makeRows(count: number): Row[] {
  return Array.from({length: count}, (_, i) => ({
    id: i,
    ref: `CMD-${String((i * 7919) % count).padStart(7, '0')}`,
    client: CLIENTS[(i * 31) % CLIENTS.length],
    statut: STATUTS[i % 4],
    montant: ((i * 7919) % 100_000) / 10,
    date: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
    actif: i % 3 === 0,
  }));
}

/** Une grille, vue par le benchmark : mêmes opérations, quel que soit son moteur. */
interface Adapter {
  readonly name: string;
  mount(host: HTMLElement, rows: Row[]): void;
  sort(columnIds: string[], descending?: boolean): void;
  clearSort(): void;
  filterText(columnId: string, value: string): void;
  filterNumberAbove(columnId: string, value: number): void;
  clearFilters(): void;
  scrollTo(index: number): void;
  update(rows: Row[]): void;
  destroy(): void;
}

class NgTableAdapter implements Adapter {
  readonly name: string;
  private ref: ComponentRef<NgTableComponent<Row>> | null = null;
  /** Un calcul en worker est en cours (jamais vrai hors mode worker). */
  private busy = false;
  /** Résultat du worker au moment de expectCompute() : un résultat différent signale la fin du calcul attendu. */
  private resultBefore: unknown = null;

  constructor(
    private readonly injector: EnvironmentInjector,
    private readonly appRef: ApplicationRef,
    private readonly worker = false,
  ) {
    this.name = worker ? 'ng-table (worker)' : 'ng-table';
  }

  /** Résolu quand le résultat de la dernière opération est affiché (hors mode worker : tout de suite). */
  async idle(expectCompute = false): Promise<void> {
    await macrotask();
    await macrotask();
    // (computing) passe par la détection de changements : un calcul court peut y passer sans jamais apparaître. On attend
    // donc un nouveau résultat (le signal du worker), pas un drapeau.
    const deadline = performance.now() + 120_000;
    while ((this.busy || (this.worker && expectCompute && this.workerResult() === this.resultBefore)) && performance.now() < deadline) {
      await macrotask();
    }
  }

  /** À appeler juste avant une opération qui lance un calcul en worker. */
  expectCompute(): void {
    this.resultBefore = this.workerResult();
  }

  private workerResult(): unknown {
    return (this.ref!.instance as unknown as Record<string, () => unknown>)['workerResult']();
  }

  mount(host: HTMLElement, rows: Row[]): void {
    const columns: NgTableColumn<Row>[] = [
      {id: 'ref', header: 'Référence', valueAccessor: (r) => r.ref, sortable: true, filter: {type: 'text'}},
      {id: 'client', header: 'Client', valueAccessor: (r) => r.client, sortable: true, filter: {type: 'text'}},
      {id: 'statut', header: 'Statut', valueAccessor: (r) => r.statut, sortable: true},
      {id: 'montant', header: 'Montant', valueAccessor: (r) => r.montant, sortable: true, filter: {type: 'number'}},
      {id: 'date', header: 'Date', valueAccessor: (r) => r.date, sortable: true},
      {id: 'actif', header: 'Actif', valueAccessor: (r) => r.actif},
    ];
    this.ref = createComponent(NgTableComponent<Row>, {environmentInjector: this.injector, hostElement: host});
    const inputs: Record<string, unknown> = {
      columns,
      rows,
      rowKeyAccessor: (r: Row) => r.id,
      virtualScroll: true,
      maxHeight: '480px',
      density: 'compact',
      multiSort: true,
      ...(this.worker ? {workerCompute: true, workerThreshold: 1} : {}),
    };
    for (const [name, value] of Object.entries(inputs)) {
      this.ref.setInput(name, value);
    }
    this.ref.instance.computing.subscribe((busy) => (this.busy = busy));
    this.appRef.attachView(this.ref.hostView);
  }

  sort(columnIds: string[], descending = false): void {
    this.ref!.instance.applyQueryState({sorts: columnIds.map((columnId) => ({columnId, direction: descending ? 'desc' : 'asc'}))});
  }

  clearSort(): void {
    this.ref!.instance.applyQueryState({sorts: []});
  }

  filterText(columnId: string, value: string): void {
    this.ref!.instance.applyQueryState({filters: {[columnId]: value}});
  }

  filterNumberAbove(columnId: string, value: number): void {
    this.ref!.instance.applyQueryState({filters: {[columnId]: `>${value}`}});
  }

  clearFilters(): void {
    this.ref!.instance.applyQueryState({filters: {}});
  }

  scrollTo(index: number): void {
    this.ref!.instance.scrollToIndex(index);
  }

  update(rows: Row[]): void {
    this.ref!.instance.applyTransaction({update: rows});
  }

  destroy(): void {
    if (this.ref) {
      this.appRef.detachView(this.ref.hostView);
      this.ref.destroy();
      this.ref = null;
    }
  }
}

class AgGridAdapter implements Adapter {
  readonly name = 'AG Grid Community';
  private api: GridApi<Row> | null = null;

  mount(host: HTMLElement, rows: Row[]): void {
    const columnDefs: ColDef<Row>[] = [
      {field: 'ref', headerName: 'Référence', sortable: true, filter: 'agTextColumnFilter'},
      {field: 'client', headerName: 'Client', sortable: true, filter: 'agTextColumnFilter'},
      {field: 'statut', headerName: 'Statut', sortable: true},
      {field: 'montant', headerName: 'Montant', sortable: true, filter: 'agNumberColumnFilter'},
      {field: 'date', headerName: 'Date', sortable: true},
      {field: 'actif', headerName: 'Actif'},
    ];
    this.api = createGrid<Row>(host, {
      columnDefs,
      rowData: rows,
      getRowId: (params) => String(params.data.id),
      animateRows: false,
      rowHeight: 36,
      defaultColDef: {flex: 1, minWidth: 90},
    });
  }

  sort(columnIds: string[], descending = false): void {
    this.api!.applyColumnState({
      state: columnIds.map((colId, index) => ({colId, sort: descending ? ('desc' as const) : ('asc' as const), sortIndex: index})),
      defaultState: {sort: null},
    });
  }

  clearSort(): void {
    this.api!.applyColumnState({defaultState: {sort: null}});
  }

  filterText(columnId: string, value: string): void {
    this.api!.setFilterModel({[columnId]: {filterType: 'text', type: 'contains', filter: value}});
  }

  filterNumberAbove(columnId: string, value: number): void {
    this.api!.setFilterModel({[columnId]: {filterType: 'number', type: 'greaterThan', filter: value}});
  }

  clearFilters(): void {
    this.api!.setFilterModel(null);
  }

  scrollTo(index: number): void {
    this.api!.ensureIndexVisible(index, 'top');
  }

  update(rows: Row[]): void {
    this.api!.applyTransaction({update: rows});
  }

  destroy(): void {
    this.api?.destroy();
    this.api = null;
  }
}

interface Scenario {
  id: string;
  label: string;
  /** Prépare l'état, sans le mesurer (retour à l'état initial entre deux mesures). */
  reset?: (grid: Adapter) => void;
  run: (grid: Adapter, ctx: {rows: Row[]; size: number; run: number}) => void;
}

const SCENARIOS: Scenario[] = [
  {id: 'sort-number', label: 'Tri numérique (montant)', reset: (g) => g.clearSort(), run: (g) => g.sort(['montant'])},
  {id: 'sort-text', label: 'Tri texte, valeurs distinctes (référence)', reset: (g) => g.clearSort(), run: (g) => g.sort(['ref'])},
  {id: 'sort-two', label: 'Tri sur deux niveaux (client, montant)', reset: (g) => g.clearSort(), run: (g) => g.sort(['client', 'montant'])},
  {id: 'filter-text', label: 'Filtre texte « contient »', reset: (g) => g.clearFilters(), run: (g) => g.filterText('client', 'client 12')},
  {id: 'filter-number', label: 'Filtre numérique « > 5 000 »', reset: (g) => g.clearFilters(), run: (g) => g.filterNumberAbove('montant', 5000)},
  {
    id: 'scroll',
    label: 'Saut à 90 % de la liste',
    // Sans tri ni filtre : les scénarios précédents ne doivent pas laisser leur état à ceux qui suivent.
    reset: (g) => {
      g.clearSort();
      g.clearFilters();
      g.scrollTo(0);
    },
    run: (g, {size}) => g.scrollTo(Math.floor(size * 0.9)),
  },
  {
    id: 'live',
    label: '1 000 mises à jour d\'un coup (lot)',
    reset: (g) => {
      g.clearSort();
      g.clearFilters();
    },
    run: (g, {rows, run}) => {
      const batch: Row[] = [];
      for (let k = 0; k < 1000; k++) {
        const row = rows[(k * 97 + run * 13) % rows.length];
        batch.push({...row, montant: row.montant + 1});
      }
      g.update(batch);
    },
  },
];


/** Scénarios du banc « calcul en worker » : les trois opérations les plus lourdes pour le fil principal. */
const WORKER_SCENARIOS = SCENARIOS.filter((scenario) => ['sort-number', 'sort-text', 'filter-text'].includes(scenario.id));

interface WorkerMeasure {
  /** Plus longue période sans que le fil principal réponde, 1re fois puis ensuite (médiane). */
  freezeCold: number;
  freezeWarm: number;
  /** Temps jusqu'au résultat affiché, 1re fois puis ensuite (médiane). */
  totalCold: number;
  totalWarm: number;
}

interface WorkerResult {
  size: number;
  modes: Record<string, Record<string, WorkerMeasure>>;
  finishedAt: string;
}

/**
 * Pendant `operation`, relève la plus longue durée entre deux tours de la boucle d'événements : c'est le gel perçu par
 * l'utilisateur (saisie, défilement, animations).
 */
async function withFreezeProbe(operation: () => Promise<void>): Promise<{freeze: number; total: number}> {
  let stop = false;
  let longest = 0;
  let last = performance.now();
  const beat = (async () => {
    while (!stop) {
      await macrotask();
      const now = performance.now();
      longest = Math.max(longest, now - last);
      last = now;
    }
  })();
  const started = performance.now();
  last = started;
  await operation();
  const total = performance.now() - started;
  stop = true;
  await beat;
  return {freeze: longest, total};
}
/** Médiane en millisecondes de chaque scénario (de l’appel à l’image suivante affichée). */
type Measure = Record<string, number>;

interface Result {
  size: number;
  mode: 'frames' | 'layout';
  grids: Record<string, Measure>;
  heapMb: Record<string, number | null>;
  finishedAt: string;
}

/**
 * Comment on attend que l'opération soit « finie » : `frames` (deux images peintes, la mesure la plus fidèle) ou
 * `layout` (deux tours de boucle d'événements puis une mise en page forcée : tout sauf la peinture). `layout` sert
 * quand le navigateur ne fournit pas d'images (fenêtre masquée, mesure automatisée) : le rapport l'indique.
 */
let settleMode: 'frames' | 'layout' = 'frames';

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    const timeout = setTimeout(resolve, 1000);
    requestAnimationFrame(() => {
      clearTimeout(timeout);
      resolve();
    });
  });

/** Tour de boucle d'événements par `MessageChannel` : `setTimeout` est ralenti à 1 s par seconde dans une fenêtre masquée. */
const macrotask = (): Promise<void> =>
  new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });

async function settle(): Promise<void> {
  if (settleMode === 'frames') {
    await nextFrame();
    await nextFrame();
    return;
  }
  await macrotask();
  document.body.getBoundingClientRect(); // force le calcul des styles et la mise en page
  await macrotask();
  document.body.getBoundingClientRect();
}

/** `frames` si le navigateur peint des images, `layout` sinon. */
async function detectSettleMode(): Promise<'frames' | 'layout'> {
  const painted = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 400);
    requestAnimationFrame(() => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
  return painted ? 'frames' : 'layout';
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/**
 * Benchmark comparatif : les mêmes opérations sur les mêmes données, dans le même navigateur, une grille à la
 * fois. Chaque mesure va de l'appel de l'opération à la fin de l'image qui suit (le rendu est donc compté) ; on
 * garde la médiane de plusieurs passages. Aucun réglage particulier n'est fait pour l'une ou l'autre grille.
 */
@Component({
  selector: 'app-benchmark-demo',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .controls { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: center; margin-bottom: 12px; }
    .controls select, .controls button { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--demo-border); font: inherit; }
    table.results { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
    table.results th, table.results td { padding: 6px 10px; border-bottom: 1px solid var(--demo-border); text-align: right; }
    table.results th:first-child, table.results td:first-child { text-align: left; }
    .win { font-weight: 700; color: #15803d; }
    .hint { margin: 8px 0 0; color: var(--demo-muted); }
    .stage { height: 480px; width: 100%; overflow: hidden; border: 1px solid var(--demo-border); border-radius: 8px; }
    pre.report { margin: 12px 0 0; padding: 10px; background: var(--demo-bg); border-radius: 8px; overflow: auto; font-size: .75rem; }
  `,
  template: `
    <p class="demo-intro">
      Mêmes opérations sur les mêmes données, dans le même navigateur, une grille à la fois. Chaque mesure court de
      l'appel de l'opération (tri, filtre, saut, lot de mises à jour) à la fin de l'image qui suit : <b>le rendu est compté</b>.
      Médiane de {{ runs }} passages. Aucun réglage particulier pour l'une ou l'autre grille (défilement virtuel,
      lignes compactes, pas d'animation).
    </p>

    <div class="demo-card">
      <h2>Lancer la comparaison</h2>
      <div class="controls">
        <label>Lignes
          <select (change)="size.set(+$any($event.target).value)" [disabled]="running()">
            @for (option of sizes; track option) {
              <option [selected]="option === size()" [value]="option">{{ option.toLocaleString('fr-FR') }}</option>
            }
          </select>
        </label>
        <button (click)="start()" [disabled]="running()" type="button">{{ running() ? 'Mesure en cours…' : 'Lancer' }}</button>
        @if (progress()) {
          <span>{{ progress() }}</span>
        }
      </div>
      <p class="hint">
        Pendant la mesure, ne touchez pas à la fenêtre et gardez-la au premier plan (un onglet masqué fausse les images).
        Les résultats dépendent de la machine : comparez les deux colonnes entre elles, pas avec un autre poste.
      </p>
    </div>

    <div class="demo-card" style="margin-top: 16px">
      <h2>Résultats</h2>
      @if (result(); as r) {
        <table class="results">
          <thead>
            <tr>
              <th>Opération ({{ r.size.toLocaleString('fr-FR') }} lignes)</th>
              <th>ng-table (ms)</th>
              <th>AG Grid (ms)</th>
              <th>Rapport</th>
            </tr>
          </thead>
          <tbody>
            @for (row of table(); track row.id) {
              <tr>
                <td>{{ row.label }}</td>
                <td [class.win]="row.ngWins">{{ row.ng }}</td>
                <td [class.win]="!row.ngWins">{{ row.ag }}</td>
                <td>{{ row.ratio }}</td>
              </tr>
            }
          </tbody>
        </table>
        <p class="hint">
          Mesure : {{ r.mode === 'frames' ? 'jusqu’à la deuxième image peinte' : 'jusqu’à la mise en page, sans peinture (le navigateur ne fournissait pas d’images)' }}.
          Mémoire du moteur JavaScript après chargement : ng-table {{ heap(r, 'ng-table') }}, AG Grid {{ heap(r, 'AG Grid Community') }}
          (indicatif : le ramasse-miettes n'est pas forcé). Rapport = temps AG Grid / temps ng-table : supérieur à 1, ng-table est plus rapide.
        </p>
        <button (click)="copy()" type="button">Copier le rapport (Markdown)</button>
        <pre class="report">{{ report() }}</pre>
      } @else {
        <p class="hint">Aucune mesure pour l'instant.</p>
      }
    </div>

    <div class="demo-card" style="margin-top: 16px">
      <h2>Calcul en Web Worker</h2>
      <p class="hint">
        Compare ng-table sur le fil principal et avec <code>[workerCompute]</code> : le <b>gel</b> est la plus longue durée sans
        réponse du fil principal pendant l'opération (ce que l'utilisateur ressent), le <b>total</b> le temps jusqu'au résultat affiché.
        Chaque cellule donne la 1re fois (avec l'envoi des colonnes au worker) puis la médiane des suivantes.
      </p>
      <div class="controls">
        <button (click)="startWorker()" [disabled]="running()" type="button">{{ running() ? 'Mesure en cours…' : 'Mesurer le worker' }}</button>
      </div>
      @if (workerResult(); as w) {
        <table class="results">
          <thead>
            <tr><th>Opération ({{ w.size.toLocaleString('fr-FR') }} lignes)</th><th>Gel, fil principal</th><th>Gel, worker</th><th>Total, fil principal</th><th>Total, worker</th></tr>
          </thead>
          <tbody>
            @for (row of workerRows(); track row.id) {
              <tr>
                <td>{{ row.label }}</td>
                <td>{{ row.main.freezeCold | number: '1.0-0' }} / {{ row.main.freezeWarm | number: '1.0-0' }} ms</td>
                <td [class.win]="row.worker.freezeWarm < row.main.freezeWarm">{{ row.worker.freezeCold | number: '1.0-0' }} / {{ row.worker.freezeWarm | number: '1.0-0' }} ms</td>
                <td>{{ row.main.totalCold | number: '1.0-0' }} / {{ row.main.totalWarm | number: '1.0-0' }} ms</td>
                <td>{{ row.worker.totalCold | number: '1.0-0' }} / {{ row.worker.totalWarm | number: '1.0-0' }} ms</td>
              </tr>
            }
          </tbody>
        </table>
        <button (click)="copyWorker()" type="button">Copier le rapport (Markdown)</button>
        <pre class="report">{{ workerReport() }}</pre>
      }
    </div>

    <div class="demo-card" style="margin-top: 16px">
      <h2>Grille mesurée</h2>
      <div #stage class="stage" aria-hidden="true"></div>
    </div>
  `,
})
export class BenchmarkDemoComponent {
  private readonly injector = inject(EnvironmentInjector);
  private readonly appRef = inject(ApplicationRef);

  protected readonly sizes = [10_000, 100_000, 1_000_000];
  protected readonly size = signal(100_000);
  protected readonly runs = 5;
  protected readonly running = signal(false);
  protected readonly progress = signal('');
  protected readonly result = signal<Result | null>(null);
  protected readonly workerResult = signal<WorkerResult | null>(null);
  protected readonly workerRows = computed(() => {
    const r = this.workerResult();
    if (!r) {
      return [];
    }
    return WORKER_SCENARIOS.map((scenario) => {
      const main = r.modes['ng-table'][scenario.id];
      const worker = r.modes['ng-table (worker)'][scenario.id];
      const f = (value: number) => Math.round(value).toLocaleString('fr-FR');
      return {id: scenario.id, label: scenario.label, main, worker, text: `| ${scenario.label} | ${f(main.freezeCold)} / ${f(main.freezeWarm)} | ${f(worker.freezeCold)} / ${f(worker.freezeWarm)} | ${f(main.totalCold)} / ${f(main.totalWarm)} | ${f(worker.totalCold)} / ${f(worker.totalWarm)} |`};
    });
  });
  protected readonly workerReport = computed(() => {
    const r = this.workerResult();
    if (!r) {
      return '';
    }
    return [
      `Calcul en worker — ng-table, ${r.size.toLocaleString('fr-FR')} lignes, ${r.finishedAt}`,
      `Navigateur : ${navigator.userAgent} — ${navigator.hardwareConcurrency} coeurs logiques`,
      'Chaque cellule : 1re fois / ensuite (médiane). Gel = plus longue durée sans réponse du fil principal ; total = jusqu\'au résultat affiché.',
      '',
      '| Opération | Gel, fil principal (ms) | Gel, worker (ms) | Total, fil principal (ms) | Total, worker (ms) |',
      '|---|---:|---:|---:|---:|',
      ...this.workerRows().map((row) => row.text),
    ].join('\n');
  });
  protected readonly table = computed(() => {
    const r = this.result();
    if (!r) {
      return [];
    }
    return [{id: 'load', label: 'Chargement des lignes (premier affichage)'}, ...SCENARIOS].map((scenario) => {
      const ng = r.grids['ng-table'][scenario.id];
      const ag = r.grids['AG Grid Community'][scenario.id];
      return {
        id: scenario.id,
        label: scenario.label,
        ng: Math.round(ng),
        ag: Math.round(ag),
        ngWins: ng <= ag,
        ratio: ng > 0 ? `${(ag / ng).toFixed(2)} ×` : '—',
      };
    });
  });

  protected readonly report = computed(() => {
    const r = this.result();
    if (!r) {
      return '';
    }
    const lines = [
      `Benchmark ng-table / AG Grid Community ${AG_VERSION} — ${r.size.toLocaleString('fr-FR')} lignes, médiane de ${this.runs} passages, ${r.finishedAt}`,
      `Navigateur : ${navigator.userAgent} — ${navigator.hardwareConcurrency} coeurs logiques`,
      r.mode === 'frames' ? 'Mesure : jusqu’à la deuxième image peinte.' : 'Mesure : jusqu’à la mise en page (sans peinture : le navigateur ne fournissait pas d’images).',
      '',
      '| Opération | ng-table (ms) | AG Grid (ms) | Rapport |',
      '|---|---:|---:|---:|',
      ...this.table().map((row) => `| ${row.label} | ${row.ng} | ${row.ag} | ${row.ratio} |`),
    ];
    return lines.join('\n');
  });

  protected heap(result: Result, grid: string): string {
    const value = result.heapMb[grid];
    return value === null || value === undefined ? 'n/d' : `${value.toFixed(0)} Mo`;
  }

  protected async copy(): Promise<void> {
    await navigator.clipboard?.writeText(this.report());
  }

  /** Gel du fil principal et temps total d'un tri / filtre, avec et sans worker, sur les mêmes lignes. */
  protected async startWorker(): Promise<void> {
    if (this.running()) {
      return;
    }
    this.running.set(true);
    settleMode = await detectSettleMode();
    const size = this.size();
    const rows = makeRows(size);
    const stage = document.querySelector<HTMLElement>('.stage')!;
    const modes: WorkerResult['modes'] = {};
    const adapters = [new NgTableAdapter(this.injector, this.appRef), new NgTableAdapter(this.injector, this.appRef, true)];
    try {
      for (const adapter of adapters) {
        this.progress.set(`Worker : ${adapter.name} : chargement…`);
        stage.replaceChildren();
        const host = document.createElement('div');
        host.style.height = '100%';
        stage.appendChild(host);
        await settle();
        adapter.mount(host, rows);
        await settle();
        modes[adapter.name] = {};
        for (const scenario of WORKER_SCENARIOS) {
          this.progress.set(`Worker : ${adapter.name} : ${scenario.label}…`);
          const freezes: number[] = [];
          const totals: number[] = [];
          for (let run = 0; run < this.runs; run++) {
            scenario.reset?.(adapter);
            await adapter.idle();
            await settle();
            const probe = await withFreezeProbe(async () => {
              adapter.expectCompute();
              scenario.run(adapter, {rows, size, run});
              await adapter.idle(true);
              await settle();
            });
            freezes.push(probe.freeze);
            totals.push(probe.total);
          }
          modes[adapter.name][scenario.id] = {
            freezeCold: freezes[0],
            freezeWarm: median(freezes.slice(1)),
            totalCold: totals[0],
            totalWarm: median(totals.slice(1)),
          };
        }
        adapter.destroy();
        stage.replaceChildren();
        await settle();
      }
      this.workerResult.set({size, modes, finishedAt: new Date().toLocaleString('fr-FR')});
      this.progress.set('Terminé.');
    } catch (error) {
      this.progress.set(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
      adapters.forEach((adapter) => adapter.destroy());
    } finally {
      this.running.set(false);
    }
  }

  protected async copyWorker(): Promise<void> {
    await navigator.clipboard?.writeText(this.workerReport());
  }

  protected async start(): Promise<void> {
    if (this.running()) {
      return;
    }
    this.running.set(true);
    settleMode = await detectSettleMode();
    const size = this.size();
    const rows = makeRows(size);
    const stage = document.querySelector<HTMLElement>('.stage')!;
    const adapters: Adapter[] = [new NgTableAdapter(this.injector, this.appRef), new AgGridAdapter()];
    const grids: Record<string, Measure> = {};
    const heapMb: Record<string, number | null> = {};
    try {
      for (const adapter of adapters) {
        const measure: Measure = {};
        this.progress.set(`${adapter.name} : chargement…`);
        await settle();
        const heapBefore = heapUsedMb();
        const loadTimes: number[] = [];
        for (let pass = 0; pass < 3; pass++) {
          stage.replaceChildren();
          const host = document.createElement('div');
          host.style.height = '100%';
          stage.appendChild(host);
          await settle();
          const started = performance.now();
          adapter.mount(host, rows);
          await settle();
          loadTimes.push(performance.now() - started);
          if (pass < 2) {
            adapter.destroy();
          }
        }
        measure['load'] = median(loadTimes);
        const heapAfter = heapUsedMb();
        heapMb[adapter.name] = heapBefore !== null && heapAfter !== null ? Math.max(0, heapAfter - heapBefore) : null;

        for (const scenario of SCENARIOS) {
          this.progress.set(`${adapter.name} : ${scenario.label}…`);
          const times: number[] = [];
          for (let run = 0; run < this.runs; run++) {
            scenario.reset?.(adapter);
            await settle();
            const started = performance.now();
            scenario.run(adapter, {rows, size, run});
            await settle();
            times.push(performance.now() - started);
          }
          measure[scenario.id] = median(times);
        }
        grids[adapter.name] = measure;
        adapter.destroy();
        stage.replaceChildren();
        await settle();
      }
      this.result.set({size, mode: settleMode, grids, heapMb, finishedAt: new Date().toLocaleString('fr-FR')});
      this.progress.set('Terminé.');
    } catch (error) {
      this.progress.set(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
      adapters.forEach((adapter) => adapter.destroy());
    } finally {
      this.running.set(false);
    }
  }
}

/** Version d'AG Grid mesurée (celle de `benchmarks/package.json`). */
const AG_VERSION = '34';

function heapUsedMb(): number | null {
  const memory = (performance as unknown as {memory?: {usedJSHeapSize: number}}).memory;
  return memory ? memory.usedJSHeapSize / 1_048_576 : null;
}
