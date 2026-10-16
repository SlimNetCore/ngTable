import {ChangeDetectionStrategy, Component, computed, input, output, signal, ViewEncapsulation} from '@angular/core';
import {NgTableCheckboxComponent} from './ng-table-checkbox.component';
import {NgTableIconComponent} from './ng-table-icon.component';
import {NG_TABLE_DEFAULT_LABELS, NgTableLabels} from './ng-table-labels';
import {parseSetFilter, serializeSetFilter, SetFilterValue} from './set-filter';

/** Nombre de cases affichées à la fois : la recherche affine le reste. */
const MAX_VISIBLE = 300;

/**
 * Contenu d'un filtre par ensemble de valeurs : recherche, « tout sélectionner » et une case par valeur distincte
 * avec son effectif. Usage interne (rendu par `ng-table-column-filter` pour `filter.type: 'set'`).
 *
 * La valeur émise est vide quand tout est coché (pas de filtre), sinon un tableau JSON des clés cochées.
 */
@Component({
  selector: 'ng-table-set-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [NgTableCheckboxComponent, NgTableIconComponent],
  template: `
    <div class="ngt-setf__search">
      <ng-table-icon aria-hidden="true" name="search"/>
      <input #search (input)="query.set(search.value)" [attr.aria-label]="labels().search" [placeholder]="labels().search"
             [value]="query()" autocomplete="off" type="text"/>
      @if (query()) {
        <button (click)="query.set(''); search.focus()" [attr.aria-label]="labels().clearFilter" class="ngt-setf__clear" type="button">
          <ng-table-icon aria-hidden="true" name="close"/>
        </button>
      }
    </div>

    <div class="ngt-setf__all">
      <ng-table-checkbox (checkedChange)="toggleVisible($event.checked)" [checked]="allVisibleSelected()"
                         [disabled]="visible().length === 0" [indeterminate]="someVisibleSelected()">
        {{ labels().selectAll }}
      </ng-table-checkbox>
    </div>

    <div class="ngt-setf__list" role="group" [attr.aria-label]="labels().selectAll">
      @for (item of visible(); track item.key) {
        <div class="ngt-setf__row">
          <ng-table-checkbox (checkedChange)="toggle(item.key, $event.checked)" [checked]="isSelected(item.key)">
            <span class="ngt-setf__label">{{ item.label }}</span>
          </ng-table-checkbox>
          @if (item.count > 0) {
            <span class="ngt-setf__count">{{ item.count }}</span>
          }
        </div>
      } @empty {
        <p class="ngt-setf__empty">{{ labels().noData }}</p>
      }
    </div>

    @if (truncated() || hiddenCount() > 0) {
      <p class="ngt-setf__note">{{ labels().setFilterTruncated }}</p>
    }
  `,
  styles: `
    ng-table-set-filter {
      display: block;
      width: 100%;
      box-sizing: border-box;
      color: var(--ngt-text, var(--app-text, #14212b));
      font-size: 0.8125rem;
    }

    .ngt-setf__search {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 36px;
      padding: 0 8px;
      border: 1px solid var(--ngt-border-strong, var(--app-border-strong, rgba(20, 33, 43, 0.18)));
      border-radius: var(--ngt-radius-control, 10px);
      background: var(--ngt-field-bg, var(--app-field-bg, #ffffff));
      color: var(--ngt-text-muted, var(--app-muted, #5f7080));
    }

    .ngt-setf__search:focus-within {
      border-color: var(--ngt-primary, var(--app-primary, #2f6fa8));
    }

    .ngt-setf__search ng-table-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }

    .ngt-setf__search input {
      flex: 1;
      min-width: 0;
      border: 0;
      background: transparent;
      color: var(--ngt-text, var(--app-text, #14212b));
      font: inherit;
      outline: none;
    }

    .ngt-setf__clear {
      display: inline-flex;
      padding: 2px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: inherit;
      cursor: pointer;
    }

    .ngt-setf__all {
      padding: 8px 4px 6px;
      border-bottom: 1px solid var(--ngt-border, var(--app-border, rgba(20, 33, 43, 0.09)));
      font-weight: 600;
    }

    .ngt-setf__list {
      max-height: 220px;
      overflow: auto;
      padding: 4px 0;
    }

    .ngt-setf__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 32px;
      padding: 0 4px;
      border-radius: 6px;
    }

    .ngt-setf__row:hover {
      background: var(--ngt-hover-surface, var(--app-hover-surface, #f3f7fb));
    }

    .ngt-setf__label {
      display: inline-block;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      vertical-align: bottom;
    }

    .ngt-setf__count {
      flex: 0 0 auto;
      color: var(--ngt-text-muted, var(--app-muted, #5f7080));
      font-variant-numeric: tabular-nums;
    }

    .ngt-setf__empty,
    .ngt-setf__note {
      margin: 6px 4px 0;
      color: var(--ngt-text-muted, var(--app-muted, #5f7080));
    }
  `,
})
export class NgTableSetFilterComponent {
  readonly values = input<readonly SetFilterValue[]>([]);
  /** Valeur courante du filtre : vide (tout), ou un tableau JSON des clés cochées. */
  readonly value = input('');
  readonly labels = input<NgTableLabels>(NG_TABLE_DEFAULT_LABELS);
  /** La colonne a plus de valeurs distinctes que la liste n'en propose. */
  readonly truncated = input(false);
  readonly valueChange = output<string>();

  protected readonly query = signal('');

  /** Clés cochées, ou `null` quand tout l'est (pas de filtre). */
  private readonly selection = computed(() => {
    const keys = parseSetFilter(this.value());
    return keys ? new Set(keys) : null;
  });

  private readonly matching = computed(() => {
    const query = this.query().trim().toLowerCase();
    const values = this.values();
    return query ? values.filter((item) => item.label.toLowerCase().includes(query)) : values;
  });

  protected readonly visible = computed(() => this.matching().slice(0, MAX_VISIBLE));
  protected readonly hiddenCount = computed(() => Math.max(0, this.matching().length - MAX_VISIBLE));

  protected readonly allVisibleSelected = computed(() => this.visible().length > 0 && this.visible().every((item) => this.isSelected(item.key)));
  protected readonly someVisibleSelected = computed(() => !this.allVisibleSelected() && this.visible().some((item) => this.isSelected(item.key)));

  protected isSelected(key: string): boolean {
    const selection = this.selection();
    return selection === null || selection.has(key);
  }

  protected toggle(key: string, checked: boolean): void {
    this.apply([key], checked);
  }

  protected toggleVisible(checked: boolean): void {
    this.apply(this.visible().map((item) => item.key), checked);
  }

  private apply(keys: readonly string[], checked: boolean): void {
    const next = new Set(this.selection() ?? this.values().map((item) => item.key));
    for (const key of keys) {
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
    }
    const every = this.values().every((item) => next.has(item.key));
    // Dans l'ordre de la liste, pour une valeur stable ; tout coché : plus de filtre.
    this.valueChange.emit(every ? '' : serializeSetFilter(this.values().filter((item) => next.has(item.key)).map((item) => item.key)));
  }
}
