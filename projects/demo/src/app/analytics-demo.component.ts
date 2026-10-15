import {ChangeDetectionStrategy, Component, computed, effect, signal, untracked, viewChild} from '@angular/core';
import {
  computePivot,
  NgTableChartComponent,
  NgTableChartData,
  NgTableChartType,
  NgTableColumn,
  NgTableComponent,
  NgTablePivotComponent,
  PivotConfig,
  PivotDatasource,
  PivotField,
  pivotCellKey,
  pivotColumnFields,
  pivotToServerResult,
} from '@sbourahla/ng-table';
import {Commande, generateCommandes, STATUT_LABELS} from './demo-data';
import {fetchDossiers, SpringCommandesApi, springPivot, UNREACHABLE} from './spring-commandes-api';

type Source = 'local' | 'fake' | 'spring';

const FIELDS: Record<string, PivotField<Commande>> = {
  client: {id: 'client', header: 'Client', accessor: (c) => c.client},
  statut: {id: 'statut', header: 'Statut', accessor: (c) => STATUT_LABELS[c.statut]},
  mois: {id: 'mois', header: 'Mois', accessor: (c) => c.dateCommande.slice(0, 7)},
  urgent: {id: 'urgent', header: 'Urgent', accessor: (c) => (c.urgent ? 'Oui' : 'Non')},
};

const MONTANT: PivotField<Commande> = {id: 'montant', header: 'Montant', accessor: (c) => c.montant};
/** « Quantité » n'existe que dans le navigateur : la base Spring Boot n'a pas cette colonne. */
const MEASURES: PivotField<Commande>[] = [MONTANT, {id: 'quantite', header: 'Quantité', accessor: (c) => (Number(c.id) % 7) + 1}];

const CHART_TYPES: {value: NgTableChartType; label: string}[] = [
  {value: 'bar', label: 'Barres'},
  {value: 'line', label: 'Courbes'},
  {value: 'area', label: 'Zones'},
  {value: 'pie', label: 'Secteurs'},
  {value: 'donut', label: 'Anneau'},
];

interface FileNode {
  id: string;
  name: string;
  size: number;
  parent: string | null;
}

const LOCAL_FILES: FileNode[] = [
  {id: 'docs', name: 'Documents', size: 0, parent: null},
  {id: 'cv', name: 'CV.pdf', size: 30, parent: 'docs'},
  {id: 'tax', name: 'Impôts', size: 0, parent: 'docs'},
  {id: 'tax25', name: 'Déclaration 2025.pdf', size: 210, parent: 'tax'},
  {id: 'tax26', name: 'Déclaration 2026.pdf', size: 200, parent: 'tax'},
  {id: 'pics', name: 'Images', size: 0, parent: null},
  {id: 'cat', name: 'chat.jpg', size: 900, parent: 'pics'},
  {id: 'trip', name: 'Voyage', size: 0, parent: 'pics'},
  {id: 'trip1', name: 'plage.jpg', size: 1500, parent: 'trip'},
  {id: 'trip2', name: 'montagne.jpg', size: 1700, parent: 'trip'},
  {id: 'code', name: 'Projets', size: 0, parent: null},
  {id: 'ngt', name: 'ng-table', size: 4200, parent: 'code'},
];

/**
 * Analyse : tableau croisé dynamique, graphiques intégrés, mini-graphiques et arbre. Les données viennent au
 * choix du navigateur, d'un serveur simulé, ou du vrai backend Spring Boot (`examples/spring-boot-backend`) :
 * le pivot est alors calculé par la base (`GROUP BY`), l'arbre et les lignes viennent de ses endpoints.
 */
@Component({
  selector: 'app-analytics-demo',
  standalone: true,
  imports: [NgTableComponent, NgTablePivotComponent, NgTableChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .controls { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: center; margin-bottom: 12px; }
    .controls label { display: inline-flex; gap: 6px; align-items: center; }
    .controls select { padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(15, 23, 42, .25); font: inherit; }
    .two { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
    @media (min-width: 1100px) { .two { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); } }
    .hint { margin: 8px 0 0; color: #4f6573; }
    .error { color: #b3261e; font-weight: 600; }
  `,
  template: `
    <p class="demo-intro">
      Trois outils d'analyse : un <b>pivot</b> (lignes × colonnes, agrégats, totaux), des <b>graphiques</b> dessinés en SVG
      à partir de n'importe quelle plage de cellules, et des <b>mini-graphiques</b> dans les cellules. Choisissez d'où
      viennent les données : le navigateur, un serveur simulé, ou le vrai backend Spring Boot.
    </p>

    <div class="demo-card">
      <h2>Source des données</h2>
      <div class="controls" role="radiogroup" aria-label="Source des données">
        <label><input (change)="source.set('local')" [checked]="source() === 'local'" name="source" type="radio"/> Navigateur (calcul local)</label>
        <label><input (change)="source.set('fake')" [checked]="source() === 'fake'" name="source" type="radio"/> Serveur simulé (400 ms)</label>
        <label><input (change)="source.set('spring')" [checked]="source() === 'spring'" name="source" type="radio"/> Spring Boot (localhost:8080, base H2)</label>
      </div>
      @if (error()) {
        <p class="error" role="alert">
          {{ error() }}. Lancez le backend : <code>cd examples/spring-boot-backend</code> puis <code>./mvnw spring-boot:run</code>
          (<code>mvnw.cmd</code> sous Windows).
        </p>
      }
    </div>

    <div class="demo-card" style="margin-top: 16px">
      <h2>Tableau croisé dynamique</h2>
      <p class="hint">
        Glissez des champs entre les zones — ou une colonne du tableau « Commandes » plus bas, directement depuis son en-tête.
        Plusieurs champs sont possibles en lignes comme en colonnes.
      </p>
      <div class="controls">
        <span aria-label="Type de graphique" role="group">
          @for (t of chartTypes; track t.value) {
            <button (click)="pivotChartType.set(t.value)" [attr.aria-pressed]="pivotChartType() === t.value" type="button">{{ t.label }}</button>
          }
        </span>
      </div>
      <div class="two">
        <ng-table-pivot [(config)]="pivotConfig" [configurator]="true" [datasource]="pivotDatasource()" [dimensions]="dimensions"
                        [measures]="measures()" [rows]="commandes" [statusBar]="true" ariaLabel="Pivot des commandes" density="compact"
                        (pivotError)="reportError($event)"/>
        <ng-table-chart [data]="pivotChart()" [title]="chartTitle()" [type]="pivotChartType()"/>
      </div>
    </div>

    <div class="demo-card" style="margin-top: 16px">
      <h2>Zoom sur un graphique</h2>
      <p class="hint">365 jours, 600 points au plus dessinés (pics et creux gardés). Glissez sur le tracé pour zoomer sur une période, Ctrl + molette, ou les boutons ; double-clic pour tout revoir.</p>
      <ng-table-chart [data]="daily" [height]="300" title="Ventes journalières" type="area"/>
    </div>

    <div class="demo-card" style="margin-top: 16px">
      <h2>Données arborescentes</h2>
      <p class="hint">
        Dossiers à plat (<code>treeParent</code>) — {{ files().length.toLocaleString('fr-FR') }} lignes
        {{ source() === 'spring' ? 'envoyées par Spring Boot (/api/dossiers)' : 'du navigateur' }}. Dépliez avec le chevron ou Alt+→ / Alt+←,
        triez, filtrez (les dossiers parents restent affichés).
      </p>
      <div class="controls">
        <button (click)="tree.expandAllTree()" type="button">Tout déplier</button>
        <button (click)="tree.collapseAllTree()" type="button">Tout replier</button>
      </div>
      <ng-table #tree [columns]="treeColumns" [rows]="files()" [treeData]="true" [treeParent]="fileParent" [rowKeyAccessor]="fileKey"
                [treeDefaultExpanded]="1" [cellNavigation]="true" [globalSearchEnabled]="true" [statusBar]="true" [paginator]="true"
                [pageSizeOptions]="[25, 100, 500]" [pageSize]="100" ariaLabel="Fichiers" density="compact"/>
    </div>

    <div class="demo-card" style="margin-top: 16px">
      <h2>Commandes : plage de cellules, graphique, mini-graphiques</h2>
      <p class="hint">
        Sélectionnez une plage (glisser, ou Maj+clic) qui contient une colonne de texte et au moins une colonne numérique.
        {{ source() === 'spring' ? 'Les 40 premières commandes et leur tendance viennent de Spring Boot.' : '' }}
      </p>
      <div class="two">
        <ng-table #rangeTable [columns]="columns" [rows]="commandesTable()" [rangeSelection]="true" [statusBar]="true" [paginator]="true"
                  [pageSizeOptions]="[10, 25]" [rowKeyAccessor]="commandeKey" ariaLabel="Commandes" density="compact"/>
        <div>
          <span aria-label="Type de graphique de la plage" role="group">
            @for (t of chartTypes; track t.value) {
              <button (click)="rangeChartType.set(t.value)" [attr.aria-pressed]="rangeChartType() === t.value" type="button">{{ t.label }}</button>
            }
          </span>
          @if (rangeTable.rangeChartData(); as data) {
            <ng-table-chart [data]="data" [type]="rangeChartType()" title="Plage sélectionnée"/>
          } @else {
            <p class="hint">Aucune plage numérique sélectionnée.</p>
          }
        </div>
      </div>
    </div>
  `,
})
export class AnalyticsDemoComponent {
  private readonly pivot = viewChild.required(NgTablePivotComponent);

  protected readonly source = signal<Source>('local');
  protected readonly error = signal('');
  private readonly spring = new SpringCommandesApi();

  /** Données du pivot en mode « navigateur » et « serveur simulé » (le serveur simulé pivote ces mêmes lignes). */
  protected readonly commandes = generateCommandes(240);
  protected readonly commandesTable = signal<Commande[]>(generateCommandes(40));
  protected readonly files = signal<FileNode[]>(LOCAL_FILES);

  /** Une année de ventes journalières, déterministe : de quoi tester le zoom. */
  protected readonly daily: NgTableChartData = (() => {
    const categories: string[] = [];
    const values: number[] = [];
    for (let day = 0; day < 365; day++) {
      const date = new Date(2026, 0, 1 + day);
      categories.push(date.toISOString().slice(0, 10));
      values.push(Math.round(100 + 40 * Math.sin(day / 20) + ((day * 7919) % 31) + (day % 90 === 0 ? 150 : 0)));
    }
    return {categories, series: [{name: 'Ventes', values}]};
  })();

  protected readonly commandeKey = (commande: Commande): string => commande.id;
  protected readonly fileKey = (file: FileNode): string => file.id;
  protected readonly fileParent = (file: FileNode): string | null => file.parent;
  protected readonly chartTypes = CHART_TYPES;
  protected readonly pivotChartType = signal<NgTableChartType>('bar');
  protected readonly rangeChartType = signal<NgTableChartType>('bar');

  protected readonly dimensions = Object.values(FIELDS);
  protected readonly measures = computed(() => (this.source() === 'spring' ? [MONTANT] : MEASURES));

  protected readonly pivotConfig = signal<PivotConfig<Commande>>({
    rows: [FIELDS['client']],
    columns: [FIELDS['statut']],
    values: [{...MONTANT, aggregate: 'sum'}],
  });

  /** Faux serveur : pivote les commandes comme le ferait une base de données, après un délai. */
  private readonly fakeServer: PivotDatasource = async (request, {signal}) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (signal.aborted) {
      throw new DOMException('Annulé', 'AbortError');
    }
    const config: PivotConfig<Commande> = {
      rows: request.rows.map((id) => FIELDS[id]),
      columns: request.columns.map((id) => FIELDS[id]),
      values: request.values.map((value) => ({...MEASURES.find((m) => m.id === value.id)!, aggregate: value.aggregate})),
      columnSort: request.columnSort,
    };
    return pivotToServerResult(computePivot(this.commandes, config), config as PivotConfig<unknown>);
  };

  protected readonly pivotDatasource = computed<PivotDatasource | null>(() => {
    const source = this.source();
    return source === 'spring' ? springPivot : source === 'fake' ? this.fakeServer : null;
  });

  constructor() {
    effect(() => {
      const source = this.source();
      untracked(() => void this.loadSource(source));
    });
  }

  private async loadSource(source: Source): Promise<void> {
    this.error.set('');
    // « Quantité » n'existe pas dans la base : on retire la valeur du pivot plutôt que d'envoyer une requête refusée.
    if (source === 'spring' && this.pivotConfig().values.some((value) => value.id !== MONTANT.id)) {
      this.pivotConfig.update((config) => ({...config, values: [{...MONTANT, aggregate: 'sum'}]}));
    }
    if (source !== 'spring') {
      this.commandesTable.set(generateCommandes(40));
      this.files.set(LOCAL_FILES);
      return;
    }
    try {
      const [page, dossiers] = await Promise.all([
        this.spring.query({sort: {columnId: '', direction: ''}, sorts: [], filters: {}, search: '', page: {index: 0, size: 40}}),
        fetchDossiers(),
      ]);
      if (this.source() === 'spring') {
        this.commandesTable.set(page.rows);
        this.files.set(dossiers);
      }
    } catch (error) {
      this.reportError(error);
    }
  }

  protected reportError(error: unknown): void {
    this.error.set(error instanceof Error && error.message !== UNREACHABLE ? error.message : UNREACHABLE);
  }

  protected readonly chartTitle = computed(() => {
    const value = this.pivotConfig().values[0];
    const label = {sum: 'Somme', avg: 'Moyenne', min: 'Minimum', max: 'Maximum', count: 'Nombre'}[value?.aggregate ?? 'sum'];
    return value ? `${label} de ${value.header.toLowerCase()}` : 'Pivot';
  });

  /**
   * Un graphique du pivot, quelle que soit sa source : une catégorie par ligne, une série par colonne du pivot
   * (ou une seule série quand il n'y a pas de champ en colonne). Les totaux ne sont pas des séries.
   */
  protected readonly pivotChart = computed<NgTableChartData>(() => {
    const {result} = this.pivot().model();
    const config = this.pivotConfig();
    const value = config.values[0];
    if (result.rows.length === 0 || !value) {
      return {categories: [], series: []};
    }
    const hasColumns = pivotColumnFields(config).length > 0;
    const series = result.columnKeys.map((key, position) => ({
      name: hasColumns ? result.columnPaths[position].join(' / ') || '—' : value.header,
      values: result.rows.map((row) => row.cells[pivotCellKey(key, value.id)] ?? null),
    }));
    return {categories: result.rows.map((row) => row.labels.join(' / ')), series};
  });

  protected readonly treeColumns: NgTableColumn<FileNode>[] = [
    {id: 'name', header: 'Nom', valueAccessor: (f) => f.name, sortable: true, filter: {type: 'text'}},
    {id: 'size', header: 'Taille (Ko)', valueAccessor: (f) => f.size || '', sortable: true, sortValueAccessor: (f) => f.size},
  ];

  /** Les en-têtes de ces colonnes se glissent dans le pivot : leur identifiant est celui d'un champ du pivot. */
  protected readonly columns: NgTableColumn<Commande>[] = [
    {id: 'client', header: 'Client', valueAccessor: (c) => c.client, sortable: true},
    {id: 'statut', header: 'Statut', valueAccessor: (c) => STATUT_LABELS[c.statut], sortable: true},
    {id: 'urgent', header: 'Urgent', valueAccessor: (c) => (c.urgent ? 'Oui' : 'Non'), sortable: true},
    {id: 'montant', header: 'Montant (€)', valueAccessor: (c) => c.montant, sortable: true},
    {
      id: 'tendance',
      header: 'Tendance (courbe)',
      valueAccessor: (c) => c.tendance,
      sortValueAccessor: (c) => c.tendance?.[c.tendance.length - 1],
      sortable: true,
      sparkline: {type: 'area'},
      exportValueAccessor: (c) => (c.tendance ?? []).join(' '),
    },
    {id: 'volume', header: 'Volume (barres)', valueAccessor: (c) => c.tendance, sparkline: {type: 'bar', color: '#e07a3f'}},
  ];

}
