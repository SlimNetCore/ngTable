import {afterRenderEffect, computed, signal, untracked} from '@angular/core';
import type {NgTableComponent} from '../ng-table.component';

/** Colonnes figées et en-têtes collants : côtés, décalages mesurés. */
export class TableSticky<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  /** En-têtes collants : demandé, ou défilement virtuel (l'en-tête doit rester en vue). */
  readonly headSticky = computed(() => this.table.stickyHeader() || this.table.viewport.virtualActive());

  /** Côté de chaque colonne figée, parmi les colonnes affichées (les colonnes de tête suivent les colonnes de gauche). */
  private readonly stickySides = computed(() => {
    const sides = new Map<string, 'start' | 'end'>();
    const pinned = this.table.columnLayout.pinnedSides();
    const leftEdge = this.table.columnLayout.hasLeftPinnedColumns();
    for (const id of this.table.columnLayout.displayedColumnIds()) {
      const side = pinned.get(id);
      if (side === 'left' || (leftEdge && (id === this.table.columnLayout.rowDragColumnId || id === this.table.columnLayout.detailToggleColumnId || id === this.table.columnLayout.selectionColumnId))) {
        sides.set(id, 'start');
      } else if (side === 'right') {
        sides.set(id, 'end');
      }
    }
    return sides;
  });

  /** Largeur mesurée des en-têtes des colonnes figées (un `ResizeObserver` la tient à jour). */
  private readonly stickyWidths = signal<ReadonlyMap<string, number>>(new Map());

  /** Position de chaque ligne d'en-tête collante sous la précédente (en-têtes groupés). */
  private readonly headerRowTops = signal<readonly number[]>([]);

  headerRowTop(index: number): number {
    return this.headerRowTops()[index] ?? 0;
  }

  /** Décalage de chaque colonne figée : la somme des largeurs des colonnes figées avant elle (ou après, à la fin). */
  readonly stickyCells = computed(() => {
    const cells = new Map<string, {side: 'start' | 'end'; offset: number; edge: boolean}>();
    const sides = this.stickySides();
    if (sides.size === 0) {
      return cells;
    }
    const widths = this.stickyWidths();
    const widthOf = (id: string): number => widths.get(id) ?? this.table.columnLayout.colWidthFor(id) ?? 0;
    const starts = [...sides].filter(([, side]) => side === 'start').map(([id]) => id);
    const ends = [...sides].filter(([, side]) => side === 'end').map(([id]) => id);
    let offset = 0;
    starts.forEach((id, index) => {
      cells.set(id, {side: 'start', offset, edge: index === starts.length - 1});
      offset += widthOf(id);
    });
    offset = 0;
    for (let index = ends.length - 1; index >= 0; index--) {
      cells.set(ends[index], {side: 'end', offset, edge: index === 0});
      offset += widthOf(ends[index]);
    }
    return cells;
  });

  private stickyObserver: ResizeObserver | null = null;

  /** Largeurs des en-têtes de colonnes figées et hauteurs des lignes d'en-tête : lues une fois la mise en page faite. */
  private measureSticky(): void {
    const table: HTMLTableElement | undefined = this.table.tableElement()?.nativeElement;
    const head = table?.tHead;
    if (!head) {
      return;
    }
    const tops: number[] = [];
    let top = 0;
    for (const row of Array.from(head.rows)) {
      tops.push(top);
      top += row.getBoundingClientRect().height;
    }
    const previousTops = this.headerRowTops();
    if (tops.length !== previousTops.length || tops.some((value, index) => Math.abs(value - previousTops[index]) > 0.5)) {
      this.headerRowTops.set(tops);
    }
    const sides = this.stickySides();
    if (sides.size === 0) {
      return;
    }
    const ids = this.table.columnLayout.displayedColumnIds();
    const cells = head.rows[head.rows.length - 1]?.cells;
    const previous = this.stickyWidths();
    const widths = new Map<string, number>();
    let changed = false;
    ids.forEach((id, index) => {
      if (!sides.has(id)) {
        return;
      }
      const width = cells?.[index]?.getBoundingClientRect().width ?? 0;
      if (width > 0) {
        widths.set(id, width);
        changed ||= Math.abs(width - (previous.get(id) ?? -1)) > 0.5;
      }
    });
    if (changed || widths.size !== previous.size) {
      this.stickyWidths.set(widths);
    }
  }

  /** Mesure les décalages des colonnes figées et des en-têtes collants après chaque rendu qui les change. */
  measureAfterRender(): void {
    // Colonnes figées et en-têtes groupés collants : leurs décalages viennent de dimensions mesurées. Un
    // `ResizeObserver` les suit (aucune lecture forcée de la mise en page) ; on le rebranche quand les en-têtes changent.
    afterRenderEffect(() => {
      const sides = this.stickySides();
      const levels = this.table.columnLayout.headerGroupLevels().length;
      this.table.columnLayout.displayedColumnIds();
      const head: HTMLTableSectionElement | null | undefined = (this.table.tableElement()?.nativeElement as HTMLTableElement | undefined)?.tHead;
      this.stickyObserver?.disconnect();
      if (!head || typeof ResizeObserver === 'undefined' || (sides.size === 0 && !(levels > 0 && this.headSticky()))) {
        return;
      }
      this.stickyObserver ??= new ResizeObserver(() => this.measureSticky());
      for (const row of Array.from(head.rows)) {
        this.stickyObserver.observe(row);
      }
      const ids = untracked(() => this.table.columnLayout.displayedColumnIds());
      const cells = head.rows[head.rows.length - 1]?.cells;
      ids.forEach((id, index) => {
        if (sides.has(id) && cells?.[index]) {
          this.stickyObserver?.observe(cells[index]);
        }
      });
    });
    this.table.destroyRef.onDestroy(() => this.stickyObserver?.disconnect());
  }
}
