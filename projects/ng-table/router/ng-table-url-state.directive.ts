import {afterNextRender, DestroyRef, Directive, inject, input} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {ActivatedRoute, ParamMap, Router} from '@angular/router';
import {NgTableComponent, NgTableQueryState} from '@sbourahla/ng-table';
import {fromUrlParams, sameUrlState, toUrlParams} from './url-state';

/**
 * Synchronise le tri, les filtres, la recherche et la page d'un `<ng-table>` avec
 * les paramètres de l'URL : un lien copié rouvre la liste dans le même état, et
 * Précédent / Suivant du navigateur naviguent entre les états.
 *
 * ```html
 * <ng-table ngTableUrlState ... />
 * <ng-table [ngTableUrlState]="'cmd'" ... />   <!-- préfixe : cmd.s, cmd.q, cmd.f.statut... -->
 * ```
 *
 * Au chargement, l'état de l'URL l'emporte sur la vue par défaut / la dernière vue
 * active. Les changements remplacent l'entrée d'historique courante (`replaceUrl`),
 * pour ne pas empiler une entrée par frappe dans la recherche.
 */
@Directive({
  selector: 'ng-table[ngTableUrlState]',
  standalone: true,
})
export class NgTableUrlStateDirective {
  /** Préfixe des paramètres d'URL (plusieurs tables sur une même page). */
  readonly ngTableUrlState = input<string>('');

  private readonly table = inject(NgTableComponent);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  /** Taille de page initiale : omise de l'URL tant qu'elle n'a pas changé. */
  private defaultPageSize = 10;
  /** Rien n'est écrit dans l'URL avant d'avoir appliqué l'état qu'elle contient. */
  private ready = false;

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      this.defaultPageSize = this.table.pageSize();
      this.applyFromUrl(this.route.snapshot.queryParamMap, true);
      this.ready = true;
    });

    // Précédent / Suivant, ou lien interne vers la même page avec d'autres paramètres.
    this.route.queryParamMap.pipe(takeUntilDestroyed(destroyRef)).subscribe((params) => {
      if (this.ready) {
        this.applyFromUrl(params, false);
      }
    });

    const subscription = this.table.queryStateChange.subscribe((state) => {
      if (this.ready) {
        this.writeToUrl(state);
      }
    });
    destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  private applyFromUrl(params: ParamMap, initial: boolean): void {
    const fromUrl = fromUrlParams(this.paramsRecord(params), this.ngTableUrlState(), this.defaultPageSize);
    if (sameUrlState(fromUrl, this.table.getQueryState(), this.ngTableUrlState(), this.defaultPageSize)) {
      return;
    }
    // Au démarrage, une URL sans paramètre de table ne doit pas effacer une vue restaurée.
    if (initial && !this.hasOwnParams(params)) {
      this.writeToUrl(this.table.getQueryState());
      return;
    }
    this.table.applyQueryState(fromUrl);
  }

  private writeToUrl(state: NgTableQueryState): void {
    const current = this.route.snapshot.queryParams;
    const fromUrl = fromUrlParams(this.paramsRecord(this.route.snapshot.queryParamMap), this.ngTableUrlState(), this.defaultPageSize);
    if (sameUrlState(fromUrl, state, this.ngTableUrlState(), this.defaultPageSize)) {
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: toUrlParams(state, this.ngTableUrlState(), this.defaultPageSize, current),
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private hasOwnParams(params: ParamMap): boolean {
    const own = toUrlParams(
      {sorts: [], filters: {}, search: '', pageIndex: 0, pageSize: this.defaultPageSize, groupBy: null, collapsedGroups: []},
      this.ngTableUrlState(),
      this.defaultPageSize,
      Object.fromEntries(params.keys.map((key) => [key, true])),
    );
    return Object.keys(own).length > 0;
  }

  private paramsRecord(params: ParamMap): Record<string, string | undefined> {
    return Object.fromEntries(params.keys.map((key) => [key, params.get(key) ?? undefined]));
  }
}
