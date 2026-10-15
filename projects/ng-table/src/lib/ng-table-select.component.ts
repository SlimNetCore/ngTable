import {DOCUMENT} from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import {NgTableIconComponent} from './ng-table-icon.component';

export interface NgTableSelectOption {
  value: string;
  label: string;
}

let nextId = 0;

/** Hauteur au-delà de laquelle la liste défile, et espace minimal sous le bouton pour ouvrir vers le bas. */
const PANEL_MAX_HEIGHT = 320;
const GAP = 4;

/**
 * Liste déroulante de `ng-table` (sélection simple ou multiple, recherche facultative), sans Angular Material.
 * Remplace `<mat-select>` + `<mat-option>`. Motif ARIA « combobox + listbox » : le bouton porte `aria-expanded` et
 * `aria-controls`, les options `role="option"` et `aria-selected`, la navigation au clavier est celle attendue
 * (flèches, Début / Fin, Entrée, Espace, Échap, Tab). Le panneau est déplacé dans `<body>` à l'ouverture, pour
 * échapper aux `overflow` et aux `backdrop-filter` des ancêtres.
 *
 * ```html
 * <ng-table-select [options]="statuts" [multiple]="true" [value]="selection()" (valueChange)="selection.set($event)"/>
 * ```
 */
@Component({
  selector: 'ng-table-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [NgTableIconComponent],
  template: `
    <button #trigger (click)="toggle()" (keydown)="onTriggerKeydown($event)" [attr.aria-controls]="open() ? panelId : null"
            [attr.aria-expanded]="open()" [attr.aria-label]="ariaLabel()" [class.ngt-select__trigger--empty]="!hasSelection()"
            aria-haspopup="listbox" class="ngt-select__trigger" role="combobox" type="button">
      <span [title]="summary()" class="ngt-select__summary">{{ summary() || placeholder() }}</span>
      <ng-table-icon aria-hidden="true" class="ngt-select__arrow" name="expand_more"/>
    </button>

    @if (open()) {
      <div #panel (keydown)="onPanelKeydown($event)" [id]="panelId" class="ngt-select__panel ngt-overlay" role="presentation">
        @if (searchable()) {
          <div class="ngt-select__search">
            <ng-table-icon aria-hidden="true" name="search"/>
            <input #search (input)="onSearch(search.value)" [attr.aria-activedescendant]="activeId()" [attr.aria-controls]="listId"
                   [attr.aria-label]="searchLabel()" [placeholder]="searchLabel()" [value]="query()" autocomplete="off" role="combobox"
                   aria-expanded="true" type="text"/>
            @if (query()) {
              <button (click)="onSearch(''); search.focus()" [attr.aria-label]="clearLabel()" class="ngt-select__clear" type="button">
                <ng-table-icon aria-hidden="true" name="close"/>
              </button>
            }
          </div>
        }
        <ul #list (mousedown)="$event.preventDefault()" [attr.aria-activedescendant]="searchable() ? null : activeId()" [attr.aria-label]="ariaLabel()"
            [attr.aria-multiselectable]="multiple() ? 'true' : null" [id]="listId" class="ngt-select__list" role="listbox" tabindex="-1">
          @for (option of visibleOptions(); track option.value; let index = $index) {
            <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -- motif aria-activedescendant : le clavier est géré sur la liste ou le champ de recherche, le focus ne quitte pas l'élément qui le porte -->
            <li (click)="choose(option)" (mouseenter)="active.set(index)" [attr.aria-selected]="isSelected(option)" [class.ngt-select__option--active]="index === active()"
                [class.ngt-select__option--selected]="isSelected(option)" [id]="optionId(index)" class="ngt-select__option" role="option">
              @if (multiple()) {
                <span aria-hidden="true" class="ngt-select__box">
                  @if (isSelected(option)) {
                    <ng-table-icon name="check"/>
                  }
                </span>
              }
              <span class="ngt-select__label">{{ option.label }}</span>
              @if (!multiple() && isSelected(option)) {
                <ng-table-icon aria-hidden="true" class="ngt-select__tick" name="check"/>
              }
            </li>
          } @empty {
            <li aria-live="polite" class="ngt-select__empty" role="presentation">{{ emptyLabel() }}</li>
          }
        </ul>
      </div>
    }
  `,
  styles: `
    ng-table-select {
      display: inline-block;
      min-width: 0;
    }

    .ngt-select__trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      box-sizing: border-box;
      width: 100%;
      min-height: 40px;
      padding: 0 8px 0 12px;
      border: 1px solid var(--ngt-border-strong, var(--app-border-strong, rgba(15, 23, 42, 0.24)));
      border-radius: 10px;
      background: var(--ngt-field-bg, var(--app-field-bg, #ffffff));
      color: var(--ngt-text, var(--app-text, #0d1d26));
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .ngt-select__trigger:hover {
      background: var(--ngt-field-hover-bg, var(--app-field-hover-bg, #f7fbff));
    }

    .ngt-select__trigger:focus-visible,
    .ngt-select__trigger[aria-expanded='true'] {
      border-color: var(--ngt-primary, var(--app-primary, #3a7ca5));
      outline: 1px solid var(--ngt-primary, var(--app-primary, #3a7ca5));
    }

    .ngt-select__trigger--empty .ngt-select__summary {
      color: var(--ngt-text-muted, var(--app-muted, #4f6573));
    }

    .ngt-select__summary {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ngt-select__arrow {
      width: 20px;
      height: 20px;
      font-size: 20px;
      color: var(--ngt-text-muted, var(--app-muted, #4f6573));
    }

    .ngt-select__panel {
      position: fixed;
      inset: auto;
      margin: 0;
      padding: 0;
      z-index: 3000;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      max-height: ${PANEL_MAX_HEIGHT}px;
      overflow: hidden;
      border: 1px solid var(--ngt-border, var(--app-border, rgba(15, 23, 42, 0.13)));
      border-radius: 12px;
      background: var(--ngt-surface, var(--app-surface, #ffffff));
      box-shadow: var(--ngt-shadow-soft, var(--app-shadow-soft, 0 8px 20px rgba(15, 23, 42, 0.09))), 0 12px 32px rgba(15, 23, 42, 0.18);
      color: var(--ngt-text, var(--app-text, #0d1d26));
      font-size: 0.8125rem;
    }

    .ngt-select__search {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      gap: 6px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--ngt-border, var(--app-border, rgba(15, 23, 42, 0.13)));
      color: var(--ngt-text-muted, var(--app-muted, #4f6573));
    }

    .ngt-select__search ng-table-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }

    .ngt-select__search input {
      flex: 1;
      min-width: 0;
      padding: 4px 2px;
      border: 0;
      background: transparent;
      color: var(--ngt-text, var(--app-text, #0d1d26));
      font: inherit;
      outline: none;
    }

    .ngt-select__clear {
      display: inline-flex;
      padding: 2px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: inherit;
      cursor: pointer;
    }

    .ngt-select__list {
      flex: 1 1 auto;
      margin: 0;
      padding: 4px 0;
      overflow: auto;
      list-style: none;
      outline: none;
    }

    .ngt-select__option {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 36px;
      padding: 0 12px;
      cursor: pointer;
    }

    .ngt-select__option--active {
      background: var(--ngt-hover-surface, var(--app-hover-surface, #f6fbff));
    }

    .ngt-select__option--selected {
      font-weight: 600;
    }

    .ngt-select__label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ngt-select__box {
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border: 2px solid var(--ngt-border-strong, var(--app-border-strong, rgba(15, 23, 42, 0.45)));
      border-radius: 4px;
      color: var(--ngt-surface, var(--app-surface, #ffffff));
    }

    .ngt-select__option--selected .ngt-select__box {
      border-color: var(--ngt-primary, var(--app-primary, #3a7ca5));
      background: var(--ngt-primary, var(--app-primary, #3a7ca5));
    }

    .ngt-select__box ng-table-icon {
      width: 14px;
      height: 14px;
      font-size: 14px;
    }

    .ngt-select__tick {
      width: 18px;
      height: 18px;
      font-size: 18px;
      color: var(--ngt-primary, var(--app-primary, #3a7ca5));
    }

    .ngt-select__empty {
      padding: 12px;
      color: var(--ngt-text-muted, var(--app-muted, #4f6573));
    }
  `,
})
export class NgTableSelectComponent {
  readonly options = input<readonly NgTableSelectOption[]>([]);
  /** Valeur choisie (`''` : aucune) ; en sélection multiple, la liste des valeurs. */
  readonly value = input<string | readonly string[]>('');
  readonly multiple = input(false);
  readonly placeholder = input('');
  /** Champ de recherche en tête du panneau. */
  readonly searchable = input(false);
  readonly searchLabel = input('Rechercher');
  readonly clearLabel = input('Effacer');
  readonly emptyLabel = input('Aucun résultat');
  /** Sélection simple : libellé de l'option « tout » (valeur vide) placée en tête ; `null` : pas d'option. */
  readonly allLabel = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  /** Largeur minimale du panneau, en pixels ; il est au moins aussi large que le bouton. */
  readonly panelWidth = input(0);
  /** La nouvelle valeur : une chaîne (sélection simple) ou la liste des valeurs (multiple). */
  readonly valueChange = output<string | string[]>();

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(0);
  private readonly id = nextId++;
  protected readonly panelId = `ngt-select-${this.id}`;
  protected readonly listId = `ngt-select-list-${this.id}`;

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  protected readonly selected = computed<ReadonlySet<string>>(() => {
    const value = this.value();
    return new Set(Array.isArray(value) ? (value as readonly string[]) : value ? [value as string] : []);
  });

  /** Options affichées : « tout » en tête (sélection simple), filtrées par la recherche. */
  protected readonly visibleOptions = computed<NgTableSelectOption[]>(() => {
    const all = this.allLabel();
    const base: NgTableSelectOption[] = !this.multiple() && all !== null ? [{value: '', label: all}, ...this.options()] : [...this.options()];
    const query = this.query().trim().toLowerCase();
    return query ? base.filter((option) => option.value !== '' && option.label.toLowerCase().includes(query)) : base;
  });

  protected readonly hasSelection = computed(() => this.selected().size > 0);

  /** Texte du bouton : libellés des valeurs choisies. */
  protected readonly summary = computed(() => {
    const labels = this.options().filter((option) => this.selected().has(option.value)).map((option) => option.label);
    return labels.join(', ');
  });

  constructor() {
    const onPointerDown = (event: Event) => {
      const target = event.target as Node;
      if (this.open() && !this.trigger().nativeElement.parentElement?.contains(target) && !this.panel()?.nativeElement.contains(target)) {
        this.close(false);
      }
    };
    this.document.addEventListener('pointerdown', onPointerDown, true);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('pointerdown', onPointerDown, true);
      this.stopFollowing();
      this.panel()?.nativeElement.remove();
    });
  }

  protected optionId(index: number): string {
    return `${this.listId}-${index}`;
  }

  protected activeId(): string | null {
    return this.visibleOptions().length > 0 ? this.optionId(this.active()) : null;
  }

  protected isSelected(option: NgTableSelectOption): boolean {
    return option.value === '' ? this.selected().size === 0 : this.selected().has(option.value);
  }

  protected toggle(): void {
    if (this.open()) {
      this.close(true);
    } else {
      this.show();
    }
  }

  private show(): void {
    this.query.set('');
    const options = this.visibleOptions();
    const firstSelected = options.findIndex((option) => this.isSelected(option));
    this.active.set(Math.max(0, firstSelected));
    this.open.set(true);
    afterNextRender(
      () => {
        const panel = this.panel()?.nativeElement;
        if (!panel) {
          return;
        }
        const theme = this.trigger().nativeElement.closest('[data-ngt-theme]')?.getAttribute('data-ngt-theme');
        if (theme) {
          panel.setAttribute('data-ngt-theme', theme); // le panneau quitte l'élément thémé en passant dans <body>
        }
        this.document.body.appendChild(panel); // hors des ancêtres qui rogneraient ou déplaceraient un panneau fixe
        // Les menus et fenêtres d'Angular Material vivent dans la « top layer » (API Popover) : aucun z-index ne passe
        // au-dessus. Le panneau y entre lui aussi, après eux, donc au-dessus d'eux.
        if (typeof panel.showPopover === 'function') {
          panel.setAttribute('popover', 'manual');
          panel.showPopover();
        }
        this.place(panel);
        this.follow(panel);
        (this.search()?.nativeElement ?? this.list()?.nativeElement)?.focus({preventScroll: true});
        this.scrollActiveIntoView();
      },
      {injector: this.injector},
    );
  }

  protected close(refocus: boolean): void {
    if (!this.open()) {
      return;
    }
    this.stopFollowing();
    this.panel()?.nativeElement.remove();
    this.open.set(false);
    if (refocus) {
      this.trigger().nativeElement.focus();
    }
  }

  private followFrame = 0;

  /**
   * Le panneau suit son champ : défilement de la page ou d'un conteneur, menu ou fenêtre de filtre qui se déplace,
   * redimensionnement. On compare la position du champ à chaque image (peu coûteux) et on replace le panneau
   * quand elle change ; si le champ disparaît du document ou n'a plus de taille, le panneau se ferme.
   */
  private follow(panel: HTMLElement): void {
    const view = this.document.defaultView;
    if (!view) {
      return;
    }
    let last = '';
    const tick = () => {
      if (!this.open()) {
        return;
      }
      const trigger = this.trigger().nativeElement;
      const rect = trigger.getBoundingClientRect();
      if (!trigger.isConnected || (rect.width === 0 && rect.height === 0)) {
        this.close(false);
        return;
      }
      const key = `${rect.left}|${rect.top}|${rect.width}|${rect.height}|${view.innerWidth}|${view.innerHeight}`;
      if (key !== last) {
        last = key;
        this.place(panel);
      }
      this.followFrame = view.requestAnimationFrame(tick);
    };
    this.followFrame = view.requestAnimationFrame(tick);
  }

  private stopFollowing(): void {
    if (this.followFrame) {
      this.document.defaultView?.cancelAnimationFrame(this.followFrame);
      this.followFrame = 0;
    }
  }

  private place(panel: HTMLElement): void {
    const anchor = this.trigger().nativeElement.getBoundingClientRect();
    const view = this.document.defaultView!;
    const width = Math.max(anchor.width, this.panelWidth());
    const height = Math.min(panel.scrollHeight + 2, PANEL_MAX_HEIGHT);
    const below = view.innerHeight - anchor.bottom - GAP - 8;
    const above = anchor.top - GAP - 8;
    const openUp = height > below && above > below;
    const room = openUp ? above : below;
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${Math.min(PANEL_MAX_HEIGHT, Math.max(120, room))}px`;
    panel.style.left = `${Math.min(Math.max(8, anchor.left), view.innerWidth - width - 8)}px`;
    panel.style.top = openUp ? `${Math.max(8, anchor.top - GAP - Math.min(height, room))}px` : `${anchor.bottom + GAP}px`;
  }

  protected onSearch(value: string): void {
    this.query.set(value);
    this.active.set(0);
  }

  protected choose(option: NgTableSelectOption): void {
    if (this.multiple()) {
      const next = new Set(this.selected());
      if (!next.delete(option.value)) {
        next.add(option.value);
      }
      // L'ordre des options, pas l'ordre des clics : la valeur sérialisée reste stable.
      this.valueChange.emit(this.options().filter((candidate) => next.has(candidate.value)).map((candidate) => candidate.value));
    } else {
      this.valueChange.emit(option.value);
      this.close(true);
    }
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key) && !this.open()) {
      event.preventDefault();
      this.show();
    }
  }

  protected onPanelKeydown(event: KeyboardEvent): void {
    const options = this.visibleOptions();
    const move = (index: number) => {
      event.preventDefault();
      this.active.set(Math.min(Math.max(0, index), Math.max(0, options.length - 1)));
      this.scrollActiveIntoView();
    };
    switch (event.key) {
      case 'ArrowDown':
        return move(this.active() + 1);
      case 'ArrowUp':
        return move(this.active() - 1);
      case 'Home':
        return move(0);
      case 'End':
        return move(options.length - 1);
      case 'Enter':
        event.preventDefault();
        if (options[this.active()]) {
          this.choose(options[this.active()]);
        }
        return;
      case ' ':
        if (event.target !== this.search()?.nativeElement && options[this.active()]) {
          event.preventDefault();
          this.choose(options[this.active()]);
        }
        return;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
        return;
      case 'Tab':
        this.close(false);
        return;
    }
  }

  private scrollActiveIntoView(): void {
    afterNextRender(
      () => this.document.getElementById(this.optionId(this.active()))?.scrollIntoView?.({block: 'nearest'}),
      {injector: this.injector},
    );
  }
}
