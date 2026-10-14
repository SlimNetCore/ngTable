import {ChangeDetectionStrategy, Component, computed, signal} from '@angular/core';
import {
  buildPivotModel,
  computePivot,
  NgTableChartComponent,
  NgTableChartData,
  NgTableChartType,
  NgTableColumn,
  NgTableComponent,
  NgTablePivotComponent,
  PivotAggregate,
  PivotConfig,
  PivotDatasource,
  PivotField,
  pivotToServerResult,
} from '@sbourahla/ng-table';
import {Commande, generateCommandes, STATUT_LABELS} from './demo-data';

interface FileNode {
  id: string;
  name: string;
  size: number;
  parent: string | null;
}

interface CommandeAvecTendance extends Commande {
  /** Six derniers mois (fictifs, déterministes) : de quoi dessiner des mini-graphiques. */
  tendance: number[];
}

const FIELDS: Record<string, PivotField<Commande>> = {
  client: {id: 'client', header: 'Client', accessor: (c) => c.client},
  statut: {id: 'statut', header: 'Statut', accessor: (c) => STATUT_LABELS[c.statut]},
  mois: {id: 'mois', header: 'Mois', accessor: (c) => c.dateCommande.slice(0, 7)},
  urgent: {id: 'urgent', header: 'Urgent', accessor: (c) => (c.urgent ? 'Oui' : 'Non')},
};

const MEASURES: PivotField<Commande>[] = [
  {id: 'montant', header: 'Montant', accessor: (c) => c.montant},
  {id: 'quantite', header: 'Quantité', accessor: (c) => (Number(c.id) % 7) + 1},
];

const CHART_TYPES: {value: NgTableChartType; label: string}[] = [
  {value: 'bar', label: 'Barres'},
  {value: 'line', label: 'Courbes'},
  {value: 'area', label: 'Zones'},
  {value: 'pie', label: 'Secteurs'},
  {value: 'donut', label: 'Anneau'},
];

/**
 * Analyse : tableau croisé dynamique, graphiques intégrés et mini-graphiques dans les cellules.
 * Tout est calculé côté navigateur à partir des mêmes `Commande`.
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
  `,
  template: `
    <p class="demo-intro">
      Trois outils d'analyse : un <b>pivot</b> (lignes × colonnes, agrégats, totaux), des <b>graphiques</b> dessinés en SVG
      à partir de n'importe quelle plage de cellules, et des <b>mini-graphiques</b> dans les cellules.
    </p>

    <div class="demo-card">
      <h2>Tableau croisé dynamique</h2>
      <div class="controls">
        <label><input (change)="server.set($any($event.target).checked)" [checked]="server()" type="checkbox"/> Calcul par le serveur (simulé, 400 ms)</label>
        <span aria-label="Type de graphique" role="group">
          @for (t of chartTypes; track t.value) {
            <button (click)="pivotChartType.set(t.value)" [attr.aria-pressed]="pivotChartType() === t.value" type="button">{{ t.label }}</button>
          }
        </span>
      </div>
      <div class="two">
        <ng-table-pivot [(config)]="pivotConfig" [configurator]="true" [datasource]="server() ? pivotServer : null" [dimensions]="dimensions"
                        [measures]="measures" [rows]="commandes" ariaLabel="Pivot des commandes" density="compact"/>
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
      <p class="hint">Dossiers à plat (<code>treeParent</code>) : dépliez avec le chevron ou Alt+→ / Alt+←, triez, filtrez (les dossiers parents restent affichés).</p>
      <div class="controls">
        <button (click)="tree.expandAllTree()" type="button">Tout déplier</button>
        <button (click)="tree.collapseAllTree()" type="button">Tout replier</button>
      </div>
      <ng-table #tree [columns]="treeColumns" [rows]="files" [treeData]="true" [treeParent]="fileParent" [rowKeyAccessor]="fileKey"
                [treeDefaultExpanded]="1" [cellNavigation]="true" [globalSearchEnabled]="true" ariaLabel="Fichiers" density="compact"/>
    </div>

    <div class="demo-card" style="margin-top: 16px">
      <h2>Graphique d'une plage de cellules</h2>
      <p class="hint">Sélectionnez une plage (glisser, ou Maj+clic) qui contient une colonne de texte et au moins une colonne numérique.</p>
      <div class="two">
        <ng-table #rangeTable [columns]="columns" [rows]="rows" [rangeSelection]="true" [statusBar]="true" [paginator]="true"
                  [pageSizeOptions]="[10, 25]" ariaLabel="Commandes avec tendance" density="compact"/>
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
  protected readonly commandes = generateCommandes(240);
  protected readonly rows: CommandeAvecTendance[] = generateCommandes(40).map((commande, index) => ({
    ...commande,
    tendance: Array.from({length: 6}, (_, month) => Math.round(((index + 3) * (month + 2) * 7919) % 90) + 10),
  }));

  protected readonly files: FileNode[] = [
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
  protected readonly fileKey = (file: FileNode): string => file.id;
  protected readonly fileParent = (file: FileNode): string | null => file.parent;
  protected readonly treeColumns: NgTableColumn<FileNode>[] = [
    {id: 'name', header: 'Nom', valueAccessor: (f) => f.name, sortable: true, filter: {type: 'text'}},
    {id: 'size', header: 'Taille (Ko)', valueAccessor: (f) => f.size || '', sortable: true, sortValueAccessor: (f) => f.size},
  ];

  protected readonly dimensions = Object.values(FIELDS);
  protected readonly measures = MEASURES;
  protected readonly server = signal(false);

  /** Faux serveur : pivote les commandes comme le ferait une base de données, après un délai. */
  protected readonly pivotServer: PivotDatasource = async (request, {signal}) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (signal.aborted) {
      throw new DOMException('Annulé', 'AbortError');
    }
    const config = this.configFromRequest(request);
    return pivotToServerResult(computePivot(this.commandes, config), config as PivotConfig<unknown>);
  };

  private configFromRequest(request: Parameters<PivotDatasource>[0]): PivotConfig<Commande> {
    return {
      rows: request.rows.map((id) => FIELDS[id]),
      columns: request.column ? FIELDS[request.column] : null,
      values: request.values.map((value) => ({...MEASURES.find((m) => m.id === value.id)!, aggregate: value.aggregate})),
      columnSort: request.columnSort,
    };
  }

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
  protected readonly chartTypes = CHART_TYPES;
  protected readonly aggregates: {value: PivotAggregate; label: string}[] = [
    {value: 'sum', label: 'Somme'},
    {value: 'avg', label: 'Moyenne'},
    {value: 'count', label: 'Nombre'},
    {value: 'max', label: 'Maximum'},
  ];

  protected readonly pivotChartType = signal<NgTableChartType>('bar');
  protected readonly rangeChartType = signal<NgTableChartType>('bar');

  protected readonly pivotConfig = signal<PivotConfig<Commande>>({
    rows: [FIELDS['client']],
    columns: FIELDS['statut'],
    values: [{...MEASURES[0], aggregate: 'sum'}],
  });

  protected readonly chartTitle = computed(() => {
    const value = this.pivotConfig().values[0];
    return value ? `${this.aggregates.find((a) => a.value === (value.aggregate ?? 'sum'))?.label} de ${value.header.toLowerCase()}` : 'Pivot';
  });

  /** Un graphique du pivot : une catégorie par ligne, une série par colonne du pivot. */
  protected readonly pivotChart = computed<NgTableChartData>(() => {
    const model = buildPivotModel(this.commandes, this.pivotConfig());
    if (model.rows.length === 0) {
      return {categories: [], series: []};
    }
    const valueColumns = model.columns.filter((column) => column.id.startsWith('pivot:') && !column.id.startsWith('pivot:total:'));
    const series = (valueColumns.length > 0 ? valueColumns : model.columns.slice(-1)).map((column) => ({
      name: column.header,
      values: model.rows.map((row) => column.valueAccessor(row) as number | null),
    }));
    return {categories: model.rows.map((row) => row.labels[0]), series};
  });

  protected readonly columns: NgTableColumn<CommandeAvecTendance>[] = [
    {id: 'client', header: 'Client', valueAccessor: (c) => c.client, sortable: true},
    {id: 'statut', header: 'Statut', valueAccessor: (c) => STATUT_LABELS[c.statut], sortable: true},
    {id: 'montant', header: 'Montant (€)', valueAccessor: (c) => c.montant, sortable: true},
    {
      id: 'tendance',
      header: 'Tendance (courbe)',
      valueAccessor: (c) => c.tendance,
      sortValueAccessor: (c) => c.tendance[c.tendance.length - 1],
      sortable: true,
      sparkline: {type: 'area'},
      exportValueAccessor: (c) => c.tendance.join(' '),
    },
    {id: 'volume', header: 'Volume (barres)', valueAccessor: (c) => c.tendance, sparkline: {type: 'bar', color: '#e07a3f'}},
  ];
}
