import {ChangeDetectionStrategy, Component, computed, effect, inject, input, model, OnDestroy, output, signal, untracked, ViewEncapsulation} from '@angular/core';
import {isFilterGroup, NgTableFilterCondition, NgTableFilterGroup, NgTableFilterNode} from './advanced-filter';
import {NgTableIconComponent} from './ng-table-icon.component';
import {NG_TABLE_DEFAULT_LABELS, NG_TABLE_LABELS, NgTableLabels, resolveNgTableLabelsSource} from './ng-table-labels';
import type {NgTableColumn} from './ng-table.component';

/** Niveaux de groupes imbriqués au plus (au-delà, un filtre devient illisible). */
const MAX_DEPTH = 3;

/** Un groupe de conditions, affiché récursivement. Interne à `ng-table-filter-builder`. */
@Component({
  selector: 'ng-table-filter-group',
  imports: [NgTableIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <fieldset [class.ngt-fb__group--nested]="depth() > 0" class="ngt-fb__group">
      <legend class="ngt-visually-hidden">{{ group().operator === 'or' ? labels().filterBuilderAny : labels().filterBuilderAll }}</legend>
      <div class="ngt-fb__head">
        <select (change)="setOperator($any($event.target).value)" [attr.aria-label]="labels().filterBuilderLabel" class="ngt-fb__field ngt-fb__operator">
          <option [selected]="group().operator === 'and'" value="and">{{ labels().filterBuilderAll }}</option>
          <option [selected]="group().operator === 'or'" value="or">{{ labels().filterBuilderAny }}</option>
        </select>
        @if (depth() > 0) {
          <button (click)="removed.emit()" [attr.aria-label]="labels().filterBuilderRemoveGroup" class="ngt-fb__icon" type="button">
            <ng-table-icon aria-hidden="true" name="close"/>
          </button>
        }
      </div>

      @for (child of group().children; track $index; let index = $index) {
        @if (index > 0) {
          <span aria-hidden="true" class="ngt-fb__joiner">{{ group().operator === 'or' ? labels().filterBuilderOr : labels().filterBuilderAnd }}</span>
        }
        @if (asGroup(child); as nested) {
          <ng-table-filter-group (changed)="replace(index, $event.node, $event.typing)" (removed)="remove(index)" [columns]="columns()" [depth]="depth() + 1"
                                 [group]="nested" [labels]="labels()"/>
        } @else {
          @let condition = asCondition(child);
          <div class="ngt-fb__condition">
            <label class="ngt-fb__not">
              <input (change)="patch(index, {not: $any($event.target).checked})" [checked]="!!condition.not" type="checkbox"/>
              {{ labels().filterBuilderNot }}
            </label>
            <select (change)="patch(index, {columnId: $any($event.target).value})" [attr.aria-label]="labels().filterBuilderColumn" class="ngt-fb__field">
              @for (column of columns(); track column.id) {
                <option [selected]="column.id === condition.columnId" [value]="column.id">{{ column.header }}</option>
              }
            </select>
            <input (input)="patch(index, {value: $any($event.target).value}, true)" [attr.aria-label]="labels().filterBuilderValue"
                   [placeholder]="labels().filterBuilderValue" [value]="condition.value" class="ngt-fb__field ngt-fb__value" type="text"/>
            <button (click)="remove(index)" [attr.aria-label]="labels().filterBuilderRemove" class="ngt-fb__icon" type="button">
              <ng-table-icon aria-hidden="true" name="close"/>
            </button>
          </div>
        }
      }

      <div class="ngt-fb__actions">
        <button (click)="addCondition()" [disabled]="columns().length === 0" class="ngt-fb__button" type="button">
          <ng-table-icon aria-hidden="true" name="add"/>
          {{ labels().filterBuilderAddCondition }}
        </button>
        @if (depth() < maxDepth - 1) {
          <button (click)="addGroup()" [disabled]="columns().length === 0" class="ngt-fb__button" type="button">
            <ng-table-icon aria-hidden="true" name="add"/>
            {{ labels().filterBuilderAddGroup }}
          </button>
        }
      </div>
    </fieldset>
  `,
})
// `any` : le constructeur sert des colonnes de n'importe quel type de ligne.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class NgTableFilterGroupComponent<T = any> {
  readonly group = input.required<NgTableFilterGroup>();
  readonly columns = input.required<readonly NgTableColumn<T>[]>();
  readonly labels = input.required<NgTableLabels>();
  readonly depth = input(0);
  /** Le groupe a changé ; `typing` : par une frappe dans une valeur (l'application peut attendre la fin de la saisie). */
  readonly changed = output<{node: NgTableFilterGroup; typing: boolean}>();
  readonly removed = output<void>();
  protected readonly maxDepth = MAX_DEPTH;

  protected asGroup(node: NgTableFilterNode): NgTableFilterGroup | null {
    return isFilterGroup(node) ? node : null;
  }

  protected asCondition(node: NgTableFilterNode): NgTableFilterCondition {
    return node as NgTableFilterCondition;
  }

  protected setOperator(operator: 'and' | 'or'): void {
    this.changed.emit({node: {...this.group(), operator}, typing: false});
  }

  protected patch(index: number, change: Partial<NgTableFilterCondition>, typing = false): void {
    this.replace(index, {...(this.group().children[index] as NgTableFilterCondition), ...change}, typing);
  }

  protected replace(index: number, node: NgTableFilterNode, typing: boolean): void {
    const children = this.group().children.map((child, i) => (i === index ? node : child));
    this.changed.emit({node: {...this.group(), children}, typing});
  }

  protected remove(index: number): void {
    this.changed.emit({node: {...this.group(), children: this.group().children.filter((_, i) => i !== index)}, typing: false});
  }

  protected addCondition(): void {
    const first = this.columns()[0];
    this.changed.emit({node: {...this.group(), children: [...this.group().children, {columnId: first.id, value: ''}]}, typing: false});
  }

  protected addGroup(): void {
    const first = this.columns()[0];
    const nested: NgTableFilterGroup = {operator: this.group().operator === 'and' ? 'or' : 'and', children: [{columnId: first.id, value: ''}]};
    this.changed.emit({node: {...this.group(), children: [...this.group().children, nested]}, typing: false});
  }
}

/**
 * Constructeur de filtres avancés : des conditions combinées par ET / OU, en groupes imbriqués. À relier à
 * `[(advancedFilter)]` de `ng-table` :
 *
 * ```html
 * <ng-table-filter-builder [columns]="columns" [(filter)]="filtre" />
 * <ng-table [columns]="columns" [rows]="rows" [(advancedFilter)]="filtre" />
 * ```
 *
 * La valeur d'une condition s'écrit comme dans le filtre de sa colonne : `>5000`, `10..50`, `Validée,Annulée`, un texte.
 */
@Component({
  selector: 'ng-table-filter-builder',
  imports: [NgTableFilterGroupComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styleUrl: './theme.css',
  styles: [
    `
    ng-table-filter-builder {
      display: block;
      color: var(--ngt-text, #14212b);
      font-size: 0.9rem;
    }

    .ngt-fb__group {
      margin: 0;
      padding: 10px 12px;
      border: 1px solid var(--ngt-border, rgba(20, 33, 43, 0.15));
      border-radius: 10px;
      background: var(--ngt-surface, #fff);
      min-width: 0;
    }

    /* Un groupe imbriqué se distingue par un filet épais sur le côté et un fond léger, pas par la couleur seule. */
    .ngt-fb__group--nested {
      border-inline-start: 4px solid var(--ngt-primary, #2f6fa8);
      background: var(--ngt-surface-soft, #f8fafc);
    }

    .ngt-fb__head,
    .ngt-fb__condition,
    .ngt-fb__actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }

    .ngt-fb__head {
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .ngt-fb__condition,
    ng-table-filter-group {
      display: flex;
      margin-block: 6px;
    }

    ng-table-filter-group > .ngt-fb__group {
      flex: 1 1 auto;
    }

    .ngt-fb__joiner {
      display: block;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--ngt-text-muted, #5f7080);
    }

    .ngt-fb__field {
      min-height: 32px;
      padding: 4px 8px;
      border: 1px solid var(--ngt-border-strong, rgba(20, 33, 43, 0.3));
      border-radius: 6px;
      background: var(--ngt-field-bg, #fff);
      color: inherit;
      font: inherit;
    }

    .ngt-fb__value {
      flex: 1 1 140px;
      min-width: 100px;
    }

    .ngt-fb__not {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .ngt-fb__button,
    .ngt-fb__icon {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-height: 32px;
      padding: 4px 10px;
      border: 1px solid var(--ngt-border-strong, rgba(20, 33, 43, 0.3));
      border-radius: 6px;
      background: var(--ngt-surface, #fff);
      color: inherit;
      font: inherit;
      cursor: pointer;
    }

    .ngt-fb__icon {
      padding: 4px;
      min-width: 32px;
      justify-content: center;
    }

    .ngt-fb__button:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .ngt-fb__button ng-table-icon,
    .ngt-fb__icon ng-table-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }

    .ngt-fb__field:focus-visible,
    .ngt-fb__button:focus-visible,
    .ngt-fb__icon:focus-visible,
    .ngt-fb__not input:focus-visible {
      outline: 2px solid var(--ngt-primary, #2f6fa8);
      outline-offset: 1px;
    }

    .ngt-fb__actions {
      margin-top: 8px;
    }

    .ngt-fb__footer {
      display: flex;
      justify-content: flex-end;
      margin-top: 8px;
    }

    .ngt-fb .ngt-visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    `,
  ],
  host: {'[attr.data-ngt-theme]': 'theme()', class: 'ngt-fb'},
  template: `
    <ng-table-filter-group (changed)="onChanged($event.node, $event.typing)" [columns]="columns()" [group]="draft()" [labels]="effectiveLabels()"/>
    @if (draft().children.length > 0) {
      <div class="ngt-fb__footer">
        <button (click)="clear()" class="ngt-fb__button" type="button">{{ effectiveLabels().filterBuilderClear }}</button>
      </div>
    }
  `,
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class NgTableFilterBuilderComponent<T = any> implements OnDestroy {
  /** Colonnes proposées dans les conditions (en général celles de la table). */
  readonly columns = input.required<readonly NgTableColumn<T>[]>();
  /** Le filtre construit ; `null` quand il n'a aucune condition. */
  readonly filter = model<NgTableFilterGroup | null>(null);
  /** Textes à remplacer (sinon ceux de `provideNgTableLabels`, puis le français). */
  readonly labels = input<Partial<NgTableLabels>>({});
  /** Délai après la dernière frappe dans une valeur avant d'appliquer le filtre. */
  readonly debounceMs = input(250);
  /** Thème : `'light'`, `'dark'`, ou `null` pour suivre la page. */
  readonly theme = input<'light' | 'dark' | null>(null);

  private readonly injectedLabels = inject(NG_TABLE_LABELS, {optional: true});
  protected readonly effectiveLabels = computed<NgTableLabels>(() => ({
    ...NG_TABLE_DEFAULT_LABELS,
    ...resolveNgTableLabelsSource(this.injectedLabels),
    ...this.labels(),
  }));

  /** Ce qui est affiché : suit `filter`, avec en plus la frappe en cours pas encore appliquée. */
  protected readonly draft = signal<NgTableFilterGroup>({operator: 'and', children: []});
  private timer: ReturnType<typeof setTimeout> | null = null;
  private emitted: NgTableFilterGroup | null = null;

  constructor() {
    // Filtre changé de l'extérieur (vue restaurée, « réinitialiser les filtres » de la table) : l'affichage le reprend.
    effect(() => {
      const filter = this.filter();
      untracked(() => {
        if (filter !== this.emitted) {
          this.cancelTimer();
          this.emitted = filter;
          this.draft.set(filter ?? {operator: this.draft().operator, children: []});
        }
      });
    });
  }

  protected onChanged(group: NgTableFilterGroup, typing: boolean): void {
    this.draft.set(group);
    this.cancelTimer();
    if (typing && this.debounceMs() > 0) {
      this.timer = setTimeout(() => this.emit(), this.debounceMs());
    } else {
      this.emit();
    }
  }

  protected clear(): void {
    this.onChanged({operator: this.draft().operator, children: []}, false);
  }

  private emit(): void {
    this.timer = null;
    const group = this.draft();
    this.emitted = group.children.length > 0 ? group : null;
    this.filter.set(this.emitted);
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  ngOnDestroy(): void {
    this.cancelTimer();
  }
}
