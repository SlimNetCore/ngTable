import {computed, signal} from '@angular/core';
import {buildScrollMarkers, NgTableMarkedRow, NgTableScrollMarker, scrollTopForMarker} from '../scroll-markers';
import {NgTableGroupRow} from '../row-grouping';
import type {NgTableComponent} from '../ng-table.component';

/** Repères de la barre de défilement et navigation de repère en repère. */
export class TableScrollMarkers<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  /** Repères de la barre de défilement (`[scrollMarkers]`) : lignes sélectionnées et lignes signalées de la liste affichée. */
  readonly scrollMarks = computed<NgTableScrollMarker[]>(() => {
    if (!this.table.scrollMarkers() || this.table.remote.blockMode()) {
      return [];
    }
    const items = this.table.paging.pageItems();
    const selected = this.table.selection.selectedKeysSet();
    const marker = this.table.rowMarker();
    if (selected.size === 0 && !marker) {
      return [];
    }
    // Où commence chaque élément dans le contenu défilant : sous les en-têtes et les lignes épinglées du haut, avec
    // les hauteurs réellement mesurées quand il y en a (détail déplié, texte sur plusieurs lignes).
    const heights = this.table.viewport.rowHeights();
    this.table.viewport.rowHeightsVersion();
    const rowHeight = this.table.viewport.rowHeight();
    const before = this.table.viewport.headerHeight() + this.table.pinnedTopRows().length * rowHeight;
    const body = heights ? heights.total : items.length * rowHeight;
    const total = before + body + this.table.pinnedBottomRows().length * rowHeight + (this.table.render.totals() ? this.table.viewport.footerHeight() : 0);
    if (!(total > 0)) {
      return [];
    }
    const marks: NgTableMarkedRow[] = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (item instanceof NgTableGroupRow) {
        continue;
      }
      const tone = marker?.(item);
      const kind = tone || (selected.size > 0 && selected.has(this.table.data.rowKey(item)) ? 'selection' : null);
      if (kind) {
        marks.push({index, kind, position: (before + (heights ? heights.offsetOf(index) : index * rowHeight)) / total});
      }
    }
    return buildScrollMarkers(marks, this.table.viewport.viewportHeight());
  });

  /** Hauteur visible de la zone défilante, ou `null` tant qu'elle n'est pas mesurée (la bande prend alors toute la hauteur). */
  viewportHeightPx(): number | null {
    return this.table.viewport.viewportHeight() > 0 ? this.table.viewport.viewportHeight() : null;
  }

  /** Ligne mise en évidence après un clic sur un repère (retirée après un instant). */
  private readonly locatedItem = signal<unknown>(null);

  private locatedTimer: ReturnType<typeof setTimeout> | null = null;

  isLocated(row: T): boolean {
    return this.locatedItem() === row;
  }

  /** Clic sur un repère : amène la ligne au milieu de la zone défilante et la met en évidence un instant. */
  onScrollMarkerClick(event: Event, mark: NgTableScrollMarker): void {
    event.preventDefault();
    event.stopPropagation();
    this.goToMarker(mark);
  }

  /**
   * F8 va à la ligne repérée suivante, Maj+F8 à la précédente (équivalent clavier du clic sur un repère, WCAG 2.1.1).
   * La ligne atteinte est annoncée par la valeur de sa première colonne.
   */
  onMarkerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'F8' || !this.table.scrollMarkers()) {
      return;
    }
    const mark = this.adjacentMarker(event.shiftKey ? -1 : 1);
    if (mark) {
      event.preventDefault();
      this.goToMarker(mark);
    }
  }

  /** Repère suivant (`1`) ou précédent (`-1`) par rapport au milieu de la zone visible ; `null` s'il n'y en a pas. */
  private adjacentMarker(direction: 1 | -1): NgTableScrollMarker | null {
    const wrap = this.table.tableWrapElement()?.nativeElement;
    const marks = this.scrollMarks();
    if (!wrap || marks.length === 0) {
      return null;
    }
    const located = this.locatedIndex;
    const here = (wrap.scrollTop + wrap.clientHeight / 2) / Math.max(1, wrap.scrollHeight);
    const after = marks.filter((mark) => (located !== null ? mark.index > located : mark.position > here));
    const before = marks.filter((mark) => (located !== null ? mark.index < located : mark.position < here));
    return direction > 0 ? (after[0] ?? marks[0]) : (before[before.length - 1] ?? marks[marks.length - 1]);
  }

  private locatedIndex: number | null = null;

  private goToMarker(mark: NgTableScrollMarker): void {
    const wrap = this.table.tableWrapElement()?.nativeElement;
    if (!wrap) {
      return;
    }
    this.locatedIndex = mark.index;
    this.table.keyboard.keyboardJumpAt = performance.now();
    const item = this.table.paging.pageItems()[mark.index];
    const lead = this.table.columnLayout.visibleColumns()[0];
    if (item !== undefined && !(item instanceof NgTableGroupRow) && lead) {
      this.table.announce([`${lead.valueAccessor(item) ?? ''}`.trim()]);
    }
    const top = scrollTopForMarker(mark.position, wrap.scrollHeight, wrap.clientHeight, this.table.viewport.rowHeight());
    wrap.scrollTop = top;
    this.table.viewport.scrollTop.set(top);
    this.locatedItem.set(this.table.paging.pageItems()[mark.index] ?? null);
    if (this.locatedTimer !== null) {
      clearTimeout(this.locatedTimer);
    }
    this.locatedTimer = setTimeout(() => {
      this.locatedTimer = null;
      this.locatedItem.set(null);
    }, 1800);
  }

  /** Annule la mise en évidence temporisée de la ligne repérée. */
  dispose(): void {
    if (this.locatedTimer !== null) {
      clearTimeout(this.locatedTimer);
    }
  }
}
