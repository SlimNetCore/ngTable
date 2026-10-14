import {CommonModule} from '@angular/common';
import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  model,
  untracked,
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
  Injector,
  input,
  output,
  signal,
  Signal,
  viewChild,
} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxChange, MatCheckboxModule} from '@angular/material/checkbox';
import {MatIconModule} from '@angular/material/icon';
import {MatMenuModule, MatMenuTrigger} from '@angular/material/menu';
import {MatPaginatorModule, PageEvent} from '@angular/material/paginator';
import {MatTableModule} from '@angular/material/table';
import {MatTooltipModule} from '@angular/material/tooltip';
import {firstValueFrom, Observable, Subject, timer} from 'rxjs';
import {debounce, groupBy, mergeMap} from 'rxjs/operators';
import {ColumnFilterRendererComponent, ColumnFilterType} from './column-filter-renderer.component';
import {DynamicFilterHostComponent} from './dynamic-filter-host.component';
import {TruncateTooltipDirective} from './truncate-tooltip.directive';
import {
  FOCUSABLE_IN_CELL,
  GridPosition,
  gridCellAt,
  gridRows,
  locateGridCell,
  moveGridTabStop,
  nextGridPosition,
  syncGridTabStops,
} from './grid-navigation';
import {generateViewId, loadViewsStore, mergeViewsStores, parseViewsStore, saveViewsStore, serializeViewsStore} from './views-storage';
import {matchesAllFilters, searchText, SortLevel} from './row-pipeline';
import {buildConsecutiveGroups, buildGroups, computeAggregate, remoteGroupedPage, groupedUnits, NgTableGroupRow, RowGroup, withGroupHeaders} from './row-grouping';
import {
  ColumnWindow,
  computeColumnWindow,
  computeVirtualLayout,
  NgTableSpacerRow,
  scrollTopForIndex,
  VirtualLayout,
  VirtualRange,
} from './virtual-window';
import {buildCellView, buildRowViews, copyText, NgTableCellView, NgTableRowClasses} from './row-view';
import {IncrementalPipeline, NgTableRowTransaction, NgTableTransactionResult, RowStore, RowUpdate} from './live-rows';

/** Élément de la source de données de la table : une ligne, un en-tête de groupe ou un espacement. */
import {BlockCache, NgTableLoadingRow} from './block-cache';
import {draftFromValue, EditChange, EditHistory, EditRestore, editorKindFor, NgTableEditorKind, parseDraft, sameCellValue} from './cell-edit';
import {buildHeaderGroupLevels, headerGroupPath} from './header-groups';

type TableItem<T> = T | NgTableGroupRow<T> | NgTableSpacerRow | NgTableLoadingRow;
import {escapeCssToken, measureNaturalWidth, writeClipboardText} from './dom-utils';
import {
  buildPasteAssignments,
  CellPosition,
  CellRange,
  clampRange,
  normalizeRange,
  parseClipboardText,
  rangeContains,
  rangeEdges,
  toClipboardText,
} from './cell-range';
import {downloadFile, ExportCell, NgTableExportFormat, toCsv, toXlsx, XLSX_MIME} from './export-writers';
import {formatRangeValue, matchesSearchTerms, NgTableTextOperator, searchTerms} from './filter-matching';
import {
  NG_TABLE_DEFAULT_LABELS,
  NG_TABLE_LABELS,
  NgTableLabels,
  ngTableLabelsEqual,
  resolveNgTableLabelsSource,
} from './ng-table-labels';

export type SortDirection = 'asc' | 'desc' | '';

function toExportCell(value: unknown): ExportCell {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === 'number' || typeof value === 'boolean' ? value : String(value);
}

/**
 * Clé d'une ligne quand aucun `rowKeyAccessor` n'est fourni : `row.id`, sinon
 * `row.ID`, sinon la ligne elle-même (référence d'objet).
 */
function defaultRowKey(row: unknown): unknown {
  const record = typeof row === 'object' && row !== null ? (row as { id?: unknown; ID?: unknown }) : null;
  return record?.id ?? record?.ID ?? row;
}

/** Largeur mini d'une colonne sans `minWidthPx` : redimensionnement, et largeur mini du tableau. */
const DEFAULT_MIN_COLUMN_WIDTH_PX = 120;
/** Largeur de la colonne de cases à cocher. */
const SELECTION_COLUMN_WIDTH_PX = 48;

/** Espace insécable (U+00A0), voir `announce`. */
const NBSP = String.fromCharCode(160);

/** Ligne de l'application (ni en-tête de groupe, ni espacement du défilement virtuel). */
function isDataItem<T>(item: TableItem<T>): item is T {
  return !(item instanceof NgTableGroupRow) && !(item instanceof NgTableSpacerRow) && !(item instanceof NgTableLoadingRow);
}

/** Clé de la recherche globale dans le flux debouncé des saisies et dans la barre des filtres actifs. */
const GLOBAL_SEARCH_KEY = '__global_search__';

/** Filtres à choix discret : appliqués immédiatement, jamais debouncés. */
const DISCRETE_FILTER_TYPES: ReadonlySet<ColumnFilterType> = new Set<ColumnFilterType>([
  'enum',
  'boolean',
  'date',
  'range',
]);

/**
 * `local`: tri/filtrage appliqués côté client sur `rows()` (défaut, adapté aux
 * petites listes qui ne changent pas souvent).
 * `remote`: `rows()` est considéré déjà trié/filtré/paginé par le serveur — le
 * composant se contente d'afficher tel quel et notifie chaque changement de tri/filtre
 * via `(remoteQueryChange)` pour que le parent puisse relancer la requête.
 */
export type NgTableDataMode = 'local' | 'remote';

/** Etat complet à envoyer au serveur en mode `remote` (tri courant, tous les filtres, et la page). */
/**
 * Mode `remote` + regroupement : résumé d'un groupe calculé par le serveur sur TOUTES
 * les lignes du groupe (la table n'en a qu'une page). `[groupSummaries]` en attend la
 * liste complète, dans l'ordre des groupes : c'est ce qui permet de placer les groupes
 * repliés, dont le serveur ne renvoie aucune ligne.
 */
export interface NgTableGroupSummary {
  /** Valeur de la colonne de regroupement en texte (jour `YYYY-MM-DD` pour une date, `''` si vide). */
  key: string;
  /** Nombre de lignes du groupe (repliés compris : c'est le nombre affiché dans l'en-tête). */
  count?: number;
  /** Agrégats par id de colonne (nombre formaté par la table, ou texte affiché tel quel). */
  aggregates?: Record<string, unknown>;
}

/**
 * Demande d'un bloc de lignes au serveur (modèle par blocs, `[remoteDatasource]`) : la
 * requête habituelle (tri, filtres, recherche) plus la tranche voulue. `page` vaut
 * `{index: n° du bloc, size: taille du bloc}` : un backend paginé existant convient tel quel.
 */
export interface NgTableBlockRequest extends NgTableRemoteQuery {
  /** Première ligne demandée (incluse). */
  startRow: number;
  /** Dernière ligne demandée (exclue). */
  endRow: number;
}

/** Réponse à `NgTableBlockRequest`. */
export interface NgTableBlockResult<T> {
  rows: readonly T[];
  /** Nombre total de lignes correspondant à la requête (toutes pages confondues). */
  totalCount: number;
}

/**
 * Source de données du modèle serveur par blocs : la table l'appelle pour chaque bloc
 * à afficher, au fil du défilement. Promesse ou Observable (seule la première valeur compte).
 */
export interface NgTableRemoteDatasource<T> {
  getRows(request: NgTableBlockRequest): Promise<NgTableBlockResult<T>> | Observable<NgTableBlockResult<T>>;
}

/** Plage de cellules sélectionnée (`[rangeSelection]`) : lignes, colonnes et texte copiable. */
export interface NgTableRangeSelection<T> {
  rows: T[];
  columns: NgTableColumn<T>[];
  /** Texte tabulé que Ctrl+C place dans le presse-papiers (avec les en-têtes si `[rangeCopyHeaders]`). */
  text: string;
}

export interface NgTableRangeCopyEvent {
  text: string;
  rowCount: number;
  columnCount: number;
}

/** Une valeur à écrire dans une cellule, issue d'un collage. */
export interface NgTableRangeAssignment<T> {
  row: T;
  column: NgTableColumn<T>;
  value: string;
}

/** Une cellule modifiée : par la saisie, un collage, ou Ctrl+Z / Ctrl+Y. */
export interface NgTableCellEditEvent<T> {
  /** La ligne avant la modification. */
  row: T;
  /** La ligne après, telle que la renvoie `valueSetter` ; `null` si la colonne n'en déclare pas. */
  newRow: T | null;
  column: NgTableColumn<T>;
  oldValue: unknown;
  newValue: unknown;
  source: 'edit' | 'paste' | 'undo' | 'redo';
}

/** Une saisie refusée (nombre ou date illisible, ou `validate` qui renvoie un message). */
export interface NgTableCellEditRejectedEvent<T> {
  row: T;
  column: NgTableColumn<T>;
  /** Texte saisi. */
  value: string;
  error: string;
}

export interface NgTableRangePasteEvent<T> {
  /** Cellules cibles et valeurs à y écrire (ce qui dépasse de la grille est déjà écarté). */
  assignments: NgTableRangeAssignment<T>[];
  /** Texte collé, et ce même texte découpé en lignes et colonnes. */
  text: string;
  values: string[][];
  /** Cellules réellement modifiées dans la table (colonnes éditables avec `valueSetter`, `[editOnPaste]`). */
  applied: number;
}

export interface NgTableRemoteQuery {
  /** Tri principal (premier niveau de `sorts`). */
  sort: NgTableSortChange;
  /** Tous les niveaux de tri, par priorité (plusieurs seulement avec `[multiSort]`). Toujours renseigné par le composant. */
  sorts?: NgTableSortChange[];
  filters: Record<string, string>;
  page: { index: number; size: number };
  /** Recherche globale saisie (`''` si aucune). Toujours renseignée par le composant. */
  search?: string;
  /**
   * Colonne de regroupement (`null` si aucun). Le serveur doit renvoyer les lignes
   * triées d'abord par cette colonne, puis par `sorts`.
   */
  groupBy?: string | null;
  /**
   * Groupes repliés (clés, voir `NgTableGroupSummary.key`). Le serveur exclut leurs
   * lignes : un groupe replié n'occupe aucune ligne de la pagination.
   */
  collapsedGroups?: string[];
}

/** Colonne à exporter, telle qu'affichée : identifiant et libellé d'en-tête. */
export interface NgTableExportColumn {
  id: string;
  header: string;
}

/**
 * `(remoteExportRequested)` : la requête courante (filtres, tri, recherche, regroupement),
 * plus ce qu'il faut au serveur pour produire le fichier comme l'export local.
 */
export interface NgTableRemoteExportRequest extends NgTableRemoteQuery {
  /** Colonnes visibles, dans l'ordre affiché, sans celles marquées `exportable: false`. */
  columns: NgTableExportColumn[];
  /** `[exportFormat]`. */
  format: NgTableExportFormat;
  /** `[exportFilename]`, sans extension. */
  filename: string;
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

export interface NgTableFilterOption { value: string; label: string }

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
  /**
   * Types texte uniquement : comment la saisie est comparée à la cellule
   * (insensible à la casse). `contains` par défaut.
   */
  operator?: NgTableTextOperator;
  options?: NgTableFilterOption[];
  optionsLoader?: () => Observable<NgTableFilterOption[]> | Promise<NgTableFilterOption[]>;
  placeholder?: string;
  /** Libellé affiché tel quel (texte déjà résolu — plus une clé i18n). */
  label?: string;
  component?: Type<unknown>;
  componentInputs?: Record<string, unknown>;
}

/**
 * Agrégat d'une colonne, affiché dans les en-têtes de groupe et la ligne de totaux :
 * somme, moyenne, minimum, maximum (valeurs numériques de `valueAccessor`), nombre de
 * lignes, ou fonction personnalisée recevant les lignes du groupe.
 */
export type NgTableAggregate<T> = 'sum' | 'avg' | 'min' | 'max' | 'count' | ((rows: readonly T[]) => unknown);

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
  /**
   * Épingle la colonne à gauche ou à droite : elle reste visible pendant le
   * défilement horizontal. Les colonnes épinglées sont toujours regroupées aux
   * bords (à gauche puis à droite), quel que soit l'ordre choisi par glisser-déposer.
   */
  pinned?: 'left' | 'right';
  /**
   * Participation à la recherche globale (`[globalSearchEnabled]`). Par défaut, la
   * valeur de `valueAccessor` est cherchée. `false` exclut la colonne ; une fonction
   * fournit le texte à chercher (ex. le libellé affiché par un `cellTemplate`
   * plutôt que le code brut).
   */
  searchable?: boolean | ((row: T) => string);
  /**
   * Mode live : surligne brièvement la cellule quand sa valeur change (vert à la hausse,
   * rouge à la baisse pour un nombre). Par défaut, suit `[flashCells]` de la table.
   */
  flashOnChange?: boolean;
  /**
   * Cellule modifiable : `true`, ou une fonction par ligne. Double-clic, Entrée ou F2 (avec
   * `[cellNavigation]`), ou simplement taper un caractère ouvre l'éditeur. Sans
   * `valueSetter`, la table n'émet que `(cellEdited)` : c'est à vous de modifier vos données.
   */
  editable?: boolean | ((row: T) => boolean);
  /** Éditeur : texte, nombre, date, liste (`editorOptions`), case à cocher. Déduit du filtre par défaut. */
  editor?: NgTableEditorKind;
  /** Valeurs de l'éditeur `select` ; par défaut les options du filtre. */
  editorOptions?: NgTableFilterOption[];
  /**
   * Renvoie la **nouvelle ligne** portant la valeur saisie (données immuables) :
   * `(row, value) => ({...row, montant: value as number})`. La table l'applique par
   * transaction (mode local) et la garde pour annuler / rétablir.
   */
  valueSetter?: (row: T, value: unknown) => T;
  /** Message d'erreur pour une valeur refusée, `null` si elle est acceptée. Bloque la validation de la cellule. */
  validate?: (value: unknown, row: T) => string | null;
  /**
   * En-tête de groupe au-dessus de la colonne : un libellé, ou un chemin du plus externe au
   * plus interne (`['Identité', 'Contact']`). Les colonnes voisines qui partagent un groupe
   * sont fusionnées sous une même cellule, une ligne d'en-tête par niveau.
   */
  headerGroup?: string | readonly string[];
  /** Agrégat affiché dans les en-têtes de groupe et la ligne de totaux (voir `NgTableAggregate`). */
  aggregate?: NgTableAggregate<T>;
  /**
   * Proposée dans le menu « Grouper » (`[groupingEnabled]`). Par défaut : oui pour une
   * colonne triable ou filtrable.
   */
  groupable?: boolean;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- défaut historique, conservé pour les usages non typés
export interface NgTableCopyEvent<T = any> {
  columnId: string;
  value: string;
  row: T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- défaut historique, conservé pour les usages non typés
export interface NgTableDetailToggleEvent<T = any> {
  /** `null` quand toutes les lignes sont repliées d'un coup (`collapseAllDetails()`). */
  row: T | null;
  expanded: boolean;
  expandedKeys: unknown[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- défaut historique, conservé pour les usages non typés
export interface NgTableSelectionChangeEvent<T = any> {
  row: T | null;
  selected: boolean;
  selectedKeys: unknown[];
  selectedRows: T[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- défaut historique, conservé pour les usages non typés
export interface NgTableContextMenuEvent<T = any> {
  row: T;
  position: { x: number; y: number };
}

/** Everything a saved "view" captures about the list's presentation. */
export interface NgTableViewState {
  columnVisibility: Record<string, boolean>;
  columnOrder: string[];
  sort: NgTableSortChange;
  /** Tous les niveaux de tri, quand il y en a plusieurs (`[multiSort]`). Absent = seulement `sort`. */
  sorts?: NgTableSortChange[];
  filters: Record<string, string>;
  /**
   * Largeurs de colonnes (px) issues du redimensionnement, par id de colonne.
   * Optionnel : les vues enregistrées avant l'ajout de cette option n'en ont pas,
   * elles restaurent alors simplement les largeurs par défaut des colonnes.
   */
  columnWidths?: Record<string, number>;
  /** Colonne de référence choisie (voir `referenceColumn`). Absente = `pinned` déclarés des colonnes. */
  referenceColumnId?: string | null;
  /** Colonne de regroupement (voir `groupBy`). */
  groupBy?: string | null;
  /** Recherche globale. Absente des vues enregistrées avant son ajout (= pas de recherche). */
  search?: string;
  /** Only populated when `pageTrackingEnabled=true` (reuses `[pageIndex]`/`[pageSize]`). */
  pageIndex?: number;
  pageSize?: number;
}

/**
 * État « requête » de la table : ce qui détermine les lignes affichées (et ce
 * qu'on met dans une URL partageable). Voir `getQueryState()` / `applyQueryState()`.
 */
export interface NgTableQueryState {
  /** Niveaux de tri, par priorité (vide = pas de tri). */
  sorts: NgTableSortChange[];
  /** Filtres non vides, par id de colonne. */
  filters: Record<string, string>;
  /** Recherche globale (`''` si aucune). */
  search: string;
  pageIndex: number;
  pageSize: number;
  /** Colonne de regroupement (`null` si aucun). */
  groupBy: string | null;
  /** Clés des groupes repliés. */
  collapsedGroups: string[];
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
  /**
   * Vue appliquée à l'ouverture de la liste, à la place de la dernière vue active.
   * Absente ou `null` = on rouvre sur la dernière vue active.
   */
  defaultViewId?: string | null;
}

/** Résultat d'un import de vues (`importViews()` ou bouton « Importer »). */
export interface NgTableViewsImportEvent {
  /** Nombre de vues valides lues dans le fichier (0 si le fichier est invalide). */
  imported: number;
  mode: 'merge' | 'replace';
}

@Component({
  selector: 'ng-table',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatMenuModule,
    MatPaginatorModule,
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
// `any` par défaut : un `viewChild(NgTableComponent)` sans paramètre reste utilisable comme avant.
// Dans un template, T est inféré depuis `[rows]` / `[columns]`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class NgTableComponent<T = any> implements OnDestroy {
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
  readonly rows = input<T[]>([]);
  /** Definition des colonnes (valeur, tri, filtre, templates, largeur...). */
  readonly columns = input<NgTableColumn<T>[]>([]);
  /** Mode controle: visibilite des colonnes pilotee par le parent. */
  readonly columnVisibility = input<Record<string, boolean> | null>(null);
  /** Mode controle: ordre des colonnes (ids) pilote par le parent. */
  readonly columnOrder = input<readonly string[] | null>(null);
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
  /** Densité des lignes : `compact` réduit la hauteur des lignes et de l'en-tête. */
  readonly density = input<'default' | 'compact'>('default');
  /**
   * Hauteur maximale de la zone des lignes (toute valeur CSS : `'600px'`, `'70vh'`) ;
   * au-delà, le défilement vertical se fait À L'INTÉRIEUR de la table.
   */
  readonly maxHeight = input<string | null>(null);
  /**
   * Garde l'en-tête visible pendant le défilement vertical. N'a d'effet qu'avec
   * `[maxHeight]` : sans hauteur limitée, c'est la page qui défile, pas la table.
   */
  readonly stickyHeader = input(false);
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
  /**
   * Largeur mini du tableau avant défilement horizontal. Le tableau ne descend de
   * toute façon jamais sous la somme des largeurs mini de ses colonnes visibles
   * (voir `tableMinWidthPx`) : au-delà, il défile au lieu d'écraser les colonnes.
   */
  readonly minTableWidthPx = input(760);
  readonly rowClassFn = input<((row: T) => string | string[] | Record<string, boolean> | null) | null>(null);
  /**
   * `trackBy` custom pour le rendu de la table (perf uniquement). N'est PAS
   * utilisé pour la clé métier de sélection/expansion/copie — celle-ci vient
   * uniquement de `rowKeyAccessor` (ou de `row.id`/`row.ID`, ou de la référence
   * de la ligne). Une fonction de `trackBy` incorpore souvent l'index de rendu,
   * qui n'est pas stable au tri/filtre/pagination — inadaptée à une clé de
   * sélection, d'où cette séparation stricte.
   */
  readonly rowTrackBy = input<TrackByFunction<T> | null>(null);
  /** Template de detail (master/detail). Quand null, pas de detail row. */
  readonly detailRowTemplate = input<TemplateRef<{ $implicit: T; row: T }> | null>(null);
  /**
   * Controlled mode: external predicate deciding whether the detail is expanded.
   * When provided, internal expansion state is bypassed entirely.
   */
  readonly detailRowWhen = input<((index: number, row: T) => boolean) | null>(null);
  /**
   * Controlled mode (key based): externally managed list of expanded row keys.
   * Keys are resolved with `rowKeyAccessor` / `rowTrackBy` / `row.id`.
   */
  readonly expandedRowKeys = input<readonly unknown[] | null>(null);
  /** Uncontrolled mode: toggle the detail row when the data row is clicked. */
  readonly detailRowToggleOnRowClick = input(true);
  /** Uncontrolled mode: only one detail row expanded at a time. */
  readonly detailRowAccordion = input(false);
  /** Optional guard: rows for which a detail can be expanded (e.g. has children). */
  readonly detailRowCanExpand = input<((row: T) => boolean) | null>(null);
  /** Stable business key for a row (expansion state, copy feedback, trackBy fallback). */
  readonly rowKeyAccessor = input<((row: T) => unknown) | null>(null);
  /** Show/hide the built-in "reset all filters" button. */
  readonly showResetFilters = input(true);
  /** Show/hide the built-in "Colonnes" button (column visibility picker). `true` par défaut. */
  readonly columnsMenuEnabled = input(true);
  /**
   * Affiche, dans le menu « Colonnes », une punaise à côté de chaque colonne visible :
   * l'utilisateur choisit la **colonne de référence**, fixée à gauche pendant le
   * défilement horizontal. Voir `referenceColumn`.
   */
  readonly referenceColumnSelectable = input(false);
  /**
   * Colonne de référence (fixée à gauche). `model()` : liable en `[(referenceColumn)]`,
   * ou laissée au composant.
   * - `undefined` (défaut) : les `pinned: 'left'` des colonnes s'appliquent ;
   * - un id de colonne : cette colonne seule est fixée à gauche, à la place des
   *   `pinned: 'left'` déclarés (les colonnes `pinned: 'right'` restent à droite) ;
   * - `null` : aucune colonne fixée à gauche.
   * Enregistrée dans les vues.
   */
  readonly referenceColumn = model<string | null | undefined>(undefined);
  /**
   * Délai (ms) avant qu'une saisie dans un filtre texte ne soit prise en compte.
   * Evite de refiltrer (mode `local`) ou de lancer une requête (mode `remote`) à chaque
   * caractère. Mettre `0` pour un filtrage immédiat. Les filtres à choix fixe
   * (select/enum/booléen/date) ne sont jamais debouncés.
   */
  readonly filterDebounceMs = input(350);
  /**
   * Affiche un champ de recherche globale dans la barre d'actions : une ligne est
   * gardée si chaque mot saisi apparaît dans l'une de ses colonnes visibles
   * (casse et accents ignorés). Voir `NgTableColumn.searchable`.
   */
  readonly globalSearchEnabled = input(false);
  /**
   * Navigation clavier cellule par cellule (motif « grid » de WAI-ARIA) : la table
   * devient un seul arrêt de tabulation, les flèches passent d'une cellule à l'autre
   * (Début/Fin, Ctrl+Début/Fin, Page préc./suiv.), Entrée ou F2 entre dans le contenu
   * interactif d'une cellule et Échap en ressort. Entrée sur une cellule simple active
   * la ligne, Espace la sélectionne, Maj+F10 ouvre son menu contextuel.
   */
  readonly cellNavigation = input(false);
  /**
   * Bouton « Grouper » dans la barre d'actions : regroupe les lignes par la valeur
   * d'une colonne. Voir `groupBy`, `NgTableColumn.aggregate`, `groupSummaries`.
   */
  readonly groupingEnabled = input(false);
  /**
   * Colonne de regroupement (`null` = aucun). `model()` : liable en `[(groupBy)]`,
   * ou laissée au composant ; enregistrée dans les vues. En mode `remote`, elle part dans
   * `NgTableRemoteQuery.groupBy` et les résumés viennent de `[groupSummaries]`.
   */
  readonly groupBy = model<string | null>(null);
  /**
   * Défilement virtuel : seules les lignes visibles (plus une marge) sont rendues, ce
   * qui garde une liste de 50 000 lignes fluide sans pagination. Demande une hauteur
   * fixe (`[maxHeight]`, 70vh par défaut) et des lignes de hauteur uniforme (mesurée).
   */
  readonly virtualScroll = input(false);
  /**
   * Modèle serveur par blocs (mode `remote`) : défilement continu sur toutes les lignes du
   * serveur, sans pagination. La table demande au fil du défilement les blocs à afficher
   * (`getRows`), en garde un nombre limité en cache, et repart de zéro quand le tri, les
   * filtres ou la recherche changent. Active le défilement virtuel ; `(remoteQueryChange)`
   * n'est alors plus émis (c'est `getRows` qui reçoit la requête).
   */
  readonly remoteDatasource = input<NgTableRemoteDatasource<T> | null>(null);
  /**
   * Affichage partiel des colonnes (virtualisation horizontale) : seules les colonnes de
   * la zone visible (plus une marge) sont rendues, les colonnes épinglées toujours. Pour
   * les tables très larges (des dizaines ou centaines de colonnes). Chaque colonne prend
   * une largeur fixe : `widthPx`, sinon `minWidthPx`, sinon 120 px.
   */
  readonly virtualColumns = input(false);
  /**
   * Lignes épinglées en haut de la table : elles restent visibles pendant le défilement
   * vertical, sous l'en-tête (colonnes et cellules identiques aux autres lignes). Pour des
   * lignes de synthèse, des favoris, une ligne « nouvelle saisie »... Ce ne sont pas des
   * lignes de `[rows]` : ni filtrées, ni triées, ni sélectionnables, et sans ligne détail.
   * Une zone de défilement à hauteur limitée (`[maxHeight]`) est nécessaire pour qu'elles
   * aient un effet. Chaque ligne doit avoir une clé distincte de celles de `[rows]`.
   */
  readonly pinnedTopRows = input<readonly T[]>([]);
  /** Lignes épinglées en bas de la table (voir `pinnedTopRows`). */
  readonly pinnedBottomRows = input<readonly T[]>([]);
  /**
   * Sélection d'une plage rectangulaire de cellules : glisser à la souris, Maj+clic, et
   * Maj+flèches avec `[cellNavigation]`. Ctrl+C copie la plage (texte tabulé, collable dans
   * Excel), Ctrl+A la étend à toute la page, Échap l'efface. Le collage (Ctrl+V) émet
   * `(rangePasted)`. Non disponible avec `[remoteDatasource]`.
   */
  readonly rangeSelection = input(false);
  /**
   * Un collage (Ctrl+V sur une plage) écrit dans les cellules éditables de la plage, en
   * une seule opération annulable. `(rangePasted)` est émis dans tous les cas.
   */
  readonly editOnPaste = input(true);
  /** Nombre d'opérations que Ctrl+Z peut défaire. */
  readonly undoRedoLimit = input(100);
  /** Ajoute une première ligne d'en-têtes de colonnes au texte copié. */
  readonly rangeCopyHeaders = input(false);
  /** Lignes par bloc demandé au serveur. */
  readonly cacheBlockSize = input(100);
  /** Blocs gardés en mémoire ; au-delà, les moins récemment affichés sont oubliés. */
  readonly maxBlocksInCache = input(50);
  /** Requêtes de blocs simultanées au plus. */
  readonly maxConcurrentBlockRequests = input(2);
  /**
   * Mode live : surligne les cellules dont la valeur change, après une transaction ou un
   * nouveau tableau `[rows]`. Colonne par colonne : `NgTableColumn.flashOnChange`.
   */
  readonly flashCells = input(false);
  /** Durée de la surbrillance d'une cellule modifiée (ms). */
  readonly flashDurationMs = input(1000);
  /**
   * `applyTransactionAsync()` : délai de regroupement des transactions (ms). Toutes celles
   * reçues pendant ce délai sont appliquées en un seul passage, avec un seul rendu.
   */
  readonly asyncTransactionWaitMillis = input(50);
  /**
   * Mode `remote` + regroupement : TOUS les groupes, dans leur ordre, avec nombre de
   * lignes et agrégats calculés par le serveur (voir `NgTableGroupSummary`). Rend les
   * groupes repliables. Sans cela, l'en-tête d'un groupe n'affiche que son libellé (un
   * compte limité à la page serait trompeur) et les groupes ne se replient pas.
   */
  readonly groupSummaries = input<readonly NgTableGroupSummary[] | null>(null);
  /** Ligne de totaux en bas de la table, pour les colonnes qui déclarent un `aggregate` (mode local). */
  readonly showTotals = input(false);
  /** Tri sur plusieurs colonnes : Maj+clic sur un en-tête ajoute un niveau de tri. */
  readonly multiSort = input(false);
  /** Mode contrôlé de la recherche globale ; `null` = non contrôlé. */
  readonly globalSearch = input<string | null>(null);
  /** Show a leading checkbox column to select one or many rows. */
  readonly rowSelectionEnabled = input(false);
  /** Controlled mode (key based): externally managed selected row keys. */
  readonly selectedRowKeys = input<readonly unknown[] | null>(null);
  /** Render column filters inline inside the header cell (no filter icon/menu). */
  readonly inlineFilters = input(false);
  /** Optional list of column ids allowed to render inline filters (when inlineFilters=true). */
  readonly inlineFilterColumnIds = input<readonly string[] | null>(null);
  /** Show a summary bar of the active filters below the list. */
  readonly showActiveFiltersBar = input(false);
  /** Enable right-click contextual menu on data rows. */
  readonly rowContextMenuEnabled = input(false);
  /** Context menu content provided by parent component. */
  readonly rowContextMenuTemplate = input<TemplateRef<{ $implicit: T; row: T }> | null>(null);

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
  /**
   * Page courante (0-based), utilisée quand la pagination est active
   * (`pageTrackingEnabled` ou `paginator`). `model()` : liable en `[(pageIndex)]`,
   * ou laissée au composant (mode non contrôlé) qui la tient à jour lui-même.
   * Émet `(pageIndexChange)` à chaque changement fait par le composant (retour à la
   * page 0 après un filtre, paginateur intégré, restauration d'une vue).
   */
  readonly pageIndex = model(0);
  /** Taille de page ; mêmes règles que `pageIndex`, émet `(pageSizeChange)`. */
  readonly pageSize = model(10);
  /**
   * Affiche un `<mat-paginator>` intégré sous la table, déjà branché : rien à relier
   * côté parent. Active la pagination (inutile d'ajouter `pageTrackingEnabled`).
   * En mode `remote`, fournir `[totalCount]` (nombre total de lignes côté serveur).
   */
  readonly paginator = input(false);
  /** Tailles de page proposées par le paginateur intégré. */
  readonly pageSizeOptions = input<readonly number[]>([10, 25, 50, 100]);
  /** Mode `remote` + paginateur intégré : nombre total de lignes côté serveur. */
  readonly totalCount = input<number | null>(null);

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
  /**
   * Format du fichier généré en `exportMode='local'`. `xlsx` garde les nombres et
   * booléens typés (sommables dans Excel) et fige la ligne d'en-têtes ; `csv` reste
   * le défaut (séparateur `;`, UTF-8 avec BOM).
   */
  readonly exportFormat = input<NgTableExportFormat>('csv');
  /** Boutons « Exporter » / « Importer » dans le menu des vues (partage de vues entre postes ou utilisateurs). */
  readonly viewsImportExportEnabled = input(false);

  readonly rowClick = output<T>();
  /** Emitted whenever any filter value changes. */
  readonly filtersChange = output<Record<string, string>>();
  /** Recherche globale appliquée (après debounce). */
  readonly globalSearchChange = output<string>();
  /** Tri principal modifié. */
  readonly sortChange = output<NgTableSortChange>();
  /** Tous les niveaux de tri, par priorité ; émis à chaque clic de tri. */
  readonly sortsChange = output<NgTableSortChange[]>();
  readonly cellCopied = output<NgTableCopyEvent<T>>();
  readonly detailToggle = output<NgTableDetailToggleEvent<T>>();
  /** Emitted when the internal column picker toggles a column visibility. */
  readonly columnVisibilityChange = output<Record<string, boolean>>();
  /** Emitted whenever the user drags a column header to a new position. */
  readonly columnOrderChange = output<string[]>();
  /** Emitted on row selection/unselection and select-all operations. */
  readonly selectionChange = output<NgTableSelectionChangeEvent<T>>();
  /** Emitted when the contextual menu is requested on a row. */
  readonly rowContextMenu = output<NgTableContextMenuEvent<T>>();
  /**
   * Emitted whenever the views store changes (saved, activated, deleted) — in
   * uncontrolled mode this mirrors what was just written to `localStorage`; in
   * controlled mode this is the ONLY place the change is reported, since the
   * component does not persist anything itself. Wire this to save wherever you want.
   */
  readonly viewsStoreChange = output<NgTableViewsStore>();
  /**
   * Émis quand l'état « requête » change (tri, filtres, recherche, page), quelle
   * qu'en soit l'origine. Sert à synchroniser un stockage externe (URL...).
   */
  readonly queryStateChange = output<NgTableQueryState>();
  /** Émis après chaque import de vues, réussi ou non (`imported: 0`). */
  readonly viewsImported = output<NgTableViewsImportEvent>();
  /** Lot de transactions asynchrones appliqué (une entrée par transaction). */
  readonly asyncTransactionsFlushed = output<NgTableTransactionResult<T>[]>();
  /** Une cellule vient d'être modifiée (saisie, collage, annuler, rétablir). */
  readonly cellEdited = output<NgTableCellEditEvent<T>>();
  /** Une saisie a été refusée à la validation : l'édition est abandonnée (perte de focus) ou reste ouverte (Entrée). */
  readonly cellEditRejected = output<NgTableCellEditRejectedEvent<T>>();
  /** Une plage de cellules vient d'être copiée dans le presse-papiers. */
  readonly rangeCopied = output<NgTableRangeCopyEvent>();
  /**
   * Du texte a été collé sur la plage sélectionnée (Ctrl+V). La table ne modifie pas vos
   * données : appliquez les `assignments` (ou rien) comme vous l'entendez.
   */
  readonly rangePasted = output<NgTableRangePasteEvent<T>>();
  /** Modèle par blocs : le chargement d'un bloc a échoué (erreur renvoyée par `getRows`). */
  readonly remoteBlockError = output<{ request: NgTableBlockRequest; error: unknown }>();
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
  readonly remoteExportRequested = output<NgTableRemoteExportRequest>();
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
  /** Pagination active : suivie par le parent (`pageTrackingEnabled`) ou paginateur intégré. */
  protected readonly pagingActive = computed(() => this.pageTrackingEnabled() || this.paginator());

  /** `[length]` du paginateur intégré. */
  protected readonly paginatorLength = computed(() =>
    this.dataMode() === 'remote' ? (this.totalCount() ?? this.rows().length) : this.pageableCount(),
  );

  /** Virtualisation horizontale effective (pas en vue mobile, où les colonnes sont déjà réduites). */
  protected readonly columnVirtualization = computed(() => this.virtualColumns() && !this.isMobileView());
  private readonly scrollLeft = signal(0);
  private readonly viewportWidth = signal(0);

  /** Largeur fixe de chaque colonne visible en virtualisation horizontale. */
  private readonly fixedColumnWidths = computed(() => {
    const widths = this.columnWidths();
    return new Map(
      this.visibleColumns().map((column) => [column.id, widths[column.id] ?? column.widthPx ?? column.minWidthPx ?? DEFAULT_MIN_COLUMN_WIDTH_PX]),
    );
  });

  /**
   * Colonnes libres (non épinglées) rendues et largeurs des espacements. Ne change que si
   * la fenêtre change : défiler de quelques pixels ne reconstruit pas les colonnes.
   */
  private readonly columnWindow = computed<(ColumnWindow & { free: NgTableColumn<T>[] }) | null>(
    () => {
      if (!this.columnVirtualization()) {
        return null;
      }
      const sides = this.pinnedSides();
      const widths = this.fixedColumnWidths();
      const free = this.visibleColumns().filter((column) => !sides.has(column.id));
      return {free, ...computeColumnWindow(free.map((column) => widths.get(column.id)!), this.scrollLeft(), this.viewportWidth())};
    },
    {
      equal: (a, b) =>
        a === b || (!!a && !!b && a.free === b.free && a.start === b.start && a.end === b.end && a.left === b.left && a.right === b.right),
    },
  );

  /** Colonnes réellement rendues : toutes les visibles, ou la fenêtre en virtualisation horizontale. */
  protected readonly renderedColumns = computed(() => {
    const window = this.columnWindow();
    if (!window) {
      return this.visibleColumns();
    }
    const sides = this.pinnedSides();
    const visible = this.visibleColumns();
    return [
      ...visible.filter((column) => sides.get(column.id) === 'left'),
      ...window.free.slice(window.start, window.end),
      ...visible.filter((column) => sides.get(column.id) === 'right'),
    ];
  });

  /** Largeur d'une colonne d'espacement de la virtualisation horizontale. */
  protected columnSpacerWidth(side: 'left' | 'right'): number {
    const window = this.columnWindow();
    return window ? (side === 'left' ? window.left : window.right) : 0;
  }

  protected readonly displayedColumnIds = computed(
    () => {
      // Colonne technique de selection injectee en tete quand activee.
      const ids = this.visibleColumns().map((column) => column.id);
      if (!this.isMobileView()) {
        const window = this.columnWindow();
        if (window) {
          const sides = this.pinnedSides();
          const rendered = [
            ...ids.filter((id) => sides.get(id) === 'left'),
            '__colspacer_left__',
            ...window.free.slice(window.start, window.end).map((column) => column.id),
            '__colspacer_right__',
            ...ids.filter((id) => sides.get(id) === 'right'),
          ];
          return this.rowSelectionEnabled() ? [this.selectionColumnId, ...rendered] : rendered;
        }
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

  /**
   * Lignes d'en-tête de groupe (`NgTableColumn.headerGroup`), de la plus externe à la plus
   * interne, pour les colonnes réellement affichées (sélection, espacements et vue
   * mobile compris). Vide quand aucune colonne n'a de groupe.
   */
  protected readonly headerGroupLevels = computed(
    () => {
      const columns = new Map(this.columns().map((column) => [column.id, column] as const));
      const leftEdge = this.hasLeftPinnedColumns();
      return buildHeaderGroupLevels(
        this.displayedColumnIds().map((id) => {
          const column = columns.get(id);
          if (!column) {
            return {id, path: [], pin: id === this.selectionColumnId && leftEdge ? ('left' as const) : undefined};
          }
          return {id, path: headerGroupPath(column.headerGroup), pin: this.pinnedSide(column)};
        }),
      );
    },
    {equal: (a, b) => JSON.stringify(a) === JSON.stringify(b)},
  );

  protected readonly columnsMenuItems = computed(() =>
    this.columns().filter((column) => column.id !== '__detail_row__' && column.id !== '__mobile_actions__'),
  );

  readonly viewsList = computed(() => this.effectiveViewsStore().views);
  readonly activeViewId = computed(() => this.effectiveViewsStore().activeViewId);
  readonly activeView = computed(() => this.viewsList().find((v) => v.id === this.activeViewId()) ?? null);

  /**
   * Colonnes visibles, dans l'ordre naturel de `columns()` — PAS trié par
   * `columnOrder`. Sert de base à `visibleColumns()` (qui applique le tri) et,
   * séparément, à tout ce qui ne dépend PAS de l'ordre d'affichage
   * (`filteredSortedRows` notamment) : sa référence reste stable tant que
   * l'ENSEMBLE des colonnes visibles ne change pas, même si leur ORDRE change.
   * Sans cette séparation, glisser une colonne pour la réordonner ferait
   * recalculer `visibleColumns()` avec une nouvelle référence à chaque fois,
   * ce qui invaliderait tout computed qui en dépend — y compris
   * `filteredSortedRows`, qui refiltrerait/retrierait alors la TOTALITÉ des
   * lignes à chaque réordonnancement, même si le filtrage/tri ne dépend en
   * rien de l'ordre des colonnes. Sur une grosse liste, c'est précisément ce
   * qui rend le réordonnancement des colonnes perceptiblement lent.
   */
  private readonly visibleColumnsUnordered = computed(() => {
    const columns = this.columns();
    const visibility = this.effectiveColumnVisibility();
    return !visibility
      ? columns.filter((column) => column.visible !== false)
      : columns.filter((column) => visibility[column.id] ?? true);
  });

  readonly visibleColumns = computed(() => {
    const filtered = this.visibleColumnsUnordered();
    const order = this.effectiveColumnOrder();
    let ordered = filtered;
    if (order.length > 0) {
      const orderIndex = new Map(order.map((id, index) => [id, index]));
      ordered = [...filtered].sort((a, b) => {
        const indexA = orderIndex.has(a.id) ? orderIndex.get(a.id)! : Number.MAX_SAFE_INTEGER;
        const indexB = orderIndex.has(b.id) ? orderIndex.get(b.id)! : Number.MAX_SAFE_INTEGER;
        return indexA - indexB;
      });
    }

    // Les colonnes épinglées doivent être contiguës aux bords : le CDK calcule le
    // décalage d'une colonne `sticky` en cumulant les largeurs des colonnes
    // `sticky` qui la PRÉCÈDENT — une colonne libre intercalée la ferait coller
    // à la mauvaise position.
    const sides = this.pinnedSides();
    if (sides.size === 0) {
      return ordered;
    }
    return [
      ...ordered.filter((column) => sides.get(column.id) === 'left'),
      ...ordered.filter((column) => !sides.has(column.id)),
      ...ordered.filter((column) => sides.get(column.id) === 'right'),
    ];
  });

  /**
   * Largeur mini effective du tableau. Avec `table-layout: fixed`, les colonnes sans
   * largeur se partagent `minTableWidthPx` sans plancher : avec beaucoup de colonnes,
   * chacune tombait sous la place nécessaire à son en-tête (libellé réduit à 0 px).
   */
  protected readonly tableMinWidthPx = computed(() => {
    const widths = this.columnWidths();
    const columnsTotal = this.visibleColumns().reduce(
      (total, column) => total + (widths[column.id] ?? column.widthPx ?? column.minWidthPx ?? DEFAULT_MIN_COLUMN_WIDTH_PX),
      this.rowSelectionEnabled() ? SELECTION_COLUMN_WIDTH_PX : 0,
    );
    return Math.max(this.minTableWidthPx(), columnsTotal);
  });

  /** Côté d'épinglage effectif de chaque colonne : `pinned` déclaré, ou colonne de référence choisie. */
  private readonly pinnedSides = computed(() => {
    const reference = this.referenceColumn();
    const sides = new Map<string, 'left' | 'right'>();
    for (const column of this.columns()) {
      if (column.pinned === 'right' && column.id !== reference) {
        sides.set(column.id, 'right');
      } else if (column.pinned === 'left' && reference === undefined) {
        sides.set(column.id, 'left');
      }
    }
    if (reference) {
      sides.set(reference, 'left');
    }
    return sides;
  });

  protected pinnedSide(column: NgTableColumn<T>): 'left' | 'right' | undefined {
    return this.pinnedSides().get(column.id);
  }

  /** Colonne actuellement fixée à gauche comme référence (choisie, ou déclarée `pinned: 'left'`). */
  protected isReferenceColumn(column: NgTableColumn<T>): boolean {
    return this.pinnedSide(column) === 'left';
  }

  /** Punaise du menu « Colonnes » : fixe cette colonne à gauche, ou la libère si elle l'est déjà. */
  protected toggleReferenceColumn(column: NgTableColumn<T>): void {
    this.referenceColumn.set(this.isReferenceColumn(column) ? null : column.id);
  }

  /** La colonne de sélection suit les colonnes épinglées à gauche, sinon elles glisseraient dessous. */
  protected readonly hasLeftPinnedColumns = computed(() => this.visibleColumns().some((column) => this.pinnedSide(column) === 'left'));
  protected readonly actionColumn = computed(() =>
    this.visibleColumns().find((column) => column.mobileRowActions) ?? null,
  );
  protected readonly detailRowColumns = ['__detail_row__'];
  protected readonly isMobileView = signal(
    typeof window !== 'undefined' ? window.innerWidth <= 760 : false,
  );
  /** Etat interne de selection quand `selectedRowKeys` n'est pas fourni. */
  protected readonly internalSelectedKeys = signal<ReadonlySet<unknown>>(new Set());
  protected readonly contextMenuRow = signal<T | null>(null);
  protected readonly columnFilters = signal<Record<string, string>>({});
  /** Recherche globale appliquée (après debounce). */
  protected readonly globalSearchTerm = signal('');
  /** Texte du champ de recherche, à jour à chaque frappe (le debounce ne porte que sur l'application). */
  protected readonly globalSearchDraft = signal('');
  /** Summary of currently active filters (for the bottom bar). */
  readonly activeFilterSummaries = computed<{ columnId: string; label: string; value: string }[]>(() => {
    const filters = this.columnFilters();
    const summaries: { columnId: string; label: string; value: string }[] = [];
    const search = this.globalSearchTerm().trim();
    if (search) {
      summaries.push({columnId: GLOBAL_SEARCH_KEY, label: this.effectiveLabels().globalSearchLabel, value: search});
    }
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
  /** Niveaux de tri actifs, par priorité (le premier est le tri principal). Jamais d'entrée sans direction. */
  protected readonly sortStates = signal<NgTableSortChange[]>([]);
  /** Tri principal : ce qu'exposent `sortChange` et `NgTableRemoteQuery.sort`. */
  protected readonly sortState = computed<NgTableSortChange>(() => this.sortStates()[0] ?? {columnId: '', direction: ''});
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
  /** Contenu de la région `aria-live` (voir `announce`). */
  protected readonly liveAnnouncement = signal('');
  /** Message affiché dans le menu des vues après un import (succès ou fichier invalide). */
  protected readonly viewsImportFeedback = signal('');
  protected readonly exportFromPage = signal(1);
  protected readonly exportToPage = signal(1);
  /**
   * Total number of locally-exportable "pages" (>= 1). Based on the filtered/sorted
   * row count and `pageSize()`; always `1` when pagination isn't tracked (there is
   * only one "page": everything), so the export dialog only asks for a page range
   * when it's actually meaningful.
   */
  protected readonly exportTotalPages = computed(() => {
    if (!this.pagingActive()) {
      return 1;
    }
    const size = this.pageSize();
    if (!size || size <= 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(this.filteredSortedRows().length / size));
  });
  /**
   * Local mode pipeline: rows source -> filtres -> tri (sans pagination).
   * Dépend de `visibleColumnsUnordered()`, PAS de `visibleColumns()` — le
   * filtrage/tri ne dépend en rien de l'ORDRE des colonnes, seulement de
   * lesquelles sont visibles et de leurs valeurs de filtre. Voir le
   * commentaire de `visibleColumnsUnordered`.
   */
  private readonly filteredSortedRows = computed(() => {
    const store = this.syncedStore();
    this.dataVersion();
    const activeColumns = this.visibleColumnsUnordered();
    const filters = this.columnFilters();
    const sorts = this.sortStates();
    const search = this.globalSearchTerm();
    const sums = this.runningSums();
    const terms = searchTerms(search);
    const haystacks = terms.length > 0 ? this.searchHaystacks() : null;

    const levels: SortLevel<T>[] = [];
    for (const sort of sorts) {
      const column = activeColumns.find((candidate) => candidate.id === sort.columnId);
      if (column) {
        levels.push({column, factor: sort.direction === 'desc' ? -1 : 1});
      }
    }
    // Seules les lignes modifiées depuis le dernier passage sont refiltrées puis fusionnées
    // dans le résultat déjà trié ; tout est recalculé si filtres, tri ou colonnes changent.
    return this.pipeline.compute(store, {
      matches: (row) =>
        matchesAllFilters(row, activeColumns, filters) &&
        (!haystacks || matchesSearchTerms(this.searchHaystack(row, haystacks), terms)),
      levels,
      collator: this.collator,
      sums,
      deps: [store, activeColumns, filters, sorts, search, haystacks?.columns, sums],
    });
  });

  /**
   * Colonnes `sum` / `avg` de la ligne de totaux : leurs sommes sont tenues par le
   * pipeline, par différence à chaque lot, au lieu de relire toutes les lignes.
   */
  private readonly runningSums = computed(() =>
    this.showTotals() && this.dataMode() === 'local'
      ? this.columns()
          .filter((column) => column.aggregate === 'sum' || column.aggregate === 'avg')
          .map((column) => ({id: column.id, value: column.valueAccessor}))
      : [],
  );

  /**
   * Lignes de la table indexées par clé (mode local) : alimentées par `[rows]` (comparé
   * à la version précédente, clé par clé) et par les transactions.
   */
  private rowStore = new RowStore<T>((row) => this.rowKey(row));
  private pipeline = new IncrementalPipeline<T>((row) => this.rowKey(row));
  /** Incrémenté à chaque transaction appliquée. */
  private readonly dataVersion = signal(0);

  /**
   * Reporte `[rows]` dans le store à chaque nouveau tableau. Lu avant toute transaction,
   * pour qu'une transaction s'applique toujours après le dernier `[rows]` reçu.
   */
  private readonly syncedStore = computed(() => {
    const rows = this.rows();
    const keyAccessor = this.rowKeyAccessor();
    if (keyAccessor !== this.storeKeyAccessor) {
      this.storeKeyAccessor = keyAccessor;
      this.rowStore = new RowStore<T>((row) => this.rowKey(row));
      this.pipeline = new IncrementalPipeline<T>((row) => this.rowKey(row));
    }
    untracked(() => this.recordFlashes(this.rowStore.replaceAll(rows)));
    return this.rowStore;
  }, {equal: () => false});
  private storeKeyAccessor: ((row: T) => unknown) | null | undefined = undefined;

  /** Toutes les lignes en mode local, transactions comprises (ordre d'arrivée). */
  private readonly sourceRows = computed(() => {
    this.dataVersion();
    return this.syncedStore().rows();
  });

  private readonly searchableColumns = computed(() =>
    this.visibleColumnsUnordered().filter((column) => column.searchable !== false),
  );

  /**
   * Texte normalisé de chaque ligne pour la recherche globale : calculé une fois par
   * ligne, puis réutilisé à chaque nouvelle saisie (seule la comparaison est refaite).
   * Le cache est recréé quand les lignes ou les colonnes cherchables changent.
   */
  private readonly searchHaystacks = computed(() =>
    // Mis en cache par objet ligne : une ligne modifiée (nouvel objet) est recalculée à la
    // demande, les autres gardent leur texte. Seul un changement de colonnes vide le cache.
    ({columns: this.searchableColumns(), cache: new WeakMap<object, string>()}),
  );
  /** Colonne de regroupement effective (mode local, colonne existante), sinon `null`. */
  protected readonly groupColumn = computed(() => {
    const id = this.groupBy();
    return id ? (this.columns().find((column) => column.id === id) ?? null) : null;
  });

  /**
   * En `remote`, replier un groupe demande au serveur d'exclure ses lignes, et la table
   * doit savoir où placer son en-tête : il faut la liste ordonnée des groupes
   * (`[groupSummaries]`). Sans elle, les groupes ne se replient pas.
   */
  protected readonly groupsCollapsible = computed(() => this.dataMode() === 'local' || !!this.groupSummaries());

  /** Résumés serveur par clé de groupe. */
  private readonly summariesByKey = computed(
    () => new Map((this.groupSummaries() ?? []).map((summary) => [summary.key, summary] as const)),
  );

  /** Colonnes proposées dans le menu « Grouper ». */
  protected readonly groupableColumns = computed(() =>
    this.columnsMenuItems().filter((column) => column.groupable ?? (!!column.sortable || !!column.filter)),
  );

  /** Dernière colonne de regroupement vue par l'effet de changement (`undefined` avant le premier passage). */
  private lastGroupBy: string | null | undefined;

  /** Clés des groupes repliés. Vidé quand la colonne de regroupement change. */
  protected readonly collapsedGroups = signal<ReadonlySet<string>>(new Set());

  private readonly groups = computed(() => {
    const column = this.groupColumn();
    if (!column) {
      return null;
    }
    if (this.dataMode() === 'remote') {
      return buildConsecutiveGroups(this.rows(), column);
    }
    const sort = this.sortState();
    const descending = sort.columnId === column.id && sort.direction === 'desc';
    return buildGroups(this.filteredSortedRows(), column, descending, this.collator);
  });

  /** Unités paginées avec regroupement : lignes des groupes dépliés, un élément par groupe replié. */
  private readonly groupUnits = computed(() => {
    const groups = this.groups();
    if (!groups) {
      return null;
    }
    return groupedUnits(groups, this.groupsCollapsible() ? this.collapsedGroups() : new Set<string>());
  });

  /** Nombre d'éléments paginés : lignes filtrées, ou unités quand les lignes sont regroupées. */
  protected readonly pageableCount = computed(() => this.groupUnits()?.length ?? this.filteredSortedRows().length);

  readonly displayedRows: Signal<T[]> = computed<T[]>(() => {
    if (this.blockMode()) {
      // Lignes chargées de la zone rendue : ce que l'utilisateur voit (sélection, clavier).
      this.blockVersion();
      const range = this.virtualRange();
      return range ? this.blockCache.loadedRows(range.start, range.end) : [];
    }
    if (this.dataMode() === 'remote') {
      // Regroupées ou non, les lignes restent dans l'ordre renvoyé par le serveur.
      // Le serveur a déjà filtré/trié/paginé — on affiche tel quel.
      return this.rows();
    }
    const units = this.groupUnits();
    if (units) {
      return this.currentPage(units).flatMap((unit) => (unit.kind === 'row' ? [unit.row] : []));
    }
    return this.currentPage(this.filteredSortedRows());
  });

  /** Éléments de la page : les lignes affichées, avec les en-têtes de groupe intercalés. */
  private readonly pageItems = computed<(T | NgTableGroupRow<T>)[]>(() => {
    const units = this.groupUnits();
    if (!units) {
      return this.displayedRows();
    }
    if (this.dataMode() === 'local') {
      return withGroupHeaders(this.currentPage(units));
    }
    // En remote, `rows()` EST déjà la page. Avec les résumés serveur, on y replace
    // aussi les en-têtes des groupes repliés (dont le serveur ne renvoie aucune ligne).
    const column = this.groupColumn();
    const summaries = this.groupSummaries();
    if (!column || !summaries) {
      return withGroupHeaders(units);
    }
    const size = this.pageSize();
    const paged = this.pagingActive() && size > 0;
    const start = paged ? this.pageIndex() * size : 0;
    return remoteGroupedPage(this.rows(), column, summaries, this.collapsedGroups(), start, paged ? start + size : Infinity);
  });

  /** Hauteur max. de la zone de défilement : `[maxHeight]`, ou 70vh en défilement virtuel. */
  /** Modèle serveur par blocs actif (mode remote + `[remoteDatasource]`). */
  protected readonly blockMode = computed(() => this.dataMode() === 'remote' && !!this.remoteDatasource());
  /** Défilement virtuel effectif : demandé, ou imposé par le modèle par blocs. */
  protected readonly virtualActive = computed(() => this.virtualScroll() || this.blockMode());

  private blockCache = new BlockCache<T>(100, 50);
  /** Incrémenté quand un bloc arrive ou que le cache est purgé. */
  private readonly blockVersion = signal(0);
  private blocksInFlight = 0;

  protected readonly effectiveMaxHeight = computed(() => this.maxHeight() ?? (this.virtualActive() ? '70vh' : null));

  private readonly scrollTop = signal(0);
  private readonly viewportHeight = signal(0);
  /** Hauteur d'une ligne, mesurée sur la première ligne rendue (densité, thème...). */
  private readonly rowHeight = signal(48);
  /** Hauteurs mesurées de l'en-tête et de la ligne de totaux : décalages des lignes épinglées. */
  private readonly headerHeight = signal(56);
  private readonly footerHeight = signal(48);

  /** Décalage CSS des lignes épinglées du haut : l'en-tête, s'il reste visible au défilement. */
  protected readonly pinHeaderOffset = computed(() => (this.stickyHeader() || this.virtualActive() ? this.headerHeight() : 0));
  /** Décalage CSS des lignes épinglées du bas : la ligne de totaux, si elle reste visible. */
  protected readonly pinFooterOffset = computed(() => (this.totals() && this.stickyHeader() ? this.footerHeight() : 0));

  /**
   * Tranche rendue en défilement virtuel. Ne change que lorsque ses bornes changent :
   * défiler de quelques pixels ne recrée pas la source de données de la table.
   */
  /** Tranche rendue et hauteurs des espacements (barre comprimée au-delà de `MAX_SCROLL_HEIGHT`). */
  private readonly virtualLayout: Signal<VirtualLayout | null> = computed<VirtualLayout | null>(() =>
    this.virtualActive()
      ? computeVirtualLayout(this.virtualCount(), this.scrollTop(), this.viewportHeight(), this.rowHeight())
      : null,
  );

  private readonly virtualRange: Signal<VirtualRange | null> = computed<VirtualRange | null>(
    () => {
      const layout = this.virtualLayout();
      return layout ? {start: layout.start, end: layout.end} : null;
    },
    {equal: (a, b) => a === b || (!!a && !!b && a.start === b.start && a.end === b.end)},
  );

  /**
   * Hauteur d'un espacement, lue par le template : défiler change ces hauteurs (barre
   * comprimée) sans recréer la source de données de la table tant que la tranche est la même.
   */
  protected spacerHeight(position: 'top' | 'bottom'): number {
    const layout = this.virtualLayout();
    return layout ? (position === 'top' ? layout.top : layout.bottom) : 0;
  }

  /**
   * Fait défiler pour amener la ligne `index` (0-based, dans l'ordre affiché) en haut de la
   * zone, comme `ensureIndexVisible` d'AG Grid. Défilement virtuel ou modèle par blocs.
   */
  scrollToIndex(index: number): void {
    const wrap = this.tableWrapElement()?.nativeElement;
    if (!this.virtualActive() || !wrap) {
      return;
    }
    const top = scrollTopForIndex(index, this.virtualCount(), this.viewportHeight(), this.rowHeight());
    wrap.scrollTop = top;
    this.scrollTop.set(top);
  }

  /** Nombre d'éléments à faire défiler : total serveur en modèle par blocs, sinon éléments de la page. */
  private readonly virtualCount: Signal<number> = computed<number>(() => {
    if (this.blockMode()) {
      this.blockVersion();
      return this.blockCache.rowCount;
    }
    return this.pageItems().length;
  });

  /** Lignes épinglées : côté et rang (depuis le bord le plus proche) de chacune. */
  protected readonly pinnedInfo = computed(() => {
    const info = new Map<T, { side: 'top' | 'bottom'; index: number; edge: boolean }>();
    const top = this.pinnedTopRows();
    top.forEach((row, index) => info.set(row, {side: 'top', index, edge: index === top.length - 1}));
    const bottom = this.pinnedBottomRows();
    bottom.forEach((row, index) => info.set(row, {side: 'bottom', index: bottom.length - 1 - index, edge: index === 0}));
    return info;
  });

  protected pinInfo(row: T): { side: 'top' | 'bottom'; index: number; edge: boolean } | undefined {
    return this.pinnedInfo().get(row);
  }

  /** Source de données de la table : lignes épinglées autour du corps (page ou tranche virtuelle). */
  protected readonly tableRows = computed<TableItem<T>[]>(() => {
    const top = this.pinnedTopRows();
    const bottom = this.pinnedBottomRows();
    const body = this.bodyRows();
    return top.length === 0 && bottom.length === 0 ? body : [...top, ...body, ...bottom];
  });

  /** Corps de la table : éléments de la page, fenêtrés en défilement virtuel. */
  private readonly bodyRows = computed<TableItem<T>[]>(() => {
    const range = this.virtualRange();
    if (this.blockMode() && range) {
      this.blockVersion();
      const items: TableItem<T>[] = [new NgTableSpacerRow('top', 0)];
      for (let index = range.start; index < range.end; index++) {
        items.push(this.blockCache.rowAt(index) ?? new NgTableLoadingRow(index));
      }
      items.push(new NgTableSpacerRow('bottom', 0));
      return items;
    }
    const items = this.pageItems();
    if (!range) {
      return items;
    }
    return [new NgTableSpacerRow('top', 0), ...items.slice(range.start, range.end), new NgTableSpacerRow('bottom', 0)];
  });

  /** Index (dans `displayedRows()`) de la première ligne de données rendue : tranche virtuelle et groupes. */
  private readonly renderedRowBase = computed(() => {
    const range = this.virtualRange();
    if (!range || this.blockMode()) {
      return 0;
    }
    if (!this.groupUnits()) {
      return range.start;
    }
    const items = this.pageItems();
    let count = 0;
    for (let i = 0; i < range.start; i++) {
      if (!(items[i] instanceof NgTableGroupRow)) {
        count++;
      }
    }
    return count;
  });

  /** Index dans `displayedRows()` de chaque ligne rendue (les lignes épinglées n'en ont pas). */
  private readonly renderedRowIndexes = computed(() => {
    const indexes = new Map<T, number>();
    if (!this.rangeSelection()) {
      return indexes;
    }
    const pinned = this.pinnedInfo();
    let index = this.renderedRowBase();
    for (const item of this.tableRows()) {
      if (isDataItem(item) && !pinned.has(item)) {
        indexes.set(item, index++);
      }
    }
    return indexes;
  });

  private readonly visibleColumnIndexes = computed(() => new Map(this.visibleColumns().map((column, index) => [column.id, index] as const)));

  /** Une colonne au moins est éditable : les cellules portent leur id de colonne (`data-ngt-col`). */
  protected readonly hasEditableColumns = computed(() => this.columns().some((column) => !!column.editable));
  protected readonly cellsTagged = computed(() => this.rangeSelection() || this.hasEditableColumns());

  /** Cellule en cours d'édition : repérée par la clé de sa ligne (stable au tri, au défilement). */
  protected readonly editing = signal<{ key: unknown; columnId: string; draft: string; error: string | null; cell: HTMLElement | null } | null>(null);
  private readonly injector = inject(Injector);
  private history = new EditHistory<T>(100);
  private readonly historyVersion = signal(0);
  /** Peut-on défaire / rétablir une modification ? */
  readonly canUndo = computed(() => (this.historyVersion(), this.history.canUndo));
  readonly canRedo = computed(() => (this.historyVersion(), this.history.canRedo));

  private readonly rangeAnchor = signal<CellPosition | null>(null);
  private readonly rangeFocus = signal<CellPosition | null>(null);
  private rangeDragging = false;

  /** Plage sélectionnée, ramenée aux lignes et colonnes qui existent encore. */
  protected readonly rangeBounds = computed<CellRange | null>(() => {
    const anchor = this.rangeAnchor();
    const focus = this.rangeFocus();
    if (!this.rangeSelection() || !anchor || !focus) {
      return null;
    }
    return clampRange(normalizeRange(anchor, focus), this.displayedRows().length, this.visibleColumns().length);
  });

  /**
   * Valeurs, textes et classes des lignes rendues (page ou tranche virtuelle), pour les
   * colonnes visibles, calculés une fois par changement : une détection de changements
   * sans rapport avec les données ne rappelle ni `valueAccessor` ni `rowClassFn`.
   */
  private readonly rowViews = computed(() =>
    buildRowViews(
      this.tableRows().filter((item): item is T => isDataItem(item)),
      this.renderedColumns(),
      this.rowClassFn(),
      this.flashes.size > 0 ? this.flashClassFn(performance.now()) : null,
    ),
  );

  /** Agrégats de chaque groupe, par colonne (texte prêt à afficher), calculés une fois par changement. */
  /** Agrégats de chaque groupe (texte prêt à afficher), par clé de groupe. */
  private readonly groupAggregates = computed(() => {
    const result = new Map<string, Record<string, string>>();
    const columns = this.columns().filter((column) => column.aggregate);
    if (this.dataMode() === 'remote') {
      for (const summary of this.groupSummaries() ?? []) {
        result.set(summary.key, this.formatAggregates(columns, summary.aggregates ?? {}));
      }
      return result;
    }
    for (const group of this.groups() ?? []) {
      result.set(group.key, this.aggregateTexts(columns, group.rows));
    }
    return result;
  });

  /** Ligne de totaux (mode local) : agrégats sur toutes les lignes filtrées. */
  protected readonly totals = computed(() => {
    if (!this.showTotals() || this.dataMode() !== 'local') {
      return null;
    }
    const columns = this.columns().filter((column) => column.aggregate);
    if (columns.length === 0) {
      return null;
    }
    const rows = this.filteredSortedRows();
    const values: Record<string, unknown> = {};
    for (const column of columns) {
      const running = column.aggregate === 'sum' || column.aggregate === 'avg' ? this.pipeline.total(column.id) : undefined;
      if (running) {
        values[column.id] = running.count === 0 ? null : column.aggregate === 'sum' ? running.sum : running.sum / running.count;
      } else {
        values[column.id] = computeAggregate(column, rows); // min, max, nombre, agrégat personnalisé
      }
    }
    return this.formatAggregates(columns, values);
  });

  /** Colonne qui porte le libellé d'un en-tête de groupe / de la ligne de totaux : la première affichée. */
  protected readonly leadColumnId = computed(() => this.renderedColumns()[0]?.id ?? null);

  protected readonly groupRowColumns = computed(() => this.displayedColumnIds().map((id) => `__group__${id}`));

  private readonly mobileActionsColumnId = '__mobile_actions__';
  protected readonly mobileActionRowColumns = computed(() => {
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
  protected readonly hasColumns = computed(() => this.displayedColumnIds().length > 0);
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
  private readonly numberFormat = new Intl.NumberFormat(undefined, {maximumFractionDigits: 2});
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
  protected readonly effectiveLabels = computed<NgTableLabels>(
    () => ({
      ...NG_TABLE_DEFAULT_LABELS,
      ...resolveNgTableLabelsSource(this.injectedLabels),
      ...this.labels(),
    }),
    {equal: ngTableLabelsEqual},
  );
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  // `read` obligatoire : sur `<table mat-table>`, la référence désignerait l'instance MatTable.
  private readonly tableElement = viewChild('gridTable', {read: ElementRef<HTMLTableElement>});
  private readonly tableWrapElement = viewChild('tableWrap', {read: ElementRef<HTMLElement>});
  /** Cellule active de la navigation clavier (index de ligne affichée, index de cellule). */
  private readonly activeGridCell = signal<GridPosition>({row: 0, col: 0});
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
        if (entry.columnId === GLOBAL_SEARCH_KEY) {
          this.commitGlobalSearch(entry.value);
          return;
        }
        this.commitFilterValue(entry.columnId, entry.value);
      });

    effect(() => {
      const external = this.globalSearch();
      if (external === null) {
        return;
      }
      this.globalSearchTerm.set(external);
      this.globalSearchDraft.set(external);
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
      this.displayedRows(); // dépendance seule : repositionner le menu de filtre ouvert
      this.requestFilterPositionUpdate();
    });

    effect(() => {
      if (this.dataMode() !== 'local' || !this.pagingActive()) {
        return;
      }
      this.filteredCountChange.emit(this.pageableCount());
    });

    // Navigation cellule par cellule : après chaque rendu qui change les lignes ou les
    // colonnes, une seule cellule reste atteignable par Tab (tabindex itinérant). La
    // cellule qui a le focus le garde (en défilement virtuel, les lignes rendues changent).
    afterRenderEffect(() => {
      if (!this.cellNavigation()) {
        return;
      }
      this.tableRows();
      this.displayedColumnIds();
      const table = this.tableElement()?.nativeElement;
      if (table) {
        const focused = document.activeElement ? locateGridCell(table, document.activeElement) : null;
        syncGridTabStops(table, focused?.position ?? untracked(() => this.activeGridCell()));
      }
    });

    // Défilement virtuel : mesure la zone visible et la hauteur réelle d'une ligne.
    afterRenderEffect(() => {
      const hasPinnedRows = this.pinnedTopRows().length > 0 || this.pinnedBottomRows().length > 0;
      if (!this.virtualActive() && !this.columnVirtualization() && !hasPinnedRows) {
        return;
      }
      this.tableRows();
      const wrap = this.tableWrapElement()?.nativeElement;
      if (!wrap) {
        return;
      }
      untracked(() => {
        // Toutes les lignes d'en-tête (groupes compris) : les lignes épinglées se placent sous leur total.
        const header = [...wrap.querySelectorAll('tr.mat-mdc-header-row')].reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
        if (header > 0 && Math.abs(header - this.headerHeight()) > 0.5) {
          this.headerHeight.set(header);
        }
        const footer = wrap.querySelector('tr.totals-row')?.getBoundingClientRect().height ?? 0;
        if (footer > 0 && Math.abs(footer - this.footerHeight()) > 0.5) {
          this.footerHeight.set(footer);
        }
        if (wrap.clientWidth !== this.viewportWidth()) {
          this.viewportWidth.set(wrap.clientWidth);
        }
        if (wrap.clientHeight !== this.viewportHeight()) {
          this.viewportHeight.set(wrap.clientHeight);
        }
        const height = wrap.querySelector('tr.data-row')?.getBoundingClientRect().height ?? 0;
        if (height > 0 && Math.abs(height - this.rowHeight()) > 0.5) {
          this.rowHeight.set(height);
        }
      });
    });

    // Changer de colonne de regroupement déplie tout et revient en page 0 (pas au
    // premier passage : la page peut venir d'une URL ou d'une vue restaurée).
    effect(() => {
      const current = this.groupBy();
      untracked(() => {
        const previousGroupBy = this.lastGroupBy;
        if (previousGroupBy !== undefined && current !== previousGroupBy) {
          this.collapsedGroups.set(new Set());
          if (this.dataMode() === 'remote') {
            this.onQueryStateChanged(); // le serveur doit renvoyer les lignes triées par groupe
          } else if (this.pagingActive() && this.pageIndex() !== 0) {
            this.pageIndex.set(0);
          }
        }
        this.lastGroupBy = current;
      });
    });

    // Modèle par blocs : nouvelle source ou nouveaux réglages de cache → on repart de zéro.
    effect(() => {
      this.remoteDatasource();
      const size = Math.max(1, this.cacheBlockSize());
      const maxBlocks = Math.max(1, this.maxBlocksInCache());
      untracked(() => {
        this.blockCache = new BlockCache<T>(size, maxBlocks);
        this.blocksInFlight = 0;
        this.blockVersion.update((version) => version + 1);
      });
    });

    // Modèle par blocs : à chaque déplacement de la zone rendue ou arrivée d'un bloc,
    // on demande les blocs manquants de la zone.
    effect(() => {
      const range = this.virtualRange();
      this.blockVersion();
      if (!this.blockMode() || !range) {
        return;
      }
      untracked(() => this.loadVisibleBlocks(range));
    });

    // Taille de l'historique annuler / rétablir : en changer repart d'un historique vide.
    effect(() => {
      const limit = Math.max(1, this.undoRedoLimit());
      untracked(() => {
        this.history = new EditHistory<T>(limit);
        this.historyVersion.update((version) => version + 1);
      });
    });

    // La plage se rapporte à des positions : elle ne survit pas à un tri, un filtre, une
    // recherche, un changement de page ou de colonnes (mais bien aux mises à jour de données).
    effect(() => {
      this.sortStates();
      this.columnFilters();
      this.globalSearchTerm();
      this.pageIndex();
      this.pageSize();
      this.groupBy();
      this.displayedColumnIds();
      untracked(() => this.clearRangeSelection());
    });

    // Un seul point d'émission de `queryStateChange`, quelle que soit l'origine du
    // changement (clic, vue, paginateur, applyQueryState...). Émis une fois au démarrage.
    effect(() => {
      const state = this.getQueryState();
      untracked(() => this.queryStateChange.emit(state));
    });

    // Paginateur intégré, mode local : si les données rétrécissent (rechargement),
    // ne pas rester sur une page devenue vide au-delà de la dernière.
    effect(() => {
      if (!this.paginator() || this.dataMode() !== 'local') {
        return;
      }
      const size = this.pageSize();
      const lastPage = size > 0 ? Math.max(0, Math.ceil(this.pageableCount() / size) - 1) : 0;
      if (this.pageIndex() > lastPage) {
        this.pageIndex.set(lastPage);
      }
    });

    // Inline mode: lazy filter options must be loaded eagerly since there is no menu-open event.
    // `visibleColumnsUnordered` : quelles colonnes sont visibles importe, leur ordre non —
    // évite de repasser sur toutes les colonnes (déjà chargées, donc no-op, mais pas gratuit
    // sur beaucoup de colonnes) à chaque réordonnancement.
    effect(() => {
      if (!this.inlineFilters()) {
        return;
      }
      for (const column of this.visibleColumnsUnordered()) {
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
          this.applyInitialView(external);
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
      const loaded = loadViewsStore(key);
      this.internalViewsStore.set(loaded);
      this.applyInitialView(loaded);
    });
  }

  ngOnDestroy(): void {
    this.detachRangeDragListeners();
    if (this.asyncTimer !== null) {
      clearTimeout(this.asyncTimer);
    }
    this.stopResize();
    this.stopScrollTracking();
    // L'ancre a été déplacée dans `document.body` : elle n'est plus détruite avec la vue.
    this.contextMenuAnchor?.remove();
    this.contextMenuAnchor = null;
  }

  /**
   * Clic sur un en-tête : croissant, puis décroissant, puis sans tri. Avec
   * `[multiSort]`, Maj+clic ajoute la colonne comme niveau de tri supplémentaire
   * (ou fait tourner sa direction si elle en est déjà un) ; un clic simple revient
   * à un tri unique.
   */
  protected onHeaderSort(column: NgTableColumn<T>, event?: { shiftKey?: boolean }): void {
    if (!column.sortable) {
      return;
    }

    const current = this.sortStates();
    const existing = current.find((sort) => sort.columnId === column.id);
    let nextDirection: SortDirection = 'asc';
    if (existing?.direction === 'asc') {
      nextDirection = 'desc';
    } else if (existing?.direction === 'desc') {
      nextDirection = '';
    }

    let next: NgTableSortChange[];
    if (this.multiSort() && event?.shiftKey) {
      const updated: NgTableSortChange = {columnId: column.id, direction: nextDirection};
      if (!existing) {
        next = [...current, updated];
      } else if (nextDirection) {
        next = current.map((sort) => (sort.columnId === column.id ? updated : sort));
      } else {
        next = current.filter((sort) => sort.columnId !== column.id);
      }
    } else {
      next = nextDirection ? [{columnId: column.id, direction: nextDirection}] : [];
    }

    const previousPrimary = this.sortState();
    this.sortStates.set(next);
    const nextState = this.sortState();
    if (previousPrimary.columnId !== nextState.columnId || previousPrimary.direction !== nextState.direction) {
      this.sortChange.emit(nextState);
    }
    this.sortsChange.emit(next);
    const labels = this.effectiveLabels();
    const sortMessage = !nextDirection
      ? labels.announceSortCleared
      : (nextDirection === 'asc' ? labels.announceSortAsc : labels.announceSortDesc).replace('{column}', column.header);
    this.onQueryStateChanged(sortMessage);
  }

  /**
   * `text` filters are free-typed — every keystroke would otherwise re-run local
   * filtering and, in `remote` mode, fire a request per character. Those are
   * debounced (see `filterInputSubject`); discrete selections (select/enum/boolean/
   * date pickers) commit immediately since they're single deliberate actions.
   */
  protected onFilterValue(columnId: string, value: string): void {
    if (!this.isFreeTypedFilter(columnId)) {
      this.commitFilterValue(columnId, value);
      return;
    }
    this.filterInputSubject.next({columnId, value, epoch: this.filterEpoch(columnId)});
  }

  clearFilter(columnId: string): void {
    if (columnId === GLOBAL_SEARCH_KEY) {
      this.clearGlobalSearch(); // pastille « Recherche » de la barre des filtres actifs
      return;
    }
    this.bumpFilterEpoch(columnId); // supersede any debounced keystroke still in flight for this column
    this.commitFilterValue(columnId, '');
  }

  /** Réinitialise les filtres de colonnes ET la recherche globale, en une seule requête en mode `remote`. */
  clearAllFilters(): void {
    for (const column of this.columns()) {
      this.bumpFilterEpoch(column.id);
    }
    this.bumpFilterEpoch(GLOBAL_SEARCH_KEY);
    this.globalSearchDraft.set('');
    if (this.globalSearchTerm()) {
      this.globalSearchTerm.set('');
      this.globalSearchChange.emit('');
    }
    const next: Record<string, string> = {};
    this.columnFilters.set(next);
    this.filtersChange.emit(next);
    this.onQueryStateChanged();
  }

  /** Saisie dans le champ de recherche globale : debouncée comme un filtre texte. */
  protected onGlobalSearchInput(value: string): void {
    this.globalSearchDraft.set(value);
    this.filterInputSubject.next({columnId: GLOBAL_SEARCH_KEY, value, epoch: this.filterEpoch(GLOBAL_SEARCH_KEY)});
  }

  /** Entrée dans le champ de recherche : applique tout de suite, sans attendre le debounce. */
  protected applyGlobalSearchNow(): void {
    this.bumpFilterEpoch(GLOBAL_SEARCH_KEY); // la frappe encore en attente devient caduque
    this.commitGlobalSearch(this.globalSearchDraft());
  }

  clearGlobalSearch(): void {
    this.bumpFilterEpoch(GLOBAL_SEARCH_KEY);
    this.globalSearchDraft.set('');
    this.commitGlobalSearch('');
  }

  private commitGlobalSearch(value: string): void {
    if (value === this.globalSearchTerm()) {
      return;
    }
    this.globalSearchTerm.set(value);
    this.globalSearchChange.emit(value);
    this.onQueryStateChanged();
  }

  private searchHaystack(
    row: T,
    haystacks: { columns: NgTableColumn<T>[]; cache: WeakMap<object, string> },
  ): string {
    const cacheable = typeof row === 'object' && row !== null;
    const cached = cacheable ? haystacks.cache.get(row) : undefined;
    if (cached !== undefined) {
      return cached;
    }
    const text = searchText(row, haystacks.columns);
    if (cacheable) {
      haystacks.cache.set(row, text);
    }
    return text;
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
      const created: NgTableView = {id: generateViewId(), name: trimmed, createdAt: now, updatedAt: now, state};
      activeViewId = created.id;
      nextViews = [...store.views, created];
    }

    this.commitViewsStore({...store, views: nextViews, activeViewId});
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
    this.commitViewsStore({...store, views: nextViews, activeViewId: view.id});

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
  protected viewUpdateIconName(view: NgTableView): string {
    return this.updatedViewId() === view.id ? 'check' : 'sync';
  }

  private captureCurrentViewState(): NgTableViewState {
    return {
      columnVisibility: {...this.effectiveColumnVisibility()},
      columnOrder: [...this.effectiveColumnOrder()],
      sort: {...this.sortState()},
      ...(this.sortStates().length > 1 ? {sorts: this.sortStates().map((sort) => ({...sort}))} : {}),
      filters: {...this.columnFilters()},
      columnWidths: {...this.columnWidths()},
      ...(this.globalSearchTerm() ? {search: this.globalSearchTerm()} : {}),
      ...(this.referenceColumn() !== undefined ? {referenceColumnId: this.referenceColumn()} : {}),
      ...(this.groupBy() ? {groupBy: this.groupBy()} : {}),
      ...(this.pagingActive() ? {pageIndex: this.pageIndex(), pageSize: this.pageSize()} : {}),
    };
  }

  protected isFilterActive(columnId: string): boolean {
    return !!(this.columnFilters()[columnId] ?? '').trim();
  }

  protected currentFilterValue(columnId: string): string {
    return this.columnFilters()[columnId] ?? '';
  }

  /** Titre du menu de filtre (libellé de la colonne). */
  protected filterMenuTitle(column: NgTableColumn<T>): string {
    return column.filter?.label ?? column.header ?? '';
  }

  /** `effectiveLabels().filterBy` avec `{field}` remplacé par le libellé de la colonne. */
  protected filterByAriaLabel(column: NgTableColumn<T>): string {
    return this.effectiveLabels().filterBy.replace('{field}', column.header ?? '');
  }

  protected onResizeStart(event: MouseEvent, column: NgTableColumn<T>): void {
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
  protected onResizeHandleKeydown(event: KeyboardEvent, column: NgTableColumn<T>): void {
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
    const minWidth = column.minWidthPx ?? DEFAULT_MIN_COLUMN_WIDTH_PX;
    const maxWidth = column.maxWidthPx ?? 620;
    const nextWidth = Math.max(minWidth, Math.min(maxWidth, currentWidth + delta));

    this.columnWidths.update((current) => ({...current, [column.id]: nextWidth}));
    this.requestFilterPositionUpdate();
  }

  protected onResizeAutoFit(event: MouseEvent, column: NgTableColumn<T>): void {
    if (!column.resizable) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const table = this.resolveTableElement(event.target as HTMLElement | null);
    if (!table) {
      return;
    }

    const selector = `.mat-column-${escapeCssToken(column.id)}`;
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
      measured = Math.max(measured, Math.ceil(measureNaturalWidth(preferredNode) + padding + 14));
    }

    const minWidth = column.minWidthPx ?? DEFAULT_MIN_COLUMN_WIDTH_PX;
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

  protected onRowContextMenu(event: MouseEvent, row: T): void {
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

  protected onFilterMenuOpened(columnId: string, trigger: MatMenuTrigger, filter: NgTableFilterConfig): void {
    this.activeFilterColumnId.set(columnId);
    this.activeFilterTrigger.set(trigger);
    this.startScrollTracking();
    void this.ensureLazyFilterOptions(columnId, filter);
    this.requestFilterPositionUpdate();
  }

  protected onFilterMenuClosed(columnId: string): void {
    if (this.activeFilterColumnId() === columnId) {
      this.activeFilterColumnId.set(null);
      this.activeFilterTrigger.set(null);
      this.stopScrollTracking();
    }
  }

  protected columnWidthPx(column: NgTableColumn<T>): number | null {
    if (this.columnVirtualization()) {
      return this.fixedColumnWidths().get(column.id) ?? null; // largeurs fixes : les espacements en dépendent
    }
    const width = this.columnWidths()[column.id] ?? column.widthPx;
    return width && width > 0 ? width : null;
  }

  private columnSort(column: NgTableColumn<T>): NgTableSortChange | undefined {
    return this.sortStates().find((sort) => sort.columnId === column.id);
  }

  protected currentSortIcon(column: NgTableColumn<T>): string {
    const sort = this.columnSort(column);
    if (!sort) {
      return 'swap_vert';
    }
    return sort.direction === 'asc' ? 'north' : 'south';
  }

  /** Rang de la colonne parmi plusieurs niveaux de tri (1 = principal) ; `null` s'il n'y a qu'un niveau. */
  protected sortPriority(column: NgTableColumn<T>): number | null {
    const sorts = this.sortStates();
    if (sorts.length < 2) {
      return null;
    }
    const index = sorts.findIndex((sort) => sort.columnId === column.id);
    return index === -1 ? null : index + 1;
  }

  protected currentSortAriaLabel(column: NgTableColumn<T>): string {
    const sort = this.columnSort(column);
    const labels = this.effectiveLabels();
    if (!sort) {
      return labels.sort;
    }
    const label = sort.direction === 'asc' ? labels.sortAsc : labels.sortDesc;
    const priority = this.sortPriority(column);
    return priority ? `${label}, ${labels.sortPriority.replace('{priority}', `${priority}`)}` : label;
  }

  /**
   * `aria-sort` du `<th>` — norme WAI-ARIA pour les tableaux triables (APG "Table"
   * pattern). `null` pour une colonne non triable : l'attribut n'est alors pas
   * posé du tout (un `aria-sort="none"` sur une colonne qu'on ne peut pas trier
   * induirait en erreur un lecteur d'écran en laissant croire que c'est possible).
   */
  protected ariaSortValue(column: NgTableColumn<T>): 'ascending' | 'descending' | 'none' | null {
    if (!column.sortable) {
      return null;
    }
    // ARIA : `aria-sort` sur un seul en-tête à la fois, celui du tri principal. Les
    // niveaux secondaires sont décrits par le libellé du bouton (`currentSortAriaLabel`).
    const sort = this.sortState();
    if (sort.columnId !== column.id || !sort.direction) {
      return 'none';
    }
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  protected cellValue(row: T, column: NgTableColumn<T>): unknown {
    return column.valueAccessor(row);
  }

  /** Valeur, texte, texte copié et contexte de template d'une cellule (mis en cache). */
  protected cellView(row: T, column: NgTableColumn<T>): NgTableCellView<T> {
    return this.rowViews().get(row)?.cells.get(column.id) ?? buildCellView(row, column);
  }

  protected onRowClick(row: T): void {
    this.rowClick.emit(row);
    if (this.isUncontrolledDetailMode() && this.detailRowToggleOnRowClick()) {
      this.toggleDetail(row);
    }
  }

  /** `{index}` interpolé en 1-based — plus lisible qu'un index 0-based pour un utilisateur de lecteur d'écran. */
  protected rowSelectAriaLabel(rowIndex: number): string {
    return this.effectiveLabels().selectRow.replace('{index}', `${rowIndex + 1}`);
  }

  /** A row is a keyboard focus stop only when it actually does something — no needless tab stops otherwise. */
  protected isRowInteractive(): boolean {
    return !!this.detailRowTemplate() || (this.rowContextMenuEnabled() && !!this.rowContextMenuTemplate());
  }

  /**
   * Enter/Space mirrors a row click (detail toggle); the "ContextMenu" key or
   * Shift+F10 opens the row's context menu — the standard keyboard equivalent for a
   * right-click, per the WAI-ARIA APG. Without this, `rowContextMenuEnabled` would
   * only ever be reachable with a mouse.
   */
  /** Navigation cellule par cellule : touches reçues par la table (voir `cellNavigation`). */
  protected onGridKeydown(event: KeyboardEvent): void {
    const table = this.tableElement()?.nativeElement;
    const target = event.target as HTMLElement | null;
    if (!this.cellNavigation() || !table || !target) {
      return;
    }
    const located = locateGridCell(table, target);
    if (!located) {
      return;
    }
    const {cell, position} = located;

    // Focus sur un bouton / champ d'une cellule : il garde ses touches, Échap rend la main à la cellule.
    if (target !== cell) {
      if (event.key === 'Escape') {
        event.preventDefault();
        cell.focus();
      }
      return;
    }

    const rows = gridRows(table);
    const next = nextGridPosition(event.key, event.ctrlKey || event.metaKey, position, rows.length, cell.parentElement
      ? (cell.parentElement as HTMLTableRowElement).cells.length
      : 0);
    if (next) {
      event.preventDefault();
      this.focusGridCell(table, next, cell);
      this.moveRangeWithKeyboard(cell, gridCellAt(table, next), event.shiftKey);
      return;
    }

    // Lignes de données dans l'ordre du DOM : épinglées, tranche virtuelle ou page.
    const row = this.tableRows().filter((item): item is T => isDataItem(item))[position.row];
    if (row === undefined) {
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      const column = this.columnOfCell(cell);
      if (column && this.startEdit(row, column, cell)) {
        return;
      }
      const inner = cell.querySelector<HTMLElement>(FOCUSABLE_IN_CELL);
      if (inner) {
        inner.focus();
      } else if (event.key === 'Enter') {
        this.onRowClick(row);
      }
    } else if (event.key === ' ' && this.rowSelectionEnabled()) {
      event.preventDefault();
      this.toggleRowSelectionFromKeyboard(row);
    } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      this.openRowContextMenuFromKeyboard(cell.parentElement, row);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Taper un caractère sur une cellule éditable ouvre l'éditeur avec ce caractère (comme un tableur).
      const column = this.columnOfCell(cell);
      if (column && this.startEdit(row, column, cell, event.key)) {
        event.preventDefault();
      }
    }
  }

  /** Ctrl+Z défait, Ctrl+Y (ou Ctrl+Maj+Z) rétablit : seulement sur une cellule, pas dans un champ de saisie. */
  protected onEditKeydown(event: KeyboardEvent): void {
    if (!this.hasEditableColumns() || (event.target as HTMLElement | null)?.tagName !== 'TD' || !(event.ctrlKey || event.metaKey)) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.undo();
    } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
      event.preventDefault();
      this.redo();
    }
  }

  /** Position (ligne affichée, colonne visible) d'une cellule du DOM ; `null` hors données (sélection, épinglées...). */
  private rangePositionOf(element: Element | null): CellPosition | null {
    const cell = element?.closest('td');
    const rowAttr = cell?.parentElement?.getAttribute('data-ngt-row');
    const columnId = cell?.getAttribute('data-ngt-col');
    if (!cell || rowAttr === null || rowAttr === undefined || !columnId) {
      return null;
    }
    const col = this.visibleColumnIndexes().get(columnId);
    return col === undefined ? null : {row: Number(rowAttr), col};
  }

  /** Flèches : avec Maj, la plage s'étend jusqu'à la cellule atteinte ; sans Maj, elle se réduit à cette cellule. */
  private moveRangeWithKeyboard(from: HTMLTableCellElement, to: HTMLTableCellElement | null, extend: boolean): void {
    if (!this.rangeSelection()) {
      return;
    }
    const destination = this.rangePositionOf(to);
    if (!destination) {
      return;
    }
    if (extend) {
      this.rangeAnchor.update((anchor) => anchor ?? this.rangePositionOf(from) ?? destination);
      this.rangeFocus.set(destination);
    } else {
      this.rangeAnchor.set(destination);
      this.rangeFocus.set(destination);
    }
  }

  protected onRangeMouseDown(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!this.rangeSelection() || event.button !== 0 || !target) {
      return;
    }
    // Les boutons, champs et cases à cocher des cellules gardent leur comportement.
    if (target.closest('button, a, input, select, textarea, mat-checkbox, [role="button"]')) {
      return;
    }
    const position = this.rangePositionOf(target);
    const cell = target.closest('td');
    if (!position || !cell) {
      return;
    }
    event.preventDefault(); // pas de sélection de texte pendant le glissement
    if (cell.getAttribute('tabindex') === null) {
      cell.tabIndex = -1; // focalisable, pour recevoir Ctrl+C / Ctrl+V / Échap
    }
    cell.focus({preventScroll: true});
    if (event.shiftKey && this.rangeAnchor()) {
      this.rangeFocus.set(position);
    } else {
      this.rangeAnchor.set(position);
      this.rangeFocus.set(position);
    }
    this.rangeDragging = true;
    document.addEventListener('mousemove', this.onRangeMouseMove);
    document.addEventListener('mouseup', this.onRangeMouseUp);
  }

  private readonly onRangeMouseMove = (event: MouseEvent): void => {
    const position = this.rangePositionOf(event.target as Element | null);
    const focus = this.rangeFocus();
    if (this.rangeDragging && position && (!focus || focus.row !== position.row || focus.col !== position.col)) {
      this.rangeFocus.set(position);
    }
  };

  private readonly onRangeMouseUp = (): void => this.detachRangeDragListeners();

  private detachRangeDragListeners(): void {
    this.rangeDragging = false;
    document.removeEventListener('mousemove', this.onRangeMouseMove);
    document.removeEventListener('mouseup', this.onRangeMouseUp);
  }

  /** Ctrl+C copie la plage, Ctrl+A la étend à toute la page, Échap l'efface. */
  protected onRangeKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    // Dans un champ ou un bouton d'une cellule, les raccourcis gardent leur sens habituel.
    if (!this.rangeSelection() || target?.tagName !== 'TD') {
      return;
    }
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (modifier && key === 'c' && this.rangeBounds()) {
      event.preventDefault();
      void this.copySelectedRange();
    } else if (modifier && key === 'a' && this.rangePositionOf(target)) {
      event.preventDefault();
      this.selectAllCells();
    } else if (event.key === 'Escape' && this.rangeBounds()) {
      this.clearRangeSelection();
    }
  }

  protected onRangePaste(event: ClipboardEvent): void {
    if (!this.rangeSelection() || (event.target as HTMLElement | null)?.tagName !== 'TD' || !this.rangeBounds()) {
      return;
    }
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (text !== '') {
      event.preventDefault();
      this.pasteIntoRange(text);
    }
  }

  /** `data-ngt-range` d'une cellule : `in`, plus `top` / `right` / `bottom` / `left` sur le contour de la plage. */
  protected cellRangeAttr(row: T, column: NgTableColumn<T>): string | null {
    const bounds = this.rangeBounds();
    if (!bounds) {
      return null;
    }
    const r = this.renderedRowIndexes().get(row);
    const c = this.visibleColumnIndexes().get(column.id);
    if (r === undefined || c === undefined || !rangeContains(bounds, r, c)) {
      return null;
    }
    const edges = rangeEdges(bounds, r, c);
    return ['in', edges.top && 'top', edges.right && 'right', edges.bottom && 'bottom', edges.left && 'left'].filter(Boolean).join(' ');
  }

  /** `aria-selected` d'une cellule : seulement quand la table est une grille (`[cellNavigation]`). */
  protected cellRangeSelected(row: T, column: NgTableColumn<T>): 'true' | null {
    return this.cellNavigation() && this.cellRangeAttr(row, column) ? 'true' : null;
  }

  /** `data-ngt-row` d'une ligne : son index dans `displayedRows()`, pour retrouver la cellule sous la souris. */
  protected rowRangeIndex(row: T): number | null {
    return this.rangeSelection() ? (this.renderedRowIndexes().get(row) ?? null) : null;
  }

  /** Plage actuellement sélectionnée, ou `null`. */
  getSelectedRange(): NgTableRangeSelection<T> | null {
    const bounds = this.rangeBounds();
    if (!bounds) {
      return null;
    }
    const rows = this.displayedRows().slice(bounds.row1, bounds.row2 + 1);
    const columns = this.visibleColumns().slice(bounds.col1, bounds.col2 + 1);
    const matrix = rows.map((row) =>
      columns.map((column) => {
        const value = toExportCell(column.exportValueAccessor ? column.exportValueAccessor(row) : column.valueAccessor(row));
        return value === null ? '' : String(value);
      }),
    );
    if (this.rangeCopyHeaders()) {
      matrix.unshift(columns.map((column) => column.header));
    }
    return {rows, columns, text: toClipboardText(matrix)};
  }

  /** Copie la plage sélectionnée dans le presse-papiers. `false` s'il n'y en a pas, ou si le navigateur refuse. */
  async copySelectedRange(): Promise<boolean> {
    const selection = this.getSelectedRange();
    if (!selection) {
      return false;
    }
    const copied = await writeClipboardText(selection.text);
    if (copied) {
      this.rangeCopied.emit({text: selection.text, rowCount: selection.rows.length, columnCount: selection.columns.length});
    }
    return copied;
  }

  /** Traite un texte collé comme le ferait Ctrl+V sur la plage : émet `(rangePasted)`. */
  pasteIntoRange(text: string): void {
    const bounds = this.rangeBounds();
    if (!bounds) {
      return;
    }
    const values = parseClipboardText(text);
    const rows = this.displayedRows();
    const columns = this.visibleColumns();
    const assignments = buildPasteAssignments(values, bounds, rows.length, columns.length).map(({row, col, value}) => ({
      row: rows[row],
      column: columns[col],
      value,
    }));
    const applied = this.editOnPaste() ? this.applyPastedValues(assignments) : 0;
    this.rangePasted.emit({assignments, text, values, applied});
  }

  /** Sélectionne toutes les cellules de la page affichée. */
  selectAllCells(): void {
    const rows = this.displayedRows().length;
    const columns = this.visibleColumns().length;
    if (rows > 0 && columns > 0) {
      this.rangeAnchor.set({row: 0, col: 0});
      this.rangeFocus.set({row: rows - 1, col: columns - 1});
    }
  }

  /** Efface la plage sélectionnée. */
  clearRangeSelection(): void {
    this.rangeAnchor.set(null);
    this.rangeFocus.set(null);
  }

  // ------------------------------------------------------------------ édition de cellules

  protected isEditable(row: T, column: NgTableColumn<T>): boolean {
    if (!column.editable || this.pinnedInfo().has(row)) {
      return false;
    }
    return typeof column.editable === 'function' ? column.editable(row) : true;
  }

  protected editorKind(column: NgTableColumn<T>): NgTableEditorKind {
    return editorKindFor(column);
  }

  protected editorOptions(column: NgTableColumn<T>): NgTableFilterOption[] {
    return column.editorOptions ?? column.filter?.options ?? [];
  }

  protected isEditing(row: T, column: NgTableColumn<T>): boolean {
    const editing = this.editing();
    return !!editing && editing.columnId === column.id && Object.is(editing.key, this.rowKey(row));
  }

  /** Case à cocher éditable : toujours affichée, un clic enregistre tout de suite. */
  protected isInlineCheckbox(row: T, column: NgTableColumn<T>): boolean {
    return this.hasEditableColumns() && this.editorKind(column) === 'checkbox' && this.isEditable(row, column);
  }

  private columnOfCell(cell: Element): NgTableColumn<T> | null {
    const id = cell.getAttribute('data-ngt-col');
    return id ? (this.visibleColumns().find((column) => column.id === id) ?? null) : null;
  }

  private findRowByKey(key: unknown): T | undefined {
    return this.dataMode() === 'local' ? this.syncedStore().get(key) : this.displayedRows().find((row) => Object.is(this.rowKey(row), key));
  }

  protected onCellDoubleClick(event: MouseEvent, row: T, column: NgTableColumn<T>): void {
    if (!this.hasEditableColumns() || (event.target as HTMLElement).closest('button, a, input, select, textarea')) {
      return;
    }
    this.startEdit(row, column, (event.currentTarget as HTMLElement) ?? null);
  }

  /**
   * Ouvre l'éditeur de la cellule (ou, pour une case à cocher, bascule sa valeur). `initial`
   * remplace le contenu : le caractère tapé pour démarrer. `false` si la cellule n'est pas éditable.
   */
  protected startEdit(row: T, column: NgTableColumn<T>, cell: HTMLElement | null, initial?: string): boolean {
    if (!this.isEditable(row, column)) {
      return false;
    }
    if (this.editing()) {
      this.finishEdit('none'); // une seule cellule en cours d'édition
    }
    const kind = this.editorKind(column);
    if (kind === 'checkbox') {
      this.commitValue(row, column, !column.valueAccessor(row), 'edit');
      return true;
    }
    const draft = initial !== undefined && kind !== 'select' ? initial : draftFromValue(kind, column.valueAccessor(row));
    this.editing.set({key: this.rowKey(row), columnId: column.id, draft, error: null, cell});
    afterNextRender(
      () => {
        const editor = this.hostElement.nativeElement.querySelector<HTMLInputElement | HTMLSelectElement>('.ngt-editor');
        editor?.focus();
        if (editor instanceof HTMLInputElement && editor.type === 'text') {
          if (initial !== undefined) {
            editor.setSelectionRange(draft.length, draft.length);
          } else {
            editor.select();
          }
        }
      },
      {injector: this.injector},
    );
    return true;
  }

  /** Ouvre l'éditeur d'une cellule par programme. `false` si elle n'est pas éditable. */
  startEditing(row: T, columnId: string): boolean {
    const column = this.columns().find((candidate) => candidate.id === columnId);
    return !!column && this.startEdit(row, column, null);
  }

  /** Ferme l'éditeur : valide la saisie, ou l'abandonne avec `cancel`. */
  stopEditing(cancel = false): void {
    if (cancel) {
      this.cancelEdit();
    } else {
      this.finishEdit('none');
    }
  }

  protected onInlineCheckbox(row: T, column: NgTableColumn<T>, checked: boolean): void {
    this.commitValue(row, column, checked, 'edit');
  }

  protected onEditInput(value: string): void {
    this.editing.update((editing) => (editing ? {...editing, draft: value, error: null} : editing));
  }

  protected onEditSelect(value: string): void {
    this.onEditInput(value);
    this.finishEdit('stay');
  }

  protected onEditorKeydown(event: KeyboardEvent): void {
    event.stopPropagation(); // les touches de l'éditeur ne pilotent pas la grille
    if (event.key === 'Enter') {
      event.preventDefault();
      this.finishEdit('down');
    } else if (event.key === 'Tab') {
      event.preventDefault();
      this.finishEdit(event.shiftKey ? 'left' : 'right');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEdit();
    }
  }

  /** Perte de focus : valide ; une saisie invalide est abandonnée (et signalée par `cellEditRejected`). */
  protected onEditorBlur(): void {
    if (this.editing() && !this.finishEdit('none')) {
      this.cancelEdit(false);
    }
  }

  /**
   * Valide la saisie en cours. `false` si elle est refusée : l'éditeur reste ouvert avec son
   * message d'erreur. Sinon l'édition se ferme et le focus passe à la cellule voisine (`move`).
   */
  private finishEdit(move: 'none' | 'stay' | 'down' | 'right' | 'left'): boolean {
    const editing = this.editing();
    if (!editing) {
      return true;
    }
    const column = this.visibleColumns().find((candidate) => candidate.id === editing.columnId);
    const row = this.findRowByKey(editing.key);
    if (!column || row === undefined) {
      this.editing.set(null);
      return true;
    }
    const labels = this.effectiveLabels();
    const parsed = parseDraft(this.editorKind(column), editing.draft);
    let error: string | null = parsed.ok ? null : parsed.error === 'number' ? labels.editInvalidNumber : labels.editInvalidDate;
    if (parsed.ok) {
      error = column.validate?.(parsed.value, row) ?? null;
    }
    if (error || !parsed.ok) {
      this.editing.set({...editing, error});
      this.cellEditRejected.emit({row, column, value: editing.draft, error: error ?? ''});
      return false;
    }
    this.editing.set(null);
    this.commitValue(row, column, parsed.value, 'edit');
    this.focusAfterEdit(editing.cell, move);
    return true;
  }

  private cancelEdit(refocus = true): void {
    const editing = this.editing();
    this.editing.set(null);
    if (refocus) {
      this.focusAfterEdit(editing?.cell ?? null, 'stay');
    }
  }

  private focusAfterEdit(cell: HTMLElement | null, move: 'none' | 'stay' | 'down' | 'right' | 'left'): void {
    if (!cell || !cell.isConnected || move === 'none') {
      return;
    }
    const table = this.tableElement()?.nativeElement;
    const key = move === 'down' ? 'ArrowDown' : move === 'right' ? 'ArrowRight' : move === 'left' ? 'ArrowLeft' : null;
    const located = key && this.cellNavigation() && table ? locateGridCell(table, cell) : null;
    const columns = (cell.parentElement as HTMLTableRowElement | null)?.cells.length ?? 0;
    const next = located && key && table ? nextGridPosition(key, false, located.position, gridRows(table).length, columns) : null;
    if (next && table) {
      this.focusGridCell(table, next, cell as HTMLTableCellElement);
    } else {
      cell.focus({preventScroll: true});
    }
  }

  /**
   * Applique une valeur à une cellule : validation, `valueSetter`, transaction (mode local),
   * historique et événement. `false` si la valeur ne change rien.
   */
  private commitValue(row: T, column: NgTableColumn<T>, value: unknown, source: 'edit' | 'paste'): boolean {
    const oldValue = column.valueAccessor(row);
    if (sameCellValue(oldValue, value)) {
      return false;
    }
    const newRow = column.valueSetter ? column.valueSetter(row, value) : null;
    if (newRow && this.dataMode() === 'local') {
      this.applyTransaction({update: [newRow]});
      this.history.record([{key: this.rowKey(row), columnId: column.id, previous: row, current: newRow}]);
      this.historyVersion.update((version) => version + 1);
    }
    this.cellEdited.emit({row, newRow, column, oldValue, newValue: value, source});
    this.announce([this.effectiveLabels().announceCellEdited.replace('{column}', column.header)]);
    return true;
  }

  /** Défait la dernière modification (ou le dernier collage). `false` s'il n'y en a pas. */
  undo(): boolean {
    return this.restoreEdits(this.history.undo(), 'undo');
  }

  /** Rétablit la dernière modification défaite. */
  redo(): boolean {
    return this.restoreEdits(this.history.redo(), 'redo');
  }

  private restoreEdits(restore: EditRestore<T> | null, source: 'undo' | 'redo'): boolean {
    if (!restore) {
      return false;
    }
    this.applyTransaction({update: restore.rows});
    this.historyVersion.update((version) => version + 1);
    for (const change of restore.changes) {
      const column = this.columns().find((candidate) => candidate.id === change.columnId);
      if (column) {
        const from = source === 'undo' ? change.current : change.previous;
        const to = source === 'undo' ? change.previous : change.current;
        this.cellEdited.emit({row: from, newRow: to, column, oldValue: column.valueAccessor(from), newValue: column.valueAccessor(to), source});
      }
    }
    const labels = this.effectiveLabels();
    this.announce([source === 'undo' ? labels.announceEditUndone : labels.announceEditRedone]);
    return true;
  }

  /** Écrit les valeurs collées dans les cellules éditables, en un seul lot annulable. Renvoie le nombre de cellules modifiées. */
  private applyPastedValues(assignments: readonly { row: T; column: NgTableColumn<T>; value: string }[]): number {
    if (this.dataMode() !== 'local') {
      return 0;
    }
    const latest = new Map<unknown, T>();
    const changes: EditChange<T>[] = [];
    const events: NgTableCellEditEvent<T>[] = [];
    for (const {row, column, value} of assignments) {
      if (!column.valueSetter || !this.isEditable(row, column)) {
        continue;
      }
      const key = this.rowKey(row);
      const current = latest.get(key) ?? this.findRowByKey(key) ?? row;
      const parsed = parseDraft(this.editorKind(column), value);
      const labels = this.effectiveLabels();
      const error = !parsed.ok ? (parsed.error === 'number' ? labels.editInvalidNumber : labels.editInvalidDate) : (column.validate?.(parsed.value, current) ?? null);
      if (error || !parsed.ok) {
        this.cellEditRejected.emit({row: current, column, value, error: error ?? ''});
        continue;
      }
      const oldValue = column.valueAccessor(current);
      if (sameCellValue(oldValue, parsed.value)) {
        continue;
      }
      const next = column.valueSetter(current, parsed.value);
      latest.set(key, next);
      changes.push({key, columnId: column.id, previous: current, current: next});
      events.push({row: current, newRow: next, column, oldValue, newValue: parsed.value, source: 'paste'});
    }
    if (changes.length > 0) {
      this.applyTransaction({update: [...latest.values()]});
      this.history.record(changes);
      this.historyVersion.update((version) => version + 1);
      events.forEach((event) => this.cellEdited.emit(event));
      this.announce([this.effectiveLabels().announceCellEdited.replace('{column}', events[0].column.header)]);
    }
    return changes.length;
  }

  /** Un clic (ou un focus programmatique) dans une cellule en fait la cellule active. */
  protected onGridFocusIn(event: FocusEvent): void {
    const table = this.tableElement()?.nativeElement;
    if (!this.cellNavigation() || !table || !event.target) {
      return;
    }
    const located = locateGridCell(table, event.target as Element);
    if (located) {
      moveGridTabStop(gridCellAt(table, this.activeGridCell()), located.cell);
      this.activeGridCell.set(located.position);
    }
  }

  private focusGridCell(table: HTMLTableElement, position: GridPosition, from: HTMLTableCellElement): void {
    const target = gridCellAt(table, position);
    if (!target) {
      return;
    }
    moveGridTabStop(from, target);
    this.activeGridCell.set(position);
    target.focus();
  }

  private toggleRowSelectionFromKeyboard(row: T): void {
    const key = this.rowKey(row);
    const selected = new Set(this.selectedKeysSet());
    const checked = !selected.has(key);
    if (checked) {
      selected.add(key);
    } else {
      selected.delete(key);
    }
    this.commitSelection(selected, row, checked);
  }

  protected onRowKeydown(event: KeyboardEvent, row: T): void {
    if (this.cellNavigation()) {
      return; // la grille gère déjà ces touches depuis la cellule active
    }
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

  private openRowContextMenuFromKeyboard(rowElement: HTMLElement | null, row: T): void {
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

  protected isFilterOptionsLoading(columnId: string): boolean {
    return this.lazyFilterLoading()[columnId] ?? false;
  }

  protected onRowContextMenuClosed(): void {
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
        `th.mat-column-${escapeCssToken(candidate.id)}`,
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
  toggleDetail(row: T): void {
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

  protected rowCanExpand(row: T): boolean {
    const guard = this.detailRowCanExpand();
    return guard ? guard(row) : true;
  }

  isRowExpanded(row: T): boolean {
    return this.isDetailExpanded(0, row);
  }

  /**
   * Clés sélectionnées sous forme de `Set`, mémoïsé : `isRowSelected()` est appelé
   * pour chaque ligne à chaque rendu. Avant, le mode contrôlé faisait un
   * `Array.includes` (O(n)) par ligne, et chaque appel à `resolveSelectedKeysSet()`
   * recréait un `Set` complet.
   */
  private readonly selectedKeysSet = computed<ReadonlySet<unknown>>(() => {
    const external = this.selectedRowKeys();
    return external ? new Set(external) : this.internalSelectedKeys();
  });

  isRowSelected(row: T): boolean {
    return this.rowSelectionEnabled() && this.selectedKeysSet().has(this.rowKey(row));
  }

  readonly selectedRowsCount = computed(() => this.selectedKeysSet().size);

  /** Nombre de lignes affichées sélectionnées — base commune de l'état de la case « tout sélectionner ». */
  private readonly selectedDisplayedCount = computed(() => {
    if (!this.rowSelectionEnabled()) {
      return 0;
    }
    const selected = this.selectedKeysSet();
    return this.displayedRows().reduce((count, row) => count + (selected.has(this.rowKey(row)) ? 1 : 0), 0);
  });

  protected readonly areAllDisplayedRowsSelected = computed(() => {
    const total = this.displayedRows().length;
    return this.rowSelectionEnabled() && total > 0 && this.selectedDisplayedCount() === total;
  });

  protected readonly hasPartiallySelectedDisplayedRows = computed(() => {
    const count = this.selectedDisplayedCount();
    return count > 0 && count < this.displayedRows().length;
  });

  protected onToggleRowSelection(event: MatCheckboxChange, row: T): void {
    const checked = !!event.checked;
    const key = this.rowKey(row);
    const selected = new Set(this.selectedKeysSet());
    if (checked) {
      selected.add(key);
    } else {
      selected.delete(key);
    }
    this.commitSelection(selected, row, checked);
  }

  protected onToggleAllDisplayedRows(event: MatCheckboxChange): void {
    const checked = !!event.checked;
    const selected = new Set(this.selectedKeysSet());
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

  protected isColumnVisible(columnId: string): boolean {
    return this.effectiveColumnVisibility()[columnId] ?? true;
  }

  protected onToggleColumnVisibility(columnId: string, checked: boolean): void {
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

  /**
   * Deletes a saved view. If it was the active one, the default view (or else the
   * first remaining view, if any) becomes active. Deleting the default view clears it.
   */
  deleteView(view: NgTableView): void {
    const store = this.effectiveViewsStore();
    const nextViews = store.views.filter((v) => v.id !== view.id);
    const defaultViewId = store.defaultViewId === view.id ? null : (store.defaultViewId ?? null);
    const nextActiveId = store.activeViewId === view.id ? (defaultViewId ?? nextViews[0]?.id ?? null) : store.activeViewId;
    this.commitViewsStore({...store, views: nextViews, activeViewId: nextActiveId, defaultViewId});
  }

  /** Définit la vue appliquée à l'ouverture de la liste ; la rappeler sur la vue par défaut la retire. */
  toggleDefaultView(view: NgTableView): void {
    const store = this.effectiveViewsStore();
    this.commitViewsStore({...store, defaultViewId: store.defaultViewId === view.id ? null : view.id});
  }

  isDefaultView(view: NgTableView): boolean {
    return this.effectiveViewsStore().defaultViewId === view.id;
  }

  /** Tri, filtres non vides, recherche et page courants. */
  getQueryState(): NgTableQueryState {
    const filters: Record<string, string> = {};
    for (const [columnId, value] of Object.entries(this.columnFilters())) {
      if (value.trim()) {
        filters[columnId] = value;
      }
    }
    return {
      sorts: this.sortStates().map((sort) => ({...sort})),
      filters,
      search: this.globalSearchTerm(),
      pageIndex: this.pageIndex(),
      pageSize: this.pageSize(),
      groupBy: this.groupColumn()?.id ?? null,
      collapsedGroups: [...this.collapsedGroups()],
    };
  }

  /**
   * Applique tout ou partie d'un état « requête » (lien partagé, bouton « réinitialiser »,
   * état venu d'un store...). Les parties absentes ne changent pas. `filters`, s'il est
   * fourni, remplace tous les filtres ; les colonnes inconnues sont ignorées. Sans
   * `pageIndex`, un changement de tri/filtre/recherche revient en page 0, comme un clic.
   * En mode `remote`, une seule `remoteQueryChange` est émise.
   */
  applyQueryState(state: Partial<NgTableQueryState>): void {
    const previousPrimary = this.sortState();
    if (state.sorts) {
      const sorts = state.sorts.filter((sort) => sort.columnId && sort.direction).map((sort) => ({...sort}));
      this.sortStates.set(this.multiSort() ? sorts : sorts.slice(0, 1));
      const primary = this.sortState();
      if (primary.columnId !== previousPrimary.columnId || primary.direction !== previousPrimary.direction) {
        this.sortChange.emit(primary);
      }
      this.sortsChange.emit(this.sortStates());
    }
    if (state.filters) {
      for (const column of this.columns()) {
        this.bumpFilterEpoch(column.id);
      }
      const cleared = Object.fromEntries(Object.keys(this.columnFilters()).map((id) => [id, '']));
      this.columnFilters.set(this.withDefaultFilterKeys({...cleared, ...state.filters}));
      this.filtersChange.emit(this.columnFilters());
    }
    if (state.search !== undefined) {
      this.bumpFilterEpoch(GLOBAL_SEARCH_KEY);
      this.globalSearchDraft.set(state.search);
      if (state.search !== this.globalSearchTerm()) {
        this.globalSearchTerm.set(state.search);
        this.globalSearchChange.emit(state.search);
      }
    }
    if (state.groupBy !== undefined) {
      // Mémorisé avant l'effet de changement de colonne, pour qu'il ne relance ni ne vide rien.
      this.lastGroupBy = state.groupBy;
      this.groupBy.set(state.groupBy);
      this.collapsedGroups.set(new Set());
    }
    if (state.collapsedGroups) {
      this.collapsedGroups.set(new Set(state.collapsedGroups));
    }
    if (state.pageSize !== undefined) {
      this.pageSize.set(state.pageSize);
    }
    const queryChanged = !!state.sorts || !!state.filters || state.search !== undefined || state.groupBy !== undefined;
    if (state.pageIndex !== undefined) {
      this.pageIndex.set(state.pageIndex);
    } else if (queryChanged && this.pagingActive()) {
      this.pageIndex.set(0);
    }
    if (this.dataMode() === 'remote') {
      this.emitRemoteQuery(this.buildRemoteQuery(this.pageIndex(), this.pageSize()));
    }
  }

  /**
   * Mode live : ajoute, met à jour ou retire des lignes sans renvoyer tout le tableau.
   * Les lignes sont retrouvées par leur clé (`rowKeyAccessor`, sinon `id`) ; seules les
   * lignes touchées sont refiltrées et replacées dans le tri. Mode local uniquement.
   *
   * Les transactions s'ajoutent à `[rows]` : un nouveau tableau `[rows]` redevient la
   * référence (ligne à ligne : ce qui n'y figure pas est retiré).
   */
  applyTransaction(transaction: NgTableRowTransaction<T>): NgTableTransactionResult<T> {
    const result = this.applyToStore(transaction);
    this.dataVersion.update((version) => version + 1);
    return result;
  }

  /**
   * Comme `applyTransaction`, mais regroupée avec les autres transactions reçues pendant
   * `[asyncTransactionWaitMillis]` : un seul recalcul et un seul rendu pour tout le lot.
   * C'est la méthode à utiliser pour des mises à jour à haute fréquence (flux temps réel).
   */
  applyTransactionAsync(transaction: NgTableRowTransaction<T>, callback?: (result: NgTableTransactionResult<T>) => void): void {
    this.asyncQueue.push({transaction, callback});
    if (this.asyncTimer === null) {
      this.asyncTimer = setTimeout(() => this.flushAsyncTransactions(), this.asyncTransactionWaitMillis());
    }
  }

  /** Applique tout de suite les transactions asynchrones en attente. */
  flushAsyncTransactions(): void {
    if (this.asyncTimer !== null) {
      clearTimeout(this.asyncTimer);
      this.asyncTimer = null;
    }
    const queue = this.asyncQueue;
    this.asyncQueue = [];
    if (queue.length === 0) {
      return;
    }
    const results = queue.map(({transaction, callback}) => {
      const result = this.applyToStore(transaction);
      callback?.(result);
      return result;
    });
    this.dataVersion.update((version) => version + 1);
    this.asyncTransactionsFlushed.emit(results);
  }

  private asyncQueue: { transaction: NgTableRowTransaction<T>; callback?: (result: NgTableTransactionResult<T>) => void }[] = [];
  private asyncTimer: ReturnType<typeof setTimeout> | null = null;

  private applyToStore(transaction: NgTableRowTransaction<T>): NgTableTransactionResult<T> {
    if (this.dataMode() !== 'local') {
      return {add: [], update: [], remove: []}; // en remote, le serveur est la source
    }
    const store = this.syncedStore(); // le dernier `[rows]` d'abord
    const {result, updates} = store.applyTransaction(transaction);
    this.recordFlashes(updates);
    return result;
  }

  private lastFlashPrune = 0;

  /** Cellules modifiées récemment, par clé de ligne puis id de colonne. */
  private readonly flashes = new Map<unknown, Map<string, { direction: 'up' | 'down' | 'change'; at: number; parity: number }>>();

  /** Relève les cellules dont la valeur a changé, pour les colonnes en surbrillance. */
  private recordFlashes(updates: readonly RowUpdate<T>[]): void {
    if (updates.length === 0) {
      return;
    }
    const columns = untracked(() => this.columns()).filter((column) => column.flashOnChange ?? untracked(() => this.flashCells()));
    if (columns.length === 0) {
      return;
    }
    const now = performance.now();
    for (const {key, previous, current} of updates) {
      for (const column of columns) {
        const before = column.valueAccessor(previous);
        const after = column.valueAccessor(current);
        if (Object.is(before, after) || (before instanceof Date && after instanceof Date && before.getTime() === after.getTime())) {
          continue;
        }
        let cells = this.flashes.get(key);
        if (!cells) {
          cells = new Map();
          this.flashes.set(key, cells);
        }
        const direction = typeof before === 'number' && typeof after === 'number' ? (after > before ? 'up' : 'down') : 'change';
        cells.set(column.id, {direction, at: now, parity: 1 - (cells.get(column.id)?.parity ?? 1)});
      }
    }
    // Ménage des surbrillances terminées : au plus une fois par durée de surbrillance,
    // pas à chaque lot (à haute fréquence, la table en compte vite des milliers).
    const duration = untracked(() => this.flashDurationMs());
    if (this.flashes.size > 2048 && now - this.lastFlashPrune > duration) {
      this.lastFlashPrune = now;
      const expired = now - duration;
      for (const [key, cells] of this.flashes) {
        for (const [columnId, flash] of cells) {
          if (flash.at < expired) {
            cells.delete(columnId);
          }
        }
        if (cells.size === 0) {
          this.flashes.delete(key);
        }
      }
    }
  }

  /**
   * Surbrillance d'une cellule à l'instant `now` (attribut `data-ngt-flash` : `up-0`,
   * `down-1`...). Deux valeurs en alternance (`-0` / `-1`) : un nouveau changement
   * redémarre l'animation CSS sur la même cellule. Un attribut plutôt qu'une classe :
   * une directive `NgClass` par cellule ralentissait nettement le rendu des pages.
   */
  private flashClassFn(now: number): (row: T, column: NgTableColumn<T>) => string {
    const limit = now - this.flashDurationMs();
    return (row, column) => {
      const flash = this.flashes.get(this.rowKey(row))?.get(column.id);
      return flash && flash.at >= limit ? `${flash.direction}-${flash.parity}` : '';
    };
  }

  /** Toutes les vues, au format JSON versionné (même format que le `localStorage`). */
  exportViews(): string {
    return serializeViewsStore(this.effectiveViewsStore());
  }

  /**
   * Importe des vues exportées par `exportViews()` (ou le bouton « Exporter »).
   * `merge` (défaut) : ajoute les vues, en remplaçant celles de même nom ; la vue
   * affichée ne change pas. `replace` : remplace toutes les vues et applique la vue
   * active du fichier. Les vues malformées sont ignorées ; un fichier invalide ne
   * modifie rien. Renvoie le nombre de vues importées.
   */
  importViews(json: string, mode: 'merge' | 'replace' = 'merge'): number {
    const imported = parseViewsStore(json);
    const count = imported.views.length;
    if (count > 0) {
      if (mode === 'replace') {
        this.commitViewsStore(imported);
        this.applyActiveView(imported);
      } else {
        this.commitViewsStore(mergeViewsStores(this.effectiveViewsStore(), imported));
      }
    }
    this.viewsImportFeedback.set(
      count > 0 ? this.effectiveLabels().viewsImported.replace('{count}', `${count}`) : this.effectiveLabels().viewsImportInvalid,
    );
    this.viewsImported.emit({imported: count, mode});
    return count;
  }

  /** Bouton « Exporter » du menu des vues : télécharge un fichier `.json`. */
  downloadViews(): void {
    const name = this.viewsStorageKey() ?? 'ng-table';
    downloadFile(this.exportViews(), `${name}-vues.json`, 'application/json');
  }

  /** Fichier choisi via le bouton « Importer » du menu des vues (fusion). */
  protected async onViewsFileSelected(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = ''; // permet de réimporter le même fichier
    if (!file) {
      return;
    }
    this.importViews(await file.text(), 'merge');
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
        ...this.buildRemoteQuery(this.pageIndex(), this.pageSize()),
        columns: this.exportColumns().map((column) => ({id: column.id, header: column.header})),
        format: this.exportFormat(),
        filename: this.exportFilename(),
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

  /** Déplie ou replie un groupe (clic ou Entrée / Espace sur son en-tête). */
  protected toggleGroup(group: RowGroup<T>): void {
    if (!this.groupsCollapsible()) {
      return;
    }
    const next = new Set(this.collapsedGroups());
    if (!next.delete(group.key)) {
      next.add(group.key);
    }
    this.setCollapsedGroups(next);
  }

  /** Replie tous les groupes (regroupement actif). */
  collapseAllGroups(): void {
    const keys = this.dataMode() === 'remote'
      ? (this.groupSummaries() ?? []).map((summary) => summary.key)
      : (this.groups() ?? []).map((group) => group.key);
    this.setCollapsedGroups(new Set(keys));
  }

  /** Déplie tous les groupes. */
  expandAllGroups(): void {
    this.setCollapsedGroups(new Set());
  }

  /**
   * En remote, replier / déplier change les lignes à charger : nouvelle requête, même page,
   * ramenée à la nouvelle dernière page si le repli l'a fait disparaître (le nouveau total
   * se déduit des comptes de `[groupSummaries]`).
   */
  private setCollapsedGroups(keys: ReadonlySet<string>): void {
    this.collapsedGroups.set(keys);
    if (this.dataMode() !== 'remote' || !this.groupsCollapsible()) {
      return;
    }
    const size = this.pageSize();
    if (this.pagingActive() && size > 0) {
      const expandedRows = (this.groupSummaries() ?? []).reduce(
        (total, summary) => total + (keys.has(summary.key) ? 0 : (summary.count ?? 0)),
        0,
      );
      const lastPage = Math.max(0, Math.ceil(expandedRows / size) - 1);
      if (this.pageIndex() > lastPage) {
        this.pageIndex.set(lastPage);
      }
    }
    this.emitRemoteQuery(this.buildRemoteQuery(this.pageIndex(), size));
  }

  /** Libellé de la valeur d'un groupe : libellé d'option du filtre s'il existe, sinon la valeur. */
  protected groupValueLabel(group: RowGroup<T>): string {
    if (group.key === '') {
      return this.effectiveLabels().groupEmpty;
    }
    const column = this.groupColumn();
    const options = column?.filter ? this.resolvedFilterOptions(column.id, column.filter) : [];
    return options.find((option) => option.value === group.key)?.label ?? group.key;
  }

  /** Nombre de lignes du groupe ; `''` en remote sans résumé serveur (un compte de page tromperait). */
  protected groupCountLabel(group: RowGroup<T>): string {
    const count = this.dataMode() === 'remote' ? this.summariesByKey().get(group.key)?.count : group.rows.length;
    return count === undefined ? '' : this.effectiveLabels().groupCount.replace('{count}', `${count}`);
  }

  protected groupAggregate(group: RowGroup<T>, columnId: string): string {
    return this.groupAggregates().get(group.key)?.[columnId] ?? '';
  }

  private aggregateTexts(columns: NgTableColumn<T>[], rows: readonly T[]): Record<string, string> {
    return this.formatAggregates(columns, Object.fromEntries(columns.map((column) => [column.id, computeAggregate(column, rows)])));
  }

  /** Texte affiché d'agrégats (calculés ici ou fournis par le serveur) : préfixe du type + nombre formaté. */
  private formatAggregates(columns: NgTableColumn<T>[], values: Record<string, unknown>): Record<string, string> {
    const labels = this.effectiveLabels();
    const prefixes = {sum: labels.aggregateSum, avg: labels.aggregateAvg, min: labels.aggregateMin, max: labels.aggregateMax, count: labels.aggregateCount};
    const texts: Record<string, string> = {};
    for (const column of columns) {
      const value = values[column.id];
      if (value === null || value === undefined) {
        continue;
      }
      const formatted = typeof value === 'number' ? this.numberFormat.format(value) : `${value}`;
      const prefix = typeof column.aggregate === 'string' ? prefixes[column.aggregate] : '';
      texts[column.id] = prefix ? `${prefix} ${formatted}` : formatted;
    }
    return texts;
  }

  /** Page courante d'une liste (lignes ou unités de regroupement), si la pagination est active. */
  private currentPage<U>(items: U[]): U[] {
    const size = this.pageSize();
    if (!this.pagingActive() || !size || size <= 0) {
      return items;
    }
    const start = this.pageIndex() * size;
    return items.slice(start, start + size);
  }

  /** Paginateur intégré : change de page ; en mode `remote`, relance la requête serveur. */
  protected onPage(event: PageEvent): void {
    this.pageSize.set(event.pageSize);
    this.pageIndex.set(event.pageIndex);
    if (this.dataMode() === 'remote') {
      this.emitRemoteQuery(this.buildRemoteQuery(event.pageIndex, event.pageSize));
    }
  }

  /** Confirms the page-range dialog and triggers the local CSV export. */
  protected confirmExportDialog(): void {
    const total = this.exportTotalPages();
    const from = Math.min(Math.max(1, Math.round(this.exportFromPage()) || 1), total);
    const to = Math.min(Math.max(from, Math.round(this.exportToPage()) || from), total);
    this.exportLocalRange(from, to);
  }

  private exportLocalRange(fromPage: number, toPage: number): void {
    const allRows = this.filteredSortedRows();
    const size = this.pagingActive() && this.pageSize() > 0 ? this.pageSize() : allRows.length || 1;
    const rows = this.pagingActive() ? allRows.slice((fromPage - 1) * size, toPage * size) : allRows;

    const matrix = this.buildExportMatrix(rows);
    const filename = this.exportFilename();
    if (this.exportFormat() === 'xlsx') {
      downloadFile(toXlsx(matrix) as BlobPart, `${filename}.xlsx`, XLSX_MIME);
    } else {
      // BOM UTF-8 : sans lui, Excel interprète le CSV en Latin-1 et corrompt les accents.
      downloadFile('﻿' + toCsv(matrix), `${filename}.csv`, 'text/csv;charset=utf-8;');
    }
    this.localExportCompleted.emit({fromPage, toPage, rowCount: rows.length});
  }

  /** Colonnes exportées (local et remote) : visibles, dans l'ordre affiché, hors `exportable: false`. */
  private readonly exportColumns = computed(() => this.visibleColumns().filter((column) => column.exportable !== false));

  /** En-têtes puis une ligne par enregistrement ; valeurs typées (le CSV les convertit en texte). */
  private buildExportMatrix(rows: readonly T[]): ExportCell[][] {
    const exportColumns = this.exportColumns();
    const matrix: ExportCell[][] = [exportColumns.map((column) => column.header)];
    for (const row of rows) {
      matrix.push(
        exportColumns.map((column) =>
          toExportCell(column.exportValueAccessor ? column.exportValueAccessor(row) : column.valueAccessor(row)),
        ),
      );
    }
    return matrix;
  }

  /** Reorders columns after a header drag-and-drop. Disabled on mobile (columns are already collapsed there). */
  protected onColumnDragStart(event: DragEvent, column: NgTableColumn<T>): void {
    if (this.isMobileView()) {
      return;
    }
    this.draggingColumnId.set(column.id);
    event.dataTransfer?.setData('text/plain', column.id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  protected onColumnDragOver(event: DragEvent, column: NgTableColumn<T>): void {
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

  protected onColumnDragLeave(column: NgTableColumn<T>): void {
    if (this.dragOverColumnId() === column.id) {
      this.dragOverColumnId.set(null);
    }
  }

  protected onColumnDrop(event: DragEvent, column: NgTableColumn<T>): void {
    event.preventDefault();
    const sourceId = this.draggingColumnId();
    this.draggingColumnId.set(null);
    this.dragOverColumnId.set(null);
    if (!sourceId) {
      return;
    }
    this.moveColumnNextTo(sourceId, column.id);
  }

  protected onColumnDragEnd(): void {
    this.draggingColumnId.set(null);
    this.dragOverColumnId.set(null);
  }

  /**
   * Keyboard-operable alternative to the drag-and-drop reorder: ArrowLeft/ArrowRight
   * while the drag handle is focused move the column one step in that direction.
   * Native HTML5 drag-and-drop (used for the mouse path) has no keyboard equivalent
   * at all, so this is required for WCAG 2.1.1 (Keyboard) — not just a nicety.
   */
  protected onColumnHandleKeydown(event: KeyboardEvent, column: NgTableColumn<T>): void {
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

  protected shouldRenderInlineFilter(column: NgTableColumn<T>): boolean {
    if (!this.inlineFilters() || !column.filter) {
      return false;
    }
    const allowedColumns = this.inlineFilterColumnIds();
    if (!allowedColumns || allowedColumns.length === 0) {
      return true;
    }
    return allowedColumns.includes(column.id);
  }

  protected rowClasses(row: T): NgTableRowClasses {
    return this.rowViews().get(row)?.classes ?? this.rowClassFn()?.(row) ?? '';
  }

  protected copyTooltip(column: NgTableColumn<T>): string {
    if (typeof column.copy === 'object' && column.copy.tooltip) {
      return column.copy.tooltip;
    }
    return this.effectiveLabels().copy;
  }

  protected copyIconName(column: NgTableColumn<T>, row: T, rowIndex: number): string {
    const key = this.copyCellKey(column, row, rowIndex);
    return this.copiedCellKey() === key ? 'check' : 'content_copy';
  }

  protected onCopyCellValue(event: MouseEvent, column: NgTableColumn<T>, row: T, rowIndex: number): void {
    event.stopPropagation();
    const value = copyText(column, row);
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

  protected closeFilterMenuOnEnter(event: Event, trigger: MatMenuTrigger): void {
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

  protected onTableWrapScroll(event: Event): void {
    this.requestFilterPositionUpdate();
    if (this.columnVirtualization()) {
      this.scrollLeft.set((event.target as HTMLElement).scrollLeft);
    }
    if (this.virtualActive()) {
      this.scrollTop.set((event.target as HTMLElement).scrollTop);
    }
  }

  private stopScrollTracking(): void {
    this.scrollListener?.();
    this.scrollListener = null;
  }

  /** Message d'erreur à afficher pour les options de filtre de cette colonne (vide = pas d'erreur). */
  protected filterOptionsError(columnId: string): string {
    const labels = this.effectiveLabels();
    if (this.lazyFilterLoadError()[columnId]) {
      return labels.refOptionsLoadError;
    }
    if (this.lazyFilterEmptyError()[columnId]) {
      return labels.refOptionsEmpty;
    }
    return '';
  }

  protected resolvedFilterOptions(columnId: string, filter: NgTableFilterConfig): NgTableFilterOption[] {
    const lazyOptions = this.lazyFilterOptions()[columnId];
    if (lazyOptions) {
      return lazyOptions;
    }
    return filter.options ?? [];
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    this.isMobileView.set(window.innerWidth <= 760);
    this.requestFilterPositionUpdate();
  }

  protected trackByColumn = (_: number, column: NgTableColumn<T>): string => column.id;

  protected trackByRow = (index: number, row: T): unknown => {
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
    return defaultRowKey(row);
  };

  protected resolvedTrackBy: TrackByFunction<TableItem<T>> = (index: number, row: TableItem<T>): unknown => {
    if (row instanceof NgTableGroupRow) {
      return `__group__${row.group.key}`;
    }
    if (row instanceof NgTableSpacerRow) {
      return `__spacer__${row.position}`;
    }
    if (row instanceof NgTableLoadingRow) {
      return `__loading__${row.index}`;
    }
    const pin = this.pinnedInfo().get(row);
    if (pin) {
      return `__pinned_${pin.side}__${pin.index}`; // clé propre : une ligne épinglée peut ressembler à une ligne du corps
    }
    return this.trackByRow(index, row);
  };

  protected mobileActionsRowWhen = (_: number, row: TableItem<T>): boolean =>
    isDataItem(row) && this.mobileActionRowColumns().length > 0;

  protected groupRowWhen = (_: number, row: TableItem<T>): boolean => row instanceof NgTableGroupRow;

  protected spacerRowWhen = (_: number, row: TableItem<T>): boolean => row instanceof NgTableSpacerRow;

  protected readonly spacerColumns = ['__spacer__'];

  protected loadingRowWhen = (_: number, row: TableItem<T>): boolean => row instanceof NgTableLoadingRow;

  protected readonly loadingColumns = ['__loading__'];

  protected readonly columnSpacerSides = ['left', 'right'] as const;

  /** Ligne d'attente d'un bloc en échec plutôt qu'en chargement. */
  protected isFailedLoadingRow(row: NgTableLoadingRow): boolean {
    this.blockVersion();
    return this.blockCache.blockState(Math.floor(row.index / this.blockCache.blockSize)) === 'failed';
  }

  /** Hauteur des lignes d'attente : celle, mesurée, des lignes de données. */
  protected loadingRowHeight(): number {
    return this.rowHeight();
  }

  protected dataRowWhen = (_: number, row: TableItem<T>): boolean => isDataItem(row);

  /**
   * The detail row is ALWAYS rendered when a template is provided.
   * Material only re-evaluates `when:` predicates on data re-render, so
   * expansion state must NOT be part of the predicate. Visibility is
   * driven by `isDetailExpanded()` bindings instead, which are re-evaluated
   * on every change detection cycle.
   */
  protected detailRowRenderWhen = (_index: number, row: TableItem<T>): boolean =>
    !!this.detailRowTemplate() && isDataItem(row) && !this.pinnedInfo().has(row);

  protected isDetailExpanded(index: number, row: T): boolean {
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
  protected resolvedEmptyLabel(): string {
    return this.emptyLabel() ?? this.effectiveLabels().noData;
  }

  protected mobileActionsCellContext(row: T): {
    $implicit: T;
    row: T;
    value: unknown;
    column: NgTableColumn<T>
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

  /** Attribut `data-mobile-row-key` de la ligne d'actions mobile. */
  protected mobileRowKey(row: T): string {
    const key = defaultRowKey(row);
    return key === row ? '' : `${key}`;
  }

  protected mobileActionsColspan(): number {
    return Math.max(1, this.displayedColumnIds().length || 1);
  }

  protected detailRowColspan(): number {
    return Math.max(1, this.displayedColumnIds().length || 1);
  }

  /**
   * Saisie libre (clavier) = debouncée ; choix discret (select, booléen, date
   * choisie au calendrier) = appliqué tout de suite. Avant, seul `text` était
   * debouncé : un filtre `number` ou `search` refiltrait à chaque touche.
   */
  private isFreeTypedFilter(columnId: string): boolean {
    const column = this.columns().find((c) => c.id === columnId);
    const type = column?.filter?.type ?? 'text';
    return !DISCRETE_FILTER_TYPES.has(type);
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
  private onQueryStateChanged(sortMessage = ''): void {
    if (this.dataMode() === 'remote') {
      // Nombre de lignes inconnu tant que le serveur n'a pas répondu : on n'annonce que le tri.
      this.announce([sortMessage]);
      // Paginateur intégré : il doit refléter la page 0 demandée au serveur. Sans lui,
      // la page reste l'affaire du parent (comportement historique, aucun événement).
      if (this.paginator() && this.pageIndex() !== 0) {
        this.pageIndex.set(0);
      }
      this.emitRemoteQuery(this.buildRemoteQuery(0, this.pageSize()));
      return;
    }
    const count = this.filteredSortedRows().length;
    const labels = this.effectiveLabels();
    this.announce([sortMessage, count === 0 ? labels.announceNoRows : labels.announceRowCount.replace('{count}', `${count}`)]);
    if (this.pagingActive() && this.pageIndex() !== 0) {
      this.pageIndex.set(0); // émet (pageIndexChange)
    }
  }

  /**
   * Met à jour la région `aria-live` (WCAG 4.1.3) : sans elle, un utilisateur de
   * lecteur d'écran qui trie ou filtre ne sait pas que la liste a changé.
   */
  private announce(parts: string[]): void {
    const text = parts.filter(Boolean).join('. ');
    if (!text) {
      return;
    }
    // Un texte identique ne modifie pas le DOM, donc n'est pas relu : on alterne un espace insécable.
    this.liveAnnouncement.update((previous) => (previous === text ? text + NBSP : text));
  }

  /**
   * La requête serveur a changé (tri, filtres, recherche, page...). En modèle par blocs,
   * le cache repart de zéro et les blocs visibles sont redemandés ; sinon, le parent est
   * prévenu par `(remoteQueryChange)`.
   */
  private emitRemoteQuery(query: NgTableRemoteQuery): void {
    if (this.blockMode()) {
      this.resetBlocks(false);
      return;
    }
    this.remoteQueryChange.emit(query);
  }

  /**
   * Modèle par blocs : oublie les blocs chargés et redemande ceux affichés (par exemple
   * après une modification des données côté serveur). Garde la position de défilement.
   */
  refreshRemoteDatasource(): void {
    this.resetBlocks(true);
  }

  /** Nombre total de lignes côté serveur en modèle par blocs (`null` avant la première réponse). */
  remoteRowCount(): number | null {
    this.blockVersion();
    return this.blockCache.totalCount;
  }

  private resetBlocks(keepPosition: boolean): void {
    this.blockCache.purge(keepPosition);
    this.blocksInFlight = 0;
    if (!keepPosition) {
      const wrap = this.tableWrapElement()?.nativeElement;
      if (wrap) {
        wrap.scrollTop = 0;
      }
      this.scrollTop.set(0);
    }
    this.blockVersion.update((version) => version + 1);
  }

  /** Demande les blocs manquants de la zone rendue, sans dépasser le nombre de requêtes simultanées. */
  private loadVisibleBlocks(range: VirtualRange): void {
    const datasource = this.remoteDatasource();
    if (!datasource) {
      return;
    }
    const size = this.blockCache.blockSize;
    for (const blockIndex of this.blockCache.missingBlocks(range.start, range.end)) {
      if (this.blocksInFlight >= Math.max(1, this.maxConcurrentBlockRequests())) {
        return; // la suite partira quand une réponse libérera une place
      }
      const generation = this.blockCache.generation;
      const request: NgTableBlockRequest = {
        ...this.buildRemoteQuery(blockIndex, size),
        page: {index: blockIndex, size},
        groupBy: null,
        collapsedGroups: [],
        startRow: blockIndex * size,
        endRow: (blockIndex + 1) * size,
      };
      this.blockCache.markLoading(blockIndex);
      this.blocksInFlight++;
      const result = datasource.getRows(request);
      const promise = result instanceof Promise ? result : firstValueFrom(result);
      promise.then(
        (response) => this.onBlockSettled(generation, () => this.blockCache.resolve(generation, blockIndex, response.rows, response.totalCount)),
        (error: unknown) =>
          this.onBlockSettled(generation, () => {
            this.blockCache.reject(generation, blockIndex);
            this.remoteBlockError.emit({request, error});
            return true;
          }),
      );
    }
  }

  private onBlockSettled(generation: number, apply: () => boolean): void {
    if (generation !== this.blockCache.generation) {
      return; // réponse d'une requête périmée (tri, filtres... ont changé entre-temps)
    }
    this.blocksInFlight = Math.max(0, this.blocksInFlight - 1);
    if (apply()) {
      this.blockVersion.update((version) => version + 1);
    }
  }

  /** `page.size` vaut `0` quand la pagination n'est pas suivie (= tout). */
  private buildRemoteQuery(pageIndex: number, pageSize: number): NgTableRemoteQuery {
    return {
      sort: this.sortState(),
      sorts: this.sortStates(),
      filters: this.columnFilters(),
      page: {index: pageIndex, size: this.pagingActive() ? pageSize : 0},
      search: this.globalSearchTerm(),
      groupBy: this.groupColumn()?.id ?? null,
      collapsedGroups: this.groupColumn() && this.groupsCollapsible() ? [...this.collapsedGroups()] : [],
    };
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

  /**
   * À l'ouverture : la vue par défaut si elle est définie, sinon la dernière vue active.
   * Si la vue par défaut n'était pas la vue active, le store est mis à jour (et donc
   * persisté / remonté au parent) pour que le menu reflète la vue réellement affichée.
   */
  private applyInitialView(store: NgTableViewsStore): void {
    const defaultId = store.defaultViewId;
    if (defaultId && defaultId !== store.activeViewId && store.views.some((v) => v.id === defaultId)) {
      const next = {...store, activeViewId: defaultId};
      this.commitViewsStore(next);
      this.applyActiveView(next);
      return;
    }
    this.applyActiveView(store);
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
    this.referenceColumn.set(state.referenceColumnId);
    this.groupBy.set(state.groupBy ?? null);
    const savedSorts = state.sorts?.length ? state.sorts : [state.sort];
    this.sortStates.set(savedSorts.filter((sort) => sort.columnId && sort.direction).map((sort) => ({...sort})));
    this.columnFilters.set({...state.filters});
    // Vue enregistrée avant l'ajout des largeurs : on laisse celles en cours
    // plutôt que de tout réinitialiser à l'activation.
    if (state.columnWidths) {
      this.columnWidths.set({...state.columnWidths});
    }
    this.filtersChange.emit(this.columnFilters());

    const search = state.search ?? '';
    this.bumpFilterEpoch(GLOBAL_SEARCH_KEY);
    this.globalSearchDraft.set(search);
    if (search !== this.globalSearchTerm()) {
      this.globalSearchTerm.set(search);
      this.globalSearchChange.emit(search);
    }

    // `onQueryStateChanged()` remettrait la page à 0 (comportement normal pour un
    // simple changement de filtre) — mais ici la vue a potentiellement sa PROPRE
    // page à restaurer. L'appeler quand même, puis corriger juste après avec
    // `viewPaginationRestore`, marchait "par chance" en mode local (le dernier
    // événement gagne) mais PAS en mode remote : `remoteQueryChange` partait avec
    // `page.index: 0` et rien ne le rattrapait ensuite, donc la taille/page
    // sauvegardées de la vue n'atteignaient jamais le serveur.
    const hasSavedPagination = state.pageIndex !== undefined && state.pageSize !== undefined;
    if (!hasSavedPagination) {
      this.onQueryStateChanged();
    } else if (this.dataMode() === 'remote') {
      this.emitRemoteQuery({
        ...this.buildRemoteQuery(state.pageIndex!, state.pageSize!),
        page: {index: state.pageIndex!, size: state.pageSize!},
      });
    }

    if (hasSavedPagination) {
      // Appliquée directement (mode non contrôlé, paginateur intégré) ET signalée,
      // pour un parent qui tient la pagination dans ses propres signaux.
      this.pageSize.set(state.pageSize!);
      this.pageIndex.set(state.pageIndex!);
      this.viewPaginationRestore.emit({pageIndex: state.pageIndex!, pageSize: state.pageSize!});
    }
    this.viewActivated.emit(view);
  }

  /** Central write path: updates in-memory state, persists to localStorage in uncontrolled mode, and always reports out. */
  private commitViewsStore(next: NgTableViewsStore): void {
    this.internalViewsStore.set(next);
    const key = this.viewsStorageKey();
    if (key && !this.viewsStore()) {
      saveViewsStore(key, next);
    }
    this.viewsStoreChange.emit(next);
  }

  private commitSelection(next: Set<unknown>, row: T | null, selected: boolean): void {
    const external = this.selectedRowKeys();
    if (!external) {
      this.internalSelectedKeys.set(next);
    }

    const source = this.dataMode() === 'local' ? this.sourceRows() : this.blockMode() ? this.displayedRows() : this.rows();
    const selectedRows = source.filter((item) => next.has(this.rowKey(item)));
    this.selectionChange.emit({
      row,
      selected,
      selectedKeys: [...next],
      selectedRows,
    });
  }

  private rowKey(row: T): unknown {
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
    return defaultRowKey(row);
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
    const minWidth = column.minWidthPx ?? DEFAULT_MIN_COLUMN_WIDTH_PX;
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
  private formatFilterValueForDisplay(column: NgTableColumn<T>, rawValue: string): string {
    const filter = column.filter;
    if (!filter) {
      return rawValue;
    }

    if ((filter.type === 'range' || filter.type === 'numberRange') && rawValue.includes('..')) {
      return formatRangeValue(rawValue);
    }

    // Même libellé que dans la liste du filtre, et non la valeur technique « true ».
    if (filter.type === 'boolean' && !filter.options?.length) {
      const labels = this.effectiveLabels();
      if (rawValue === 'true') {
        return labels.yes;
      }
      if (rawValue === 'false') {
        return labels.no;
      }
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

  private copyCellKey(column: NgTableColumn<T>, row: T, rowIndex: number): string {
    const key = defaultRowKey(row);
    // Pas d'id : l'index (la ligne elle-même donnerait "[object Object]" pour toutes).
    const rowId = key === row ? rowIndex : key;
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

}
