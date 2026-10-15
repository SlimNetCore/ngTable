import {ChangeDetectionStrategy, Component, computed, effect, input, model, output, signal, untracked, ViewEncapsulation} from '@angular/core';
import {NgTableTheme} from './theme';
import {draggedTableColumn, NG_TABLE_COLUMN_DRAG_TYPE} from './column-drag';
import {NgTableColumn, NgTableComponent} from './ng-table.component';
import {
  computePivot,
  configFromLayout,
  PivotAggregate,
  PivotConfig,
  PivotDatasource,
  PivotField,
  PivotLayout,
  PivotResult,
  PivotRow,
  PivotZone,
  pivotCellKey,
  pivotColumnFields,
  pivotFromServer,
  pivotRequestFor,
  pivotTotalKey,
  placeInLayout,
  removeFromLayout,
  setLayoutAggregate,
} from './pivot';

/** Une ligne du pivot telle que la voit `ng-table`. */
export interface NgTablePivotRow {
  id: string;
  labels: string[];
  cells: Record<string, number | null>;
}

export interface NgTablePivotModel {
  columns: NgTableColumn<NgTablePivotRow>[];
  rows: NgTablePivotRow[];
  /** Ligne de total général, à épingler en bas. */
  pinnedBottom: NgTablePivotRow[];
  result: PivotResult;
}

const round = (value: number | null): number | null => (value === null ? null : Math.round(value * 100) / 100);

const asRow = (row: PivotRow): NgTablePivotRow => ({id: row.key, labels: row.labels, cells: row.cells});

/**
 * Transforme le résultat d'un pivot en colonnes et lignes pour `ng-table`. Fonction pure :
 * utile pour brancher le pivot sur une `ng-table` configurée à la main.
 */
export function buildPivotModel<T>(rows: readonly T[], config: PivotConfig<T>): NgTablePivotModel {
  return buildPivotModelFromResult(computePivot(rows, config), config);
}

/** Comme `buildPivotModel`, à partir d'un résultat déjà calculé (par exemple par le serveur). */
export function buildPivotModelFromResult<T>(result: PivotResult, config: PivotConfig<T>): NgTablePivotModel {
  const columnFields = pivotColumnFields(config);
  const totalLabel = config.totalLabel ?? 'Total';
  const single = config.values.length === 1;
  const columns: NgTableColumn<NgTablePivotRow>[] = [];

  config.rows.forEach((field, index) => {
    columns.push({
      id: `pivot-row-${index}`,
      header: field.header,
      valueAccessor: (row) => row.labels[index],
      sortable: true,
      filter: {type: 'text'},
      pinned: index === 0 ? 'left' : undefined,
    });
  });

  const valueColumn = (id: string, header: string, key: string, group: string[]): NgTableColumn<NgTablePivotRow> => ({
    id,
    header,
    valueAccessor: (row) => round(row.cells[key] ?? null),
    sortable: true,
    headerGroup: group.length > 0 ? group : undefined,
    filter: {type: 'number'},
    exportValueAccessor: (row) => round(row.cells[key] ?? null),
  });

  // En-têtes d'une colonne du pivot. Un seul champ en colonne : son libellé coiffe les valeurs. Plusieurs : les
  // valeurs des champs externes coiffent celles des champs internes. Plusieurs valeurs agrégées : elles se
  // répartissent sous la dernière valeur du chemin.
  const prefix = columnFields.length === 1 ? [columnFields[0].header] : [];
  result.columnKeys.forEach((columnKey, position) => {
    const path = (result.columnPaths[position] ?? []).map((label) => label || '—');
    for (const value of config.values) {
      const id = `pivot:${columnKey}:${value.id}`;
      const key = pivotCellKey(columnKey, value.id);
      if (columnFields.length === 0) {
        columns.push(valueColumn(id, value.header, key, []));
      } else if (single) {
        columns.push(valueColumn(id, path[path.length - 1], key, [...prefix, ...path.slice(0, -1)]));
      } else {
        columns.push(valueColumn(id, value.header, key, [...prefix, ...path]));
      }
    }
  });

  if (columnFields.length > 0 && config.rowTotals !== false) {
    for (const value of config.values) {
      columns.push(valueColumn(`pivot:total:${value.id}`, single ? totalLabel : value.header, pivotTotalKey(value.id), [totalLabel]));
    }
  }

  return {
    columns,
    rows: result.rows.map(asRow),
    pinnedBottom: result.grandTotal ? [asRow(result.grandTotal)] : [],
    result,
  };
}

/** Textes du configurateur de pivot (champs à glisser). */
export interface NgTablePivotLabels {
  fields: string;
  rows: string;
  columns: string;
  values: string;
  dropHere: string;
  remove: string;
  add: string;
  aggregate: string;
  loading: string;
  error: string;
  retry: string;
  aggregates: Record<PivotAggregate, string>;
}

export const NG_TABLE_PIVOT_LABELS_FR: NgTablePivotLabels = {
  fields: 'Champs',
  rows: 'Lignes',
  columns: 'Colonnes',
  values: 'Valeurs',
  dropHere: 'Glissez un champ ici',
  remove: 'Retirer {field}',
  add: 'Ajouter à {zone}',
  aggregate: 'Agrégat de {field}',
  loading: 'Calcul du pivot…',
  error: 'Le pivot n’a pas pu être calculé.',
  retry: 'Réessayer',
  aggregates: {sum: 'Somme', avg: 'Moyenne', min: 'Minimum', max: 'Maximum', count: 'Nombre'},
};

export const NG_TABLE_PIVOT_LABELS_EN: NgTablePivotLabels = {
  fields: 'Fields',
  rows: 'Rows',
  columns: 'Columns',
  values: 'Values',
  dropHere: 'Drop a field here',
  remove: 'Remove {field}',
  add: 'Add to {zone}',
  aggregate: 'Aggregate of {field}',
  loading: 'Computing pivot…',
  error: 'The pivot could not be computed.',
  retry: 'Retry',
  aggregates: {sum: 'Sum', avg: 'Average', min: 'Minimum', max: 'Maximum', count: 'Count'},
};

const AGGREGATES: PivotAggregate[] = ['sum', 'avg', 'min', 'max', 'count'];

/**
 * Tableau croisé dynamique : une `ng-table` dont les lignes et les colonnes viennent d'un
 * pivot. Calculé dans le navigateur à partir de `[rows]`, ou par votre serveur avec
 * `[datasource]`. Avec `[configurator]`, l'utilisateur compose le pivot en glissant des champs
 * entre « Lignes », « Colonnes » et « Valeurs ».
 *
 * ```html
 * <ng-table-pivot [rows]="ventes()" [(config)]="pivot" [dimensions]="dims" [measures]="mesures" [configurator]="true" />
 * <ng-table-pivot [datasource]="pivotServeur" [(config)]="pivot" [dimensions]="dims" [measures]="mesures" />
 * ```
 */
@Component({
  selector: 'ng-table-pivot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [NgTableComponent],
  template: `
    @if (configurator()) {
      <div class="ngt-pivot-config" role="group" [attr.aria-label]="texts().fields">
        <div (dragover)="onZoneDragOver($event, 'fields')" (drop)="onFieldsDrop($event)" class="ngt-pivot-zone ngt-pivot-zone--fields"
             [class.ngt-pivot-zone--over]="overZone() === 'fields'">
          <span class="ngt-pivot-zone__title">{{ texts().fields }}</span>
          <div class="ngt-pivot-chips">
            @for (field of unusedFields(); track field.id) {
              <span (dragend)="onDragEnd()" (dragstart)="onChipDragStart($event, field.id)" class="ngt-pivot-chip" draggable="true">
                {{ field.header }}
              </span>
            }
          </div>
        </div>

        @for (zone of zones; track zone.id) {
          <div (dragleave)="overZone.set(null)" (dragover)="onZoneDragOver($event, zone.id)" (drop)="onZoneDrop($event, zone.id)"
               [class.ngt-pivot-zone--over]="overZone() === zone.id" [attr.data-zone]="zone.id" class="ngt-pivot-zone">
            <span class="ngt-pivot-zone__title">{{ zoneLabel(zone.id) }}</span>
            <div class="ngt-pivot-chips">
              @for (item of zoneItems(zone.id); track item.field.id; let index = $index) {
                <span (dragend)="onDragEnd()" (dragstart)="onChipDragStart($event, item.field.id)"
                      (dragover)="onZoneDragOver($event, zone.id)" (drop)="onZoneDrop($event, zone.id, index); $event.stopPropagation()"
                      class="ngt-pivot-chip ngt-pivot-chip--used" draggable="true">
                  {{ item.field.header }}
                  @if (zone.id === 'values') {
                    <select (change)="onAggregate(item.field.id, $any($event.target).value)"
                            [attr.aria-label]="texts().aggregate.replace('{field}', item.field.header)" class="ngt-pivot-agg">
                      @for (a of aggregates; track a) {
                        <option [selected]="a === item.aggregate" [value]="a">{{ texts().aggregates[a] }}</option>
                      }
                    </select>
                  }
                  <button (click)="onRemove(item.field.id)" [attr.aria-label]="texts().remove.replace('{field}', item.field.header)"
                          class="ngt-pivot-chip__x" type="button">×</button>
                </span>
              } @empty {
                <span class="ngt-pivot-zone__hint">{{ texts().dropHere }}</span>
              }
              @if (addable(zone.id).length > 0) {
                <select (change)="onAdd(zone.id, $any($event.target))" [attr.aria-label]="texts().add.replace('{zone}', zoneLabel(zone.id))"
                        class="ngt-pivot-add">
                  <option value="">+</option>
                  @for (field of addable(zone.id); track field.id) {
                    <option [value]="field.id">{{ field.header }}</option>
                  }
                </select>
              }
            </div>
          </div>
        }
      </div>
    }

    @if (error()) {
      <div class="ngt-pivot-error" role="alert">
        {{ texts().error }}
        <button (click)="reload()" type="button">{{ texts().retry }}</button>
      </div>
    }

    <ng-table
      [ariaLabel]="ariaLabel()"
      [columns]="model().columns"
      [density]="density()"
      [exportEnabled]="exportEnabled()"
      [exportFilename]="exportFilename()"
      [globalSearchEnabled]="globalSearchEnabled()"
      [loading]="loading()"
      [maxHeight]="maxHeight()"
      [paginator]="false"
      [pinnedBottomRows]="model().pinnedBottom"
      [rowKeyAccessor]="rowKey"
      [rows]="model().rows"
      [stickyHeader]="maxHeight() !== null"
      [statusBar]="statusBar()"
      [theme]="theme()"
    />
  `,
  host: {'[attr.data-ngt-theme]': 'theme()'},
  styleUrl: './theme.css',
  styles: [
    `
    .ngt-pivot-config {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }

    .ngt-pivot-zone {
      min-height: 64px;
      padding: 8px;
      border: 1px dashed var(--ngt-border, var(--app-border, rgba(15, 23, 42, 0.3)));
      border-radius: 12px;
      background: var(--ngt-surface, var(--app-surface, #fff));
    }

    .ngt-pivot-zone--over {
      border-color: var(--ngt-primary, var(--app-primary, #2f6fa8));
      background: color-mix(in srgb, var(--ngt-primary, var(--app-primary, #2f6fa8)) 8%, var(--ngt-surface, var(--app-surface, #fff)));
    }

    .ngt-pivot-zone__title {
      display: block;
      margin-bottom: 6px;
      color: var(--ngt-text-muted, var(--app-text-muted, #475569));
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .ngt-pivot-zone__hint {
      color: var(--ngt-text-muted, var(--app-text-muted, #475569));
      font-size: 0.8125rem;
    }

    .ngt-pivot-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }

    .ngt-pivot-chip {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      padding: 4px 10px;
      border: 1px solid var(--ngt-border, var(--app-border, rgba(15, 23, 42, 0.2)));
      border-radius: 999px;
      background: var(--ngt-surface-alt, var(--app-surface-alt, #f4f6f9));
      font-size: 0.8125rem;
      cursor: grab;
      user-select: none;
    }

    .ngt-pivot-chip--used {
      border-color: var(--ngt-primary, var(--app-primary, #2f6fa8));
    }

    .ngt-pivot-chip__x {
      padding: 0 2px;
      border: 0;
      background: none;
      color: inherit;
      font-size: 1rem;
      line-height: 1;
      cursor: pointer;
    }

    .ngt-pivot-agg,
    .ngt-pivot-add {
      border: 1px solid var(--ngt-border, var(--app-border, rgba(15, 23, 42, 0.2)));
      border-radius: 6px;
      background: var(--ngt-surface, var(--app-surface, #fff));
      color: inherit;
      font: inherit;
      font-size: 0.75rem;
    }

    .ngt-pivot-error {
      margin-bottom: 8px;
      padding: 8px 12px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--ngt-danger, var(--mat-sys-error, #b3261e)) 12%, transparent);
      color: var(--ngt-danger, var(--mat-sys-error, #b3261e));
    }
  `,
  ],
})
export class NgTablePivotComponent<T> {
  /** Les données à croiser (calcul dans le navigateur). Ignoré quand `datasource` est fourni. */
  readonly rows = input<readonly T[]>([]);
  readonly config = model.required<PivotConfig<T>>();
  /** Calcul par le serveur : reçoit les champs, la colonne pivot et les agrégats, renvoie le résultat. */
  readonly datasource = input<PivotDatasource | null>(null);
  /** Filtres transmis au serveur avec chaque requête, pour pivoter les mêmes lignes que la table. */
  readonly filters = input<Record<string, string> | null>(null);
  /** Champs qui peuvent servir de lignes ou de colonne (configurateur). */
  readonly dimensions = input<readonly PivotField<T>[]>([]);
  /** Champs qui peuvent être agrégés (configurateur). */
  readonly measures = input<readonly PivotField<T>[]>([]);
  /** Affiche les zones « Lignes », « Colonnes » et « Valeurs » où glisser les champs. */
  readonly configurator = input(false);
  readonly labels = input<Partial<NgTablePivotLabels>>({});
  readonly ariaLabel = input<string | null>(null);
  readonly density = input<'default' | 'compact'>('default');
  readonly maxHeight = input<string | null>(null);
  readonly exportEnabled = input(true);
  readonly exportFilename = input('pivot');
  readonly globalSearchEnabled = input(true);
  readonly statusBar = input(false);
  /** `'dark'`, `'light'`, `'auto'`, ou `null` (jetons de l'application). */
  readonly theme = input<NgTableTheme | null>(null);
  /** Le serveur a échoué ou refusé la requête. */
  readonly pivotError = output<unknown>();

  protected readonly aggregates = AGGREGATES;
  protected readonly zones: { id: PivotZone }[] = [{id: 'rows'}, {id: 'columns'}, {id: 'values'}];
  protected readonly texts = computed(() => ({...NG_TABLE_PIVOT_LABELS_FR, ...this.labels()}));

  // ---------------------------------------------------------------- calcul serveur

  private readonly serverResult = signal<PivotResult | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  private controller: AbortController | null = null;
  private requestId = 0;
  private readonly reloadTick = signal(0);

  constructor() {
    effect(() => {
      const datasource = this.datasource();
      const config = this.config();
      const filters = this.filters();
      this.reloadTick();
      if (datasource) {
        untracked(() => void this.runServer(datasource, config, filters ?? undefined));
      } else {
        untracked(() => this.cancelServer());
      }
    });
  }

  private cancelServer(): void {
    this.controller?.abort();
    this.controller = null;
    this.requestId++;
    this.loading.set(false);
    this.error.set(false);
    this.serverResult.set(null);
  }

  private async runServer(datasource: PivotDatasource, config: PivotConfig<T>, filters?: Record<string, string>): Promise<void> {
    this.controller?.abort(); // une requête périmée ne doit plus rien changer
    const controller = new AbortController();
    this.controller = controller;
    const id = ++this.requestId;
    this.loading.set(true);
    this.error.set(false);
    try {
      const response = await datasource(pivotRequestFor(config, filters), {signal: controller.signal});
      if (id === this.requestId) {
        this.serverResult.set(pivotFromServer(response, config));
      }
    } catch (error) {
      if (id === this.requestId && !controller.signal.aborted) {
        this.error.set(true);
        this.pivotError.emit(error);
      }
    } finally {
      if (id === this.requestId) {
        this.loading.set(false);
      }
    }
  }

  protected reload(): void {
    this.reloadTick.update((tick) => tick + 1);
  }

  /** Colonnes, lignes et résultat du pivot (lecture seule). */
  readonly model = computed<NgTablePivotModel>(() => {
    const config = this.config();
    if (this.datasource()) {
      const result = this.serverResult();
      return result ? buildPivotModelFromResult(result, config) : {columns: [], rows: [], pinnedBottom: [], result: {columnKeys: [], columnPaths: [], rows: [], grandTotal: null}};
    }
    return buildPivotModel(this.rows(), config);
  });

  protected readonly rowKey = (row: NgTablePivotRow): string => row.id;

  // ---------------------------------------------------------------- configurateur

  private readonly layout = computed<PivotLayout>(() => {
    const config = this.config();
    return {
      rows: config.rows.map((field) => field.id),
      columns: pivotColumnFields(config).map((field) => field.id),
      values: config.values.map((value) => ({id: value.id, aggregate: value.aggregate ?? 'sum'})),
    };
  });

  private readonly allFields = computed(() => [
    ...this.dimensions().map((field) => ({field, kind: 'dimension' as const})),
    ...this.measures().map((field) => ({field, kind: 'measure' as const})),
  ]);

  protected readonly unusedFields = computed(() => {
    const layout = this.layout();
    const used = new Set([...layout.rows, ...layout.columns, ...layout.values.map((value) => value.id)]);
    return this.allFields().filter(({field}) => !used.has(field.id)).map(({field}) => field);
  });

  protected zoneLabel(zone: PivotZone | 'fields'): string {
    const texts = this.texts();
    return zone === 'rows' ? texts.rows : zone === 'columns' ? texts.columns : zone === 'values' ? texts.values : texts.fields;
  }

  protected zoneItems(zone: PivotZone): { field: PivotField<T>; aggregate: PivotAggregate }[] {
    const layout = this.layout();
    const find = (id: string) => this.allFields().find(({field}) => field.id === id)?.field;
    if (zone === 'rows') {
      return layout.rows.flatMap((id) => find(id) ?? []).map((field) => ({field, aggregate: 'sum' as const}));
    }
    if (zone === 'columns') {
      return layout.columns.flatMap((id) => find(id) ?? []).map((field) => ({field, aggregate: 'sum' as const}));
    }
    return layout.values.flatMap((value) => {
      const field = find(value.id);
      return field ? [{field, aggregate: value.aggregate}] : [];
    });
  }

  /** Champs que la zone accepte et qui n'y sont pas déjà : proposés dans la liste « + » (sans souris). */
  protected addable(zone: PivotZone): PivotField<T>[] {
    const wanted = zone === 'values' ? 'measure' : 'dimension';
    const here = new Set(this.zoneItems(zone).map((item) => item.field.id));
    return this.allFields().filter(({field, kind}) => kind === wanted && !here.has(field.id)).map(({field}) => field);
  }

  private apply(layout: PivotLayout | null): void {
    if (!layout) {
      return;
    }
    const current = this.config();
    this.config.set(
      configFromLayout(layout, this.dimensions(), this.measures(), {
        rowTotals: current.rowTotals,
        grandTotal: current.grandTotal,
        totalLabel: current.totalLabel,
        columnSort: current.columnSort,
      }),
    );
  }

  private kindOf(id: string): 'dimension' | 'measure' | null {
    return this.allFields().find(({field}) => field.id === id)?.kind ?? null;
  }

  protected readonly overZone = signal<PivotZone | 'fields' | null>(null);
  private dragging: string | null = null;

  protected onChipDragStart(event: DragEvent, id: string): void {
    this.dragging = id;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id);
    }
  }

  protected onDragEnd(): void {
    this.dragging = null;
    draggedTableColumn.set(null);
    this.overZone.set(null);
  }

  /** Champ glissé en ce moment : un chip du configurateur, ou l'en-tête d'une colonne de `ng-table`. */
  private draggedField(): string | null {
    return this.dragging ?? draggedTableColumn();
  }

  protected onZoneDragOver(event: DragEvent, zone: PivotZone | 'fields'): void {
    const dragged = this.draggedField();
    const kind = dragged ? this.kindOf(dragged) : null;
    const allowed = zone === 'fields' ? kind !== null : kind !== null && (zone === 'values') === (kind === 'measure');
    if (allowed) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = this.dragging ? 'move' : 'copy'; // une colonne de la table reste dans la table
      }
      this.overZone.set(zone);
    }
  }

  protected onZoneDrop(event: DragEvent, zone: PivotZone, index?: number): void {
    event.preventDefault();
    const id = this.droppedField(event);
    const kind = id ? this.kindOf(id) : null;
    this.onDragEnd();
    if (id && kind) {
      const existing = this.layout().values.find((value) => value.id === id);
      this.apply(placeInLayout(this.layout(), id, zone, kind, index, existing?.aggregate));
    }
  }

  /** Champ déposé : celui d'un chip, ou une colonne de `ng-table` (son identifiant est celui du champ). */
  private droppedField(event: DragEvent): string | null {
    return this.dragging ?? draggedTableColumn() ?? event.dataTransfer?.getData(NG_TABLE_COLUMN_DRAG_TYPE) ?? null;
  }

  /** Lâcher un champ sur « Champs » le retire du pivot. */
  protected onFieldsDrop(event: DragEvent): void {
    event.preventDefault();
    const id = this.dragging;
    this.onDragEnd();
    if (id) {
      this.apply(removeFromLayout(this.layout(), id));
    }
  }

  protected onRemove(id: string): void {
    this.apply(removeFromLayout(this.layout(), id));
  }

  protected onAggregate(id: string, aggregate: PivotAggregate): void {
    this.apply(setLayoutAggregate(this.layout(), id, aggregate));
  }

  protected onAdd(zone: PivotZone, select: HTMLSelectElement): void {
    const id = select.value;
    select.value = '';
    const kind = id ? this.kindOf(id) : null;
    if (id && kind) {
      this.apply(placeInLayout(this.layout(), id, zone, kind));
    }
  }
}
