import {CommonModule} from '@angular/common';
import {
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
import {matchesAllFilters, searchText, SortLevel, sortRows} from './row-pipeline';
import {buildConsecutiveGroups, buildGroups, computeAggregate, groupedUnits, NgTableGroupRow, RowGroup, withGroupHeaders} from './row-grouping';
import {computeVirtualRange, NgTableSpacerRow, VirtualRange} from './virtual-window';

/** Élément de la source de données de la table : une ligne, un en-tête de groupe ou un espacement. */
type TableItem<T> = T | NgTableGroupRow<T> | NgTableSpacerRow;
import {escapeCssToken, measureNaturalWidth} from './dom-utils';
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
  return !(item instanceof NgTableGroupRow) && !(item instanceof NgTableSpacerRow);
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
 * les lignes du groupe (la table n'en a qu'une page). Clé = valeur de la colonne de
 * regroupement en texte (jour `YYYY-MM-DD` pour une date, `''` pour une valeur vide).
 */
export interface NgTableGroupSummary {
  /** Nombre de lignes du groupe. */
  count?: number;
  /** Agrégats par id de colonne (nombre formaté par la table, ou texte affiché tel quel). */
  aggregates?: Record<string, unknown>;
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
   * Mode `remote` + regroupement : nombre de lignes et agrégats de chaque groupe,
   * calculés par le serveur (voir `NgTableGroupSummary`). Sans cela, l'en-tête d'un
   * groupe n'affiche que son libellé : un compte limité à la page serait trompeur.
   */
  readonly groupSummaries = input<Record<string, NgTableGroupSummary> | null>(null);
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
  /** Pagination active : suivie par le parent (`pageTrackingEnabled`) ou paginateur intégré. */
  protected readonly pagingActive = computed(() => this.pageTrackingEnabled() || this.paginator());

  /** `[length]` du paginateur intégré. */
  protected readonly paginatorLength = computed(() =>
    this.dataMode() === 'remote' ? (this.totalCount() ?? this.rows().length) : this.pageableCount(),
  );

  protected readonly displayedColumnIds = computed(
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
    const sourceRows = this.rows();
    const activeColumns = this.visibleColumnsUnordered();
    const filters = this.columnFilters();
    const sorts = this.sortStates();
    const terms = searchTerms(this.globalSearchTerm());
    const haystacks = terms.length > 0 ? this.searchHaystacks() : null;

    const nextRows = sourceRows.filter(
      (row) =>
        matchesAllFilters(row, activeColumns, filters) &&
        (!haystacks || matchesSearchTerms(this.searchHaystack(row, haystacks), terms)),
    );
    const levels: SortLevel<T>[] = [];
    for (const sort of sorts) {
      const column = activeColumns.find((candidate) => candidate.id === sort.columnId);
      if (column) {
        levels.push({column, factor: sort.direction === 'desc' ? -1 : 1});
      }
    }
    return sortRows(nextRows, levels, this.collator);
  });

  private readonly searchableColumns = computed(() =>
    this.visibleColumnsUnordered().filter((column) => column.searchable !== false),
  );

  /**
   * Texte normalisé de chaque ligne pour la recherche globale : calculé une fois par
   * ligne, puis réutilisé à chaque nouvelle saisie (seule la comparaison est refaite).
   * Le cache est recréé quand les lignes ou les colonnes cherchables changent.
   */
  private readonly searchHaystacks = computed(() => {
    this.rows();
    return {columns: this.searchableColumns(), cache: new WeakMap<object, string>()};
  });
  /** Colonne de regroupement effective (mode local, colonne existante), sinon `null`. */
  protected readonly groupColumn = computed(() => {
    const id = this.groupBy();
    return id ? (this.columns().find((column) => column.id === id) ?? null) : null;
  });

  /**
   * Les groupes ne se replient qu'en mode local : en `remote`, replier raccourcirait la
   * page renvoyée par le serveur et fausserait la pagination.
   */
  protected readonly groupsCollapsible = computed(() => this.dataMode() === 'local');

  /** Colonnes proposées dans le menu « Grouper ». */
  protected readonly groupableColumns = computed(() =>
    this.columnsMenuItems().filter((column) => column.groupable ?? (!!column.sortable || !!column.filter)),
  );

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

  readonly displayedRows = computed(() => {
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
    // En remote, `rows()` EST déjà la page : pas de second découpage.
    return withGroupHeaders(this.dataMode() === 'remote' ? units : this.currentPage(units));
  });

  /** Hauteur max. de la zone de défilement : `[maxHeight]`, ou 70vh en défilement virtuel. */
  protected readonly effectiveMaxHeight = computed(() => this.maxHeight() ?? (this.virtualScroll() ? '70vh' : null));

  private readonly scrollTop = signal(0);
  private readonly viewportHeight = signal(0);
  /** Hauteur d'une ligne, mesurée sur la première ligne rendue (densité, thème...). */
  private readonly rowHeight = signal(48);

  /**
   * Tranche rendue en défilement virtuel. Ne change que lorsque ses bornes changent :
   * défiler de quelques pixels ne recrée pas la source de données de la table.
   */
  private readonly virtualRange = computed<VirtualRange | null>(
    () =>
      this.virtualScroll()
        ? computeVirtualRange(this.pageItems().length, this.scrollTop(), this.viewportHeight(), this.rowHeight())
        : null,
    {equal: (a, b) => a === b || (!!a && !!b && a.start === b.start && a.end === b.end)},
  );

  /** Source de données de la table : éléments de la page, fenêtrés en défilement virtuel. */
  protected readonly tableRows = computed<TableItem<T>[]>(() => {
    const items = this.pageItems();
    const range = this.virtualRange();
    if (!range) {
      return items;
    }
    const height = this.rowHeight();
    return [
      new NgTableSpacerRow('top', range.start * height),
      ...items.slice(range.start, range.end),
      new NgTableSpacerRow('bottom', (items.length - range.end) * height),
    ];
  });

  /** Nombre de lignes de données avant la tranche rendue : position DOM → index dans `displayedRows()`. */
  private readonly renderedRowOffset = computed(() => {
    const range = this.virtualRange();
    if (!range) {
      return 0;
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

  /** Agrégats de chaque groupe, par colonne (texte prêt à afficher), calculés une fois par changement. */
  private readonly groupAggregates = computed(() => {
    const result = new Map<RowGroup<T>, Record<string, string>>();
    const columns = this.columns().filter((column) => column.aggregate);
    const remote = this.dataMode() === 'remote';
    const summaries = this.groupSummaries();
    for (const group of this.groups() ?? []) {
      result.set(
        group,
        remote ? this.formatAggregates(columns, summaries?.[group.key]?.aggregates ?? {}) : this.aggregateTexts(columns, group.rows),
      );
    }
    return result;
  });

  /** Ligne de totaux (mode local) : agrégats sur toutes les lignes filtrées. */
  protected readonly totals = computed(() => {
    if (!this.showTotals() || this.dataMode() !== 'local') {
      return null;
    }
    const columns = this.columns().filter((column) => column.aggregate);
    return columns.length > 0 ? this.aggregateTexts(columns, this.filteredSortedRows()) : null;
  });

  /** Colonne qui porte le libellé d'un en-tête de groupe / de la ligne de totaux : la première affichée. */
  protected readonly leadColumnId = computed(() => this.visibleColumns()[0]?.id ?? null);

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
      if (!this.virtualScroll()) {
        return;
      }
      this.tableRows();
      const wrap = this.tableWrapElement()?.nativeElement;
      if (!wrap) {
        return;
      }
      untracked(() => {
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
    let previousGroupBy: string | null | undefined;
    effect(() => {
      const current = this.groupBy();
      untracked(() => {
        if (previousGroupBy !== undefined && current !== previousGroupBy) {
          this.collapsedGroups.set(new Set());
          if (this.dataMode() === 'remote') {
            this.onQueryStateChanged(); // le serveur doit renvoyer les lignes triées par groupe
          } else if (this.pagingActive() && this.pageIndex() !== 0) {
            this.pageIndex.set(0);
          }
        }
        previousGroupBy = current;
      });
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

  /** Texte de la tooltip de troncature — même valeur que la cellule, en `string`. */
  protected cellText(row: T, column: NgTableColumn<T>): string {
    const value = this.cellValue(row, column);
    return value === null || value === undefined ? '' : String(value);
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
      return;
    }

    const row = this.displayedRows()[this.renderedRowOffset() + position.row];
    if (row === undefined) {
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
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
    }
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
    if (state.pageSize !== undefined) {
      this.pageSize.set(state.pageSize);
    }
    const queryChanged = !!state.sorts || !!state.filters || state.search !== undefined;
    if (state.pageIndex !== undefined) {
      this.pageIndex.set(state.pageIndex);
    } else if (queryChanged && this.pagingActive()) {
      this.pageIndex.set(0);
    }
    if (this.dataMode() === 'remote') {
      this.remoteQueryChange.emit(this.buildRemoteQuery(this.pageIndex(), this.pageSize()));
    }
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
      this.remoteExportRequested.emit(this.buildRemoteQuery(this.pageIndex(), this.pageSize()));
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
    this.collapsedGroups.set(next);
  }

  /** Replie tous les groupes (regroupement actif). */
  collapseAllGroups(): void {
    this.collapsedGroups.set(new Set((this.groups() ?? []).map((group) => group.key)));
  }

  /** Déplie tous les groupes. */
  expandAllGroups(): void {
    this.collapsedGroups.set(new Set());
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
    const count = this.dataMode() === 'remote' ? this.groupSummaries()?.[group.key]?.count : group.rows.length;
    return count === undefined ? '' : this.effectiveLabels().groupCount.replace('{count}', `${count}`);
  }

  protected groupAggregate(group: RowGroup<T>, columnId: string): string {
    return this.groupAggregates().get(group)?.[columnId] ?? '';
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
      this.remoteQueryChange.emit(this.buildRemoteQuery(event.pageIndex, event.pageSize));
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

  /** En-têtes puis une ligne par enregistrement ; valeurs typées (le CSV les convertit en texte). */
  private buildExportMatrix(rows: readonly T[]): ExportCell[][] {
    const exportColumns = this.visibleColumns().filter((column) => column.exportable !== false);
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

  protected rowClasses(row: T): string | string[] | Record<string, boolean> {
    return this.rowClassFn()?.(row) ?? '';
  }

  protected hasCopyAction(column: NgTableColumn<T>, row: T): boolean {
    return !!this.resolveCopyValue(column, row);
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
    if (this.virtualScroll()) {
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
    return this.trackByRow(index, row);
  };

  protected mobileActionsRowWhen = (_: number, row: TableItem<T>): boolean =>
    isDataItem(row) && this.mobileActionRowColumns().length > 0;

  protected groupRowWhen = (_: number, row: TableItem<T>): boolean => row instanceof NgTableGroupRow;

  protected spacerRowWhen = (_: number, row: TableItem<T>): boolean => row instanceof NgTableSpacerRow;

  protected readonly spacerColumns = ['__spacer__'];

  protected dataRowWhen = (_: number, row: TableItem<T>): boolean => isDataItem(row);

  /**
   * The detail row is ALWAYS rendered when a template is provided.
   * Material only re-evaluates `when:` predicates on data re-render, so
   * expansion state must NOT be part of the predicate. Visibility is
   * driven by `isDetailExpanded()` bindings instead, which are re-evaluated
   * on every change detection cycle.
   */
  protected detailRowRenderWhen = (_index: number, row: TableItem<T>): boolean =>
    !!this.detailRowTemplate() && isDataItem(row);

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
      this.remoteQueryChange.emit(this.buildRemoteQuery(0, this.pageSize()));
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

  /** `page.size` vaut `0` quand la pagination n'est pas suivie (= tout). */
  private buildRemoteQuery(pageIndex: number, pageSize: number): NgTableRemoteQuery {
    return {
      sort: this.sortState(),
      sorts: this.sortStates(),
      filters: this.columnFilters(),
      page: {index: pageIndex, size: this.pagingActive() ? pageSize : 0},
      search: this.globalSearchTerm(),
      groupBy: this.groupColumn()?.id ?? null,
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
      this.remoteQueryChange.emit({
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

    const selectedRows = this.rows().filter((item) => next.has(this.rowKey(item)));
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

  private resolveCopyValue(column: NgTableColumn<T>, row: T): string {
    if (!column.copy) {
      return '';
    }

    if (typeof column.copy === 'object' && column.copy.valueAccessor) {
      return `${column.copy.valueAccessor(row) ?? ''}`.trim();
    }

    return `${column.valueAccessor(row) ?? ''}`.trim();
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
