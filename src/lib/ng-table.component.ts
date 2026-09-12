import {CommonModule} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  TemplateRef,
  TrackByFunction,
  Type,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxChange, MatCheckboxModule} from '@angular/material/checkbox';
import {MatIconModule} from '@angular/material/icon';
import {MatMenuModule, MatMenuTrigger} from '@angular/material/menu';
import {MatTableModule} from '@angular/material/table';
import {MatTooltipModule} from '@angular/material/tooltip';
import {firstValueFrom, Observable, Subject, timer} from 'rxjs';
import {debounce, groupBy, mergeMap} from 'rxjs/operators';
import {ColumnFilterRendererComponent, ColumnFilterType} from './column-filter-renderer.component';
import {DynamicFilterHostComponent} from './dynamic-filter-host.component';
import {TruncateTooltipDirective} from './truncate-tooltip.directive';
import {
  NG_TABLE_DEFAULT_LABELS,
  NG_TABLE_LABELS,
  NgTableLabels,
  ngTableLabelsEqual,
  resolveNgTableLabelsSource,
} from './ng-table-labels';

export type SortDirection = 'asc' | 'desc' | '';

/**
 * `local`: tri/filtrage appliqués côté client sur `rows()` (défaut, adapté aux
 * petites listes qui ne changent pas souvent).
 * `remote`: `rows()` est considéré déjà trié/filtré/paginé par le serveur — le
 * composant se contente d'afficher tel quel et notifie chaque changement de tri/filtre
 * via `(remoteQueryChange)` pour que le parent puisse relancer la requête.
 */
export type NgTableDataMode = 'local' | 'remote';

/** Etat complet à envoyer au serveur en mode `remote` (tri courant, tous les filtres, et la page). */
export interface NgTableRemoteQuery {
  sort: NgTableSortChange;
  filters: Record<string, string>;
  page: { index: number; size: number };
}

/**
 * `local`: `ng-table` génère lui-même le fichier d'export (CSV) à partir des données
 * déjà chargées, après que l'utilisateur choisit une plage de pages dans une boîte
 * de dialogue intégrée. Aucun appel réseau.
 * `remote`: `ng-table` ne génère rien — il émet `(remoteExportRequested)` avec le
 * tri/filtres/page courants ; à l'appelant de construire sa requête serveur (avec
 * ses propres paramètres additionnels, ex. via un store) et de déclencher le
 * téléchargement du fichier généré côté back.
 */
export type NgTableExportMode = 'local' | 'remote';

/** Résultat d'un export `local` réussi — informatif (analytics, toast...). */
export interface NgTableLocalExportEvent {
  fromPage: number;
  toPage: number;
  rowCount: number;
}

export type NgTableFilterOption = { value: string; label: string };

/**
 * Configuration de filtrage d'une colonne.
 *
 * - `type`, `options` et `placeholder` alimentent le rendu standard via
 *   `ColumnFilterRendererComponent`.
 * - `optionsLoader` permet de charger des options a la demande (menu) ou en eager
 *   quand `inlineFilters=true`.
 * - `component`/`componentInputs` permettent de brancher un renderer de filtre custom
 *   via `DynamicFilterHostComponent`.
 */
export interface NgTableFilterConfig {
  type?: ColumnFilterType;
  options?: NgTableFilterOption[];
  optionsLoader?: () => Observable<NgTableFilterOption[]> | Promise<NgTableFilterOption[]>;
  placeholder?: string;
  /** Libellé affiché tel quel (texte déjà résolu — plus une clé i18n). */
  label?: string;
  component?: Type<unknown>;
  componentInputs?: Record<string, unknown>;
}

export interface NgTableColumn<T> {
  id: string;
  /** Libellé d'en-tête affiché tel quel (texte déjà résolu — plus une clé i18n). */
  header: string;
  valueAccessor: (row: T) => unknown;
  visible?: boolean;
  sortable?: boolean;
  resizable?: boolean;
  widthPx?: number;
  minWidthPx?: number;
  maxWidthPx?: number;
  cellTemplate?: TemplateRef<{ $implicit: T; row: T; value: unknown; column: NgTableColumn<T> }>;
  /**
   * Comportement du texte de cellule quand il dépasse la largeur de la colonne —
   * s'applique aussi bien à `valueAccessor` qu'au rendu d'un `cellTemplate`.
   * `'truncate'` (défaut) : une ligne, coupée avec "…" (tooltip au survol
   * uniquement si le texte est réellement tronqué, sauf avec `cellTemplate` — le
   * rendu riche n'est pas résumable en tooltip). `'wrap'` : retour à la ligne
   * normal. Un `cellTemplate` produisant plusieurs éléments côte à côte qui
   * doivent pouvoir se répartir sur plusieurs lignes doit passer explicitement
   * en `'wrap'` (le défaut `'truncate'` les forcerait sur une seule ligne).
   */
  textOverflow?: 'truncate' | 'wrap';
  sortValueAccessor?: (row: T) => string | number | boolean | Date | null | undefined;
  filter?: NgTableFilterConfig;
  filterPredicate?: (row: T, filterValue: string) => boolean;
  mobileRowActions?: boolean;
  copy?:
    | boolean
    | {
    valueAccessor?: (row: T) => string;
    tooltip?: string;
  };
  /** `false` exclut la colonne de l'export (ex. une colonne d'actions/boutons). `true` par défaut. */
  exportable?: boolean;
  /** Valeur utilisée pour l'export si elle doit différer de `valueAccessor` (ex. valeur brute vs rendu riche d'un `cellTemplate`). */
  exportValueAccessor?: (row: T) => string | number | boolean | null | undefined;
}

export interface NgTableSortChange {
  columnId: string;
  direction: SortDirection;
}

export interface NgTableCopyEvent<T = any> {
  columnId: string;
  value: string;
  row: T;
}

export interface NgTableDetailToggleEvent<T = any> {
  row: T;
  expanded: boolean;
  expandedKeys: unknown[];
}

export interface NgTableSelectionChangeEvent<T = any> {
  row: T | null;
  selected: boolean;
  selectedKeys: unknown[];
  selectedRows: T[];
}

export interface NgTableContextMenuEvent<T = any> {
  row: T;
  position: { x: number; y: number };
}

/** Everything a saved "view" captures about the list's presentation. */
export interface NgTableViewState {
  columnVisibility: Record<string, boolean>;
  columnOrder: string[];
  sort: NgTableSortChange;
  filters: Record<string, string>;
  /**
   * Largeurs de colonnes (px) issues du redimensionnement, par id de colonne.
   * Optionnel : les vues enregistrées avant l'ajout de cette option n'en ont pas,
   * elles restaurent alors simplement les largeurs par défaut des colonnes.
   */
  columnWidths?: Record<string, number>;
  /** Only populated when `pageTrackingEnabled=true` (reuses `[pageIndex]`/`[pageSize]`). */
  pageIndex?: number;
  pageSize?: number;
}

export interface NgTableView {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  state: NgTableViewState;
}

/**
 * The whole "views" store for a list: every saved view plus which one is active.
 * By default the component persists this itself (localStorage, keyed by
 * `viewsStorageKey`). A parent that wants to persist it elsewhere (backend, file...)
 * can instead pass `[viewsStore]` (controlled mode) and listen to `(viewsStoreChange)`.
 */
export interface NgTableViewsStore {
  views: NgTableView[];
  activeViewId: string | null;
}

@Component({
  selector: 'ng-table',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatMenuModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatTooltipModule,
    ColumnFilterRendererComponent,
    DynamicFilterHostComponent,
    TruncateTooltipDirective,
  ],
  templateUrl: './ng-table.component.html',
  styleUrl: './ng-table.component.css',
  // Tout l'état interne passe par des signals : `OnPush` suffit et évite de re-vérifier
  // la vue (et ses centaines de cellules) à chaque cycle de détection global.
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class NgTableComponent implements OnDestroy {
  /**
   * Table Angular Material configurable, sans dépendance i18n ni métier.
   *
   * Fonctionnalites majeures:
   * - colonnes configurables (ordre defini par le parent, visibilite, resize, drag-and-drop)
   * - tri (local ou remote)
   * - filtrage (local ou remote), par colonne (renderer standard ou custom)
   * - copie rapide d'une cellule
   * - ligne detail expandable (mode interne ou controle)
   * - selection de lignes (checkbox, interne ou controle)
   * - vues sauvegardées (colonnes/ordre/tri/filtres/pagination)
   * - support responsive (ligne d'actions mobile)
   *
   * Lien avec `ColumnFilterRendererComponent`:
   * - `ng-table` decide QUAND/OÙ afficher le filtre (menu vs inline)
   * - `ColumnFilterRendererComponent` decide COMMENT capturer la valeur de filtre
   * - la valeur remonte via `(valueChange)` puis est stockee ici dans `columnFilters`
   * - le filtrage final s'applique dans `displayedRows()` via `matchesAllFilters()`
   */

  /** Source des donnees (non filtrees/non triees), fournie par le parent. */
  readonly rows = input<any[]>([]);
  /** Definition des colonnes (valeur, tri, filtre, templates, largeur...). */
  readonly columns = input<NgTableColumn<any>[]>([]);
  /** Mode controle: visibilite des colonnes pilotee par le parent. */
  readonly columnVisibility = input<Record<string, boolean> | null>(null);
  /** Mode controle: ordre des colonnes (ids) pilote par le parent. */
  readonly columnOrder = input<ReadonlyArray<string> | null>(null);
  /** Mode controle: filtres pilotes par le parent. */
  readonly filters = input<Record<string, string> | null>(null);
  /**
   * Textes affichés par cette table — ne fournissez que ce que vous voulez surcharger.
   * Pour configurer toute l'application d'un coup (et rendre les textes réactifs au
   * changement de langue), préférez `provideNgTableLabels()`.
   */
  readonly labels = input<Partial<NgTableLabels>>({});
  /**
   * `aria-label` du `<table>` — décrit ce que la table représente pour un lecteur
   * d'écran (ex. "Liste des commandes"). `null` (défaut) retombe sur
   * `labels.tableLabel`, générique mais toujours présent : un tableau de données
   * doit avoir un nom accessible (WCAG 1.3.1 / 4.1.2).
   */
  readonly ariaLabel = input<string | null>(null);
  /** Message affiché quand `rows()` est vide (ou vide après filtrage en mode local). */
  readonly emptyLabel = input<string | null>(null);
  /**
   * Affiche un overlay de chargement centré au milieu de la table (bloque
   * l'interaction avec les lignes tant qu'il est visible). A piloter depuis le
   * parent — `ng-table` ne sait pas lui-même si une requête est en cours.
   */
  readonly loading = input(false);
  /**
   * Contenu custom de l'overlay de chargement. `null` (défaut) affiche le spinner
   * intégré ; sinon ce template remplace entièrement le rendu par défaut.
   */
  readonly loadingTemplate = input<TemplateRef<unknown> | null>(null);
  readonly minTableWidthPx = input(760);
  readonly rowClassFn = input<((row: any) => string | string[] | Record<string, boolean> | null) | null>(null);
  /**
   * `trackBy` custom pour le rendu de la table (perf uniquement). N'est PAS
   * utilisé pour la clé métier de sélection/expansion/copie — celle-ci vient
   * uniquement de `rowKeyAccessor` (ou de `row.id`/`row.ID`, ou de la référence
   * de la ligne). Une fonction de `trackBy` incorpore souvent l'index de rendu,
   * qui n'est pas stable au tri/filtre/pagination — inadaptée à une clé de
   * sélection, d'où cette séparation stricte.
   */
  readonly rowTrackBy = input<TrackByFunction<any> | null>(null);
  /** Template de detail (master/detail). Quand null, pas de detail row. */
  readonly detailRowTemplate = input<TemplateRef<{ $implicit: any; row: any }> | null>(null);
  /**
   * Controlled mode: external predicate deciding whether the detail is expanded.
   * When provided, internal expansion state is bypassed entirely.
   */
  readonly detailRowWhen = input<((index: number, row: any) => boolean) | null>(null);
  /**
   * Controlled mode (key based): externally managed list of expanded row keys.
   * Keys are resolved with `rowKeyAccessor` / `rowTrackBy` / `row.id`.
   */
  readonly expandedRowKeys = input<ReadonlyArray<unknown> | null>(null);
  /** Uncontrolled mode: toggle the detail row when the data row is clicked. */
  readonly detailRowToggleOnRowClick = input(true);
  /** Uncontrolled mode: only one detail row expanded at a time. */
  readonly detailRowAccordion = input(false);
  /** Optional guard: rows for which a detail can be expanded (e.g. has children). */
  readonly detailRowCanExpand = input<((row: any) => boolean) | null>(null);
  /** Stable business key for a row (expansion state, copy feedback, trackBy fallback). */
  readonly rowKeyAccessor = input<((row: any) => unknown) | null>(null);
  /** Show/hide the built-in "reset all filters" button. */
  readonly showResetFilters = input(true);
  /**
   * Délai (ms) avant qu'une saisie dans un filtre texte ne soit prise en compte.
   * Evite de refiltrer (mode `local`) ou de lancer une requête (mode `remote`) à chaque
   * caractère. Mettre `0` pour un filtrage immédiat. Les filtres à choix fixe
   * (select/enum/booléen/date) ne sont jamais debouncés.
   */
  readonly filterDebounceMs = input(350);
  /** Show a leading checkbox column to select one or many rows. */
  readonly rowSelectionEnabled = input(false);
  /** Controlled mode (key based): externally managed selected row keys. */
  readonly selectedRowKeys = input<ReadonlyArray<unknown> | null>(null);
  /** Render column filters inline inside the header cell (no filter icon/menu). */
  readonly inlineFilters = input(false);
  /** Optional list of column ids allowed to render inline filters (when inlineFilters=true). */
  readonly inlineFilterColumnIds = input<ReadonlyArray<string> | null>(null);
  /** Show a summary bar of the active filters below the list. */
  readonly showActiveFiltersBar = input(false);
  /** Enable right-click contextual menu on data rows. */
  readonly rowContextMenuEnabled = input(false);
  /** Context menu content provided by parent component. */
  readonly rowContextMenuTemplate = input<TemplateRef<{ $implicit: any; row: any }> | null>(null);

  /**
   * `local` (défaut): tri/filtres appliqués sur `rows()` côté client.
   * `remote`: `rows()` est affiché tel quel (déjà trié/filtré/paginé côté serveur) ;
   * tout changement de tri ou de filtre émet `(remoteQueryChange)` au lieu d'être
   * appliqué localement.
   */
  readonly dataMode = input<NgTableDataMode>('local');

  /**
   * Declares that `[pageIndex]`/`[pageSize]` are meaningfully bound and should be
   * taken into account. Off by default (back-compat: `displayedRows()` is never
   * sliced, exactly like before this feature existed) — a `local` table with no
   * built-in pagination (all rows shown at once) simply leaves this `false`.
   *
   * Its effect differs by mode, which is the main source of confusion — read
   * carefully:
   * - **`local` mode: this is where it actually does something.** `displayedRows()`
   *   is sliced to `[pageIndex*pageSize, +pageSize)` after filter/sort, and
   *   `(filteredCountChange)` reports the post-filter total so your own paginator's
   *   `[length]` stays correct.
   * - **`remote` mode: mostly a no-op in practice.** The only effect is which value
   *   gets embedded in `(remoteQueryChange).page.size` when a filter/sort changes:
   *   `pageSize()` if `true`, `0` otherwise. Page navigation itself is NEVER routed
   *   through this component in `remote` mode (see `dataMode`) — your own
   *   paginator's `(page)` event always calls your fetch method directly, with or
   *   without this flag. Most `remote` consumers can leave it `false` and read
   *   their own known page size instead of relying on this echoed value.
   */
  readonly pageTrackingEnabled = input(false);
  /** Current page index (0-based). Only used when `pageTrackingEnabled=true`. */
  readonly pageIndex = input(0);
  /** Current page size. Only used when `pageTrackingEnabled=true`. */
  readonly pageSize = input(10);

  /** Show/hide the whole "views" toolbar (save/switch/delete). Off by default. */
  readonly viewsEnabled = input(false);
  /**
   * Uncontrolled mode: storage key used to persist the views store in `localStorage`
   * (namespaced automatically). Required for built-in persistence to do anything —
   * without it, views still work but only for the current page session.
   */
  readonly viewsStorageKey = input<string | null>(null);
  /** Controlled mode: parent owns the views store entirely (backend, file, etc.). */
  readonly viewsStore = input<NgTableViewsStore | null>(null);

  /** Show/hide the export button. Off by default. */
  readonly exportEnabled = input(false);
  /** See {@link NgTableExportMode}. `'local'` by default. */
  readonly exportMode = input<NgTableExportMode>('local');
  /** Base filename (without extension) used for the file generated in `exportMode='local'`. */
  readonly exportFilename = input('export');

  readonly rowClick = output<any>();
  /** Emitted whenever any filter value changes. */
  readonly filtersChange = output<Record<string, string>>();
  readonly sortChange = output<NgTableSortChange>();
  readonly cellCopied = output<NgTableCopyEvent>();
  readonly detailToggle = output<NgTableDetailToggleEvent>();
  /** Emitted when the internal column picker toggles a column visibility. */
  readonly columnVisibilityChange = output<Record<string, boolean>>();
  /** Emitted whenever the user drags a column header to a new position. */
  readonly columnOrderChange = output<string[]>();
  /** Emitted on row selection/unselection and select-all operations. */
  readonly selectionChange = output<NgTableSelectionChangeEvent>();
  /** Emitted when the contextual menu is requested on a row. */
  readonly rowContextMenu = output<NgTableContextMenuEvent>();
  /**
   * Emitted whenever the views store changes (saved, activated, deleted) — in
   * uncontrolled mode this mirrors what was just written to `localStorage`; in
   * controlled mode this is the ONLY place the change is reported, since the
   * component does not persist anything itself. Wire this to save wherever you want.
   */
  readonly viewsStoreChange = output<NgTableViewsStore>();
  /** Emitted whenever a view becomes active (user switch, or auto-activation on load). */
  readonly viewActivated = output<NgTableView | null>();
  /** Emitted when an activated view carries pagination — apply it to your own paginator. */
  readonly viewPaginationRestore = output<{ pageIndex: number; pageSize: number }>();
  /**
   * `exportMode='remote'` only: the user clicked the export button. Carries the
   * current sort/filters/page — build your server export request from this (add
   * whatever extra parameters your backend needs, e.g. from your own store) and
   * handle the resulting file/download yourself; `ng-table` does not call your API.
   */
  readonly remoteExportRequested = output<NgTableRemoteQuery>();
  /** `exportMode='local'` only: emitted after the CSV file has been generated and downloaded. */
  readonly localExportCompleted = output<NgTableLocalExportEvent>();
  /**
   * `dataMode='remote'` only: emitted with the full current sort + filters whenever
   * either changes (sort toggle, filter value, reset, or a saved view activating with
   * new sort/filters). Build your server request from this payload.
   */
  readonly remoteQueryChange = output<NgTableRemoteQuery>();
  /** `dataMode='local'` + `pageTrackingEnabled=true` only: post-filter row count — bind to your paginator's `[length]`. */
  readonly filteredCountChange = output<number>();
  /** `dataMode='local'` + `pageTrackingEnabled=true` only: emitted with `0` when a filter/sort change should reset the current page. */
  readonly pageIndexChange = output<number>();
  readonly displayedColumnIds = computed(
    () => {
      // Colonne technique de selection injectee en tete quand activee.
      const ids = this.visibleColumns().map((column) => column.id);
      if (!this.isMobileView()) {
        return this.rowSelectionEnabled() ? [this.selectionColumnId, ...ids] : ids;
      }

      const actionColumn = this.actionColumn();
      if (!actionColumn) {
        return ids;
      }

      const withoutActions = ids.filter((id) => id !== actionColumn.id);
      const mobileIds = withoutActions.length > 0 ? withoutActions : ids;
      return this.rowSelectionEnabled() ? [this.selectionColumnId, ...mobileIds] : mobileIds;
    },
    // La liste est passée à `matHeaderRowDef`/`matRowDef` : garder la même référence
    // quand les ids n'ont pas changé évite à mat-table de reconstruire ses colonnes.
    {equal: (a, b) => a.length === b.length && a.every((id, index) => id === b[index])},
  );

  readonly columnsMenuItems = computed(() =>
    this.columns().filter((column) => column.id !== '__detail_row__' && column.id !== '__mobile_actions__'),
  );

  readonly viewsList = computed(() => this.effectiveViewsStore().views);
  readonly activeViewId = computed(() => this.effectiveViewsStore().activeViewId);
  readonly activeView = computed(() => this.viewsList().find((v) => v.id === this.activeViewId()) ?? null);

  readonly visibleColumns = computed(() => {
    const columns = this.columns();
    const visibility = this.effectiveColumnVisibility();

    const filtered = !visibility
      ? columns.filter((column) => column.visible !== false)
      : columns.filter((column) => visibility[column.id] ?? true);

    const order = this.effectiveColumnOrder();
    if (order.length === 0) {
      return filtered;
    }

    const orderIndex = new Map(order.map((id, index) => [id, index]));
    return [...filtered].sort((a, b) => {
      const indexA = orderIndex.has(a.id) ? orderIndex.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const indexB = orderIndex.has(b.id) ? orderIndex.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return indexA - indexB;
    });
  });
  readonly actionColumn = computed(() =>
    this.visibleColumns().find((column) => column.mobileRowActions) ?? null,
  );
  readonly detailRowColumns = ['__detail_row__'];
  protected readonly isMobileView = signal(
    typeof window !== 'undefined' ? window.innerWidth <= 760 : false,
  );
  /** Etat interne de selection quand `selectedRowKeys` n'est pas fourni. */
  protected readonly internalSelectedKeys = signal<ReadonlySet<unknown>>(new Set());
  protected readonly contextMenuRow = signal<any | null>(null);
  protected readonly columnFilters = signal<Record<string, string>>({});
  /** Summary of currently active filters (for the bottom bar). */
  readonly activeFilterSummaries = computed<Array<{ columnId: string; label: string; value: string }>>(() => {
    const filters = this.columnFilters();
    const summaries: Array<{ columnId: string; label: string; value: string }> = [];
    for (const column of this.columns()) {
      const rawValue = (filters[column.id] ?? '').trim();
      if (!rawValue) {
        continue;
      }
      summaries.push({
        columnId: column.id,
        label: column.filter?.label ?? column.header,
        value: this.formatFilterValueForDisplay(column, rawValue),
      });
    }
    return summaries;
  });
  protected readonly sortState = signal<NgTableSortChange>({columnId: '', direction: ''});
  /** Native HTML5 drag-and-drop state for column reordering (id of the column being dragged / hovered). */
  protected readonly draggingColumnId = signal<string | null>(null);
  protected readonly dragOverColumnId = signal<string | null>(null);
  protected readonly copiedCellKey = signal<string | null>(null);
  /** Id de la vue venant d'être mise à jour — pilote la coche transitoire du bouton. */
  protected readonly updatedViewId = signal<string | null>(null);
  protected readonly lazyFilterOptions = signal<Record<string, NgTableFilterOption[]>>({});
  protected readonly lazyFilterLoading = signal<Record<string, boolean>>({});
  /** `true` = "empty options" error, `false` = no error, a loader error is tracked separately below. */
  protected readonly lazyFilterEmptyError = signal<Record<string, boolean>>({});
  protected readonly lazyFilterLoadError = signal<Record<string, boolean>>({});
  /** Uncontrolled expansion state (row keys currently expanded). */
  protected readonly internalExpandedKeys = signal<ReadonlySet<unknown>>(new Set());
  protected readonly columnWidths = signal<Record<string, number>>({});
  protected readonly contextMenuPosition = signal<{ x: number; y: number }>({x: 0, y: 0});
  protected readonly contextMenuTriggerRef = viewChild<MatMenuTrigger>('rowContextMenuTrigger');
  protected readonly newViewName = signal('');
  protected readonly exportFromPage = signal(1);
  protected readonly exportToPage = signal(1);
  /**
   * Total number of locally-exportable "pages" (>= 1). Based on the filtered/sorted
   * row count and `pageSize()`; always `1` when pagination isn't tracked (there is
   * only one "page": everything), so the export dialog only asks for a page range
   * when it's actually meaningful.
   */
  readonly exportTotalPages = computed(() => {
    if (!this.pageTrackingEnabled()) {
      return 1;
    }
    const size = this.pageSize();
    if (!size || size <= 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(this.filteredSortedRows().length / size));
  });
  /** Local mode pipeline: rows source -> filtres -> tri (sans pagination). */
  private readonly filteredSortedRows = computed(() => {
    const sourceRows = this.rows();
    const activeColumns = this.visibleColumns();
    const filters = this.columnFilters();
    const sort = this.sortState();

    let nextRows = sourceRows.filter((row) => this.matchesAllFilters(row, activeColumns, filters));
    if (!sort.columnId || !sort.direction) {
      return nextRows;
    }

    const sortColumn = activeColumns.find((column) => column.id === sort.columnId);
    if (!sortColumn) {
      return nextRows;
    }

    nextRows = [...nextRows].sort((left, right) => {
      const leftValue = this.getSortValue(left, sortColumn);
      const rightValue = this.getSortValue(right, sortColumn);
      const compareResult = this.compareSortValues(leftValue, rightValue);
      return sort.direction === 'asc' ? compareResult : -compareResult;
    });

    return nextRows;
  });
  readonly displayedRows = computed(() => {
    if (this.dataMode() === 'remote') {
      // Le serveur a déjà filtré/trié/paginé — on affiche tel quel.
      return this.rows();
    }

    const filteredSorted = this.filteredSortedRows();
    if (!this.pageTrackingEnabled()) {
      return filteredSorted;
    }

    const size = this.pageSize();
    if (!size || size <= 0) {
      return filteredSorted;
    }

    const start = this.pageIndex() * size;
    return filteredSorted.slice(start, start + size);
  });
  private readonly mobileActionsColumnId = '__mobile_actions__';
  readonly mobileActionRowColumns = computed(() => {
    if (!this.isMobileView()) {
      return [] as string[];
    }
    return this.actionColumn() ? [this.mobileActionsColumnId] : [];
  });
  private readonly selectionColumnId = '__row_selection__';
  /**
   * Free-typed filter keystrokes flow through here instead of committing straight to
   * `columnFilters`. Grouped by column so typing in one field never resets another
   * field's debounce timer (`groupBy` + `mergeMap` keeps each column's debounce
   * independent), then `debounce` collapses rapid keystrokes into one commit —
   * which in `remote` mode means one request instead of one per character.
   */
  private readonly filterInputSubject = new Subject<{ columnId: string; value: string; epoch: number }>();
  readonly hasColumns = computed(() => this.displayedColumnIds().length > 0);
  /** Labels applicatifs fournis via `provideNgTableLabels()` (optionnels). */
  private readonly injectedLabels = inject(NG_TABLE_LABELS, {optional: true});
  private readonly filterEpochByColumn = new Map<string, number>();
  private readonly internalColumnVisibility = signal<Record<string, boolean>>({});
  private readonly internalColumnOrder = signal<string[]>([]);
  private readonly internalViewsStore = signal<NgTableViewsStore>({views: [], activeViewId: null});
  private hasLoadedInitialViewsStore = false;
  private readonly activeFilterColumnId = signal<string | null>(null);
  private readonly activeFilterTrigger = signal<MatMenuTrigger | null>(null);

  private readonly collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
  private resizingState: { columnId: string; startX: number; startWidth: number } | null = null;
  /**
   * Labels effectifs : défauts de la librairie < labels injectés pour toute
   * l'application (`provideNgTableLabels`) < `[labels]` de cette instance.
   *
   * `equal` est essentiel ici : un consommateur peut écrire
   * `[labels]="{columnsButton: 'X' | translate}"`, ce qui recrée l'objet à chaque
   * cycle de détection. La comparaison par valeur garde alors la référence
   * précédente, donc les composants enfants (`OnPush`) ne sont pas invalidés
   * inutilement.
   */
  readonly effectiveLabels = computed<NgTableLabels>(
    () => ({
      ...NG_TABLE_DEFAULT_LABELS,
      ...resolveNgTableLabelsSource(this.injectedLabels),
      ...this.labels(),
    }),
    {equal: ngTableLabelsEqual},
  );
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Ancre du menu contextuel, une fois déplacée dans `document.body` (voir `onRowContextMenu`). */
  private contextMenuAnchor: HTMLElement | null = null;
  /**
   * Ecouteur de scroll installé uniquement pendant qu'un menu de filtre est ouvert.
   * Enregistré hors binding Angular (`addEventListener` direct, `passive`) pour ne pas
   * déclencher un cycle de détection à chaque pixel scrollé de la page.
   */
  private scrollListener: (() => void) | null = null;

  constructor() {
    this.filterInputSubject
      .pipe(
        groupBy((entry) => entry.columnId),
        // `debounce(() => timer(...))` plutôt que `debounceTime(...)` : le délai est relu
        // à chaque frappe, donc `[filterDebounceMs]` reste modifiable à chaud (et peut
        // être mis à 0 dans les tests).
        mergeMap((group) => group.pipe(debounce(() => timer(this.filterDebounceMs())))),
        takeUntilDestroyed(),
      )
      .subscribe((entry) => {
        if (entry.epoch !== this.filterEpoch(entry.columnId)) {
          return; // superseded by a clear/reset that happened while this keystroke was debouncing
        }
        this.commitFilterValue(entry.columnId, entry.value);
      });

    effect(() => {
      const externalFilters = this.filters();
      if (!externalFilters) {
        return;
      }
      this.columnFilters.set(this.withDefaultFilterKeys(externalFilters));
      this.requestFilterPositionUpdate();
    });

    effect(() => {
      const externalVisibility = this.columnVisibility();
      if (!externalVisibility) {
        return;
      }
      this.internalColumnVisibility.set({...externalVisibility});
    });

    effect(() => {
      const externalOrder = this.columnOrder();
      if (!externalOrder) {
        return;
      }
      this.internalColumnOrder.set([...externalOrder]);
    });

    effect(() => {
      // Defensive sync: suit la liste des colonnes courantes.
      const columns = this.columns();
      this.internalColumnVisibility.update((current) => {
        const next = {...current};
        const ids = new Set(columns.map((column) => column.id));
        for (const key of Object.keys(next)) {
          if (!ids.has(key)) {
            delete next[key];
          }
        }
        for (const column of columns) {
          if (next[column.id] === undefined) {
            next[column.id] = column.visible !== false;
          }
        }
        return next;
      });

      // Drop stale ids from the drag order (removed/renamed columns) without
      // resetting the whole order — newly seen columns simply fall back to
      // their natural position via visibleColumns()'s MAX_SAFE_INTEGER fallback.
      this.internalColumnOrder.update((current) => {
        if (current.length === 0) {
          return current;
        }
        const ids = new Set(columns.map((column) => column.id));
        const pruned = current.filter((id) => ids.has(id));
        return pruned.length === current.length ? current : pruned;
      });

      // Le composant construit lui-même le jeu de filtres à partir de `columns()` —
      // indépendamment de ce que le parent branche (ou non) sur [filters]. Chaque
      // colonne filtrable obtient une entrée (défaut '') dans `columnFilters`, et les
      // colonnes retirées/renommées voient la leur nettoyée. Ainsi `filtersChange` /
      // `remoteQueryChange` exposent toujours un jeu complet, prévisible, et
      // directement exploitable par n'importe quel consommateur sans qu'il ait à
      // connaître/répéter la liste des colonnes filtrables lui-même.
      this.columnFilters.update((current) => this.withDefaultFilterKeys(current));
    });

    effect(() => {
      const nextColumns = this.visibleColumns();
      this.columnWidths.update((current) => {
        const existing = new Set(nextColumns.map((column) => column.id));
        const next: Record<string, number> = {};

        for (const [columnId, width] of Object.entries(current)) {
          if (existing.has(columnId)) {
            next[columnId] = width;
          }
        }

        for (const column of nextColumns) {
          if (next[column.id] !== undefined) {
            continue;
          }
          if (column.widthPx && column.widthPx > 0) {
            next[column.id] = column.widthPx;
          }
        }

        return next;
      });

      this.requestFilterPositionUpdate();
    });

    effect(() => {
      this.displayedRows().length;
      this.requestFilterPositionUpdate();
    });

    effect(() => {
      if (this.dataMode() !== 'local' || !this.pageTrackingEnabled()) {
        return;
      }
      this.filteredCountChange.emit(this.filteredSortedRows().length);
    });

    // Inline mode: lazy filter options must be loaded eagerly since there is no menu-open event.
    effect(() => {
      if (!this.inlineFilters()) {
        return;
      }
      for (const column of this.visibleColumns()) {
        if (column.filter?.optionsLoader) {
          void this.ensureLazyFilterOptions(column.id, column.filter);
        }
      }
    });

    // Views: the active view is auto-applied exactly once, on the first time a store
    // becomes available (controlled: parent-supplied input; uncontrolled: localStorage
    // read) — never again afterwards, so the user's later edits are never silently
    // reverted by a stale re-read or an echoed store update from the parent.
    effect(() => {
      if (!this.viewsEnabled()) {
        return;
      }
      const external = this.viewsStore();
      if (external) {
        this.internalViewsStore.set(external);
        if (!this.hasLoadedInitialViewsStore) {
          this.hasLoadedInitialViewsStore = true;
          this.applyActiveView(external);
        }
        return;
      }
      if (this.hasLoadedInitialViewsStore) {
        return;
      }
      const key = this.viewsStorageKey();
      if (!key) {
        return;
      }
      this.hasLoadedInitialViewsStore = true;
      const loaded = this.loadViewsStoreFromLocalStorage(key);
      this.internalViewsStore.set(loaded);
      this.applyActiveView(loaded);
    });
  }

  ngOnDestroy(): void {
    this.stopResize();
    this.stopScrollTracking();
    // L'ancre a été déplacée dans `document.body` : elle n'est plus détruite avec la vue.
    this.contextMenuAnchor?.remove();
    this.contextMenuAnchor = null;
  }

  onHeaderSort(column: NgTableColumn<any>): void {
    if (!column.sortable) {
      return;
    }

    const current = this.sortState();
    const isSameColumn = current.columnId === column.id;

    let nextDirection: SortDirection = 'asc';
    if (isSameColumn && current.direction === 'asc') {
      nextDirection = 'desc';
    } else if (isSameColumn && current.direction === 'desc') {
      nextDirection = '';
    }

    const nextState: NgTableSortChange = {
      columnId: nextDirection ? column.id : '',
      direction: nextDirection,
    };
    this.sortState.set(nextState);
    this.sortChange.emit(nextState);
    this.onQueryStateChanged();
  }

  /**
   * `text` filters are free-typed — every keystroke would otherwise re-run local
   * filtering and, in `remote` mode, fire a request per character. Those are
   * debounced (see `filterInputSubject`); discrete selections (select/enum/boolean/
   * date pickers) commit immediately since they're single deliberate actions.
   */
  onFilterValue(columnId: string, value: string): void {
    if (!this.isFreeTypedFilter(columnId)) {
      this.commitFilterValue(columnId, value);
      return;
    }
    this.filterInputSubject.next({columnId, value, epoch: this.filterEpoch(columnId)});
  }

  clearFilter(columnId: string): void {
    this.bumpFilterEpoch(columnId); // supersede any debounced keystroke still in flight for this column
    this.commitFilterValue(columnId, '');
  }

  clearAllFilters(): void {
    for (const column of this.columns()) {
      this.bumpFilterEpoch(column.id);
    }
    const next: Record<string, string> = {};
    this.columnFilters.set(next);
    this.filtersChange.emit(next);
    this.onQueryStateChanged();
  }

  /**
   * Saves the list's current presentation (columns, order, sort, filters, and
   * pagination when `pageTrackingEnabled=true`) as a view. If a view with the same name
   * already exists, it is overwritten in place; otherwise a new view is created.
   * Either way the saved view becomes the active one.
   */
  saveCurrentAsView(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    const state = this.captureCurrentViewState();
    const store = this.effectiveViewsStore();
    const now = new Date().toISOString();
    const existing = store.views.find((v) => v.name === trimmed);

    let nextViews: NgTableView[];
    let activeViewId: string;
    if (existing) {
      activeViewId = existing.id;
      nextViews = store.views.map((v) => (v.id === existing.id ? {...v, state, updatedAt: now} : v));
    } else {
      const created: NgTableView = {id: this.generateViewId(), name: trimmed, createdAt: now, updatedAt: now, state};
      activeViewId = created.id;
      nextViews = [...store.views, created];
    }

    this.commitViewsStore({views: nextViews, activeViewId});
    this.newViewName.set('');
  }

  /**
   * Overwrites an existing view's saved presentation with the list's current one
   * (columns, order, sort, filters, and pagination when `pageTrackingEnabled=true`),
   * keeping its name and id. The updated view becomes the active one.
   */
  updateView(view: NgTableView): void {
    const state = this.captureCurrentViewState();
    const store = this.effectiveViewsStore();
    const now = new Date().toISOString();
    const nextViews = store.views.map((v) => (v.id === view.id ? {...v, state, updatedAt: now} : v));
    this.commitViewsStore({views: nextViews, activeViewId: view.id});

    // Feedback transitoire (icône -> check) — même mécanisme que la copie de
    // cellule. Pas de notification/toast : la librairie n'a pas de dépendance
    // UI pour ça, et un swap d'icône reste visible même si le menu est resté ouvert.
    this.updatedViewId.set(view.id);
    setTimeout(() => {
      if (this.updatedViewId() === view.id) {
        this.updatedViewId.set(null);
      }
    }, 1400);
  }

  /** Icône du bouton "mettre à jour" d'une vue — coche transitoire juste après l'action. */
  viewUpdateIconName(view: NgTableView): string {
    return this.updatedViewId() === view.id ? 'check' : 'sync';
  }

  private captureCurrentViewState(): NgTableViewState {
    return {
      columnVisibility: {...this.effectiveColumnVisibility()},
      columnOrder: [...this.effectiveColumnOrder()],
      sort: {...this.sortState()},
      filters: {...this.columnFilters()},
      columnWidths: {...this.columnWidths()},
      ...(this.pageTrackingEnabled() ? {pageIndex: this.pageIndex(), pageSize: this.pageSize()} : {}),
    };
  }

  isFilterActive(columnId: string): boolean {
    return !!(this.columnFilters()[columnId] ?? '').trim();
  }

  currentFilterValue(columnId: string): string {
    return this.columnFilters()[columnId] ?? '';
  }

  /** Titre du menu de filtre (libellé de la colonne). */
  filterMenuTitle(column: NgTableColumn<any>): string {
    return column.filter?.label ?? column.header ?? '';
  }

  /** `effectiveLabels().filterBy` avec `{field}` remplacé par le libellé de la colonne. */
  filterByAriaLabel(column: NgTableColumn<any>): string {
    return this.effectiveLabels().filterBy.replace('{field}', column.header ?? '');
  }

  onResizeStart(event: MouseEvent, column: NgTableColumn<any>): void {
    if (!column.resizable) {
      return;
    }

    // Let dblclick trigger auto-fit without initiating a drag cycle.
    if (event.detail > 1) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    // `table-layout: fixed` ignore `min-width`/`max-width` sur les cellules : sans
    // largeur explicite, les colonnes voisines absorbent la place et s'écrasent sous
    // leur `minWidthPx` (leur contenu débordant alors sur la colonne suivante). On fige
    // donc la largeur rendue de toutes les colonnes avant de commencer le drag : chacune
    // garde sa taille, et le tableau déborde en scroll horizontal comme attendu.
    this.freezeRenderedColumnWidths(event.target as HTMLElement | null);

    const widthMap = this.columnWidths();
    const startWidth = widthMap[column.id] ?? column.widthPx ?? 180;
    this.resizingState = {
      columnId: column.id,
      startX: event.clientX,
      startWidth,
    };

    document.addEventListener('mousemove', this.onMouseMoveBound);
    document.addEventListener('mouseup', this.onMouseUpBound);
  }

  /**
   * Keyboard-operable alternative to dragging the resize handle: ArrowLeft/ArrowRight
   * shrink/grow the column by a fixed step while the handle is focused. The mouse-only
   * drag otherwise has no keyboard equivalent at all (WCAG 2.1.1 Keyboard).
   */
  onResizeHandleKeydown(event: KeyboardEvent, column: NgTableColumn<any>): void {
    if (!column.resizable || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) {
      return;
    }
    event.preventDefault();

    // Même raison que dans `onResizeStart` : sans figer les largeurs rendues des
    // colonnes voisines, `table-layout: fixed` les laisse s'écraser sous leur
    // `minWidthPx` au lieu de laisser le tableau déborder en scroll horizontal.
    this.freezeRenderedColumnWidths(event.target as HTMLElement | null);

    const step = 16;
    const delta = event.key === 'ArrowLeft' ? -step : step;
    const widthMap = this.columnWidths();
    const currentWidth = widthMap[column.id] ?? column.widthPx ?? 180;
    const minWidth = column.minWidthPx ?? 120;
    const maxWidth = column.maxWidthPx ?? 620;
    const nextWidth = Math.max(minWidth, Math.min(maxWidth, currentWidth + delta));

    this.columnWidths.update((current) => ({...current, [column.id]: nextWidth}));
    this.requestFilterPositionUpdate();
  }

  onResizeAutoFit(event: MouseEvent, column: NgTableColumn<any>): void {
    if (!column.resizable) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const table = this.resolveTableElement(event.target as HTMLElement | null);
    if (!table) {
      return;
    }

    const selector = `.mat-column-${this.escapeCssToken(column.id)}`;
    const cells = Array.from(table.querySelectorAll<HTMLElement>(selector));
    if (cells.length === 0) {
      return;
    }

    let measured = 0;
    for (const cell of cells) {
      const preferredNode =
        (cell.querySelector('.header-button') as HTMLElement | null)
        ?? (cell.querySelector('.th-wrap') as HTMLElement | null)
        ?? (cell.querySelector('.cell-content') as HTMLElement | null)
        ?? cell;

      const computed = window.getComputedStyle(cell);
      const padding = (parseFloat(computed.paddingLeft) || 0) + (parseFloat(computed.paddingRight) || 0);
      measured = Math.max(measured, Math.ceil(this.measureNaturalWidth(preferredNode) + padding + 14));
    }

    const minWidth = column.minWidthPx ?? 120;
    const maxWidth = column.maxWidthPx ?? 620;
    const nextWidth = Math.max(minWidth, Math.min(maxWidth, measured));

    // Les colonnes voisines doivent aussi être figées, sinon l'auto-fit d'une colonne
    // écrase les autres exactement comme un drag (cf. `freezeRenderedColumnWidths`).
    this.freezeRenderedColumnWidths(table);

    this.columnWidths.update((current) => ({
      ...current,
      [column.id]: nextWidth,
    }));

    this.requestFilterPositionUpdate();
  }

  onRowContextMenu(event: MouseEvent, row: any): void {
    if (!this.rowContextMenuEnabled() || !this.rowContextMenuTemplate()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.contextMenuRow.set(row);
    // Small offset keeps the pointer visible and makes the menu feel anchored to the click.
    this.contextMenuPosition.set({x: event.clientX + 2, y: event.clientY + 2});
    this.detachContextMenuAnchorFromHost();
    this.rowContextMenu.emit({
      row,
      position: {x: event.clientX, y: event.clientY},
    });

    const trigger = this.contextMenuTriggerRef();
    if (!trigger) {
      return;
    }

    if (trigger.menuOpen) {
      trigger.closeMenu();
    }
    // Wait one frame so overlay origin position is fully updated before opening.
    requestAnimationFrame(() => trigger.openMenu());
  }

  onFilterMenuOpened(columnId: string, trigger: MatMenuTrigger, filter: NgTableFilterConfig): void {
    this.activeFilterColumnId.set(columnId);
    this.activeFilterTrigger.set(trigger);
    this.startScrollTracking();
    void this.ensureLazyFilterOptions(columnId, filter);
    this.requestFilterPositionUpdate();
  }

  onFilterMenuClosed(columnId: string): void {
    if (this.activeFilterColumnId() === columnId) {
      this.activeFilterColumnId.set(null);
      this.activeFilterTrigger.set(null);
      this.stopScrollTracking();
    }
  }

  columnWidthPx(column: NgTableColumn<any>): number | null {
    const width = this.columnWidths()[column.id] ?? column.widthPx;
    return width && width > 0 ? width : null;
  }

  currentSortIcon(column: NgTableColumn<any>): string {
    const sort = this.sortState();
    if (sort.columnId !== column.id || !sort.direction) {
      return 'swap_vert';
    }
    return sort.direction === 'asc' ? 'north' : 'south';
  }

  currentSortAriaLabel(column: NgTableColumn<any>): string {
    const sort = this.sortState();
    const labels = this.effectiveLabels();
    if (sort.columnId !== column.id || !sort.direction) {
      return labels.sort;
    }
    return sort.direction === 'asc' ? labels.sortAsc : labels.sortDesc;
  }

  /**
   * `aria-sort` du `<th>` — norme WAI-ARIA pour les tableaux triables (APG "Table"
   * pattern). `null` pour une colonne non triable : l'attribut n'est alors pas
   * posé du tout (un `aria-sort="none"` sur une colonne qu'on ne peut pas trier
   * induirait en erreur un lecteur d'écran en laissant croire que c'est possible).
   */
  ariaSortValue(column: NgTableColumn<any>): 'ascending' | 'descending' | 'none' | null {
    if (!column.sortable) {
      return null;
    }
    const sort = this.sortState();
    if (sort.columnId !== column.id || !sort.direction) {
      return 'none';
    }
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  cellValue(row: any, column: NgTableColumn<any>): unknown {
    return column.valueAccessor(row);
  }

  /** Texte de la tooltip de troncature — même valeur que la cellule, en `string`. */
  cellText(row: any, column: NgTableColumn<any>): string {
    const value = this.cellValue(row, column);
    return value === null || value === undefined ? '' : String(value);
  }

  onRowClick(row: any): void {
    this.rowClick.emit(row);
    if (this.isUncontrolledDetailMode() && this.detailRowToggleOnRowClick()) {
      this.toggleDetail(row);
    }
  }

  /** `{index}` interpolé en 1-based — plus lisible qu'un index 0-based pour un utilisateur de lecteur d'écran. */
  rowSelectAriaLabel(rowIndex: number): string {
    return this.effectiveLabels().selectRow.replace('{index}', `${rowIndex + 1}`);
  }

  /** A row is a keyboard focus stop only when it actually does something — no needless tab stops otherwise. */
  isRowInteractive(): boolean {
    return !!this.detailRowTemplate() || (this.rowContextMenuEnabled() && !!this.rowContextMenuTemplate());
  }

  /**
   * Enter/Space mirrors a row click (detail toggle); the "ContextMenu" key or
   * Shift+F10 opens the row's context menu — the standard keyboard equivalent for a
   * right-click, per the WAI-ARIA APG. Without this, `rowContextMenuEnabled` would
   * only ever be reachable with a mouse.
   */
  onRowKeydown(event: KeyboardEvent, row: any): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onRowClick(row);
      return;
    }

    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      this.openRowContextMenuFromKeyboard(event.currentTarget as HTMLElement | null, row);
    }
  }

  private openRowContextMenuFromKeyboard(rowElement: HTMLElement | null, row: any): void {
    if (!this.rowContextMenuEnabled() || !this.rowContextMenuTemplate()) {
      return;
    }

    // Pas de coordonnées souris pour une ouverture clavier : on ancre le menu au
    // coin de la ligne plutôt qu'à un point de clic.
    const rect = rowElement?.getBoundingClientRect();
    const x = rect ? rect.left + 12 : 0;
    const y = rect ? rect.top + 12 : 0;

    this.contextMenuRow.set(row);
    this.contextMenuPosition.set({x, y});
    this.detachContextMenuAnchorFromHost();
    this.rowContextMenu.emit({row, position: {x, y}});

    const trigger = this.contextMenuTriggerRef();
    if (!trigger) {
      return;
    }
    if (trigger.menuOpen) {
      trigger.closeMenu();
    }
    requestAnimationFrame(() => trigger.openMenu());
  }

  isFilterOptionsLoading(columnId: string): boolean {
    return this.lazyFilterLoading()[columnId] ?? false;
  }

  onRowContextMenuClosed(): void {
    this.contextMenuRow.set(null);
  }

  /**
   * Donne une largeur explicite à chaque colonne visible qui n'en a pas encore, à
   * partir de sa largeur réellement rendue — condition pour qu'un redimensionnement
   * n'écrase pas les colonnes voisines (cf. `table-layout: fixed`).
   */
  private freezeRenderedColumnWidths(fromElement: HTMLElement | null): void {
    const table = this.resolveTableElement(fromElement);
    if (!table) {
      return;
    }

    const measured: Record<string, number> = {};
    for (const candidate of this.visibleColumns()) {
      if (this.columnWidths()[candidate.id] !== undefined) {
        continue;
      }
      const headerCell = table.querySelector<HTMLElement>(
        `th.mat-column-${this.escapeCssToken(candidate.id)}`,
      );
      const width = headerCell?.getBoundingClientRect().width ?? 0;
      if (width > 0) {
        measured[candidate.id] = Math.round(width);
      }
    }

    if (Object.keys(measured).length > 0) {
      this.columnWidths.update((current) => ({...measured, ...current}));
    }
  }

  /** Programmatic toggle of a row detail (uncontrolled mode only). */
  toggleDetail(row: any): void {
    if (!this.detailRowTemplate() || !this.rowCanExpand(row)) {
      return;
    }

    const key = this.rowKey(row);
    const current = new Set(this.internalExpandedKeys());
    const expanded = !current.has(key);

    if (expanded) {
      if (this.detailRowAccordion()) {
        current.clear();
      }
      current.add(key);
    } else {
      current.delete(key);
    }

    this.internalExpandedKeys.set(current);
    this.detailToggle.emit({row, expanded, expandedKeys: [...current]});
  }

  /** Collapse every expanded detail row (uncontrolled mode). */
  collapseAllDetails(): void {
    if (this.internalExpandedKeys().size === 0) {
      return;
    }
    this.internalExpandedKeys.set(new Set());
    this.detailToggle.emit({row: null, expanded: false, expandedKeys: []});
  }

  /** Number of currently expanded detail rows (uncontrolled mode). */
  expandedDetailCount(): number {
    return this.internalExpandedKeys().size;
  }

  rowCanExpand(row: any): boolean {
    const guard = this.detailRowCanExpand();
    return guard ? guard(row) : true;
  }

  isRowExpanded(row: any): boolean {
    return this.isDetailExpanded(0, row);
  }

  isRowSelected(row: any): boolean {
    if (!this.rowSelectionEnabled()) {
      return false;
    }
    const key = this.rowKey(row);
    const external = this.selectedRowKeys();
    if (external) {
      return external.includes(key);
    }
    return this.internalSelectedKeys().has(key);
  }

  selectedRowsCount(): number {
    return this.resolveSelectedKeysSet().size;
  }

  areAllDisplayedRowsSelected(): boolean {
    if (!this.rowSelectionEnabled()) {
      return false;
    }
    const rows = this.displayedRows();
    if (rows.length === 0) {
      return false;
    }
    const selected = this.resolveSelectedKeysSet();
    return rows.every((row) => selected.has(this.rowKey(row)));
  }

  hasPartiallySelectedDisplayedRows(): boolean {
    if (!this.rowSelectionEnabled()) {
      return false;
    }
    const rows = this.displayedRows();
    if (rows.length === 0) {
      return false;
    }
    const selected = this.resolveSelectedKeysSet();
    const selectedCount = rows.reduce((count, row) => count + (selected.has(this.rowKey(row)) ? 1 : 0), 0);
    return selectedCount > 0 && selectedCount < rows.length;
  }

  onToggleRowSelection(event: MatCheckboxChange, row: any): void {
    const checked = !!event.checked;
    const key = this.rowKey(row);
    const selected = new Set(this.resolveSelectedKeysSet());
    if (checked) {
      selected.add(key);
    } else {
      selected.delete(key);
    }
    this.commitSelection(selected, row, checked);
  }

  onToggleAllDisplayedRows(event: MatCheckboxChange): void {
    const checked = !!event.checked;
    const selected = new Set(this.resolveSelectedKeysSet());
    const rows = this.displayedRows();
    for (const row of rows) {
      const key = this.rowKey(row);
      if (checked) {
        selected.add(key);
      } else {
        selected.delete(key);
      }
    }
    this.commitSelection(selected, null, checked);
  }

  isColumnVisible(columnId: string): boolean {
    return this.effectiveColumnVisibility()[columnId] ?? true;
  }

  onToggleColumnVisibility(columnId: string, checked: boolean): void {
    const next = {
      ...this.effectiveColumnVisibility(),
      [columnId]: checked,
    };
    this.internalColumnVisibility.set(next);
    this.columnVisibilityChange.emit(next);
  }

  /** Switches to a saved view, applying its presentation immediately. */
  activateView(view: NgTableView): void {
    const store = this.effectiveViewsStore();
    this.commitViewsStore({...store, activeViewId: view.id});
    this.applyViewState(view);
  }

  /** Deletes a saved view. If it was the active one, the first remaining view (if any) becomes active. */
  deleteView(view: NgTableView): void {
    const store = this.effectiveViewsStore();
    const nextViews = store.views.filter((v) => v.id !== view.id);
    const nextActiveId = store.activeViewId === view.id ? (nextViews[0]?.id ?? null) : store.activeViewId;
    this.commitViewsStore({views: nextViews, activeViewId: nextActiveId});
  }

  /**
   * Click on the export button. `remote` mode emits `(remoteExportRequested)`
   * directly (no dialog — the caller owns the whole flow). `local` mode opens the
   * page-range dialog, unless there's only a single exportable page, in which case
   * it exports immediately.
   */
  openExportDialog(): void {
    if (this.exportMode() === 'remote') {
      this.remoteExportRequested.emit({
        sort: this.sortState(),
        filters: this.columnFilters(),
        page: {index: this.pageIndex(), size: this.pageTrackingEnabled() ? this.pageSize() : 0},
      });
      return;
    }

    const total = this.exportTotalPages();
    if (total <= 1) {
      this.exportLocalRange(1, 1);
      return;
    }
    this.exportFromPage.set(1);
    this.exportToPage.set(total);
  }

  /** Confirms the page-range dialog and triggers the local CSV export. */
  confirmExportDialog(): void {
    const total = this.exportTotalPages();
    const from = Math.min(Math.max(1, Math.round(this.exportFromPage()) || 1), total);
    const to = Math.min(Math.max(from, Math.round(this.exportToPage()) || from), total);
    this.exportLocalRange(from, to);
  }

  private exportLocalRange(fromPage: number, toPage: number): void {
    const allRows = this.filteredSortedRows();
    const size = this.pageTrackingEnabled() && this.pageSize() > 0 ? this.pageSize() : allRows.length || 1;
    const rows = this.pageTrackingEnabled() ? allRows.slice((fromPage - 1) * size, toPage * size) : allRows;

    this.downloadCsv(this.buildExportCsv(rows), `${this.exportFilename()}.csv`);
    this.localExportCompleted.emit({fromPage, toPage, rowCount: rows.length});
  }

  private buildExportCsv(rows: readonly any[]): string {
    const exportColumns = this.visibleColumns().filter((column) => column.exportable !== false);
    const lines = [exportColumns.map((column) => this.csvEscape(column.header)).join(';')];

    for (const row of rows) {
      const cells = exportColumns.map((column) => {
        const raw = column.exportValueAccessor ? column.exportValueAccessor(row) : column.valueAccessor(row);
        return this.csvEscape(this.formatExportValue(raw));
      });
      lines.push(cells.join(';'));
    }

    return lines.join('\r\n');
  }

  private formatExportValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    return value instanceof Date ? value.toISOString() : String(value);
  }

  /** Quotes a CSV field only when needed (separator, quote or newline present). */
  private csvEscape(value: string): string {
    return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }

  private downloadCsv(content: string, filename: string): void {
    if (typeof document === 'undefined') {
      return;
    }
    // BOM UTF-8 : sans lui, Excel interprète le CSV en Latin-1 et corrompt les accents.
    const blob = new Blob(['﻿' + content], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  /** Reorders columns after a header drag-and-drop. Disabled on mobile (columns are already collapsed there). */
  onColumnDragStart(event: DragEvent, column: NgTableColumn<any>): void {
    if (this.isMobileView()) {
      return;
    }
    this.draggingColumnId.set(column.id);
    event.dataTransfer?.setData('text/plain', column.id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onColumnDragOver(event: DragEvent, column: NgTableColumn<any>): void {
    const draggingId = this.draggingColumnId();
    if (!draggingId || draggingId === column.id) {
      return;
    }
    // Must call preventDefault() for the browser to allow a drop on this element.
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dragOverColumnId.set(column.id);
  }

  onColumnDragLeave(column: NgTableColumn<any>): void {
    if (this.dragOverColumnId() === column.id) {
      this.dragOverColumnId.set(null);
    }
  }

  onColumnDrop(event: DragEvent, column: NgTableColumn<any>): void {
    event.preventDefault();
    const sourceId = this.draggingColumnId();
    this.draggingColumnId.set(null);
    this.dragOverColumnId.set(null);
    if (!sourceId) {
      return;
    }
    this.moveColumnNextTo(sourceId, column.id);
  }

  onColumnDragEnd(): void {
    this.draggingColumnId.set(null);
    this.dragOverColumnId.set(null);
  }

  /**
   * Keyboard-operable alternative to the drag-and-drop reorder: ArrowLeft/ArrowRight
   * while the drag handle is focused move the column one step in that direction.
   * Native HTML5 drag-and-drop (used for the mouse path) has no keyboard equivalent
   * at all, so this is required for WCAG 2.1.1 (Keyboard) — not just a nicety.
   */
  onColumnHandleKeydown(event: KeyboardEvent, column: NgTableColumn<any>): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();

    const reorderable = this.visibleColumns().map((c) => c.id);
    const fromIndex = reorderable.indexOf(column.id);
    if (fromIndex === -1) {
      return;
    }
    const toIndex = event.key === 'ArrowLeft' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= reorderable.length) {
      return;
    }
    this.moveColumnNextTo(column.id, reorderable[toIndex]);
  }

  /** Moves `sourceId` to `targetId`'s position. Shared by the drag-drop and keyboard reorder paths. */
  private moveColumnNextTo(sourceId: string, targetId: string): void {
    if (sourceId === targetId) {
      return;
    }

    const reorderable = this.visibleColumns().map((c) => c.id);
    const fromIndex = reorderable.indexOf(sourceId);
    const toIndex = reorderable.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) {
      return;
    }
    reorderable.splice(fromIndex, 1);
    reorderable.splice(toIndex, 0, sourceId);

    // Columns currently hidden by the picker keep their place at the end so
    // toggling them visible later doesn't jump them to an unexpected spot.
    const hiddenIds = this.columns()
      .map((c) => c.id)
      .filter((id) => !reorderable.includes(id));

    const next = [...reorderable, ...hiddenIds];
    this.internalColumnOrder.set(next);
    this.columnOrderChange.emit(next);
  }

  shouldRenderInlineFilter(column: NgTableColumn<any>): boolean {
    if (!this.inlineFilters() || !column.filter) {
      return false;
    }
    const allowedColumns = this.inlineFilterColumnIds();
    if (!allowedColumns || allowedColumns.length === 0) {
      return true;
    }
    return allowedColumns.includes(column.id);
  }

  rowClasses(row: any): string | string[] | Record<string, boolean> {
    return this.rowClassFn()?.(row) ?? '';
  }

  hasCopyAction(column: NgTableColumn<any>, row: any): boolean {
    return !!this.resolveCopyValue(column, row);
  }

  copyTooltip(column: NgTableColumn<any>): string {
    if (typeof column.copy === 'object' && column.copy.tooltip) {
      return column.copy.tooltip;
    }
    return this.effectiveLabels().copy;
  }

  copyIconName(column: NgTableColumn<any>, row: any, rowIndex: number): string {
    const key = this.copyCellKey(column, row, rowIndex);
    return this.copiedCellKey() === key ? 'check' : 'content_copy';
  }

  onCopyCellValue(event: MouseEvent, column: NgTableColumn<any>, row: any, rowIndex: number): void {
    event.stopPropagation();
    const value = this.resolveCopyValue(column, row);
    if (!value) {
      return;
    }

    const key = this.copyCellKey(column, row, rowIndex);
    navigator.clipboard.writeText(value)
      .catch(() => undefined)
      .finally(() => {
        this.copiedCellKey.set(key);
        setTimeout(() => {
          if (this.copiedCellKey() === key) {
            this.copiedCellKey.set(null);
          }
        }, 1400);
      });

    this.cellCopied.emit({columnId: column.id, value, row});
  }

  closeFilterMenuOnEnter(event: Event, trigger: MatMenuTrigger): void {
    event.stopPropagation();
    queueMicrotask(() => trigger.closeMenu());
  }

  private resolveTableElement(fromElement: HTMLElement | null): HTMLElement | null {
    return (
      (fromElement?.closest('table.ng-table') as HTMLElement | null)
      ?? this.hostElement.nativeElement.querySelector<HTMLElement>('table.ng-table')
    );
  }

  /**
   * Largeur naturelle du contenu d'un nœud, indépendamment de la largeur imposée à sa
   * colonne. On ne peut pas se contenter de `scrollWidth` : le nœud est déjà contraint,
   * et comme les cellules sont en `overflow: visible`, `scrollWidth` renvoie ~la largeur
   * de la boîte, pas celle du contenu — d'où un auto-fit systématiquement trop étroit.
   * On dé-contraint donc le nœud le temps d'une mesure, puis on restaure ses styles.
   */
  private measureNaturalWidth(node: HTMLElement): number {
    const previousWidth = node.style.width;
    const previousMaxWidth = node.style.maxWidth;
    const previousWhiteSpace = node.style.whiteSpace;

    node.style.width = 'max-content';
    node.style.maxWidth = 'none';
    node.style.whiteSpace = 'nowrap';

    const natural = Math.max(node.scrollWidth, node.getBoundingClientRect().width);

    node.style.width = previousWidth;
    node.style.maxWidth = previousMaxWidth;
    node.style.whiteSpace = previousWhiteSpace;

    return natural;
  }

  /**
   * L'ancre du menu contextuel est en `position: fixed` : si un ancêtre du composant
   * porte `backdrop-filter`, `transform`, `filter` ou `perspective`, cet ancêtre devient
   * le bloc conteneur des éléments `fixed` et le menu s'ouvre au mauvais endroit.
   * On déplace donc l'ancre dans `document.body` au premier clic droit — le composant
   * reste ainsi correct quel que soit le contexte de mise en page du consommateur.
   */
  private detachContextMenuAnchorFromHost(): void {
    if (this.contextMenuAnchor || typeof document === 'undefined') {
      return;
    }
    const anchor = this.hostElement.nativeElement.querySelector<HTMLElement>('.context-menu-anchor');
    if (!anchor || anchor.parentElement === document.body) {
      return;
    }
    document.body.appendChild(anchor);
    this.contextMenuAnchor = anchor;
  }

  /**
   * Le menu de filtre est en overlay : il doit se repositionner quand la page défile.
   * L'écouteur est posé hors Angular (pas de `@HostListener`) et seulement tant qu'un
   * menu est ouvert — un `window:scroll` bindé en permanence déclencherait un cycle de
   * détection à chaque événement de scroll de l'application entière.
   */
  private startScrollTracking(): void {
    if (this.scrollListener || typeof window === 'undefined') {
      return;
    }
    const listener = () => this.requestFilterPositionUpdate();
    window.addEventListener('scroll', listener, {passive: true, capture: true});
    this.scrollListener = () => window.removeEventListener('scroll', listener, {capture: true});
  }

  onTableWrapScroll(): void {
    this.requestFilterPositionUpdate();
  }

  private stopScrollTracking(): void {
    this.scrollListener?.();
    this.scrollListener = null;
  }

  /** Message d'erreur à afficher pour les options de filtre de cette colonne (vide = pas d'erreur). */
  filterOptionsError(columnId: string): string {
    const labels = this.effectiveLabels();
    if (this.lazyFilterLoadError()[columnId]) {
      return labels.refOptionsLoadError;
    }
    if (this.lazyFilterEmptyError()[columnId]) {
      return labels.refOptionsEmpty;
    }
    return '';
  }

  resolvedFilterOptions(columnId: string, filter: NgTableFilterConfig): NgTableFilterOption[] {
    const lazyOptions = this.lazyFilterOptions()[columnId];
    if (lazyOptions) {
      return lazyOptions;
    }
    return filter.options ?? [];
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.isMobileView.set(window.innerWidth <= 760);
    this.requestFilterPositionUpdate();
  }

  trackByColumn = (_: number, column: NgTableColumn<any>): string => column.id;

  trackByRow = (index: number, row: any): any => {
    const keyAccessor = this.rowKeyAccessor();
    if (keyAccessor) {
      return keyAccessor(row);
    }
    const externalTrackBy = this.rowTrackBy();
    if (externalTrackBy) {
      return externalTrackBy(index, row);
    }
    // Jamais l'index en dernier recours : il change au tri/filtre/pagination,
    // ce qui ferait réutiliser la vue (et la case à cocher) d'une ligne pour
    // une autre — voir `rowKey()` pour la même règle côté sélection.
    return row?.id ?? row?.ID ?? row;
  };

  resolvedTrackBy: TrackByFunction<any> = (index: number, row: any): any =>
    this.trackByRow(index, row);

  mobileActionsRowWhen = (_: number, _row: any): boolean => this.mobileActionRowColumns().length > 0;

  dataRowWhen = (_: number, _row: any): boolean => true;

  /**
   * The detail row is ALWAYS rendered when a template is provided.
   * Material only re-evaluates `when:` predicates on data re-render, so
   * expansion state must NOT be part of the predicate. Visibility is
   * driven by `isDetailExpanded()` bindings instead, which are re-evaluated
   * on every change detection cycle.
   */
  detailRowRenderWhen = (_index: number, _row: any): boolean => !!this.detailRowTemplate();

  isDetailExpanded(index: number, row: any): boolean {
    if (!this.detailRowTemplate()) {
      return false;
    }

    const when = this.detailRowWhen();
    if (when) {
      return !!when(index, row);
    }

    if (!this.rowCanExpand(row)) {
      return false;
    }

    const key = this.rowKey(row);
    const externalKeys = this.expandedRowKeys();
    if (externalKeys) {
      return externalKeys.includes(key);
    }

    return this.internalExpandedKeys().has(key);
  }

  /** Message affiché quand la liste est vide — `[emptyLabel]` si fourni, sinon le défaut de `[labels]`. */
  resolvedEmptyLabel(): string {
    return this.emptyLabel() ?? this.effectiveLabels().noData;
  }

  mobileActionsCellContext(row: any): {
    $implicit: any;
    row: any;
    value: unknown;
    column: NgTableColumn<any>
  } | null {
    const actionColumn = this.actionColumn();
    if (!actionColumn) {
      return null;
    }

    return {
      $implicit: row,
      row,
      value: this.cellValue(row, actionColumn),
      column: actionColumn,
    };
  }

  mobileActionsColspan(): number {
    return Math.max(1, this.displayedColumnIds().length || 1);
  }

  detailRowColspan(): number {
    return Math.max(1, this.displayedColumnIds().length || 1);
  }

  private isFreeTypedFilter(columnId: string): boolean {
    const column = this.columns().find((c) => c.id === columnId);
    return (column?.filter?.type ?? 'text') === 'text';
  }

  private filterEpoch(columnId: string): number {
    return this.filterEpochByColumn.get(columnId) ?? 0;
  }

  private bumpFilterEpoch(columnId: string): void {
    this.filterEpochByColumn.set(columnId, this.filterEpoch(columnId) + 1);
  }

  private commitFilterValue(columnId: string, value: string): void {
    this.columnFilters.update((current) => {
      const next = {...current, [columnId]: value ?? ''};
      this.filtersChange.emit(next);
      return next;
    });
    this.onQueryStateChanged();
  }

  /**
   * Reports a sort/filter change: emits the full combined query in `remote` mode
   * (page reset to `0`), or requests a page reset in paginated `local` mode.
   */
  private onQueryStateChanged(): void {
    if (this.dataMode() === 'remote') {
      this.remoteQueryChange.emit({
        sort: this.sortState(),
        filters: this.columnFilters(),
        page: {index: 0, size: this.pageTrackingEnabled() ? this.pageSize() : 0},
      });
      return;
    }
    if (this.pageTrackingEnabled() && this.pageIndex() !== 0) {
      this.pageIndexChange.emit(0);
    }
  }

  /** Uncontrolled mode = no external predicate nor external keys provided. */
  private isUncontrolledDetailMode(): boolean {
    return !!this.detailRowTemplate() && !this.detailRowWhen() && !this.expandedRowKeys();
  }

  /**
   * Completes a filters map with a `''` entry for every column of `columns()` that
   * has a `filter`/`filterPredicate`, and drops entries for columns no longer present.
   * Used both when mirroring the controlled `[filters]` input and when `columns()`
   * itself changes, so the component's filters set is always self-built from its own
   * column definitions — no consumer needs to know/repeat the filterable column list.
   */
  private withDefaultFilterKeys(source: Record<string, string>): Record<string, string> {
    const filterableIds = new Set(
      this.columns().filter((column) => !!column.filter || !!column.filterPredicate).map((column) => column.id),
    );
    let changed = false;
    const next: Record<string, string> = {};
    for (const id of filterableIds) {
      next[id] = source[id] ?? '';
      if (source[id] === undefined) {
        changed = true;
      }
    }
    for (const key of Object.keys(source)) {
      if (!filterableIds.has(key)) {
        changed = true;
      }
    }
    return changed ? next : source;
  }

  private effectiveColumnVisibility(): Record<string, boolean> {
    // Priorite au mode controle, fallback sur l'etat interne.
    return this.columnVisibility() ?? this.internalColumnVisibility();
  }

  private effectiveColumnOrder(): string[] {
    const external = this.columnOrder();
    return external ? [...external] : this.internalColumnOrder();
  }

  private effectiveViewsStore(): NgTableViewsStore {
    return this.viewsStore() ?? this.internalViewsStore();
  }

  private applyActiveView(store: NgTableViewsStore): void {
    const active = store.views.find((v) => v.id === store.activeViewId);
    if (active) {
      this.applyViewState(active);
    }
  }

  private applyViewState(view: NgTableView): void {
    const state = view.state;
    this.internalColumnVisibility.set({...state.columnVisibility});
    this.internalColumnOrder.set([...state.columnOrder]);
    this.sortState.set({...state.sort});
    this.columnFilters.set({...state.filters});
    // Vue enregistrée avant l'ajout des largeurs : on laisse celles en cours
    // plutôt que de tout réinitialiser à l'activation.
    if (state.columnWidths) {
      this.columnWidths.set({...state.columnWidths});
    }
    this.filtersChange.emit(this.columnFilters());
    this.onQueryStateChanged();
    if (state.pageIndex !== undefined && state.pageSize !== undefined) {
      this.viewPaginationRestore.emit({pageIndex: state.pageIndex, pageSize: state.pageSize});
    }
    this.viewActivated.emit(view);
  }

  /** Central write path: updates in-memory state, persists to localStorage in uncontrolled mode, and always reports out. */
  private commitViewsStore(next: NgTableViewsStore): void {
    this.internalViewsStore.set(next);
    const key = this.viewsStorageKey();
    if (key && !this.viewsStore()) {
      this.saveViewsStoreToLocalStorage(key, next);
    }
    this.viewsStoreChange.emit(next);
  }

  private loadViewsStoreFromLocalStorage(key: string): NgTableViewsStore {
    try {
      const raw = localStorage.getItem(this.viewsStorageNamespacedKey(key));
      if (!raw) {
        return {views: [], activeViewId: null};
      }
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.views)) {
        return {views: parsed.views, activeViewId: parsed.activeViewId ?? null};
      }
    } catch {
      // Corrupt/unavailable storage — fall through to an empty store.
    }
    return {views: [], activeViewId: null};
  }

  private saveViewsStoreToLocalStorage(key: string, store: NgTableViewsStore): void {
    try {
      localStorage.setItem(this.viewsStorageNamespacedKey(key), JSON.stringify(store));
    } catch {
      // Storage full/unavailable (e.g. private browsing) — the view still works for this session.
    }
  }

  private viewsStorageNamespacedKey(key: string): string {
    return `ng-table.views.${key}`;
  }

  private generateViewId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private resolveSelectedKeysSet(): Set<unknown> {
    // Priorite au mode controle, fallback sur l'etat interne.
    const external = this.selectedRowKeys();
    if (external) {
      return new Set(external);
    }
    return new Set(this.internalSelectedKeys());
  }

  private commitSelection(next: Set<unknown>, row: any | null, selected: boolean): void {
    const external = this.selectedRowKeys();
    if (!external) {
      this.internalSelectedKeys.set(next);
    }

    const selectedRows = this.rows().filter((item) => next.has(this.rowKey(item)));
    this.selectionChange.emit({
      row,
      selected,
      selectedKeys: [...next],
      selectedRows,
    });
  }

  private rowKey(row: any): unknown {
    // Cle metier stable: rowKeyAccessor > heuristique id > reference de la ligne.
    // Volontairement PAS `rowTrackBy` ici : c'est un trackBy de rendu (perf),
    // qui incorpore souvent l'index — un index n'est pas stable au tri/filtre/
    // pagination, ce qui ferait migrer silencieusement la sélection d'une ligne
    // vers une autre au lieu de rester attachée à la bonne (bug corrigé : cette
    // branche appelait aussi `rowTrackBy` avec un index toujours à `0`).
    const accessor = this.rowKeyAccessor();
    if (accessor) {
      return accessor(row);
    }
    return row?.id ?? row?.ID ?? row;
  }

  private readonly onMouseMoveBound = (event: MouseEvent) => this.onResizeMove(event);

  private readonly onMouseUpBound = () => this.stopResize();

  private onResizeMove(event: MouseEvent): void {
    if (!this.resizingState) {
      return;
    }

    const column = this.columns().find((item) => item.id === this.resizingState?.columnId);
    if (!column) {
      this.stopResize();
      return;
    }

    const delta = event.clientX - this.resizingState.startX;
    const minWidth = column.minWidthPx ?? 120;
    const maxWidth = column.maxWidthPx ?? 620;
    const nextWidth = Math.max(minWidth, Math.min(maxWidth, this.resizingState.startWidth + delta));

    this.columnWidths.update((current) => ({
      ...current,
      [column.id]: nextWidth,
    }));
  }

  private stopResize(): void {
    if (!this.resizingState) {
      return;
    }
    this.resizingState = null;
    document.removeEventListener('mousemove', this.onMouseMoveBound);
    document.removeEventListener('mouseup', this.onMouseUpBound);
  }

  private requestFilterPositionUpdate(): void {
    const trigger = this.activeFilterTrigger();
    if (!trigger?.menuOpen) {
      return;
    }
    requestAnimationFrame(() => {
      if (trigger.menuOpen) {
        trigger.updatePosition();
      }
    });
  }

  /** Human readable value for the active filters bar (resolves enum option labels). */
  private formatFilterValueForDisplay(column: NgTableColumn<any>, rawValue: string): string {
    const filter = column.filter;
    if (!filter) {
      return rawValue;
    }

    if (filter.type === 'range' && rawValue.includes('..')) {
      const [from = '', to = ''] = rawValue.split('..', 2);
      if (from && to) {
        return `${from} → ${to}`;
      }
      return from || to;
    }

    const options = this.resolvedFilterOptions(column.id, filter);
    if (options.length === 0) {
      return rawValue;
    }

    return rawValue
      .split(',')
      .map((part) => part.trim())
      .filter((part) => !!part)
      .map((part) => options.find((option) => option.value === part)?.label ?? part)
      .join(', ');
  }

  private resolveCopyValue(column: NgTableColumn<any>, row: any): string {
    if (!column.copy) {
      return '';
    }

    if (typeof column.copy === 'object' && column.copy.valueAccessor) {
      return `${column.copy.valueAccessor(row) ?? ''}`.trim();
    }

    return `${column.valueAccessor(row) ?? ''}`.trim();
  }

  private copyCellKey(column: NgTableColumn<any>, row: any, rowIndex: number): string {
    const rowId = row?.id ?? row?.ID ?? rowIndex;
    return `${column.id}:${rowId}`;
  }

  private async ensureLazyFilterOptions(columnId: string, filter: NgTableFilterConfig): Promise<void> {
    // Evite les doubles chargements; memoization par colonne.
    if (!filter.optionsLoader) {
      return;
    }

    const loaded = this.lazyFilterOptions()[columnId];
    const loading = this.lazyFilterLoading()[columnId];
    if (loaded || loading) {
      return;
    }

    this.lazyFilterLoading.update((current) => ({
      ...current,
      [columnId]: true,
    }));
    this.lazyFilterEmptyError.update((current) => ({...current, [columnId]: false}));
    this.lazyFilterLoadError.update((current) => ({...current, [columnId]: false}));

    try {
      const source = filter.optionsLoader();
      const options = this.isObservableSource(source)
        ? await firstValueFrom(source)
        : await source;

      if (!options || options.length === 0) {
        this.lazyFilterOptions.update((current) => ({
          ...current,
          [columnId]: [],
        }));
        this.lazyFilterEmptyError.update((current) => ({...current, [columnId]: true}));
        return;
      }

      this.lazyFilterOptions.update((current) => ({
        ...current,
        [columnId]: options,
      }));
    } catch {
      this.lazyFilterOptions.update((current) => ({
        ...current,
        [columnId]: [],
      }));
      this.lazyFilterLoadError.update((current) => ({...current, [columnId]: true}));
    } finally {
      this.lazyFilterLoading.update((current) => ({
        ...current,
        [columnId]: false,
      }));
      this.requestFilterPositionUpdate();
    }
  }

  private isObservableSource(
    value: Observable<NgTableFilterOption[]> | Promise<NgTableFilterOption[]>,
  ): value is Observable<NgTableFilterOption[]> {
    return typeof (value as Observable<NgTableFilterOption[]>)?.subscribe === 'function';
  }

  private escapeCssToken(value: string): string {
    const raw = value ?? '';
    // `CSS.escape` gère correctement tous les cas (chiffre en tête, unicode...) ;
    // repli manuel pour les environnements qui ne l'exposent pas (certains jsdom).
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(raw);
    }
    return raw.replace(/[^a-zA-Z0-9_-]/g, (match) => `\\${match}`);
  }

  private matchesAllFilters(
    row: any,
    columns: NgTableColumn<any>[],
    activeFilters: Record<string, string>,
  ): boolean {
    for (const column of columns) {
      const filterValue = (activeFilters[column.id] ?? '').trim();
      if (!filterValue) {
        continue;
      }

      if (!this.matchesColumnFilter(row, column, filterValue)) {
        return false;
      }
    }
    return true;
  }

  private matchesColumnFilter(row: any, column: NgTableColumn<any>, filterValue: string): boolean {
    if (column.filterPredicate) {
      return column.filterPredicate(row, filterValue);
    }

    const lowerFilter = filterValue.toLowerCase();
    const raw = column.valueAccessor(row);

    if (raw === null || raw === undefined) {
      return false;
    }

    const filterType = column.filter?.type;
    if (filterType === 'date' || filterType === 'range') {
      return this.matchesDateFilter(raw, filterValue, filterType);
    }

    if (typeof raw === 'boolean') {
      const expected = lowerFilter === 'true' || lowerFilter === '1';
      return raw === expected;
    }

    if (typeof raw === 'number') {
      const parsed = Number(lowerFilter);
      if (!Number.isNaN(parsed)) {
        return raw === parsed;
      }
      return `${raw}`.toLowerCase().includes(lowerFilter);
    }

    return `${raw}`.toLowerCase().includes(lowerFilter);
  }

  /**
   * Filtrage par défaut des types `date` (jour exact) et `range` (période, bornes
   * incluses, chacune pouvant être vide = borne ouverte).
   *
   * La valeur de cellule est ramenée à un jour `"YYYY-MM-DD"` (`Date`, chaîne ISO,
   * ou toute date parsable) : sur ce format, la comparaison lexicographique est
   * équivalente à la comparaison chronologique, donc pas de `Date` à instancier
   * par ligne et par rendu.
   */
  private matchesDateFilter(raw: unknown, filterValue: string, type: 'date' | 'range'): boolean {
    const cellDay = this.toIsoDay(raw);
    if (!cellDay) {
      return false;
    }

    if (type === 'date') {
      const day = this.normalizeIsoDay(filterValue);
      // Valeur de filtre non parsable (saisie libre en cours) : on retombe sur une
      // correspondance textuelle plutôt que de tout masquer.
      return day ? cellDay === day : `${raw}`.toLowerCase().includes(filterValue.toLowerCase());
    }

    const [fromRaw = '', toRaw = ''] = filterValue.split('..', 2);
    const from = this.normalizeIsoDay(fromRaw);
    const to = this.normalizeIsoDay(toRaw);
    if (!from && !to) {
      return false;
    }

    return (!from || cellDay >= from) && (!to || cellDay <= to);
  }

  /** Ramène une valeur de cellule à un jour `"YYYY-MM-DD"`, ou `''` si ce n'est pas une date. */
  private toIsoDay(raw: unknown): string {
    if (raw instanceof Date) {
      return Number.isNaN(raw.getTime()) ? '' : this.formatIsoDay(raw);
    }

    const text = `${raw}`.trim();
    // Couvre "2026-01-12" comme "2026-01-12T08:30:00Z" sans passer par `Date`.
    const leadingIsoDay = /^(\d{4}-\d{2}-\d{2})/.exec(text);
    if (leadingIsoDay) {
      return leadingIsoDay[1];
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? '' : this.formatIsoDay(parsed);
  }

  private normalizeIsoDay(value: string): string {
    const raw = (value ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  }

  private formatIsoDay(value: Date): string {
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }

  private getSortValue(row: any, column: NgTableColumn<any>): string | number | Date | boolean | null {
    if (column.sortValueAccessor) {
      return column.sortValueAccessor(row) ?? null;
    }

    const raw = column.valueAccessor(row);
    if (raw instanceof Date) {
      return raw;
    }
    if (typeof raw === 'boolean' || typeof raw === 'number' || typeof raw === 'string') {
      return raw;
    }
    return raw === null || raw === undefined ? null : `${raw}`;
  }

  private compareSortValues(
    left: string | number | Date | boolean | null,
    right: string | number | Date | boolean | null,
  ): number {
    if (left === right) {
      return 0;
    }

    if (left === null || left === undefined) {
      return 1;
    }

    if (right === null || right === undefined) {
      return -1;
    }

    if (left instanceof Date || right instanceof Date) {
      const leftTime = this.toComparableDateValue(left);
      const rightTime = this.toComparableDateValue(right);

      if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
        return 0;
      }
      if (Number.isNaN(leftTime)) {
        return 1;
      }
      if (Number.isNaN(rightTime)) {
        return -1;
      }

      return leftTime - rightTime;
    }

    if (typeof left === 'boolean' || typeof right === 'boolean') {
      return Number(left) - Number(right);
    }

    if (typeof left === 'number' && typeof right === 'number') {
      return left - right;
    }

    return this.collator.compare(`${left}`, `${right}`);
  }

  private toComparableDateValue(value: string | number | Date | boolean): number {
    if (value instanceof Date) {
      return value.getTime();
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return new Date(value).getTime();
    }
    return Number.NaN;
  }
}
