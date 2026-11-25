import {CommonModule} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  Injector,
  input,
  model,
  OnDestroy,
  output,
  signal,
  Signal,
  TemplateRef,
  TrackByFunction,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import {NgTableIconComponent} from './ng-table-icon.component';
import {NgTableMenuComponent, NgTableMenuTriggerDirective} from './ng-table-menu';
import {NgTableCheckboxComponent} from './ng-table-checkbox.component';
import {NgTablePaginatorComponent} from './ng-table-paginator.component';
import {Dir, Directionality} from '@angular/cdk/bidi';
import {NgTableTooltipDirective} from './tooltip.directive';
import {ColumnFilterRendererComponent} from './column-filter-renderer.component';
import {DynamicFilterHostComponent} from './dynamic-filter-host.component';
import {TruncateTooltipDirective} from './truncate-tooltip.directive';
import {NgTableTheme} from './theme';
import {NgTableFilterGroup} from './advanced-filter';
import {NgTableTone} from './cell-format';
import {NgTableCellFormatComponent} from './ng-table-cell-format.component';
import {NgTableRowTransaction, NgTableTransactionResult} from './live-rows';
import {NgTableSparklineComponent} from './ng-table-sparkline.component';
import {RowDropPosition} from './row-drag';
import {NgTableExportFormat} from './export-writers';
import {ComputeWorkerLike} from './compute-worker-client';
import {NgTableSelectionAction, NgTableSelectionActionEvent, NgTableSelectionBarContext} from './selection-actions';
import type {StyledXlsxOptions} from './xlsx-styled';
import {NG_TABLE_DEFAULT_LABELS, NG_TABLE_LABELS, NgTableLabels, ngTableLabelsEqual, resolveNgTableLabelsSource} from './ng-table-labels';
import type {
  NgTableBlockRequest,
  NgTableCellEditEvent,
  NgTableCellEditRejectedEvent,
  NgTableColumn,
  NgTableContextMenuEvent,
  NgTableCopyEvent,
  NgTableDataMode,
  NgTableDetailToggleEvent,
  NgTableExportMode,
  NgTableGroupSummary,
  NgTableLocalExportEvent,
  NgTableQueryState,
  NgTableRangeCopyEvent,
  NgTableRangePasteEvent,
  NgTableRangeSelection,
  NgTableRemoteDatasource,
  NgTableRemoteExportRequest,
  NgTableRemoteQuery,
  NgTableRowMoveEvent,
  NgTableSelectionChangeEvent,
  NgTableSortChange,
  NgTableTreeToggleEvent,
  NgTableView,
  NgTableViewsImportEvent,
  NgTableViewsStore,
} from './ng-table.models';
import {TableColumnLayout} from './table/table-column-layout';
import {TableSorting} from './table/table-sorting';
import {TableFiltering} from './table/table-filtering';
import {TableData} from './table/table-data';
import {TableTree} from './table/table-tree';
import {TableGrouping} from './table/table-grouping';
import {TablePaging} from './table/table-paging';
import {TableRemoteBlocks} from './table/table-remote-blocks';
import {TableViewport} from './table/table-viewport';
import {TableScrollMarkers} from './table/table-scroll-markers';
import {TableFocus} from './table/table-focus';
import {TableRowReuse} from './table/table-row-reuse';
import {TableAria} from './table/table-aria';
import {TableRender} from './table/table-render';
import {TableSticky} from './table/table-sticky';
import {TableStatusBar} from './table/table-status-bar';
import {TableKeyboard} from './table/table-keyboard';
import {TableCellEditing} from './table/table-cell-editing';
import {TableSidePanel} from './table/table-side-panel';
import {TableRangeSelection} from './table/table-range-selection';
import {TableRowMove} from './table/table-row-move';
import {TableSelection} from './table/table-selection';
import {TableDetail} from './table/table-detail';
import {TableViews} from './table/table-views';
import {TableQueryState} from './table/table-query-state';
import {TableLiveUpdates} from './table/table-live-updates';
import {TableExport} from './table/table-export';
import {TableColumnMove} from './table/table-column-move';
import {TableColumnResize} from './table/table-column-resize';
import {TableContextMenu} from './table/table-context-menu';
import {TableCellCopy} from './table/table-cell-copy';

/** Espace insécable (U+00A0), voir `announce`. */
const NBSP = String.fromCharCode(160);

/**
 * Table de données.
 *
 * Le composant porte l'API publique (entrées, sorties, méthodes) et relie les classes du dossier `table/`, une par
 * domaine : colonnes, tri, filtres, données, édition, sélection... Chacune garde son état et ses opérations ; le
 * gabarit les lit directement (`sorting.…`, `filtering.…`) et le constructeur met leurs effets en route, dans un
 * ordre fixe.
 */
@Component({
  selector: 'ng-table',
  imports: [
    CommonModule,
    NgTableMenuComponent,
    NgTableMenuTriggerDirective,
    NgTablePaginatorComponent,
    NgTableCheckboxComponent,
    NgTableIconComponent,
    NgTableTooltipDirective,
    ColumnFilterRendererComponent,
    DynamicFilterHostComponent,
    TruncateTooltipDirective,
    NgTableSparklineComponent,
    NgTableCellFormatComponent,
  ],
  templateUrl: './ng-table.component.html',
  styleUrls: ['./theme.css', './buttons.css', './ng-table.component.css'],
  host: {'[attr.data-ngt-theme]': 'theme()'},
  // [dir]="'rtl'" : sens de lecture propre au tableau (sinon celui de la page) ; les colonnes figées suivent (décalages logiques).
  hostDirectives: [{directive: Dir, inputs: ['dir']}],
  // Tout l'état interne passe par des signals : `OnPush` suffit et évite de re-vérifier
  // la vue (et ses centaines de cellules) à chaque cycle de détection global.
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
// `any` par défaut : un `viewChild(NgTableComponent)` sans paramètre reste utilisable comme avant.
// Dans un template, T est inféré depuis `[rows]` / `[columns]`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class NgTableComponent<T = any> implements OnDestroy {
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
  /** Une ligne sur deux a un fond légèrement différent (jeton `--ngt-row-alt-bg`). Stable au défilement virtuel. */
  readonly striped = input(false);
  /**
   * Au premier affichage des lignes, ajuste la largeur de chaque colonne à son contenu (comme un double-clic sur sa
   * bordure). Les titres ne sont plus tronqués quand une colonne voisine a de la place en trop. Voir `autoSizeAllColumns()`.
   */
  readonly autoSizeColumns = input(false);
  /**
   * Garde les colonnes épinglées sur un écran étroit (760 px ou moins). Par défaut elles sont libérées : sur un
   * téléphone, elles prenaient toute la largeur et cachaient les autres colonnes.
   */
  readonly pinColumnsOnMobile = input(false);
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
  /**
   * Bouton natif déplier / replier : dès qu'un `detailRowTemplate` est fourni, une colonne étroite en tête de table porte un
   * chevron par ligne (clavier, `aria-expanded`). `false` le retire, pour garder votre propre bouton ou le seul clic sur la ligne.
   * En mode contrôlé (`detailRowWhen` / `expandedRowKeys`), le bouton émet `(detailToggle)` : à vous de mettre l'état à jour.
   */
  readonly detailRowToggleButton = input(true);
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
   * Filtre avancé : conditions combinées par ET / OU, en groupes imbriqués (`NgTableFilterGroup`). Il s'ajoute aux
   * filtres de colonnes et à la recherche. Chaque condition lit sa saisie comme le filtre de sa colonne (`>5000`,
   * `Validée,Annulée`...). En mode `remote`, il est transmis dans la requête (`advancedFilter`). Pour le construire à
   * l'écran : `<ng-table-filter-builder [columns]="columns" [(filter)]="filtre" />`.
   */
  readonly advancedFilter = model<NgTableFilterGroup | null>(null);
  /**
   * Surligne, dans les cellules, le texte trouvé par la recherche globale (casse et accents ignorés). Ne concerne que
   * les cellules affichées en texte : pas celles d'un `cellTemplate`, ni les colonnes dont `searchable` est réglé.
   */
  readonly highlightSearch = input(false);
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
   * Niveaux de regroupement supplémentaires, dans l'ordre : `groupBy` est le premier niveau, ceux-ci les suivants
   * (sous-groupes). Mode local uniquement ; sans `groupBy` ils sont ignorés. Liable en `[(groupLevels)]`, enregistré dans les vues.
   */
  readonly groupLevels = model<string[]>([]);
  /**
   * Panneau de regroupement au-dessus du tableau : on y dépose des en-têtes de colonne (ou on les choisit dans la liste)
   * pour regrouper sur un ou plusieurs niveaux, comme le panneau « row group » d'AG Grid. Demande `[groupingEnabled]`.
   */
  readonly groupPanel = input(false);
  /**
   * Anime le changement de tri : les lignes déjà à l'écran glissent vers leur nouvelle place, les autres apparaissent
   * en fondu. Sans effet si l'utilisateur a demandé moins d'animations (`prefers-reduced-motion`).
   */
  readonly animateRows = input(false);
  /**
   * Repères le long du bord de la zone défilante : un trait à la hauteur de chaque ligne sélectionnée, et de chaque
   * ligne signalée par `[rowMarker]`. Ils montrent où se trouvent ces lignes dans toute la liste, sans défiler ; un
   * clic sur un trait amène la ligne au milieu de la zone et la met en évidence un instant. Sur une longue liste, un
   * pixel de barre représente plusieurs lignes : des lignes marquées très proches partagent un trait.
   * La liste est parcourue en entier à chaque changement : à éviter au-delà de quelques centaines de milliers de lignes.
   */
  readonly scrollMarkers = input(false);
  /** Teinte du repère d'une ligne (`'danger'`, `'warning'`, `'info'`, `'success'`), ou `null` : pas de repère. Voir `[scrollMarkers]`. */
  readonly rowMarker = input<((row: T) => NgTableTone | null | undefined) | null>(null);
  /**
   * Regroupement : l'en-tête du groupe en cours (et de ses groupes parents) reste collé sous l'en-tête des colonnes
   * pendant qu'on fait défiler ses lignes. Demande une zone défilante (`[maxHeight]` ou `[virtualScroll]`).
   */
  readonly stickyGroupHeaders = input(false);
  /**
   * Défilement virtuel : seules les lignes visibles (plus une marge) sont rendues, ce
   * qui garde une liste de 50 000 lignes fluide sans pagination. Demande une hauteur
   * fixe (`[maxHeight]`, 70vh par défaut) et des lignes de hauteur uniforme (mesurée).
   */
  /**
   * Les lignes s'activent au clavier : chaque ligne reçoit le focus (Tab) et Entrée ou Espace émet `(rowClick)`,
   * comme un clic. À activer dès que l'application écoute `(rowClick)` (ouvrir une fiche...) : sans cela, l'action
   * n'existe qu'à la souris (WCAG 2.1.1). Avec `[cellNavigation]`, Entrée sur une cellule émet aussi `(rowClick)`.
   */
  readonly rowActivatable = input(false);
  readonly virtualScroll = input(false);
  /**
   * Défilement virtuel : réutiliser les lignes déjà créées au lieu de les détruire et d'en recréer à chaque déplacement.
   * Une ligne qui sort de la zone rendue est reprise pour celle qui y entre : seul son contenu change. Un saut dans
   * la liste ne recrée donc plus aucune ligne.
   *
   * `'auto'` (défaut) : actif quand aucune colonne affichée n'a de `cellTemplate` et qu'il n'y a pas de
   * `detailRowTemplate`. Un gabarit fourni par l'application peut contenir un composant qui garde un état (menu
   * ouvert, saisie en cours) : réutilisé, il le montrerait sur une autre ligne. `true` force la réutilisation
   * (gabarits sans état), `false` la désactive.
   */
  readonly rowReuse = input<'auto' | boolean>('auto');
  /**
   * Tri, filtres et recherche exécutés dans un Web Worker quand le jeu de données dépasse `[workerThreshold]` lignes :
   * le fil principal reste libre (défilement, saisie) pendant le calcul, et l'ancien résultat reste affiché sous un
   * indicateur d'attente jusqu'à l'arrivée du nouveau. Mode local uniquement, sans données arborescentes ; un filtre
   * à `filterPredicate` (fonction) se calcule sur le fil principal. Le worker est livré avec la bibliothèque (chargé
   * dans un `Blob`) ; voir `[computeWorkerFactory]` si la politique de sécurité de la page l'interdit.
   */
  readonly workerCompute = input(false);
  /** Nombre de lignes à partir duquel `[workerCompute]` s'applique. */
  readonly workerThreshold = input(100_000);
  /** Fabrique du worker de calcul, si celui livré (`Blob`) n'est pas utilisable (CSP) : doit renvoyer un `Worker` qui exécute `ng-table.worker`. */
  readonly computeWorkerFactory = input<(() => ComputeWorkerLike) | null>(null);
  /** `true` pendant qu'un calcul en worker est en cours, `false` à son arrivée. */
  readonly computing = output<boolean>();
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
   * Poignée de recopie, comme dans un tableur : un petit carré au coin de la plage sélectionnée, à tirer vers le bas,
   * le haut, la droite ou la gauche pour recopier les valeurs dans les cellules voisines (une suite de nombres à pas
   * constant est prolongée). Au clavier : Ctrl+D recopie la première ligne de la plage vers le bas, Ctrl+R la première
   * colonne vers la droite. Demande `[rangeSelection]`, le mode local et des colonnes éditables (`valueSetter`) ;
   * l'ensemble de la recopie s'annule en une fois (Ctrl+Z).
   */
  readonly fillHandle = input(false);
  /**
   * Un collage (Ctrl+V sur une plage) écrit dans les cellules éditables de la plage, en
   * une seule opération annulable. `(rangePasted)` est émis dans tous les cas.
   */
  readonly editOnPaste = input(true);
  /** Nombre d'opérations que Ctrl+Z peut défaire. */
  readonly undoRedoLimit = input(100);
  /**
   * Thème : `'dark'`, `'light'`, ou `'auto'` (suit `prefers-color-scheme`). `null` (défaut) ne force rien : les
   * jetons `--ngt-*` de l'application s'appliquent. Pour un thème sombre dans toute l'application, y compris les
   * menus et filtres qui s'ouvrent en surcouche, posez plutôt la classe `ngt-dark` sur `<html>`.
   */
  readonly theme = input<NgTableTheme | null>(null);
  /**
   * Données arborescentes (mode local) : la première colonne affiche l'indentation et un bouton
   * pour déplier / replier. Fournir `[treeChildren]` (lignes imbriquées) ou `[treeParent]`
   * (lignes à plat, avec la clé du parent). Le tri se fait entre frères ; un filtre ou une
   * recherche garde les lignes qui correspondent ET leurs ancêtres, dépliés. Le regroupement
   * et le déplacement de lignes sont inactifs en mode arbre.
   */
  readonly treeData = input(false);
  /** Enfants d'une ligne (lignes imbriquées) : `[rows]` ne contient alors que les racines. */
  readonly treeChildren = input<((row: T) => readonly T[] | null | undefined) | null>(null);
  /** Clé du parent d'une ligne (lignes à plat), `null` pour une racine. Utilise `[rowKeyAccessor]` comme clé. */
  readonly treeParent = input<((row: T) => unknown) | null>(null);
  /** Nœuds dépliés au départ : `true` tous, ou un nombre de niveaux (`1` = les racines seulement dépliées). */
  readonly treeDefaultExpanded = input<boolean | number>(false);
  /** Retrait par niveau, en pixels. */
  readonly treeIndent = input(20);
  /**
   * Poignée de glisser-déposer en tête de chaque ligne. La table ne réordonne pas vos données :
   * `(rowMoved)` donne le nouvel ordre complet à réinjecter dans `[rows]`. Actif en mode local,
   * sans tri ni regroupement (l'ordre des lignes est alors celui de `[rows]`).
   */
  readonly rowDrag = input(false);
  /**
   * Barre d'état sous le tableau : nombre de lignes (filtrées / total), lignes sélectionnées,
   * et, pour une plage de cellules, nombre, somme, moyenne, min et max.
   */
  readonly statusBar = input(false);
  /** Panneau latéral (colonnes, filtres actifs) ouvert par un bouton de la barre d'actions. */
  readonly sidePanel = input(false);
  readonly sidePanelOpen = model(false);
  /** Panneau fixé à droite du tableau : il ne recouvre plus les colonnes et ne se ferme plus au clic à l'extérieur. */
  readonly sidePanelPinned = model(false);
  /** Ajoute une première ligne d'en-têtes de colonnes au texte copié. */
  readonly rangeCopyHeaders = input(false);
  /** Lignes par bloc demandé au serveur. */
  readonly cacheBlockSize = input(100);
  /** Blocs gardés en mémoire ; au-delà, les moins récemment affichés sont oubliés. */
  readonly maxBlocksInCache = input(50);
  /** Requêtes de blocs simultanées au plus. */
  readonly maxConcurrentBlockRequests = input(2);
  /**
   * Modèle par blocs : nombre de blocs chargés d'avance dans le sens du défilement, une fois la zone affichée
   * servie. `0` (défaut) : seuls les blocs affichés sont demandés.
   */
  readonly prefetchBlocks = input(0);
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
   * Affiche dans la barre d'outils un bouton « Suspendre les mises à jour » (WCAG 2.2.2 : un contenu qui se met à
   * jour tout seul doit pouvoir être mis en pause par l'utilisateur). À activer sur une table alimentée en direct.
   */
  readonly livePauseButton = input(false);
  /**
   * Mises à jour en direct suspendues (liaison bidirectionnelle). Tant que c'est vrai, en mode local : un nouveau
   * tableau `[rows]` n'est pas reporté, et les transactions (`applyTransaction`, `applyTransactionAsync`) attendent.
   * À la reprise, le dernier `[rows]` et les transactions en attente sont appliqués d'un coup. L'édition par
   * l'utilisateur reste immédiate. Écoutez ce modèle pour couper aussi votre flux si vous le souhaitez.
   */
  readonly liveUpdatesPaused = model(false);
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
  /**
   * Barre d'actions flottante en bas du tableau, affichée quand des lignes sont sélectionnées (avec `[rowSelectionEnabled]`) :
   * le nombre de lignes, un bouton pour tout désélectionner, et les `[selectionActions]`. S'utilise seule ou avec le menu
   * contextuel (`[rowContextMenuEnabled]`) : ce sont deux façons indépendantes d'agir sur les lignes.
   */
  readonly selectionBar = input(false);
  /**
   * Actions de la barre. Chacune peut déclarer une règle métier sur la sélection (`when`, `minRows`, `maxRows`) et, si elle
   * n'est pas respectée, disparaître ou être grisée avec sa raison. Voir `NgTableSelectionAction`.
   */
  readonly selectionActions = input<readonly NgTableSelectionAction<T>[]>([]);
  /**
   * Règle métier d'affichage de la barre : elle n'apparaît que si la sélection la satisfait (ex. uniquement des commandes
   * à traiter). Sans règle, la barre apparaît dès qu'une ligne est sélectionnée.
   */
  readonly selectionBarWhen = input<((rows: readonly T[]) => boolean) | null>(null);
  /** Nombre d'actions montrées dans la barre ; les suivantes passent dans le menu « Autres actions ». */
  readonly selectionBarMaxActions = input(4);
  /** Contenu libre ajouté dans la barre, après le compteur (`NgTableSelectionBarContext`). */
  readonly selectionBarTemplate = input<TemplateRef<NgTableSelectionBarContext<T>> | null>(null);
  /** Une action de la barre a été choisie. */
  readonly selectionAction = output<NgTableSelectionActionEvent<T>>();
  /** Enable right-click contextual menu on data rows. */
  readonly rowContextMenuEnabled = input(false);
  /** Context menu content provided by parent component. */
  readonly rowContextMenuTemplate = input<TemplateRef<{ $implicit: T; row: T; selectedRows: readonly T[] }> | null>(null);

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
   * Affiche un paginateur intégré (`<ng-table-paginator>`) sous la table, déjà branché : rien à relier
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
  /**
   * Réglages de l'export `xlsx` stylé (ignorés en CSV) : couleur d'en-tête (par défaut l'accent `--ngt-primary` du thème),
   * lignes alternées, filtre automatique, nom de la feuille. `null` : réglages par défaut.
   */
  readonly exportXlsxOptions = input<Pick<StyledXlsxOptions, 'headerFill' | 'headerColor' | 'zebra' | 'autoFilter' | 'sheetName'> | null>(null);
  /** `'styled'` (défaut) : classeur mis en forme (en-têtes colorés, formats, largeurs, filtre) ; `'plain'` : classeur brut, en-têtes en gras. */
  readonly exportXlsxStyle = input<'styled' | 'plain'>('styled');
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
  /** Un nœud de l'arbre a été déplié ou replié. */
  readonly treeToggle = output<NgTableTreeToggleEvent<T>>();
  /** Une ligne a été déplacée : nouvel ordre complet dans `rows`. */
  readonly rowMoved = output<NgTableRowMoveEvent<T>>();
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
  /** @internal */
  readonly contextMenuTriggerRef = viewChild<NgTableMenuTriggerDirective>('rowContextMenuTrigger');
  /** L'élément `<table>`. @internal */
  readonly tableElement = viewChild('gridTable', {read: ElementRef<HTMLTableElement>});
  /** @internal */
  readonly tableWrapElement = viewChild('tableWrap', {read: ElementRef<HTMLElement>});

  /** Contenu de la région `aria-live` (voir `announce`). */
  protected readonly liveAnnouncement = signal('');

  /** @internal */
  quietRepeat = false;

  /** @internal */
  readonly destroyRef = inject(DestroyRef);

  /** @internal */
  readonly injector = inject(Injector);

  /** Labels applicatifs fournis via `provideNgTableLabels()` (optionnels). */
  private readonly injectedLabels = inject(NG_TABLE_LABELS, {optional: true});

  /** @internal */
  readonly collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});

  /**
   * Labels effectifs : défauts de la librairie < labels injectés pour toute
   * l'application (`provideNgTableLabels`) < `[labels]` de cette instance.
   *
   * `equal` est essentiel ici : un consommateur peut écrire
   * `[labels]="{columnsButton: 'X' | translate}"`, ce qui recrée l'objet à chaque
   * cycle de détection. La comparaison par valeur garde alors la référence
   * précédente, donc les composants enfants (`OnPush`) ne sont pas invalidés
   * inutilement.
   * @internal
   */
  readonly effectiveLabels = computed<NgTableLabels>(
    () => ({
      ...NG_TABLE_DEFAULT_LABELS,
      ...resolveNgTableLabelsSource(this.injectedLabels),
      ...this.labels(),
    }),
    {equal: ngTableLabelsEqual},
  );

  /** @internal */
  readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Colonnes affichées : visibilité, ordre, épinglage, largeurs, alignement, fenêtre de colonnes. @internal */
  readonly columnLayout = new TableColumnLayout<T>(this);

  /** Tri : niveaux de tri, libellés et icônes d'en-tête, animation des lignes triées. @internal */
  readonly sorting = new TableSorting<T>(this);

  /** Filtres de colonne, recherche globale et filtre avancé. @internal */
  readonly filtering = new TableFiltering<T>(this);

  /** Données : magasin de lignes, filtrage et tri (dans la page ou en Web Worker), recherche. @internal */
  readonly data = new TableData<T>(this);

  /** Données arborescentes : profondeur, repli et dépli des nœuds. @internal */
  readonly tree = new TableTree<T>(this);

  /** Regroupement de lignes : niveaux, repli, agrégats, panneau de regroupement, en-têtes de groupe collants. @internal */
  readonly grouping = new TableGrouping<T>(this);

  /** Pagination : lignes de la page courante. @internal */
  readonly paging = new TablePaging<T>(this);

  /** Source distante par blocs : cache, requêtes, lignes en cours de chargement. @internal */
  readonly remote = new TableRemoteBlocks<T>(this);

  /** Zone de défilement : position, hauteurs mesurées, fenêtre du défilement virtuel. @internal */
  readonly viewport = new TableViewport<T>(this);

  /** Repères de la barre de défilement et navigation de repère en repère. @internal */
  readonly markers = new TableScrollMarkers<T>(this);

  /** Conservation du focus quand l'élément focalisé disparaît ou est rendu à nouveau. @internal */
  readonly focus = new TableFocus<T>(this);

  /** Réutilisation des lignes rendues pendant le défilement virtuel. @internal */
  readonly reuse = new TableRowReuse<T>(this);

  /** Rangs ARIA des lignes et des colonnes. @internal */
  readonly aria = new TableAria<T>(this);

  /** Rendu : lignes et cellules à afficher, totaux, mise en forme et surlignage. @internal */
  readonly render = new TableRender<T>(this);

  /** Colonnes figées et en-têtes collants : côtés, décalages mesurés. @internal */
  readonly sticky = new TableSticky<T>(this);

  /** Barre d'état : décomptes et statistiques de la plage sélectionnée. @internal */
  readonly status = new TableStatusBar<T>(this);

  /** Navigation au clavier dans la grille : cellule active, tabindex itinérant, sauts dans la liste virtuelle. @internal */
  readonly keyboard = new TableKeyboard<T>(this);

  /** Édition de cellules : éditeurs, validation, annuler et rétablir. @internal */
  readonly cellEditing = new TableCellEditing<T>(this);

  /** Panneau latéral : ouverture, onglets. @internal */
  readonly panel = new TableSidePanel<T>(this);

  /** Sélection d'une plage de cellules : souris, clavier, copier, coller, poignée de recopie. @internal */
  readonly range = new TableRangeSelection<T>(this);

  /** Déplacement de lignes : glisser-déposer et clavier. @internal */
  readonly rowMove = new TableRowMove<T>(this);

  /** Sélection de lignes et barre d'actions de sélection. @internal */
  readonly selection = new TableSelection<T>(this);

  /** Ligne détail : dépli, repli, accordéon. @internal */
  readonly detail = new TableDetail<T>(this);

  /** Vues enregistrées : création, application, import et export. @internal */
  readonly views = new TableViews<T>(this);

  /** État de requête : lecture, application, émission vers le parent et vers le serveur. @internal */
  readonly query = new TableQueryState<T>(this);

  /** Mises à jour en direct : transactions, file d'attente, surbrillance des cellules modifiées. @internal */
  readonly live = new TableLiveUpdates<T>(this);

  /** Export : dialogue, plage de pages, matrices CSV et Excel. @internal */
  readonly exporting = new TableExport<T>(this);

  /** Déplacement de colonnes : glisser-déposer et clavier. @internal */
  readonly columnMove = new TableColumnMove<T>(this);

  /** Redimensionnement de colonnes : souris, clavier, ajustement au contenu. @internal */
  readonly columnResize = new TableColumnResize<T>(this);

  /** Menu contextuel de ligne. @internal */
  readonly rowMenu = new TableContextMenu<T>(this);

  /** Copie de la valeur d'une cellule. @internal */
  readonly cellCopy = new TableCellCopy<T>(this);

  /** Vues enregistrées. */
  readonly viewsList = this.views.viewsList;

  /** Identifiant de la vue active, s'il y en a une. */
  readonly activeViewId = this.views.activeViewId;

  /** Vue active, ou `null`. */
  readonly activeView = this.views.activeView;

  /** Colonnes visibles, dans l'ordre affiché. */
  readonly visibleColumns = this.columnLayout.visibleColumns;

  /** Ajuste la largeur de toutes les colonnes visibles à leur contenu (titres et cellules rendues). */
  autoSizeAllColumns(): void {
    this.columnLayout.autoSizeAllColumns();
  }

  /** Summary of currently active filters (for the bottom bar). */
  readonly activeFilterSummaries = this.filtering.activeFilterSummaries;

  /** Déplie ou replie un nœud. Sans effet pour une ligne sans enfants. */
  setTreeExpanded(row: T, expanded: boolean): void {
    this.tree.setTreeExpanded(row, expanded);
  }

  /** Déplie tous les nœuds de l'arbre. */
  expandAllTree(): void {
    this.tree.expandAllTree();
  }

  /** Replie tous les nœuds de l'arbre. */
  collapseAllTree(): void {
    this.tree.collapseAllTree();
  }

  /** Lignes de données affichées : après filtres, tri et pagination. */
  readonly displayedRows: Signal<T[]> = this.paging.displayedRows;

  /**
   * Fait défiler pour amener la ligne `index` (0-based, dans l'ordre affiché) en haut de la
   * zone, comme `ensureIndexVisible` d'AG Grid. Défilement virtuel ou modèle par blocs.
   */
  scrollToIndex(index: number): void {
    this.viewport.scrollToIndex(index);
  }

  /**
   * Données de graphique de la plage sélectionnée (colonnes numériques en séries, première
   * colonne de texte en catégories), ou `null`. À donner à `<ng-table-chart [data]="…">`.
   */
  readonly rangeChartData = this.status.rangeChartData;

  /** Ouvre ou ferme le panneau latéral ; avec `tab`, affiche cet onglet. */
  toggleSidePanel(tab?: 'columns' | 'filters'): void {
    this.panel.toggleSidePanel(tab);
  }

  /** Peut-on défaire / rétablir une modification ? */
  readonly canUndo = this.cellEditing.canUndo;

  /** Peut-on rétablir une modification annulée ? */
  readonly canRedo = this.cellEditing.canRedo;

  /** Efface le filtre d'une colonne. */
  clearFilter(columnId: string): void {
    this.filtering.clearFilter(columnId);
  }

  /** Réinitialise les filtres de colonnes ET la recherche globale, en une seule requête en mode `remote`. */
  clearAllFilters(): void {
    this.filtering.clearAllFilters();
  }

  /** Efface la recherche globale. */
  clearGlobalSearch(): void {
    this.filtering.clearGlobalSearch();
  }

  /**
   * Saves the list's current presentation (columns, order, sort, filters, and
   * pagination when `pageTrackingEnabled=true`) as a view. If a view with the same name
   * already exists, it is overwritten in place; otherwise a new view is created.
   * Either way the saved view becomes the active one.
   */
  saveCurrentAsView(name: string): void {
    this.views.saveCurrentAsView(name);
  }

  /**
   * Overwrites an existing view's saved presentation with the list's current one
   * (columns, order, sort, filters, and pagination when `pageTrackingEnabled=true`),
   * keeping its name and id. The updated view becomes the active one.
   */
  updateView(view: NgTableView): void {
    this.views.updateView(view);
  }

  /** Ajuste la largeur d'une colonne redimensionnable à son contenu (comme un double-clic sur sa bordure). */
  autoFitColumn(column: NgTableColumn<T>): void {
    this.columnResize.autoFitColumn(column);
  }

  /** Plage actuellement sélectionnée, ou `null`. */
  getSelectedRange(): NgTableRangeSelection<T> | null {
    return this.range.getSelectedRange();
  }

  /** Copie la plage sélectionnée dans le presse-papiers. `false` s'il n'y en a pas, ou si le navigateur refuse. */
  copySelectedRange(): Promise<boolean> {
    return this.range.copySelectedRange();
  }

  /** Traite un texte collé comme le ferait Ctrl+V sur la plage : émet `(rangePasted)`. */
  pasteIntoRange(text: string): void {
    this.range.pasteIntoRange(text);
  }

  /** Sélectionne toutes les cellules de la page affichée. */
  selectAllCells(): void {
    this.range.selectAllCells();
  }

  /** Efface la plage sélectionnée. */
  clearRangeSelection(): void {
    this.range.clearRangeSelection();
  }

  /** Déplace une ligne par programme : même effet qu'un glisser-déposer (`(rowMoved)` est émis). */
  moveRow(row: T, target: T, position: RowDropPosition = 'before'): boolean {
    return this.rowMove.moveRow(row, target, position);
  }

  /** Ouvre l'éditeur d'une cellule par programme. `false` si elle n'est pas éditable. */
  startEditing(row: T, columnId: string): boolean {
    return this.cellEditing.startEditing(row, columnId);
  }

  /** Ferme l'éditeur : valide la saisie, ou l'abandonne avec `cancel`. */
  stopEditing(cancel = false): void {
    this.cellEditing.stopEditing(cancel);
  }

  /** Défait la dernière modification (ou le dernier collage). `false` s'il n'y en a pas. */
  undo(): boolean {
    return this.cellEditing.undo();
  }

  /** Rétablit la dernière modification défaite. */
  redo(): boolean {
    return this.cellEditing.redo();
  }

  /** Programmatic toggle of a row detail (uncontrolled mode only). */
  toggleDetail(row: T): void {
    this.detail.toggleDetail(row);
  }

  /** Collapse every expanded detail row (uncontrolled mode). */
  collapseAllDetails(): void {
    this.detail.collapseAllDetails();
  }

  /** Number of currently expanded detail rows (uncontrolled mode). */
  expandedDetailCount(): number {
    return this.detail.expandedDetailCount();
  }

  /** La ligne détail de cette ligne est-elle dépliée ? */
  isRowExpanded(row: T): boolean {
    return this.detail.isRowExpanded(row);
  }

  /** La ligne est-elle sélectionnée ? */
  isRowSelected(row: T): boolean {
    return this.selection.isRowSelected(row);
  }

  /** Nombre de lignes sélectionnées. */
  readonly selectedRowsCount = this.selection.selectedRowsCount;

  /** Désélectionne toutes les lignes (la barre disparaît). */
  clearSelection(): void {
    this.selection.clearSelection();
  }

  /** Sélectionne toutes les lignes filtrées (mode local), pas seulement la page affichée. */
  selectAllFiltered(): void {
    this.selection.selectAllFiltered();
  }

  /** Switches to a saved view, applying its presentation immediately. */
  activateView(view: NgTableView): void {
    this.views.activateView(view);
  }

  /**
   * Deletes a saved view. If it was the active one, the default view (or else the
   * first remaining view, if any) becomes active. Deleting the default view clears it.
   */
  deleteView(view: NgTableView): void {
    this.views.deleteView(view);
  }

  /** Définit la vue appliquée à l'ouverture de la liste ; la rappeler sur la vue par défaut la retire. */
  toggleDefaultView(view: NgTableView): void {
    this.views.toggleDefaultView(view);
  }

  /** Cette vue est-elle la vue par défaut ? */
  isDefaultView(view: NgTableView): boolean {
    return this.views.isDefaultView(view);
  }

  /** Tri, filtres non vides, recherche et page courants. */
  getQueryState(): NgTableQueryState {
    return this.query.getQueryState();
  }

  /**
   * Applique tout ou partie d'un état « requête » (lien partagé, bouton « réinitialiser »,
   * état venu d'un store...). Les parties absentes ne changent pas. `filters`, s'il est
   * fourni, remplace tous les filtres ; les colonnes inconnues sont ignorées. Sans
   * `pageIndex`, un changement de tri/filtre/recherche revient en page 0, comme un clic.
   * En mode `remote`, une seule `remoteQueryChange` est émise.
   */
  applyQueryState(state: Partial<NgTableQueryState>): void {
    this.query.applyQueryState(state);
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
    return this.live.applyTransaction(transaction);
  }

  /**
   * Comme `applyTransaction`, mais regroupée avec les autres transactions reçues pendant
   * `[asyncTransactionWaitMillis]` : un seul recalcul et un seul rendu pour tout le lot.
   * C'est la méthode à utiliser pour des mises à jour à haute fréquence (flux temps réel).
   */
  applyTransactionAsync(transaction: NgTableRowTransaction<T>, callback?: (result: NgTableTransactionResult<T>) => void): void {
    this.live.applyTransactionAsync(transaction, callback);
  }

  /** Applique tout de suite les transactions asynchrones en attente. */
  flushAsyncTransactions(): void {
    this.live.flushAsyncTransactions();
  }

  /** Toutes les vues, au format JSON versionné (même format que le `localStorage`). */
  exportViews(): string {
    return this.views.exportViews();
  }

  /**
   * Importe des vues exportées par `exportViews()` (ou le bouton « Exporter »).
   * `merge` (défaut) : ajoute les vues, en remplaçant celles de même nom ; la vue
   * affichée ne change pas. `replace` : remplace toutes les vues et applique la vue
   * active du fichier. Les vues malformées sont ignorées ; un fichier invalide ne
   * modifie rien. Renvoie le nombre de vues importées.
   */
  importViews(json: string, mode: 'merge' | 'replace' = 'merge'): number {
    return this.views.importViews(json, mode);
  }

  /** Bouton « Exporter » du menu des vues : télécharge un fichier `.json`. */
  downloadViews(): void {
    this.views.downloadViews();
  }

  /**
   * Click on the export button. `remote` mode emits `(remoteExportRequested)`
   * directly (no dialog — the caller owns the whole flow). `local` mode opens the
   * page-range dialog, unless there's only a single exportable page, in which case
   * it exports immediately.
   */
  openExportDialog(): void {
    this.exporting.openExportDialog();
  }

  /** Replie tous les groupes (regroupement actif). */
  collapseAllGroups(): void {
    this.grouping.collapseAllGroups();
  }

  /** Déplie tous les groupes. */
  expandAllGroups(): void {
    this.grouping.expandAllGroups();
  }

  /**
   * Déplace une colonne d'un cran sans glisser (boutons du menu Colonnes) : alternative au glisser-déposer pour qui
   * ne peut que cliquer ou toucher (WCAG 2.5.7).
   */
  moveColumnBy(column: NgTableColumn<T>, delta: -1 | 1): void {
    this.columnMove.moveColumnBy(column, delta);
  }

  /**
   * Modèle par blocs : oublie les blocs chargés et redemande ceux affichés (par exemple
   * après une modification des données côté serveur). Garde la position de défilement.
   */
  refreshRemoteDatasource(): void {
    this.remote.refreshRemoteDatasource();
  }

  /** Nombre total de lignes côté serveur en modèle par blocs (`null` avant la première réponse). */
  remoteRowCount(): number | null {
    return this.remote.remoteRowCount();
  }

  constructor() {
    // Sans [dir], le tableau suit le sens de lecture de la page : la directive Dir (hôte) fournirait sinon ltr aux
    // descendants, même sur une page de droite à gauche.
    inject(Dir, {self: true}).dir = inject(Directionality, {skipSelf: true, optional: true})?.value ?? 'ltr';
    this.data.reportComputing();
    this.filtering.debounceTypedFilters();
    this.filtering.followGlobalSearchInput();
    this.filtering.followFiltersInput();
    this.columnLayout.followVisibilityAndOrderInputs();
    this.columnLayout.reconcileWithColumns();
    this.columnLayout.reconcileColumnWidths();
    this.filtering.repositionOpenMenuOnRowsChange();
    this.paging.reportFilteredCount();
    this.keyboard.keepTabStopsAfterRender();
    this.columnLayout.observeHostWidth();
    this.sticky.measureAfterRender();
    this.columnLayout.autoSizeOnFirstRows();
    this.viewport.measureAfterRender();
    this.sorting.animateAfterRender();
    this.viewport.observeRowHeights();
    this.filtering.followAdvancedFilter();
    this.live.flushOnResume();
    this.focus.restoreLostFocus();
    this.grouping.resetOnGroupingChange();
    this.remote.resetOnDatasourceChange();
    this.remote.loadBlocksOnScroll();
    this.cellEditing.resetHistoryOnLimitChange();
    this.range.clearWhenPositionsChange();
    this.query.reportStateChanges();
    this.paging.clampPageIndex();
    this.filtering.preloadInlineFilterOptions();
    this.views.applyInitialViewOnce();
  }

  ngOnDestroy(): void {
    this.range.detachRangeDragListeners();
    this.live.dispose();
    this.markers.dispose();
    this.columnResize.stopResize();
    this.viewport.stopScrollTracking();
    this.data.dispose();
    this.rowMenu.dispose();
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    this.columnLayout.isMobileView.set(window.innerWidth <= 760);
    this.filtering.requestFilterPositionUpdate();
  }

  /**
   * Met à jour la région `aria-live` (WCAG 4.1.3) : sans elle, un utilisateur de
   * lecteur d'écran qui trie ou filtre ne sait pas que la liste a changé.
   * @internal
   */
  announce(parts: string[]): void {
    const text = parts.filter(Boolean).join('. ');
    if (!text) {
      return;
    }
    // Un texte identique ne modifie pas le DOM, donc n'est pas relu : on alterne un espace insécable.
    this.liveAnnouncement.update((previous) => (previous === text ? text + NBSP : text));
  }
}
