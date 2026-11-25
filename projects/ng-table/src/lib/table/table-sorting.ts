import {afterRenderEffect, computed, signal, untracked} from '@angular/core';
import type {NgTableColumn, NgTableSortChange, SortDirection} from '../ng-table.models';
import type {NgTableComponent} from '../ng-table.component';

/** Tri : niveaux de tri, libellés et icônes d'en-tête, animation des lignes triées. */
export class TableSorting<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  /** Niveaux de tri actifs, par priorité (le premier est le tri principal). Jamais d'entrée sans direction. */
  readonly sortStates = signal<NgTableSortChange[]>([]);

  /** Tri principal : ce qu'exposent `sortChange` et `NgTableRemoteQuery.sort`. */
  readonly sortState = computed<NgTableSortChange>(() => this.sortStates()[0] ?? {columnId: '', direction: ''});

  /** Position verticale (dans le contenu défilant) de chaque ligne au dernier rendu. */
  private rowTops = new WeakMap<Element, number>();

  private animatedSorts: unknown = null;

  private animateSortedRows(wrap: HTMLElement, sorts: unknown): void {
    const sorted = this.animatedSorts !== null && sorts !== this.animatedSorts;
    this.animatedSorts = sorts;
    const rows = wrap.querySelectorAll<HTMLElement>('tbody > tr.data-row:not([data-ngt-pin])');
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Au-delà d'une centaine de lignes rendues, l'animation coûterait plus qu'elle n'apporte.
    const animate = sorted && !calm && rows.length <= 120;
    const origin = wrap.getBoundingClientRect().top - wrap.scrollTop;
    for (const row of rows) {
      const top = row.getBoundingClientRect().top - origin;
      const previous = this.rowTops.get(row);
      this.rowTops.set(row, top);
      if (!animate || typeof row.animate !== 'function') {
        continue;
      }
      if (previous === undefined) {
        row.animate([{opacity: 0}, {opacity: 1}], {duration: 220, easing: 'ease-out'});
      } else if (Math.abs(previous - top) > 1) {
        row.animate([{transform: `translateY(${previous - top}px)`}, {transform: 'none'}], {duration: 260, easing: 'cubic-bezier(0.2, 0, 0, 1)'});
      }
    }
  }

  /**
   * Clic sur un en-tête : croissant, puis décroissant, puis sans tri. Avec
   * `[multiSort]`, Maj+clic ajoute la colonne comme niveau de tri supplémentaire
   * (ou fait tourner sa direction si elle en est déjà un) ; un clic simple revient
   * à un tri unique.
   */
  onHeaderSort(column: NgTableColumn<T>, event?: { shiftKey?: boolean }): void {
    if (!column.sortable) {
      return;
    }

    const current = this.sortStates();
    const existing = current.find((sort) => sort.columnId === column.id);
    let nextDirection: SortDirection = 'asc';
    if (existing?.direction === 'asc') {
      nextDirection = 'desc';
    } else if (existing?.direction === 'desc') {
      nextDirection = '';
    }

    let next: NgTableSortChange[];
    if (this.table.multiSort() && event?.shiftKey) {
      const updated: NgTableSortChange = {columnId: column.id, direction: nextDirection};
      if (!existing) {
        next = [...current, updated];
      } else if (nextDirection) {
        next = current.map((sort) => (sort.columnId === column.id ? updated : sort));
      } else {
        next = current.filter((sort) => sort.columnId !== column.id);
      }
    } else {
      next = nextDirection ? [{columnId: column.id, direction: nextDirection}] : [];
    }

    const previousPrimary = this.sortState();
    this.sortStates.set(next);
    const nextState = this.sortState();
    if (previousPrimary.columnId !== nextState.columnId || previousPrimary.direction !== nextState.direction) {
      this.table.sortChange.emit(nextState);
    }
    this.table.sortsChange.emit(next);
    const labels = this.table.effectiveLabels();
    const sortMessage = !nextDirection
      ? labels.announceSortCleared
      : (nextDirection === 'asc' ? labels.announceSortAsc : labels.announceSortDesc).replace('{column}', column.header);
    this.table.query.onQueryStateChanged(sortMessage);
  }

  private columnSort(column: NgTableColumn<T>): NgTableSortChange | undefined {
    return this.sortStates().find((sort) => sort.columnId === column.id);
  }

  currentSortIcon(column: NgTableColumn<T>): string {
    const sort = this.columnSort(column);
    if (!sort) {
      return 'swap_vert';
    }
    return sort.direction === 'asc' ? 'north' : 'south';
  }

  /**
   * Bouton « ajouter au tri » d'un en-tête (écrans tactiles, où Maj+clic n'existe pas) : proposé dès qu'un tri est
   * actif, sauf sur la colonne qui est le seul tri (un appui sur son en-tête suffit).
   */
  canAddSortLevel(column: NgTableColumn<T>): boolean {
    const sorts = this.sortStates();
    return this.table.multiSort() && !!column.sortable && sorts.length > 0 && !(sorts.length === 1 && sorts[0].columnId === column.id);
  }

  sortLevelLabel(column: NgTableColumn<T>): string {
    const labels = this.table.effectiveLabels();
    const sorted = this.sortStates().some((sort) => sort.columnId === column.id);
    return (sorted ? labels.changeSortLevel : labels.addSortLevel).replace('{column}', column.header ?? '');
  }

  /** Rang de la colonne parmi plusieurs niveaux de tri (1 = principal) ; `null` s'il n'y a qu'un niveau. */
  sortPriority(column: NgTableColumn<T>): number | null {
    const sorts = this.sortStates();
    if (sorts.length < 2) {
      return null;
    }
    const index = sorts.findIndex((sort) => sort.columnId === column.id);
    return index === -1 ? null : index + 1;
  }

  currentSortAriaLabel(column: NgTableColumn<T>): string {
    const sort = this.columnSort(column);
    const labels = this.table.effectiveLabels();
    // Le nom accessible commence par le libellé visible de l'en-tête (WCAG 2.5.3 « Label in Name »).
    if (!sort) {
      return `${column.header}, ${labels.sort}`;
    }
    const label = sort.direction === 'asc' ? labels.sortAsc : labels.sortDesc;
    const priority = this.sortPriority(column);
    return `${column.header}, ${priority ? `${label}, ${labels.sortPriority.replace('{priority}', `${priority}`)}` : label}`;
  }

  /**
   * `aria-sort` du `<th>` — norme WAI-ARIA pour les tableaux triables (APG "Table"
   * pattern). `null` pour une colonne non triable : l'attribut n'est alors pas
   * posé du tout (un `aria-sort="none"` sur une colonne qu'on ne peut pas trier
   * induirait en erreur un lecteur d'écran en laissant croire que c'est possible).
   */
  ariaSortValue(column: NgTableColumn<T>): 'ascending' | 'descending' | 'none' | null {
    if (!column.sortable) {
      return null;
    }
    // ARIA : `aria-sort` sur un seul en-tête à la fois, celui du tri principal. Les
    // niveaux secondaires sont décrits par le libellé du bouton (`currentSortAriaLabel`).
    const sort = this.sortState();
    if (sort.columnId !== column.id || !sort.direction) {
      return 'none';
    }
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  /** `[animateRows]` : anime les lignes vers leur nouvelle place quand le tri vient de changer. */
  animateAfterRender(): void {
    // [animateRows] : après chaque rendu, la position de chaque ligne est retenue ; quand le tri vient de changer,
    // les lignes repartent de leur ancienne position (technique « FLIP » : mesurer, déplacer, animer l'écart).
    afterRenderEffect(() => {
      if (!this.table.animateRows()) {
        return;
      }
      this.table.render.tableRows();
      const sorts = this.sortStates();
      const wrap = this.table.tableWrapElement()?.nativeElement;
      if (wrap) {
        untracked(() => this.animateSortedRows(wrap, sorts));
      }
    });
  }
}
