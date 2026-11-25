import {computed, inject, InjectionToken, Provider, Signal, isSignal} from '@angular/core';

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
  /** Noms accessibles précis : `{field}` est le titre de la colonne, `{name}` la valeur de la première colonne de la ligne. */
  filterActiveOn: string;
  clearFilterOf: string;
  selectRowNamed: string;
  linkOpensNewTab: string;
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
  /** Liste vide à cause des filtres ou de la recherche (un bouton propose de les réinitialiser). */
  noDataFiltered: string;
  /** Nom accessible d'une note en étoiles (`cell: {type: 'rating'}`) ; `{value}` et `{max}`. */
  ratingLabel: string;
  /** Constructeur de filtres avancés (`ng-table-filter-builder`). */
  filterBuilderLabel: string;
  filterBuilderAll: string;
  filterBuilderAny: string;
  filterBuilderAnd: string;
  filterBuilderOr: string;
  filterBuilderNot: string;
  filterBuilderColumn: string;
  filterBuilderValue: string;
  filterBuilderAddCondition: string;
  filterBuilderAddGroup: string;
  filterBuilderRemove: string;
  filterBuilderRemoveGroup: string;
  filterBuilderClear: string;
  /** Filtre par ensemble : case « tout » en tête de liste. */
  selectAll: string;
  /** Filtre par ensemble : libellé des cellules vides. */
  blanks: string;
  /** Filtre par ensemble : la liste est tronquée (trop de valeurs distinctes ou de cases à montrer). */
  setFilterTruncated: string;
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
  /** Bouton « Grouper » de la barre d'actions. */
  groupButton: string;
  /** Entrée « aucun regroupement » du menu « Grouper ». */
  groupNone: string;
  /** Nombre de lignes d'un groupe ; `{count}`. */
  groupCount: string;
  /** Libellé d'un groupe dont la valeur est vide. */
  groupEmpty: string;
  /** Panneau de regroupement : nom accessible, invite, retrait d'un niveau (`{column}`), ajout d'un niveau. */
  groupPanelLabel: string;
  groupPanelHint: string;
  groupRemove: string;
  groupAdd: string;
  /** Menu « Grouper » : déplier tous les groupes. */
  expandAllGroups: string;
  /** Menu « Grouper » : replier tous les groupes. */
  collapseAllGroups: string;
  /** Préfixes des agrégats (`NgTableColumn.aggregate`). */
  aggregateSum: string;
  aggregateAvg: string;
  aggregateMin: string;
  aggregateMax: string;
  aggregateCount: string;
  /** Libellé de la ligne de totaux (`[showTotals]`). */
  totalsLabel: string;
  /** Modèle par blocs : texte des lignes dont le bloc n'a pas pu être chargé. */
  blockLoadError: string;
  /** Édition : texte saisi qui n'est pas un nombre. */
  editInvalidNumber: string;
  /** Édition : texte saisi qui n'est pas une date AAAA-MM-JJ. */
  editInvalidDate: string;
  /** Annonce lecteur d'écran après une édition ; `{column}` = en-tête de la colonne. */
  announceCellEdited: string;
  /** Annonces aux lecteurs d'écran (région `aria-live`). `{count}` et `{name}` sont remplacés. */
  announceCopied: string;
  announceCellsCopied: string;
  announceCellsEdited: string;
  announceValuesRejected: string;
  announceRowsSelected: string;
  announceViewApplied: string;
  announceRemoteQuery: string;
  announceExportStarted: string;
  announceEditUndone: string;
  announceEditRedone: string;
  /** Barre d'état. `{count}` et `{total}` sont remplacés. */
  statusBarLabel: string;
  statusRows: string;
  statusRowsOf: string;
  statusSelected: string;
  /** Barre d'actions de sélection : nom accessible, nombre de lignes, désélection, tout sélectionner, autres actions. */
  selectionBarLabel: string;
  /** Texte à côté du nombre de lignes (le nombre est dans la pastille) : « ligne sélectionnée » / « lignes sélectionnées ». */
  selectionCountOne: string;
  selectionCountMany: string;
  selectionClear: string;
  selectionSelectAll: string;
  selectionMore: string;
  statusCells: string;
  statusSum: string;
  statusAvg: string;
  statusMin: string;
  statusMax: string;
  /** Panneau latéral. */
  sidePanelButton: string;
  sidePanelTitle: string;
  sidePanelColumns: string;
  sidePanelFilters: string;
  sidePanelNoFilters: string;
  sidePanelClose: string;
  sidePanelPin: string;
  /** Arbre : `{row}` n'est pas utilisé, les libellés sont génériques. */
  treeExpand: string;
  treeCollapse: string;
  /** Bouton natif du master/detail. */
  detailExpand: string;
  detailCollapse: string;
  /** En-tête (lu par les lecteurs d'écran) de la colonne du bouton de détail. */
  detailColumn: string;
  /** Paginateur intégré. `{from}`, `{to}` et `{total}` sont remplacés. */
  paginatorLabel: string;
  paginatorItemsPerPage: string;
  paginatorFirst: string;
  paginatorPrevious: string;
  paginatorNext: string;
  paginatorLast: string;
  paginatorRange: string;
  paginatorRangeEmpty: string;
  /** Glisser-déposer de lignes. `{position}` = nouvelle position (à partir de 1). */
  rowDragHandle: string;
  announceRowMoved: string;
  /** Déplacer et ajuster sans glisser (menu Colonnes, poignées) ; `{column}` et `{position}` sont remplacés. */
  moveColumnEarlier: string;
  moveColumnLater: string;
  autoFitColumn: string;
  announceColumnMoved: string;
  /** Mode live : bouton de suspension des mises à jour (`[livePauseButton]`) et annonces associées. */
  livePause: string;
  liveResume: string;
  announceLivePaused: string;
  announceLiveResumed: string;
  /** Tri multi-niveaux sans Maj+clic : bouton d'en-tête. `{column}` est le titre de la colonne. */
  addSortLevel: string;
  changeSortLevel: string;
  /** Dit après « N lignes sélectionnées » la première fois : le raccourci qui mène à la barre d'actions. */
  selectionBarHint: string;
  announceViewSaved: string;
  announceViewDeleted: string;
  announceAllCollapsed: string;
  announceAllExpanded: string;
  /** Textes de `<ng-table-pivot>` (son entrée `[labels]` reste prioritaire). */
  pivotFields: string;
  pivotRows: string;
  pivotColumns: string;
  pivotValues: string;
  pivotDropHere: string;
  pivotRemove: string;
  pivotAdd: string;
  pivotAggregate: string;
  pivotLoading: string;
  pivotError: string;
  pivotRetry: string;
  pivotSum: string;
  pivotAvg: string;
  pivotMin: string;
  pivotMax: string;
  pivotCount: string;
  /** Textes de la barre de zoom de `<ng-table-chart>` (son entrée `[zoomTexts]` reste prioritaire). */
  chartZoomToolbar: string;
  chartZoomIn: string;
  chartZoomOut: string;
  chartPanLeft: string;
  chartPanRight: string;
  chartZoomReset: string;
  chartDecimated: string;
  announceRowPicked: string;
  announceFillArmed: string;
  announceMoveCancelled: string;
}

export const NG_TABLE_DEFAULT_LABELS: NgTableLabels = {
  columnsButton: 'Colonnes',
  viewsButton: 'Vues',
  resetFiltersButton: 'Réinitialiser les filtres',
  clearFilter: 'Effacer le filtre',
  activeFilters: 'Filtres actifs',
  filterBy: 'Filtrer par {field}',
  filterActiveOn: 'Filtre actif sur {field} : modifier',
  clearFilterOf: 'Effacer le filtre : {field}',
  selectRowNamed: 'Sélectionner la ligne {name}',
  linkOpensNewTab: 'nouvel onglet',
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
  noDataFiltered: 'Aucune ligne ne correspond aux filtres',
  ratingLabel: '{value} sur {max}',
  filterBuilderLabel: 'Filtre avancé',
  filterBuilderAll: 'Toutes les conditions (ET)',
  filterBuilderAny: 'Au moins une condition (OU)',
  filterBuilderAnd: 'ET',
  filterBuilderOr: 'OU',
  filterBuilderNot: 'Sauf',
  filterBuilderColumn: 'Colonne',
  filterBuilderValue: 'Valeur',
  filterBuilderAddCondition: 'Ajouter une condition',
  filterBuilderAddGroup: 'Ajouter un groupe',
  filterBuilderRemove: 'Retirer la condition',
  filterBuilderRemoveGroup: 'Retirer le groupe',
  filterBuilderClear: 'Tout effacer',
  selectAll: '(Tout sélectionner)',
  blanks: '(Vides)',
  setFilterTruncated: 'Liste tronquée : affinez avec la recherche.',
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
  groupButton: 'Grouper',
  groupNone: 'Aucun regroupement',
  groupCount: '{count} ligne(s)',
  groupEmpty: '(vide)',
  groupPanelLabel: 'Regroupement des lignes',
  groupPanelHint: 'Glissez une colonne ici pour regrouper',
  groupRemove: 'Retirer le regroupement par {column}',
  groupAdd: 'Ajouter un niveau de regroupement',
  expandAllGroups: 'Tout déplier',
  collapseAllGroups: 'Tout replier',
  aggregateSum: 'Σ',
  aggregateAvg: 'Moy.',
  aggregateMin: 'Min',
  aggregateMax: 'Max',
  aggregateCount: 'Nb',
  totalsLabel: 'Total',
  blockLoadError: 'Chargement impossible',
  editInvalidNumber: 'Nombre invalide',
  editInvalidDate: 'Date invalide (AAAA-MM-JJ)',
  announceCellEdited: 'Cellule « {column} » modifiée',
  announceCopied: 'Copié',
  announceCellsCopied: '{count} cellule(s) copiée(s)',
  announceCellsEdited: '{count} cellule(s) modifiée(s)',
  announceValuesRejected: '{count} valeur(s) refusée(s)',
  announceRowsSelected: '{count} ligne(s) sélectionnée(s)',
  announceViewApplied: 'Vue « {name} » appliquée',
  announceRemoteQuery: 'Filtres appliqués, chargement des résultats',
  announceExportStarted: 'Export lancé',
  announceEditUndone: 'Modification annulée',
  announceEditRedone: 'Modification rétablie',
  statusBarLabel: 'Barre d’état',
  statusRows: '{count} lignes',
  statusRowsOf: '{count} sur {total} lignes',
  statusSelected: '{count} sélectionnée(s)',
  selectionBarLabel: 'Actions sur la sélection',
  selectionCountOne: 'ligne sélectionnée',
  selectionCountMany: 'lignes sélectionnées',
  selectionClear: 'Tout désélectionner',
  selectionSelectAll: 'Tout sélectionner ({count})',
  selectionMore: 'Autres actions',
  statusCells: '{count} cellules',
  statusSum: 'Somme',
  statusAvg: 'Moyenne',
  statusMin: 'Min',
  statusMax: 'Max',
  sidePanelButton: 'Panneau',
  sidePanelTitle: 'Panneau latéral',
  sidePanelColumns: 'Colonnes',
  sidePanelFilters: 'Filtres',
  sidePanelNoFilters: 'Aucun filtre actif',
  sidePanelClose: 'Fermer le panneau',
  sidePanelPin: 'Fixer le panneau à droite',
  treeExpand: 'Déplier',
  treeCollapse: 'Replier',
  detailExpand: 'Afficher le détail',
  detailCollapse: 'Masquer le détail',
  detailColumn: 'Détail',
  paginatorLabel: 'Pagination',
  paginatorItemsPerPage: 'Éléments par page',
  paginatorFirst: 'Première page',
  paginatorPrevious: 'Page précédente',
  paginatorNext: 'Page suivante',
  paginatorLast: 'Dernière page',
  paginatorRange: '{from} – {to} sur {total}',
  paginatorRangeEmpty: '0 sur {total}',
  rowDragHandle: 'Déplacer la ligne (Alt + flèches haut / bas)',
  announceRowMoved: 'Ligne déplacée en position {position}',
  moveColumnEarlier: 'Déplacer « {column} » vers le début',
  moveColumnLater: 'Déplacer « {column} » vers la fin',
  autoFitColumn: 'Ajuster la largeur de « {column} » à son contenu',
  announceColumnMoved: 'Colonne « {column} » en position {position}',
  livePause: 'Suspendre les mises à jour',
  liveResume: 'Reprendre les mises à jour',
  announceLivePaused: 'Mises à jour suspendues',
  announceLiveResumed: 'Mises à jour reprises',
  addSortLevel: 'Ajouter {column} au tri',
  changeSortLevel: 'Tri multiple : changer le sens de {column}',
  selectionBarHint: 'F6 : barre d’actions',
  announceViewSaved: 'Vue « {name} » enregistrée',
  announceViewDeleted: 'Vue « {name} » supprimée',
  announceAllCollapsed: 'Tout est replié',
  announceAllExpanded: 'Tout est déplié',
  pivotFields: 'Champs',
  pivotRows: 'Lignes',
  pivotColumns: 'Colonnes',
  pivotValues: 'Valeurs',
  pivotDropHere: 'Glissez un champ ici',
  pivotRemove: 'Retirer {field}',
  pivotAdd: 'Ajouter à {zone}',
  pivotAggregate: 'Agrégat de {field}',
  pivotLoading: 'Calcul du pivot…',
  pivotError: 'Le pivot n’a pas pu être calculé.',
  pivotRetry: 'Réessayer',
  pivotSum: 'Somme',
  pivotAvg: 'Moyenne',
  pivotMin: 'Minimum',
  pivotMax: 'Maximum',
  pivotCount: 'Nombre',
  chartZoomToolbar: 'Zoom du graphique',
  chartZoomIn: 'Zoomer',
  chartZoomOut: 'Dézoomer',
  chartPanLeft: 'Vers la gauche',
  chartPanRight: 'Vers la droite',
  chartZoomReset: 'Tout',
  chartDecimated: 'Points écartés pour rester lisible : zoomez pour tout voir',
  announceRowPicked: 'Ligne saisie. Cliquez la poignée de la ligne de destination, ou de nouveau celle-ci pour annuler.',
  announceFillArmed: 'Recopie prête. Cliquez la dernière cellule à remplir, ou Échap pour annuler.',
  announceMoveCancelled: 'Annulé',
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
  filterActiveOn: 'Filter active on {field}: edit',
  clearFilterOf: 'Clear filter: {field}',
  selectRowNamed: 'Select row {name}',
  linkOpensNewTab: 'new tab',
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
  noDataFiltered: 'No rows match the filters',
  ratingLabel: '{value} out of {max}',
  filterBuilderLabel: 'Advanced filter',
  filterBuilderAll: 'All conditions (AND)',
  filterBuilderAny: 'Any condition (OR)',
  filterBuilderAnd: 'AND',
  filterBuilderOr: 'OR',
  filterBuilderNot: 'Not',
  filterBuilderColumn: 'Column',
  filterBuilderValue: 'Value',
  filterBuilderAddCondition: 'Add condition',
  filterBuilderAddGroup: 'Add group',
  filterBuilderRemove: 'Remove condition',
  filterBuilderRemoveGroup: 'Remove group',
  filterBuilderClear: 'Clear all',
  selectAll: '(Select all)',
  blanks: '(Blanks)',
  setFilterTruncated: 'List truncated: narrow it down with the search.',
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
  groupButton: 'Group',
  groupNone: 'No grouping',
  groupCount: '{count} row(s)',
  groupEmpty: '(empty)',
  groupPanelLabel: 'Row grouping',
  groupPanelHint: 'Drag a column here to group',
  groupRemove: 'Stop grouping by {column}',
  groupAdd: 'Add a grouping level',
  expandAllGroups: 'Expand all',
  collapseAllGroups: 'Collapse all',
  aggregateSum: 'Σ',
  aggregateAvg: 'Avg',
  aggregateMin: 'Min',
  aggregateMax: 'Max',
  aggregateCount: 'Count',
  totalsLabel: 'Total',
  blockLoadError: 'Could not load rows',
  editInvalidNumber: 'Invalid number',
  editInvalidDate: 'Invalid date (YYYY-MM-DD)',
  announceCellEdited: 'Cell "{column}" edited',
  announceCopied: 'Copied',
  announceCellsCopied: '{count} cell(s) copied',
  announceCellsEdited: '{count} cell(s) edited',
  announceValuesRejected: '{count} value(s) rejected',
  announceRowsSelected: '{count} row(s) selected',
  announceViewApplied: 'View "{name}" applied',
  announceRemoteQuery: 'Filters applied, loading results',
  announceExportStarted: 'Export started',
  announceEditUndone: 'Edit undone',
  announceEditRedone: 'Edit redone',
  statusBarLabel: 'Status bar',
  statusRows: '{count} rows',
  statusRowsOf: '{count} of {total} rows',
  statusSelected: '{count} selected',
  selectionBarLabel: 'Actions on the selection',
  selectionCountOne: 'row selected',
  selectionCountMany: 'rows selected',
  selectionClear: 'Clear selection',
  selectionSelectAll: 'Select all ({count})',
  selectionMore: 'More actions',
  statusCells: '{count} cells',
  statusSum: 'Sum',
  statusAvg: 'Average',
  statusMin: 'Min',
  statusMax: 'Max',
  sidePanelButton: 'Panel',
  sidePanelTitle: 'Side panel',
  sidePanelColumns: 'Columns',
  sidePanelFilters: 'Filters',
  sidePanelNoFilters: 'No active filter',
  sidePanelClose: 'Close panel',
  sidePanelPin: 'Dock the panel on the right',
  treeExpand: 'Expand',
  treeCollapse: 'Collapse',
  detailExpand: 'Show details',
  detailCollapse: 'Hide details',
  detailColumn: 'Details',
  paginatorLabel: 'Pagination',
  paginatorItemsPerPage: 'Items per page',
  paginatorFirst: 'First page',
  paginatorPrevious: 'Previous page',
  paginatorNext: 'Next page',
  paginatorLast: 'Last page',
  paginatorRange: '{from} – {to} of {total}',
  paginatorRangeEmpty: '0 of {total}',
  rowDragHandle: 'Move row (Alt + up / down arrows)',
  announceRowMoved: 'Row moved to position {position}',
  moveColumnEarlier: 'Move "{column}" towards the start',
  moveColumnLater: 'Move "{column}" towards the end',
  autoFitColumn: 'Fit the width of "{column}" to its content',
  announceColumnMoved: 'Column "{column}" at position {position}',
  livePause: 'Pause updates',
  liveResume: 'Resume updates',
  announceLivePaused: 'Updates paused',
  announceLiveResumed: 'Updates resumed',
  addSortLevel: 'Add {column} to the sort',
  changeSortLevel: 'Multi-sort: change the direction of {column}',
  selectionBarHint: 'F6: action bar',
  announceViewSaved: 'View "{name}" saved',
  announceViewDeleted: 'View "{name}" deleted',
  announceAllCollapsed: 'All collapsed',
  announceAllExpanded: 'All expanded',
  pivotFields: 'Fields',
  pivotRows: 'Rows',
  pivotColumns: 'Columns',
  pivotValues: 'Values',
  pivotDropHere: 'Drop a field here',
  pivotRemove: 'Remove {field}',
  pivotAdd: 'Add to {zone}',
  pivotAggregate: 'Aggregate of {field}',
  pivotLoading: 'Computing pivot…',
  pivotError: 'The pivot could not be computed.',
  pivotRetry: 'Retry',
  pivotSum: 'Sum',
  pivotAvg: 'Average',
  pivotMin: 'Minimum',
  pivotMax: 'Maximum',
  pivotCount: 'Count',
  chartZoomToolbar: 'Chart zoom',
  chartZoomIn: 'Zoom in',
  chartZoomOut: 'Zoom out',
  chartPanLeft: 'Pan left',
  chartPanRight: 'Pan right',
  chartZoomReset: 'All',
  chartDecimated: 'Points dropped to stay readable: zoom in to see them all',
  announceRowPicked: 'Row picked. Click the handle of the destination row, or this one again to cancel.',
  announceFillArmed: 'Fill ready. Click the last cell to fill, or Escape to cancel.',
  announceMoveCancelled: 'Cancelled',
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

/**
 * Labels de l'application pour les composants qui vivent à côté de la table (pivot, graphique, liste déroulante) :
 * les défauts, recouverts par `provideNgTableLabels`. À appeler dans un contexte d'injection.
 */
export function injectNgTableLabels(): Signal<NgTableLabels> {
  const source = inject(NG_TABLE_LABELS, {optional: true});
  return computed(() => ({...NG_TABLE_DEFAULT_LABELS, ...resolveNgTableLabelsSource(source)}), {equal: ngTableLabelsEqual});
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
