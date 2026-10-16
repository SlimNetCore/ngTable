import {ChangeDetectionStrategy, Component, computed, input, output, ViewEncapsulation} from '@angular/core';
import {NG_TABLE_DEFAULT_LABELS, NgTableLabels} from './ng-table-labels';

/** Ce que reçoit `(page)` : la nouvelle page, et la taille de page choisie. */
export interface NgTablePageEvent {
  pageIndex: number;
  previousPageIndex: number;
  pageSize: number;
  length: number;
}

/**
 * Paginateur de `ng-table` : taille de page, plage affichée, première / précédente / suivante / dernière page.
 * Textes traduits par `[labels]` (ceux de la table), plus de `MatPaginatorIntl`. Remplace `<mat-paginator>`.
 */
@Component({
  selector: 'ng-table-paginator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="ngt-pager" role="group" [attr.aria-label]="texts().paginatorLabel">
      @if (pageSizeOptions().length > 1) {
        <label class="ngt-pager__size">
          <span>{{ texts().paginatorItemsPerPage }}</span>
          <select (change)="changePageSize($any($event.target).value)" class="ngt-pager__select">
            @for (size of sizeChoices(); track size) {
              <option [selected]="size === pageSize()" [value]="size">{{ size }}</option>
            }
          </select>
        </label>
      }
      <span aria-live="polite" class="ngt-pager__range">{{ rangeText() }}</span>
      <span class="ngt-pager__buttons">
        <button (click)="go(0)" [attr.aria-label]="texts().paginatorFirst" [disabled]="atFirst()" [title]="texts().paginatorFirst" type="button">
          <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18"><path d="M18.41 16.59 13.82 12l4.59-4.59L17 6l-6 6 6 6zM6 6h2v12H6z" fill="currentColor"/></svg>
        </button>
        <button (click)="go(pageIndex() - 1)" [attr.aria-label]="texts().paginatorPrevious" [disabled]="atFirst()" [title]="texts().paginatorPrevious" type="button">
          <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor"/></svg>
        </button>
        <button (click)="go(pageIndex() + 1)" [attr.aria-label]="texts().paginatorNext" [disabled]="atLast()" [title]="texts().paginatorNext" type="button">
          <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="currentColor"/></svg>
        </button>
        <button (click)="go(lastIndex())" [attr.aria-label]="texts().paginatorLast" [disabled]="atLast()" [title]="texts().paginatorLast" type="button">
          <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18"><path d="M5.59 7.41 10.18 12l-4.59 4.59L7 18l6-6-6-6zM16 6h2v12h-2z" fill="currentColor"/></svg>
        </button>
      </span>
    </div>
  `,
  styles: `
    ng-table-paginator {
      display: block;
    }

    .ngt-pager {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 8px 24px;
      padding: 8px 16px;
      color: var(--ngt-text-muted, var(--app-muted, var(--app-text-muted, #5f7080)));
      font-size: 0.8125rem;
    }

    .ngt-pager__size {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .ngt-pager__select {
      padding: 4px 8px;
      border: 1px solid var(--ngt-border-strong, var(--app-border-strong, rgba(20, 33, 43, 0.18)));
      border-radius: 6px;
      background: var(--ngt-field-bg, var(--app-field-bg, #ffffff));
      color: var(--ngt-text, var(--app-text, #14212b));
      font: inherit;
    }

    .ngt-pager__buttons {
      display: inline-flex;
      gap: 2px;
    }

    .ngt-pager__buttons button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--ngt-text, var(--app-text, #14212b));
      cursor: pointer;
    }

    .ngt-pager__buttons button:hover:not(:disabled),
    .ngt-pager__buttons button:focus-visible {
      background: var(--ngt-primary-soft, var(--app-primary-soft, rgba(47, 111, 168, 0.1)));
    }

    .ngt-pager__buttons button:focus-visible,
    .ngt-pager__select:focus-visible {
      outline: 2px solid var(--ngt-primary, var(--app-primary, #2f6fa8));
      outline-offset: 1px;
    }

    .ngt-pager__buttons button:disabled {
      cursor: default;
      opacity: 0.38;
    }
  `,
})
export class NgTablePaginatorComponent {
  /** Nombre total d'éléments. */
  readonly length = input(0);
  readonly pageIndex = input(0);
  readonly pageSize = input(10);
  readonly pageSizeOptions = input<readonly number[]>([]);
  /** Textes : ceux de la table (`NgTableLabels`). */
  readonly labels = input<NgTableLabels>(NG_TABLE_DEFAULT_LABELS);
  readonly page = output<NgTablePageEvent>();

  protected readonly texts = computed(() => this.labels());
  protected readonly lastIndex = computed(() => Math.max(0, Math.ceil(this.length() / Math.max(1, this.pageSize())) - 1));
  protected readonly atFirst = computed(() => this.pageIndex() <= 0);
  protected readonly atLast = computed(() => this.pageIndex() >= this.lastIndex());

  /** Les tailles proposées, avec la taille courante même si elle n'y figure pas. */
  protected readonly sizeChoices = computed(() => [...new Set([...this.pageSizeOptions(), this.pageSize()])].sort((a, b) => a - b));

  protected readonly rangeText = computed(() => {
    const total = this.length();
    const size = this.pageSize();
    const texts = this.texts();
    if (total === 0 || size === 0) {
      return texts.paginatorRangeEmpty.replace('{total}', `${total}`);
    }
    const from = this.pageIndex() * size + 1;
    const to = Math.min(from - 1 + size, total);
    return texts.paginatorRange.replace('{from}', `${from}`).replace('{to}', `${to}`).replace('{total}', `${total}`);
  });

  protected go(index: number): void {
    const target = Math.min(Math.max(0, index), this.lastIndex());
    if (target !== this.pageIndex()) {
      this.page.emit({pageIndex: target, previousPageIndex: this.pageIndex(), pageSize: this.pageSize(), length: this.length()});
    }
  }

  /** Une autre taille de page garde la première ligne affichée à l'écran (comme `mat-paginator`). */
  protected changePageSize(value: string): void {
    const size = Number(value);
    if (!Number.isFinite(size) || size <= 0 || size === this.pageSize()) {
      return;
    }
    const firstRow = this.pageIndex() * this.pageSize();
    this.page.emit({pageIndex: Math.floor(firstRow / size), previousPageIndex: this.pageIndex(), pageSize: size, length: this.length()});
  }
}
