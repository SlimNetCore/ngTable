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
  /** Tooltip du bouton de suppression d'une vue. */
  deleteView: string;
  /** Message affiché quand aucune vue n'est enregistrée. */
  noSavedViews: string;
  /** Tooltip de la poignée de réorganisation des colonnes. */
  dragToReorder: string;
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
  deleteView: 'Supprimer la vue',
  noSavedViews: 'Aucune vue enregistrée',
  dragToReorder: 'Glisser pour réordonner',
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
