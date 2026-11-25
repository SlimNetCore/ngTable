import {TemplateRef, Type} from '@angular/core';
import {Observable} from 'rxjs';
import {ColumnFilterType} from './column-filter-renderer.component';
import {NgTableFilterGroup} from './advanced-filter';
import {NgTableCellFormat} from './cell-format';
import {NgTableSparklineOptions} from './sparkline';
import {RowDropPosition} from './row-drag';
import {NgTableEditorKind} from './cell-edit';
import {NgTableExportFormat} from './export-writers';
import type {StyledXlsxColumn} from './xlsx-styled';
import {NgTableTextOperator} from './filter-matching';

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
export interface NgTableBlockRequest<T = unknown> extends NgTableRemoteQuery {
  /** Première ligne demandée (incluse). */
  startRow: number;
  /** Dernière ligne demandée (exclue). */
  endRow: number;
  /**
   * Signale que la table n'a plus besoin de ce bloc (tri ou filtre changé, zone quittée par un défilement rapide).
   * À transmettre à `fetch` ou à `HttpClient` pour annuler la requête ; l'ignorer est sans danger.
   */
  signal?: AbortSignal;
  /**
   * Pagination par clé : la dernière ligne du bloc précédent, quand la table l'a en mémoire (défilement vers le bas).
   * Le serveur peut alors demander « les lignes après celle-ci » (`WHERE (tri, id) > (...) LIMIT n`) au lieu de
   * « à partir de la ligne n° startRow », lent sur beaucoup de bases quand le décalage est grand. Absente après un
   * saut : utilisez alors `startRow`.
   */
  afterRow?: T;
  /** Pendant de `afterRow` en défilant vers le haut : la première ligne du bloc suivant, quand elle est en mémoire. */
  beforeRow?: T;
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
  getRows(request: NgTableBlockRequest<T>): Promise<NgTableBlockResult<T>> | Observable<NgTableBlockResult<T>>;
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
  source: 'edit' | 'paste' | 'fill' | 'undo' | 'redo';
}

/** Une saisie refusée (nombre ou date illisible, ou `validate` qui renvoie un message). */
export interface NgTableCellEditRejectedEvent<T> {
  row: T;
  column: NgTableColumn<T>;
  /** Texte saisi. */
  value: string;
  error: string;
}

/** Un nœud de l'arbre vient d'être déplié ou replié. */
export interface NgTableTreeToggleEvent<T> {
  row: T;
  expanded: boolean;
}

/** Une ligne vient d'être déplacée par glisser-déposer (ou Alt + flèches sur sa poignée). */
export interface NgTableRowMoveEvent<T> {
  row: T;
  /** Ligne près de laquelle elle a été déposée. */
  target: T;
  position: RowDropPosition;
  /** Position de la ligne avant et après, parmi toutes les lignes (filtrées ou non). */
  fromIndex: number;
  toIndex: number;
  /** Toutes les lignes dans le nouvel ordre : à réinjecter dans `[rows]`. */
  rows: T[];
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
  /** Niveaux de regroupement supplémentaires (après `groupBy`), mode local. */
  groupLevels?: string[];
  /**
   * Groupes repliés (clés, voir `NgTableGroupSummary.key`). Le serveur exclut leurs
   * lignes : un groupe replié n'occupe aucune ligne de la pagination.
   */
  collapsedGroups?: string[];
  /** Filtre avancé (conditions ET / OU, voir `[advancedFilter]`) ; absent s'il n'y en a pas. À appliquer en plus de `filters`. */
  advancedFilter?: NgTableFilterGroup | null;
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
  /**
   * Alignement du texte de la colonne (en-tête, cellules, total). Par défaut : `'end'` pour une colonne de nombres
   * (filtre numérique, ou valeurs de type `number` sans gabarit ni mise en forme), `'start'` sinon.
   */
  align?: 'start' | 'center' | 'end';
  /**
   * Affiche les nombres de la colonne au format de la langue du navigateur (« 989 810,5 »). `true` : deux décimales
   * au plus ; ou des options `Intl.NumberFormat`. L'affichage seul change : tri, filtres, export et copie lisent
   * toujours la valeur. À ne pas mettre sur un identifiant numérique (une année, un code postal).
   */
  numberFormat?: boolean | Intl.NumberFormatOptions;
  /** Affiche les dates (objet `Date`, texte ISO ou nombre de millisecondes) au format de la langue. `true` : date courte. */
  dateFormat?: boolean | Intl.DateTimeFormatOptions;
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
   * Mini-graphique dans la cellule : `valueAccessor` renvoie alors une série de nombres
   * (`[3, 5, 4, 8]`), tracée en courbe, zone ou barres. Pensez à `sortValueAccessor` pour trier.
   */
  sparkline?: NgTableSparklineOptions;
  /**
   * Cellule prête à l'emploi ou mise en forme conditionnelle, sans `cellTemplate` : pastille (`badge`), barre de
   * progression (`progress`), note (`rating`), lien (`link`), avatar (`avatar`), barre de données (`dataBar`),
   * dégradé de couleur (`colorScale`). Un `cellTemplate` garde la priorité.
   */
  cell?: NgTableCellFormat<T>;
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
  exportValueAccessor?: (row: T) => string | number | boolean | Date | null | undefined;
  /**
   * Mise en forme de la colonne dans un export `xlsx` stylé : format de nombre ou de date Excel (`'#,##0.00 "€"'`, `'0.0%'`,
   * `'dd/mm/yyyy'`), largeur en caractères, alignement. Sans elle, le format se déduit du contenu.
   */
  excel?: StyledXlsxColumn;
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
  /** Niveaux de regroupement supplémentaires (voir `groupLevels`). */
  groupLevels?: string[];
  /** Recherche globale. Absente des vues enregistrées avant son ajout (= pas de recherche). */
  search?: string;
  /** Filtre avancé (conditions ET / OU). Absent : pas de filtre avancé. */
  advancedFilter?: NgTableFilterGroup;
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
  /** Niveaux de regroupement supplémentaires, mode local (absent = aucun). */
  groupLevels?: string[];
  /** Clés des groupes repliés. */
  collapsedGroups: string[];
  /**
   * Filtre avancé (conditions ET / OU). Dans `getQueryState()` : présent seulement s'il y en a un. Dans
   * `applyQueryState()` : absent = inchangé, `null` = retiré.
   */
  advancedFilter?: NgTableFilterGroup | null;
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
