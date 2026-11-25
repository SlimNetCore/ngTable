import {afterNextRender, afterRenderEffect, computed, effect, signal, untracked} from '@angular/core';
import {ColumnWindow, computeColumnWindow} from '../virtual-window';
import {buildHeaderGroupLevels, headerGroupPath} from '../header-groups';
import type {NgTableColumn} from '../ng-table.models';
import {DEFAULT_MIN_COLUMN_WIDTH_PX} from './internals';
import type {NgTableComponent} from '../ng-table.component';

/** Largeur de la colonne de cases à cocher. */
const SELECTION_COLUMN_WIDTH_PX = 48;

const ROW_DRAG_COLUMN_WIDTH_PX = 40;

const DETAIL_TOGGLE_COLUMN_WIDTH_PX = 44;

/** Colonnes affichées : visibilité, ordre, épinglage, largeurs, alignement, fenêtre de colonnes. */
export class TableColumnLayout<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  /** Virtualisation horizontale effective (pas en vue mobile, où les colonnes sont déjà réduites). */
  readonly columnVirtualization = computed(() => this.table.virtualColumns() && !this.isMobileView());

  readonly scrollLeft = signal(0);
  readonly viewportWidth = signal(0);

  /** Largeur fixe de chaque colonne visible en virtualisation horizontale. */
  private readonly fixedColumnWidths = computed(() => {
    const widths = this.columnWidths();
    return new Map(
      this.visibleColumns().map((column) => [column.id, widths[column.id] ?? column.widthPx ?? column.minWidthPx ?? DEFAULT_MIN_COLUMN_WIDTH_PX]),
    );
  });

  /**
   * Colonnes libres (non épinglées) rendues et largeurs des espacements. Ne change que si
   * la fenêtre change : défiler de quelques pixels ne reconstruit pas les colonnes.
   */
  readonly columnWindow = computed<(ColumnWindow & { free: NgTableColumn<T>[] }) | null>(
    () => {
      if (!this.columnVirtualization()) {
        return null;
      }
      const sides = this.pinnedSides();
      const widths = this.fixedColumnWidths();
      const free = this.visibleColumns().filter((column) => !sides.has(column.id));
      return {free, ...computeColumnWindow(free.map((column) => widths.get(column.id)!), this.scrollLeft(), this.viewportWidth())};
    },
    {
      equal: (a, b) =>
        a === b || (!!a && !!b && a.free === b.free && a.start === b.start && a.end === b.end && a.left === b.left && a.right === b.right),
    },
  );

  /** Colonnes réellement rendues : toutes les visibles, ou la fenêtre en virtualisation horizontale. */
  readonly renderedColumns = computed(() => {
    const window = this.columnWindow();
    if (!window) {
      return this.visibleColumns();
    }
    const sides = this.pinnedSides();
    const visible = this.visibleColumns();
    return [
      ...visible.filter((column) => sides.get(column.id) === 'left'),
      ...window.free.slice(window.start, window.end),
      ...visible.filter((column) => sides.get(column.id) === 'right'),
    ];
  });

  /** Rang (à partir de 1) de chaque colonne dans l'ordre complet : colonnes techniques, épinglées à gauche, libres, épinglées à droite. */
  private readonly ariaColumnRanks = computed(() => {
    const order = new Map<string, number>();
    if (!this.columnVirtualization()) {
      return order;
    }
    const sides = this.pinnedSides();
    const visible = this.visibleColumns();
    const ids = [
      ...(this.rowDragActive() ? [this.rowDragColumnId] : []),
      ...(this.detailToggleActive() ? [this.detailToggleColumnId] : []),
      ...(this.table.rowSelectionEnabled() ? [this.selectionColumnId] : []),
      ...visible.filter((column) => sides.get(column.id) === 'left').map((column) => column.id),
      ...visible.filter((column) => !sides.has(column.id)).map((column) => column.id),
      ...visible.filter((column) => sides.get(column.id) === 'right').map((column) => column.id),
    ];
    ids.forEach((id, index) => order.set(id, index + 1));
    return order;
  });

  /**
   * `aria-colcount` : nombre total de colonnes quand la virtualisation horizontale n'en rend qu'une fenêtre. Associé à
   * `aria-colindex` sur chaque cellule rendue, il évite qu'un lecteur d'écran annonce « colonne 3 sur 10 » pour 108 colonnes.
   */
  readonly ariaColCount = computed<number | null>(() => (this.columnVirtualization() ? this.ariaColumnRanks().size : null));

  ariaColIndex(id: string): number | null {
    return this.columnVirtualization() ? (this.ariaColumnRanks().get(id) ?? null) : null;
  }

  /** Largeur d'une colonne d'espacement de la virtualisation horizontale. */
  columnSpacerWidth(side: 'left' | 'right'): number {
    const window = this.columnWindow();
    return window ? (side === 'left' ? window.left : window.right) : 0;
  }

  private readonly baseDisplayedColumnIds = computed(
    () => {
      // Colonne technique de selection injectee en tete quand activee.
      const ids = this.visibleColumns().map((column) => column.id);
      if (!this.isMobileView()) {
        const window = this.columnWindow();
        if (window) {
          const sides = this.pinnedSides();
          const rendered = [
            ...ids.filter((id) => sides.get(id) === 'left'),
            '__colspacer_left__',
            ...window.free.slice(window.start, window.end).map((column) => column.id),
            '__colspacer_right__',
            ...ids.filter((id) => sides.get(id) === 'right'),
          ];
          return [...this.leadingColumnIds(), ...rendered];
        }
        return [...this.leadingColumnIds(), ...ids];
      }

      const actionColumn = this.actionColumn();
      if (!actionColumn) {
        return this.detailToggleActive() ? [this.detailToggleColumnId, ...ids] : ids;
      }

      const withoutActions = ids.filter((id) => id !== actionColumn.id);
      const mobileIds = withoutActions.length > 0 ? withoutActions : ids;
      return [...this.leadingColumnIds(), ...mobileIds];
    },
    // Même référence tant que les ids n'ont pas changé : rien de ce qui en dépend n'est recalculé.
    {equal: (a, b) => a.length === b.length && a.every((id, index) => id === b[index])},
  );

  readonly rowDragColumnId = '__row_drag__';
  readonly detailToggleColumnId = '__detail_toggle__';

  /** La colonne du bouton déplier / replier est affichée : un détail est fourni et le bouton natif n'a pas été retiré. */
  private readonly detailToggleActive = computed(() => !!this.table.detailRowTemplate() && this.table.detailRowToggleButton());

  /** Colonnes techniques placées avant les colonnes de données : bouton de détail, puis case de sélection. */
  private leadingColumnIds(): string[] {
    return [...(this.detailToggleActive() ? [this.detailToggleColumnId] : []), ...(this.table.rowSelectionEnabled() ? [this.selectionColumnId] : [])];
  }

  /** Le glisser-déposer de lignes est actif : demandé, en mode local, sans tri ni regroupement. */
  private readonly rowDragActive = computed(
    () => this.table.rowDrag() && this.table.dataMode() === 'local' && !this.table.tree.treeActive() && !this.table.groupBy() && !this.table.sorting.sortStates().some((sort) => !!sort.direction),
  );

  readonly displayedColumnIds = computed(
    () => (this.rowDragActive() ? [this.rowDragColumnId, ...this.baseDisplayedColumnIds()] : this.baseDisplayedColumnIds()),
    {equal: (a, b) => a.length === b.length && a.every((id, index) => id === b[index])},
  );

  /**
   * Lignes d'en-tête de groupe (`NgTableColumn.headerGroup`), de la plus externe à la plus
   * interne, pour les colonnes réellement affichées (sélection, espacements et vue
   * mobile compris). Vide quand aucune colonne n'a de groupe.
   */
  readonly headerGroupLevels = computed(
    () => {
      const columns = new Map(this.table.columns().map((column) => [column.id, column] as const));
      const leftEdge = this.hasLeftPinnedColumns();
      return buildHeaderGroupLevels(
        this.displayedColumnIds().map((id) => {
          const column = columns.get(id);
          if (!column) {
            return {id, path: [], pin: (id === this.selectionColumnId || id === this.rowDragColumnId || id === this.detailToggleColumnId) && leftEdge ? ('left' as const) : undefined};
          }
          return {id, path: headerGroupPath(column.headerGroup), pin: this.pinnedSide(column)};
        }),
      );
    },
    {equal: (a, b) => JSON.stringify(a) === JSON.stringify(b)},
  );

  readonly columnsMenuItems = computed(() =>
    this.table.columns().filter((column) => column.id !== '__detail_row__' && column.id !== '__mobile_actions__'),
  );

  /**
   * Colonnes visibles, dans l'ordre naturel de `columns()` — PAS trié par
   * `columnOrder`. Sert de base à `visibleColumns()` (qui applique le tri) et,
   * séparément, à tout ce qui ne dépend PAS de l'ordre d'affichage
   * (`filteredSortedRows` notamment) : sa référence reste stable tant que
   * l'ENSEMBLE des colonnes visibles ne change pas, même si leur ORDRE change.
   * Sans cette séparation, glisser une colonne pour la réordonner ferait
   * recalculer `visibleColumns()` avec une nouvelle référence à chaque fois,
   * ce qui invaliderait tout computed qui en dépend — y compris
   * `filteredSortedRows`, qui refiltrerait/retrierait alors la TOTALITÉ des
   * lignes à chaque réordonnancement, même si le filtrage/tri ne dépend en
   * rien de l'ordre des colonnes. Sur une grosse liste, c'est précisément ce
   * qui rend le réordonnancement des colonnes perceptiblement lent.
   */
  readonly visibleColumnsUnordered = computed(() => {
    const columns = this.table.columns();
    const visibility = this.effectiveColumnVisibility();
    return !visibility
      ? columns.filter((column) => column.visible !== false)
      : columns.filter((column) => visibility[column.id] ?? true);
  });

  /** Voir `NgTableComponent.visibleColumns`. */
  readonly visibleColumns = computed(() => {
    const filtered = this.visibleColumnsUnordered();
    const order = this.effectiveColumnOrder();
    let ordered = filtered;
    if (order.length > 0) {
      const orderIndex = new Map(order.map((id, index) => [id, index]));
      ordered = [...filtered].sort((a, b) => {
        const indexA = orderIndex.has(a.id) ? orderIndex.get(a.id)! : Number.MAX_SAFE_INTEGER;
        const indexB = orderIndex.has(b.id) ? orderIndex.get(b.id)! : Number.MAX_SAFE_INTEGER;
        return indexA - indexB;
      });
    }

    // Les colonnes épinglées doivent être contiguës aux bords : le CDK calcule le
    // décalage d'une colonne `sticky` en cumulant les largeurs des colonnes
    // `sticky` qui la PRÉCÈDENT — une colonne libre intercalée la ferait coller
    // à la mauvaise position.
    const sides = this.pinnedSides();
    if (sides.size === 0) {
      return ordered;
    }
    return [
      ...ordered.filter((column) => sides.get(column.id) === 'left'),
      ...ordered.filter((column) => !sides.has(column.id)),
      ...ordered.filter((column) => sides.get(column.id) === 'right'),
    ];
  });

  /**
   * Largeur mini effective du tableau. Avec `table-layout: fixed`, les colonnes sans
   * largeur se partagent `minTableWidthPx` sans plancher : avec beaucoup de colonnes,
   * chacune tombait sous la place nécessaire à son en-tête (libellé réduit à 0 px).
   */
  readonly tableMinWidthPx = computed(() => {
    const widths = this.columnWidths();
    const columnsTotal = this.visibleColumns().reduce(
      (total, column) => total + (widths[column.id] ?? column.widthPx ?? column.minWidthPx ?? DEFAULT_MIN_COLUMN_WIDTH_PX),
      (this.table.rowSelectionEnabled() ? SELECTION_COLUMN_WIDTH_PX : 0) + (this.rowDragActive() ? ROW_DRAG_COLUMN_WIDTH_PX : 0),
    );
    return Math.max(this.table.minTableWidthPx(), columnsTotal);
  });

  /** Côté d'épinglage effectif de chaque colonne : `pinned` déclaré, ou colonne de référence choisie. */
  readonly pinnedSides = computed(() => {
    const reference = this.table.referenceColumn();
    const sides = new Map<string, 'left' | 'right'>();
    if (this.narrowHost() && !this.table.pinColumnsOnMobile()) {
      return sides;
    }
    for (const column of this.table.columns()) {
      if (column.pinned === 'right' && column.id !== reference) {
        sides.set(column.id, 'right');
      } else if (column.pinned === 'left' && reference === undefined) {
        sides.set(column.id, 'left');
      }
    }
    if (reference) {
      sides.set(reference, 'left');
    }
    return sides;
  });

  pinnedSide(column: NgTableColumn<T>): 'left' | 'right' | undefined {
    return this.pinnedSides().get(column.id);
  }

  /** Colonne actuellement fixée à gauche comme référence (choisie, ou déclarée `pinned: 'left'`). */
  isReferenceColumn(column: NgTableColumn<T>): boolean {
    return this.pinnedSide(column) === 'left';
  }

  /** Punaise du menu « Colonnes » : fixe cette colonne à gauche, ou la libère si elle l'est déjà. */
  toggleReferenceColumn(column: NgTableColumn<T>): void {
    this.table.referenceColumn.set(this.isReferenceColumn(column) ? null : column.id);
  }

  /**
   * Alignement effectif de chaque colonne : `align` déclaré, sinon à droite pour une colonne de nombres. Une colonne
   * est « de nombres » si son filtre est numérique, ou si la première valeur renseignée parmi ses cellules rendues
   * est un `number` et qu'elle n'a ni gabarit, ni mise en forme, ni éditeur à case. Les valeurs sont lues dans le
   * modèle de vue déjà calculé (aucun appel de plus à `valueAccessor`), et la réponse est retenue par colonne : un
   * alignement ne change pas pendant le défilement.
   */
  private readonly numericColumns = new WeakMap<object, boolean>();

  private readonly columnAligns = computed(() => {
    const aligns = new Map<string, 'start' | 'center' | 'end'>();
    const views = this.table.render.rowViews();
    for (const column of this.table.columns()) {
      if (column.align) {
        aligns.set(column.id, column.align);
        continue;
      }
      if (column.cellTemplate || column.cell || column.sparkline || column.editor === 'checkbox') {
        continue;
      }
      const filterType = column.filter?.type;
      let numeric = filterType === 'number' || filterType === 'numberRange' || this.numericColumns.get(column) === true;
      if (!numeric && !this.numericColumns.has(column)) {
        for (const view of views.values()) {
          const value = view.cells.get(column.id)?.value;
          if (value !== null && value !== undefined && value !== '') {
            numeric = typeof value === 'number';
            this.numericColumns.set(column, numeric);
            break;
          }
        }
      }
      if (numeric) {
        aligns.set(column.id, 'end');
      }
    }
    return aligns;
  });

  alignOf(column: NgTableColumn<T>): 'start' | 'center' | 'end' | null {
    return this.columnAligns().get(column.id) ?? null;
  }

  private autoSized = false;

  /** Voir `NgTableComponent.autoSizeAllColumns`. */
  autoSizeAllColumns(): void {
    for (const column of this.visibleColumns()) {
      this.table.columnResize.fitColumnToContent(column);
    }
  }

  /** Largeur de l'élément `ng-table`, suivie par un `ResizeObserver` (0 tant qu'elle n'est pas connue). */
  private readonly hostWidth = signal(0);

  /**
   * La table est à l'étroit : fenêtre de 760 px ou moins, ou table elle-même de 600 px ou moins (dans une colonne,
   * un panneau, un tiroir). C'est la largeur de la table qui compte, pas seulement celle de la fenêtre.
   */
  private readonly narrowHost = computed(() => this.isMobileView() || (this.hostWidth() > 0 && this.hostWidth() <= 600));

  /** La colonne de sélection suit les colonnes épinglées à gauche, sinon elles glisseraient dessous. */
  readonly hasLeftPinnedColumns = computed(() => this.visibleColumns().some((column) => this.pinnedSide(column) === 'left'));

  readonly actionColumn = computed(() =>
    this.visibleColumns().find((column) => column.mobileRowActions) ?? null,
  );

  readonly isMobileView = signal(
    typeof window !== 'undefined' ? window.innerWidth <= 760 : false,
  );

  readonly columnWidths = signal<Record<string, number>>({});

  /** Largeur imposée à une colonne affichée (`<colgroup>`), `null` = part du reste. */
  colWidthFor(id: string): number | null {
    if (id === this.selectionColumnId) {
      return 56;
    }
    if (id === this.rowDragColumnId) {
      return ROW_DRAG_COLUMN_WIDTH_PX;
    }
    if (id === this.detailToggleColumnId) {
      return DETAIL_TOGGLE_COLUMN_WIDTH_PX;
    }
    if (id === '__colspacer_left__' || id === '__colspacer_right__') {
      return this.columnSpacerWidth(id === '__colspacer_left__' ? 'left' : 'right');
    }
    const column = this.table.columns().find((candidate) => candidate.id === id);
    return column ? this.columnWidthPx(column) : null;
  }

  readonly selectionColumnId = '__row_selection__';
  readonly hasColumns = computed(() => this.displayedColumnIds().length > 0);
  readonly internalColumnVisibility = signal<Record<string, boolean>>({});
  readonly internalColumnOrder = signal<string[]>([]);

  columnWidthPx(column: NgTableColumn<T>): number | null {
    if (this.columnVirtualization()) {
      return this.fixedColumnWidths().get(column.id) ?? null; // largeurs fixes : les espacements en dépendent
    }
    const width = this.columnWidths()[column.id] ?? column.widthPx;
    return width && width > 0 ? width : null;
  }

  isColumnVisible(columnId: string): boolean {
    return this.effectiveColumnVisibility()[columnId] ?? true;
  }

  onToggleColumnVisibility(columnId: string, checked: boolean): void {
    const next = {
      ...this.effectiveColumnVisibility(),
      [columnId]: checked,
    };
    this.internalColumnVisibility.set(next);
    this.table.columnVisibilityChange.emit(next);
  }

  effectiveColumnVisibility(): Record<string, boolean> {
    // Priorite au mode controle, fallback sur l'etat interne.
    return this.table.columnVisibility() ?? this.internalColumnVisibility();
  }

  effectiveColumnOrder(): string[] {
    const external = this.table.columnOrder();
    return external ? [...external] : this.internalColumnOrder();
  }

  /** Suit les entrées `[columnVisibility]` et `[columnOrder]`. */
  followVisibilityAndOrderInputs(): void {
    effect(() => {
      const externalVisibility = this.table.columnVisibility();
      if (!externalVisibility) {
        return;
      }
      this.internalColumnVisibility.set({...externalVisibility});
    });

    effect(() => {
      const externalOrder = this.table.columnOrder();
      if (!externalOrder) {
        return;
      }
      this.internalColumnOrder.set([...externalOrder]);
    });
  }

  /** Accorde la visibilité, l'ordre et les filtres à la liste de colonnes courante. */
  reconcileWithColumns(): void {
    effect(() => {
      // Defensive sync: suit la liste des colonnes courantes.
      const columns = this.table.columns();
      this.internalColumnVisibility.update((current) => {
        const next = {...current};
        const ids = new Set(columns.map((column) => column.id));
        for (const key of Object.keys(next)) {
          if (!ids.has(key)) {
            delete next[key];
          }
        }
        for (const column of columns) {
          if (next[column.id] === undefined) {
            next[column.id] = column.visible !== false;
          }
        }
        return next;
      });

      // Drop stale ids from the drag order (removed/renamed columns) without
      // resetting the whole order — newly seen columns simply fall back to
      // their natural position via visibleColumns()'s MAX_SAFE_INTEGER fallback.
      this.internalColumnOrder.update((current) => {
        if (current.length === 0) {
          return current;
        }
        const ids = new Set(columns.map((column) => column.id));
        const pruned = current.filter((id) => ids.has(id));
        return pruned.length === current.length ? current : pruned;
      });

      // Le composant construit lui-même le jeu de filtres à partir de `columns()` —
      // indépendamment de ce que le parent branche (ou non) sur [filters]. Chaque
      // colonne filtrable obtient une entrée (défaut '') dans `columnFilters`, et les
      // colonnes retirées/renommées voient la leur nettoyée. Ainsi `filtersChange` /
      // `remoteQueryChange` exposent toujours un jeu complet, prévisible, et
      // directement exploitable par n'importe quel consommateur sans qu'il ait à
      // connaître/répéter la liste des colonnes filtrables lui-même.
      this.table.filtering.columnFilters.update((current) => this.table.filtering.withDefaultFilterKeys(current));
    });
  }

  /** Accorde les largeurs retenues aux colonnes visibles. */
  reconcileColumnWidths(): void {
    effect(() => {
      const nextColumns = this.visibleColumns();
      this.columnWidths.update((current) => {
        const existing = new Set(nextColumns.map((column) => column.id));
        const next: Record<string, number> = {};

        for (const [columnId, width] of Object.entries(current)) {
          if (existing.has(columnId)) {
            next[columnId] = width;
          }
        }

        for (const column of nextColumns) {
          if (next[column.id] !== undefined) {
            continue;
          }
          if (column.widthPx && column.widthPx > 0) {
            next[column.id] = column.widthPx;
          }
        }

        return next;
      });

      this.table.filtering.requestFilterPositionUpdate();
    });
  }

  /** Mesure la largeur de la table, pour libérer les colonnes épinglées quand elle est à l'étroit. */
  observeHostWidth(): void {
    // Largeur de la table elle-même, pour libérer les colonnes épinglées quand elle est à l'étroit.
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      // Par paliers : seul le passage du seuil compte, pas chaque pixel d'un redimensionnement.
      const record = (width: number): void => {
        const narrow = width > 0 && width <= 600;
        if (this.hostWidth() === 0 || narrow !== this.hostWidth() <= 600) {
          this.hostWidth.set(narrow ? 600 : 601);
        }
      };
      // La section, pas l'élément hôte : celui-ci peut être « inline », dont la largeur observée vaut 0.
      const panel = this.table.hostElement.nativeElement.querySelector<HTMLElement>('.list-panel') ?? this.table.hostElement.nativeElement;
      record(Math.round(panel.getBoundingClientRect().width)); // tout de suite, sans attendre le premier rappel
      const observer = new ResizeObserver((entries) => record(Math.round(entries[entries.length - 1]?.contentRect.width ?? 0)));
      observer.observe(panel);
      this.table.destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  /** `[autoSizeColumns]` : ajuste les largeurs une seule fois, dès que des lignes sont rendues. */
  autoSizeOnFirstRows(): void {
    // [autoSizeColumns] : une seule fois, dès que des lignes sont rendues.
    afterRenderEffect(() => {
      if (!this.table.autoSizeColumns() || this.autoSized) {
        return;
      }
      this.table.render.tableRows();
      if (this.table.tableElement()?.nativeElement.querySelector('tr.data-row')) {
        this.autoSized = true;
        untracked(() => this.autoSizeAllColumns());
      }
    });
  }
}
