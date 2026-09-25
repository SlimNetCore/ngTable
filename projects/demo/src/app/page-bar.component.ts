import {ChangeDetectionStrategy, Component, computed, input, model} from '@angular/core';

/**
 * Paginateur personnalisé de la démo, sans rapport avec Material : il montre qu'on
 * peut brancher n'importe quelle UI de pagination sur ng-table. Il ne connaît que
 * trois choses : le total (post-filtre, fourni par `(filteredCountChange)`), la page
 * et la taille de page (liées en deux sens avec la table).
 */
@Component({
  selector: 'app-page-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;
      margin-top: 8px; padding: 10px 14px; background: #fff; border: 1px solid rgba(15, 23, 42, .13); border-radius: 12px;
      font-size: .85rem; color: #4f6573;
    }
    nav { display: flex; align-items: center; gap: 4px; }
    button {
      min-width: 34px; height: 34px; padding: 0 8px; border: 1px solid rgba(15, 23, 42, .16); border-radius: 8px;
      background: #fff; color: #0d1d26; font: inherit; cursor: pointer;
    }
    button:disabled { opacity: .4; cursor: default; }
    button[aria-current='page'] { background: #1d4f91; border-color: #1d4f91; color: #fff; font-weight: 600; }
    button:focus-visible, select:focus-visible { outline: 2px solid #1d4f91; outline-offset: 2px; }
    .gap { padding: 0 4px; }
    select { height: 34px; margin-left: 6px; border-radius: 8px; border: 1px solid rgba(15, 23, 42, .16); font: inherit; }
  `,
  template: `
    <span>{{ rangeLabel() }}</span>

    <nav aria-label="Pagination">
      <button (click)="goTo(0)" [disabled]="pageIndex() === 0" aria-label="Première page" type="button">«</button>
      <button (click)="goTo(pageIndex() - 1)" [disabled]="pageIndex() === 0" aria-label="Page précédente" type="button">‹</button>
      @for (item of pageItems(); track $index) {
        @if (item === null) {
          <span aria-hidden="true" class="gap">…</span>
        } @else {
          <button (click)="goTo(item)" [attr.aria-current]="item === pageIndex() ? 'page' : null"
                  [attr.aria-label]="'Page ' + (item + 1)" type="button">{{ item + 1 }}</button>
        }
      }
      <button (click)="goTo(pageIndex() + 1)" [disabled]="pageIndex() >= lastPage()" aria-label="Page suivante" type="button">›</button>
      <button (click)="goTo(lastPage())" [disabled]="pageIndex() >= lastPage()" aria-label="Dernière page" type="button">»</button>
    </nav>

    <label>
      Par page
      <select (change)="changeSize($any($event.target).value)" [value]="pageSize()">
        @for (size of sizes(); track size) {
          <option [value]="size">{{ size }}</option>
        }
      </select>
    </label>
  `,
})
export class PageBarComponent {
  /** Nombre total de lignes (après filtres). */
  readonly total = input.required<number>();
  readonly sizes = input<readonly number[]>([10, 25, 50, 100]);
  readonly pageIndex = model(0);
  readonly pageSize = model(25);

  protected readonly lastPage = computed(() => Math.max(0, Math.ceil(this.total() / this.pageSize()) - 1));

  protected readonly rangeLabel = computed(() => {
    const total = this.total();
    if (total === 0) {
      return 'Aucune commande';
    }
    const first = this.pageIndex() * this.pageSize() + 1;
    const last = Math.min(total, first + this.pageSize() - 1);
    return `Commandes ${first}–${last} sur ${total}`;
  });

  /** Pages à afficher : la première, la dernière et deux de part et d'autre de la page courante ; `null` = « … ». */
  protected readonly pageItems = computed<(number | null)[]>(() => {
    const last = this.lastPage();
    const current = this.pageIndex();
    const items: (number | null)[] = [];
    for (let page = 0; page <= last; page++) {
      if (page === 0 || page === last || Math.abs(page - current) <= 2) {
        items.push(page);
      } else if (items.at(-1) !== null) {
        items.push(null);
      }
    }
    return items;
  });

  protected goTo(page: number): void {
    this.pageIndex.set(Math.min(Math.max(0, page), this.lastPage()));
  }

  protected changeSize(value: string): void {
    // Garde la première ligne affichée visible après le changement de taille.
    const firstRow = this.pageIndex() * this.pageSize();
    this.pageSize.set(Number(value));
    this.pageIndex.set(Math.floor(firstRow / Number(value)));
  }
}
