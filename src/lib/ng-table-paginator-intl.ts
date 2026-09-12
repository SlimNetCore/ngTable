import {Injectable, Provider} from '@angular/core';
import {MatPaginatorIntl} from '@angular/material/paginator';

/**
 * `MatPaginatorIntl` en français — pour votre propre `<mat-paginator>` externe
 * (`ng-table` ne rend pas de pagination lui-même : voir "Mode local / distant"
 * et "Pagination" dans le README pour le brancher).
 *
 * `<mat-paginator>` a son propre mécanisme d'i18n, entièrement séparé des
 * `labels`/`provideNgTableLabels()` de `ng-table` — sans ceci, ses textes
 * ("Items per page", "of"...) restent en anglais même si le reste de la table
 * est traduit.
 */
@Injectable()
export class NgTablePaginatorIntl extends MatPaginatorIntl {
  override itemsPerPageLabel = 'Éléments par page';
  override nextPageLabel = 'Page suivante';
  override previousPageLabel = 'Page précédente';
  override firstPageLabel = 'Première page';
  override lastPageLabel = 'Dernière page';

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) {
      return `0 sur ${length}`;
    }
    const startIndex = page * pageSize;
    const endIndex = Math.min(startIndex + pageSize, length);
    return `${startIndex + 1} – ${endIndex} sur ${length}`;
  };
}

/**
 * Fournit `NgTablePaginatorIntl` à la place du `MatPaginatorIntl` par défaut
 * (anglais) d'Angular Material.
 *
 * ```ts
 * // Pour toute l'application (app.config.ts)
 * export const appConfig: ApplicationConfig = {
 *   providers: [provideNgTablePaginatorIntl()],
 * };
 *
 * // Ou juste pour le composant qui affiche le <mat-paginator>
 * @Component({
 *   providers: [provideNgTablePaginatorIntl()],
 *   ...
 * })
 * ```
 *
 * Pour surcharger un texte ponctuellement, étendez la classe plutôt que
 * d'appeler cette fonction :
 *
 * ```ts
 * class MyPaginatorIntl extends NgTablePaginatorIntl {
 *   override itemsPerPageLabel = 'Lignes par page';
 * }
 * providers: [{provide: MatPaginatorIntl, useClass: MyPaginatorIntl}]
 * ```
 */
export function provideNgTablePaginatorIntl(): Provider {
  return {provide: MatPaginatorIntl, useClass: NgTablePaginatorIntl};
}
