import {InjectionToken, Provider, Signal, isSignal} from '@angular/core';

/**
 * Tous les textes affichés par `ng-table` (aucune dépendance i18n externe).
 * Fournissez `[labels]` avec seulement les clés à surcharger — le reste garde
 * `NG_TABLE_DEFAULT_LABELS`.
 */
export interface NgTableLabels {
  columnsButton: string;
  viewsButton: string;
  resetFiltersButton: string;
  clearFilter: string;
  activeFilters: string;
  /** Interpolé : `{field}` est remplacé par le libellé de la colonne. */
  filterBy: string;
  refOptionsLoading: string;
  refOptionsEmpty: string;
  refOptionsLoadError: string;
  dateStart: string;
  dateEnd: string;
  ok: string;
  cancel: string;
  all: string;
  search: string;
  noData: string;
  sort: string;
  sortAsc: string;
  sortDesc: string;
  copy: string;
  yes: string;
  no: string;
  /** Placeholder du champ "nom de la vue" (bloc Vues). */
  viewNamePlaceholder: string;
  /** Tooltip du bouton d'enregistrement d'une vue. */
  saveView: string;
  /** Tooltip du bouton de mise à jour d'une vue existante avec l'affichage actuel. */
  updateView: string;
  /** Tooltip du bouton de suppression d'une vue. */
  deleteView: string;
  /** Message affiché quand aucune vue n'est enregistrée. */
  noSavedViews: string;
  /** Tooltip de la poignée de réorganisation des colonnes. */
  dragToReorder: string;
  /** Libellé du bouton d'export. */
  exportButton: string;
  /** Titre de la boîte de dialogue de choix de plage de pages (export local). */
  exportDialogTitle: string;
  /** Libellé précédant le sélecteur "page de début". */
  exportFromPage: string;
  /** Libellé précédant le sélecteur "page de fin". */
  exportToPage: string;
  /** Libellé du bouton de confirmation de l'export. */
  exportConfirm: string;
  /** `aria-label` de l'overlay de chargement. */
  loading: string;
  /** `aria-label` par défaut du `<table>` quand `[ariaLabel]` n'est pas fourni. */
  tableLabel: string;
  /** `aria-label` de la case "tout sélectionner" (en-tête). */
  selectAllRows: string;
  /** `aria-label` d'une case de sélection de ligne. Interpolé : `{index}` = numéro de ligne (1-based). */
  selectRow: string;
  /** `aria-label` de la poignée de réorganisation d'une colonne (glisser-déposer ou flèches gauche/droite au clavier). */
  dragHandleLabel: string;
  /** `aria-label` de la poignée de redimensionnement d'une colonne (glisser ou flèches gauche/droite au clavier). */
  resizeHandleLabel: string;
  /** Placeholder de la borne basse d'un filtre `numberRange`. */
  numberMin: string;
  /** Placeholder de la borne haute d'un filtre `numberRange`. */
  numberMax: string;
  /** Placeholder du champ de recherche globale. */
  globalSearchPlaceholder: string;
  /** Nom accessible du champ de recherche globale, et libellé de sa pastille dans la barre des filtres actifs. */
  globalSearchLabel: string;
  /** Bouton d'effacement de la recherche globale. */
  clearGlobalSearch: string;
  /** Bouton étoile d'une vue qui n'est pas la vue par défaut. */
  setDefaultView: string;
  /** Bouton étoile de la vue par défaut (la retirer). */
  unsetDefaultView: string;
  /** Bouton d'export des vues (fichier JSON). */
  exportViews: string;
  /** Bouton d'import des vues. */
  importViews: string;
  /** Message après un import réussi ; `{count}` = nombre de vues importées. */
  viewsImported: string;
  /** Message après l'import d'un fichier invalide. */
  viewsImportInvalid: string;
  /** Annonce lecteur d'écran après un tri croissant ; `{column}` = en-tête de la colonne. */
  announceSortAsc: string;
  /** Annonce lecteur d'écran après un tri décroissant. */
  announceSortDesc: string;
  /** Annonce lecteur d'écran quand le tri est retiré. */
  announceSortCleared: string;
  /** Annonce lecteur d'écran du nombre de lignes après un tri/filtre (mode local) ; `{count}`. */
  announceRowCount: string;
  /** Annonce lecteur d'écran quand plus aucune ligne ne correspond (mode local). */
  announceNoRows: string;
  /** Rang d'une colonne parmi plusieurs niveaux de tri, ajouté au libellé du bouton de tri ; `{priority}`. */
  sortPriority: string;
  /** Infobulle des en-têtes triables quand `[multiSort]` est actif. */
  multiSortHint: string;
  /** Punaise du menu « Colonnes » : fixer la colonne à gauche ; `{column}` = en-tête. */
  setReferenceColumn: string;
  /** Punaise de la colonne de référence actuelle : la libérer ; `{column}` = en-tête. */
  unsetReferenceColumn: string;
}

export const NG_TABLE_DEFAULT_LABELS: NgTableLabels = {
  columnsButton: 'Colonnes',
  viewsButton: 'Vues',
  resetFiltersButton: 'Réinitialiser les filtres',
  clearFilter: 'Effacer le filtre',
  activeFilters: 'Filtres actifs',
  filterBy: 'Filtrer par {field}',
  refOptionsLoading: 'Chargement des options...',
  refOptionsEmpty: 'Aucune option chargée.',
  refOptionsLoadError: 'Erreur de chargement des options.',
  dateStart: 'Date début',
  dateEnd: 'Date fin',
  ok: 'OK',
  cancel: 'Annuler',
  all: 'Tous',
  search: 'Rechercher',
  noData: 'Aucune donnée',
  sort: 'Trier',
  sortAsc: 'Trié croissant',
  sortDesc: 'Trié décroissant',
  copy: 'Copier',
  yes: 'Oui',
  no: 'Non',
  viewNamePlaceholder: 'Nom de la vue',
  saveView: 'Enregistrer la vue actuelle',
  updateView: 'Mettre à jour cette vue avec l\'affichage actuel',
  deleteView: 'Supprimer la vue',
  noSavedViews: 'Aucune vue enregistrée',
  dragToReorder: 'Glisser pour réordonner',
  exportButton: 'Exporter',
  exportDialogTitle: 'Exporter les données',
  exportFromPage: 'De la page',
  exportToPage: 'à la page',
  exportConfirm: 'Exporter',
  loading: 'Chargement en cours',
  tableLabel: 'Tableau de données',
  selectAllRows: 'Sélectionner toutes les lignes',
  selectRow: 'Sélectionner la ligne {index}',
  dragHandleLabel: 'Réordonner la colonne : glisser-déposer, ou flèches gauche/droite au clavier',
  resizeHandleLabel: 'Redimensionner la colonne : glisser, ou flèches gauche/droite au clavier',
  numberMin: 'Min',
  numberMax: 'Max',
  globalSearchPlaceholder: 'Rechercher…',
  globalSearchLabel: 'Recherche',
  clearGlobalSearch: 'Effacer la recherche',
  setDefaultView: 'Ouvrir la liste sur cette vue',
  unsetDefaultView: 'Ne plus ouvrir la liste sur cette vue',
  exportViews: 'Exporter',
  importViews: 'Importer',
  viewsImported: '{count} vue(s) importée(s)',
  viewsImportInvalid: 'Fichier invalide : aucune vue importée',
  announceSortAsc: '{column}, tri croissant',
  announceSortDesc: '{column}, tri décroissant',
  announceSortCleared: 'Tri retiré',
  announceRowCount: '{count} ligne(s) affichée(s)',
  announceNoRows: 'Aucune ligne ne correspond',
  sortPriority: 'priorité {priority}',
  multiSortHint: 'Maj+clic : ajouter un niveau de tri',
  setReferenceColumn: 'Fixer « {column} » à gauche (colonne de référence)',
  unsetReferenceColumn: 'Ne plus fixer « {column} » à gauche',
};

/**
 * Textes anglais prêts à l'emploi. Typé `NgTableLabels` (et non `Partial`) : le
 * compilateur signale toute clé oubliée quand une nouvelle est ajoutée.
 *
 * ```ts
 * provideNgTableLabels(() => NG_TABLE_LABELS_EN)
 * ```
 */
export const NG_TABLE_LABELS_EN: NgTableLabels = {
  columnsButton: 'Columns',
  viewsButton: 'Views',
  resetFiltersButton: 'Reset filters',
  clearFilter: 'Clear filter',
  activeFilters: 'Active filters',
  filterBy: 'Filter by {field}',
  refOptionsLoading: 'Loading options...',
  refOptionsEmpty: 'No options loaded.',
  refOptionsLoadError: 'Failed to load options.',
  dateStart: 'Start date',
  dateEnd: 'End date',
  ok: 'OK',
  cancel: 'Cancel',
  all: 'All',
  search: 'Search',
  noData: 'No data',
  sort: 'Sort',
  sortAsc: 'Sorted ascending',
  sortDesc: 'Sorted descending',
  copy: 'Copy',
  yes: 'Yes',
  no: 'No',
  viewNamePlaceholder: 'View name',
  saveView: 'Save current view',
  updateView: 'Update this view with the current display',
  deleteView: 'Delete view',
  noSavedViews: 'No saved views',
  dragToReorder: 'Drag to reorder',
  exportButton: 'Export',
  exportDialogTitle: 'Export data',
  exportFromPage: 'From page',
  exportToPage: 'to page',
  exportConfirm: 'Export',
  loading: 'Loading',
  tableLabel: 'Data table',
  selectAllRows: 'Select all rows',
  selectRow: 'Select row {index}',
  dragHandleLabel: 'Reorder column: drag and drop, or left/right arrow keys',
  resizeHandleLabel: 'Resize column: drag, or left/right arrow keys',
  numberMin: 'Min',
  numberMax: 'Max',
  globalSearchPlaceholder: 'Search…',
  globalSearchLabel: 'Search',
  clearGlobalSearch: 'Clear search',
  setDefaultView: 'Open the list on this view',
  unsetDefaultView: 'Stop opening the list on this view',
  exportViews: 'Export',
  importViews: 'Import',
  viewsImported: '{count} view(s) imported',
  viewsImportInvalid: 'Invalid file: no view imported',
  announceSortAsc: '{column}, sorted ascending',
  announceSortDesc: '{column}, sorted descending',
  announceSortCleared: 'Sort cleared',
  announceRowCount: '{count} row(s) shown',
  announceNoRows: 'No matching rows',
  sortPriority: 'priority {priority}',
  multiSortHint: 'Shift+click: add a sort level',
  setReferenceColumn: 'Pin "{column}" to the left (reference column)',
  unsetReferenceColumn: 'Unpin "{column}"',
};

/**
 * Source de labels applicables à toutes les instances de `ng-table` : soit un objet
 * figé, soit un `Signal` (recalculé automatiquement, typiquement au changement de
 * langue) — voir {@link provideNgTableLabels}.
 */
export type NgTableLabelsSource = Partial<NgTableLabels> | Signal<Partial<NgTableLabels>>;

/**
 * Labels par défaut de l'application, injectés dans toutes les instances de `ng-table`.
 * Priorité de résolution : `NG_TABLE_DEFAULT_LABELS` < valeur injectée < `[labels]`.
 */
export const NG_TABLE_LABELS = new InjectionToken<NgTableLabelsSource>('NG_TABLE_LABELS');

/**
 * Déclare les labels de `ng-table` pour toute l'application, une seule fois.
 *
 * La factory s'exécute dans un contexte d'injection : vous pouvez donc y injecter
 * votre service de traduction et renvoyer un `Signal` qui se recalcule au changement
 * de langue — toutes les tables suivent automatiquement, sans binding `[labels]`.
 *
 * ```ts
 * // Statique
 * provideNgTableLabels(() => ({columnsButton: 'Columns', noData: 'No data'}))
 *
 * // Réactif (ex. @ngx-translate/core)
 * provideNgTableLabels(() => {
 *   const translate = inject(TranslateService);
 *   const lang = toSignal(translate.onLangChange, {initialValue: null});
 *   return computed(() => {
 *     lang(); // dépendance : recalcule à chaque changement de langue
 *     return {
 *       columnsButton: translate.instant('NG_TABLE.COLUMNS'),
 *       filterBy: translate.instant('NG_TABLE.FILTER_BY', {field: '{field}'}),
 *     };
 *   });
 * })
 * ```
 */
export function provideNgTableLabels(factory: () => NgTableLabelsSource): Provider {
  return {provide: NG_TABLE_LABELS, useFactory: factory};
}

/** Lit une source de labels, qu'elle soit un objet figé ou un `Signal`. */
export function resolveNgTableLabelsSource(
  source: NgTableLabelsSource | null | undefined,
): Partial<NgTableLabels> {
  if (!source) {
    return {};
  }
  return isSignal(source) ? source() : source;
}

/**
 * Egalité par valeur de deux jeux de labels complets.
 *
 * Utilisé comme `equal` du `computed` des labels effectifs : un consommateur qui écrit
 * `[labels]="{columnsButton: 'X' | translate}"` recrée l'objet à chaque cycle de
 * détection ; sans cette comparaison, chaque cycle propagerait une nouvelle référence
 * aux composants enfants (et invaliderait leur `OnPush`) alors que rien n'a changé.
 */
export function ngTableLabelsEqual(a: NgTableLabels, b: NgTableLabels): boolean {
  if (a === b) {
    return true;
  }
  for (const key of Object.keys(NG_TABLE_DEFAULT_LABELS) as (keyof NgTableLabels)[]) {
    if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}
