import {afterRenderEffect, computed, effect, signal, Signal, untracked} from '@angular/core';
import {computeVariableLayout, HeightIndex, mostCommonHeight, variableScrollTop} from '../row-heights';
import {computeVirtualLayout, scrollTopForIndex, VirtualLayout, VirtualRange} from '../virtual-window';
import type {NgTableComponent} from '../ng-table.component';

/** Zone de défilement : position, hauteurs mesurées, fenêtre du défilement virtuel. */
export class TableViewport<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  /** Défilement virtuel effectif : demandé, ou imposé par le modèle par blocs. */
  readonly virtualActive = computed(() => this.table.virtualScroll() || this.table.remote.blockMode());

  readonly effectiveMaxHeight = computed(() => this.table.maxHeight() ?? (this.virtualActive() ? '70vh' : null));
  readonly scrollTop = signal(0);
  readonly viewportHeight = signal(0);

  /** Hauteur d'une ligne, mesurée sur la première ligne rendue (densité, thème...). */
  readonly rowHeight = signal(48);

  /** Hauteurs mesurées de l'en-tête et de la ligne de totaux : décalages des lignes épinglées. */
  readonly headerHeight = signal(56);

  readonly footerHeight = signal(48);

  /** Décalage CSS des lignes épinglées du haut : l'en-tête, s'il reste visible au défilement. */
  readonly pinHeaderOffset = computed(() => (this.table.stickyHeader() || this.virtualActive() ? this.headerHeight() : 0));

  /** Décalage CSS des lignes épinglées du bas : la ligne de totaux, si elle reste visible. */
  readonly pinFooterOffset = computed(() => (this.table.render.totals() && this.table.stickyHeader() ? this.footerHeight() : 0));

  /**
   * Tranche rendue en défilement virtuel. Ne change que lorsque ses bornes changent :
   * défiler de quelques pixels ne recrée pas la source de données de la table.
   */
  /** Tranche rendue et hauteurs des espacements (barre comprimée au-delà de `MAX_SCROLL_HEIGHT`). */
  private readonly virtualLayout: Signal<VirtualLayout | null> = computed<VirtualLayout | null>(() => {
    if (!this.virtualActive()) {
      return null;
    }
    const heights = this.rowHeights();
    if (heights) {
      this.rowHeightsVersion();
      return computeVariableLayout(heights, this.scrollTop(), this.viewportHeight());
    }
    return computeVirtualLayout(this.virtualCount(), this.scrollTop(), this.viewportHeight(), this.rowHeight());
  });

  /**
   * Hauteurs mesurées des lignes rendues (détail déplié, texte sur plusieurs lignes, en-tête de groupe) : les lignes
   * pas encore vues gardent la hauteur estimée. Repart de zéro quand la liste affichée change (tri, filtre, données) :
   * les mesures sont rattachées à des positions, qui ne désignent alors plus les mêmes lignes. Pas en modèle par blocs.
   */
  readonly rowHeights = computed(() =>
    this.virtualActive() && !this.table.remote.blockMode() ? new HeightIndex(this.table.paging.pageItems().length, this.rowHeight()) : null,
  );

  /** Incrémenté quand une mesure modifie `rowHeights` (l'objet, lui, ne change pas). */
  readonly rowHeightsVersion = signal(0);

  /**
   * Mesure les éléments rendus du corps (une ligne de données ou de groupe, avec la ligne détail qui la suit) et
   * retient leurs hauteurs. Renvoie la hauteur la plus fréquente : c'est l'estimation des lignes pas encore vues, et
   * elle ne doit pas changer selon que la première ligne rendue est haute ou non.
   */
  private layoutObserver: ResizeObserver | null = null;

  private layoutObserved = new Set<Element>();
  private layoutMeasuredFor: {heights: unknown; start: number; end: number} | null = null;

  /**
   * Fait suivre les lignes rendues par un `ResizeObserver` et dit si la mesure immédiate peut être évitée : seulement
   * en défilement virtuel, une fois les dimensions connues, et quand la tranche rendue recouvre la précédente (après un
   * saut, un tri ou un filtre, les lignes ne sont plus les mêmes : on mesure tout de suite).
   */
  private deferLayoutMeasure(wrap: HTMLElement): boolean {
    const range = this.virtualRange();
    const heights = this.rowHeights();
    const previous = this.layoutMeasuredFor;
    this.layoutMeasuredFor = range ? {heights, start: range.start, end: range.end} : null;
    if (typeof ResizeObserver === 'undefined' || !this.virtualActive() || !range) {
      return false;
    }
    this.layoutObserver ??= new ResizeObserver(() => {
      const current = this.table.tableWrapElement()?.nativeElement;
      if (current) {
        this.measureLayout(current);
      }
    });
    const observer = this.layoutObserver;
    for (const row of this.layoutObserved) {
      if (!row.isConnected) {
        observer.unobserve(row);
        this.layoutObserved.delete(row);
      }
    }
    for (const row of [wrap, ...wrap.querySelectorAll('thead > tr, tfoot > tr, tbody > tr:not(.spacer-row)')]) {
      if (!this.layoutObserved.has(row)) {
        this.layoutObserved.add(row);
        observer.observe(row); // premier appel une fois la mise en page faite : c'est lui qui mesure la ligne entrante
      }
    }
    const overlaps = !!previous && previous.heights === heights && range.start < previous.end && range.end > previous.start;
    return overlaps && this.rowHeight() > 0 && this.viewportHeight() > 0 && this.headerHeight() > 0;
  }

  /** Mesure la zone visible, les en-têtes, la ligne de totaux et les lignes rendues (défilement virtuel, lignes épinglées). */
  private measureLayout(wrap: HTMLElement): void {
    // Toutes les lignes d'en-tête (groupes compris) : les lignes épinglées se placent sous leur total.
    const header = [...wrap.querySelectorAll('tr.cdk-header-row')].reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
    if (header > 0 && Math.abs(header - this.headerHeight()) > 0.5) {
      this.headerHeight.set(header);
    }
    const footer = wrap.querySelector('tr.totals-row')?.getBoundingClientRect().height ?? 0;
    if (footer > 0 && Math.abs(footer - this.footerHeight()) > 0.5) {
      this.footerHeight.set(footer);
    }
    if (wrap.clientWidth !== this.table.columnLayout.viewportWidth()) {
      this.table.columnLayout.viewportWidth.set(wrap.clientWidth);
    }
    if (wrap.clientHeight !== this.viewportHeight()) {
      this.viewportHeight.set(wrap.clientHeight);
    }
    const height = this.virtualActive()
      ? this.measureRowHeights(wrap, this.virtualRange())
      : (wrap.querySelector('tr.data-row')?.getBoundingClientRect().height ?? 0);
    if (height > 0 && Math.abs(height - this.rowHeight()) > 0.5) {
      this.rowHeight.set(height);
    }
  }

  private measureRowHeights(wrap: HTMLElement, range: VirtualRange | null): number {
    const measured: number[] = [];
    let current = -1;
    for (const row of wrap.querySelectorAll<HTMLElement>('tbody > tr')) {
      if (row.classList.contains('spacer-row') || row.hasAttribute('data-ngt-pin') || row.hasAttribute('data-ngt-group-extra')) {
        continue;
      }
      const height = row.getBoundingClientRect().height;
      if (row.classList.contains('data-row') || row.classList.contains('group-row') || row.classList.contains('loading-row')) {
        measured.push(height);
        current = measured.length - 1;
      } else if (current >= 0) {
        measured[current] += height; // ligne détail, actions mobiles : avec la ligne qui précède
      }
    }
    const usual = mostCommonHeight(measured);
    const heights = this.rowHeights();
    // Les mesures ne valent que si la tranche rendue est bien celle attendue, et l'estimation à jour.
    if (heights && range && measured.length === range.end - range.start && Math.abs(usual - heights.defaultHeight) <= 0.5) {
      let changed = false;
      for (let i = 0; i < measured.length; i++) {
        changed = heights.set(range.start + i, measured[i]) || changed;
      }
      if (changed) {
        this.rowHeightsVersion.update((version) => version + 1);
      }
    }
    return usual;
  }

  readonly virtualRange: Signal<VirtualRange | null> = computed<VirtualRange | null>(
    () => {
      const layout = this.virtualLayout();
      return layout ? {start: layout.start, end: layout.end} : null;
    },
    {equal: (a, b) => a === b || (!!a && !!b && a.start === b.start && a.end === b.end)},
  );

  /**
   * Hauteur d'un espacement, lue par le template : défiler change ces hauteurs (barre
   * comprimée) sans recréer la source de données de la table tant que la tranche est la même.
   */
  spacerHeight(position: 'top' | 'bottom'): number {
    const layout = this.virtualLayout();
    if (!layout) {
      return 0;
    }
    if (position === 'bottom') {
      return layout.bottom;
    }
    // Les en-têtes de groupe remis en tête de tranche occupent leur place : l'espacement du haut la leur cède.
    return Math.max(0, layout.top - this.table.grouping.stickyGroupExtras().length * this.rowHeight());
  }

  /** Voir `NgTableComponent.scrollToIndex`. */
  scrollToIndex(index: number): void {
    const wrap = this.table.tableWrapElement()?.nativeElement;
    if (!this.virtualActive() || !wrap) {
      return;
    }
    const heights = this.rowHeights();
    const top =
      (heights ? variableScrollTop(heights, index) : null) ??
      scrollTopForIndex(index, this.virtualCount(), this.viewportHeight(), this.rowHeight());
    wrap.scrollTop = top;
    this.scrollTop.set(top);
  }

  /** Nombre d'éléments à faire défiler : total serveur en modèle par blocs, sinon éléments de la page. */
  readonly virtualCount: Signal<number> = computed<number>(() => {
    if (this.table.remote.blockMode()) {
      this.table.remote.blockVersion();
      return this.table.remote.blockCache.rowCount;
    }
    return this.table.paging.pageItems().length;
  });

  /**
   * Ecouteur de scroll installé uniquement pendant qu'un menu de filtre est ouvert.
   * Enregistré hors binding Angular (`addEventListener` direct, `passive`) pour ne pas
   * déclencher un cycle de détection à chaque pixel scrollé de la page.
   */
  private scrollListener: (() => void) | null = null;

  /**
   * Le menu de filtre est en overlay : il doit se repositionner quand la page défile.
   * L'écouteur est posé hors Angular (pas de `@HostListener`) et seulement tant qu'un
   * menu est ouvert — un `window:scroll` bindé en permanence déclencherait un cycle de
   * détection à chaque événement de scroll de l'application entière.
   */
  startScrollTracking(): void {
    if (this.scrollListener || typeof window === 'undefined') {
      return;
    }
    const listener = () => this.table.filtering.requestFilterPositionUpdate();
    window.addEventListener('scroll', listener, {passive: true, capture: true});
    this.scrollListener = () => window.removeEventListener('scroll', listener, {capture: true});
  }

  onTableWrapScroll(event: Event): void {
    this.table.filtering.requestFilterPositionUpdate();
    if (this.table.columnLayout.columnVirtualization()) {
      this.table.columnLayout.scrollLeft.set((event.target as HTMLElement).scrollLeft);
    }
    if (this.virtualActive()) {
      this.scrollTop.set((event.target as HTMLElement).scrollTop);
    }
  }

  stopScrollTracking(): void {
    this.scrollListener?.();
    this.scrollListener = null;
  }

  /** Mesure la zone visible et la hauteur réelle d'une ligne après le rendu. */
  measureAfterRender(): void {
    // Défilement virtuel : mesure la zone visible et la hauteur réelle d'une ligne.
    afterRenderEffect(() => {
      const hasPinnedRows = this.table.pinnedTopRows().length > 0 || this.table.pinnedBottomRows().length > 0;
      if (!this.virtualActive() && !this.table.columnLayout.columnVirtualization() && !hasPinnedRows) {
        return;
      }
      this.table.render.tableRows();
      const wrap = this.table.tableWrapElement()?.nativeElement;
      if (!wrap) {
        return;
      }
      untracked(() => {
        // Lire une hauteur juste après avoir écrit dans le document oblige le navigateur à recalculer la mise en page
        // sur-le-champ (mesuré : près d'un quart du script d'un défilement). Pendant un défilement qui recouvre la
        // tranche précédente, les lignes sont confiées à un `ResizeObserver`, qui rappelle une fois la mise en page
        // faite : la mesure ne force alors plus rien.
        if (!this.deferLayoutMeasure(wrap)) {
          this.measureLayout(wrap);
        }
      });
    });
    this.table.destroyRef.onDestroy(() => {
      this.layoutObserver?.disconnect();
      if (this.table.data.searchCacheTimer !== null) {
        clearTimeout(this.table.data.searchCacheTimer);
      }
    });
  }

  /** Observe les lignes dont la hauteur change sans que la liste rendue change. */
  observeRowHeights(): void {
    // Défilement virtuel : une ligne peut changer de hauteur sans que la liste rendue change (détail déplié ou
    // replié, texte qui passe à la ligne, image chargée). La hauteur du tableau change alors : on remesure.
    effect((onCleanup) => {
      const table = this.table.tableElement()?.nativeElement;
      const wrap = this.table.tableWrapElement()?.nativeElement;
      if (!table || !wrap || !this.virtualActive() || this.table.remote.blockMode() || typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver(() => {
        const height = this.measureRowHeights(wrap, untracked(() => this.virtualRange()));
        if (height > 0 && Math.abs(height - untracked(() => this.rowHeight())) > 0.5) {
          this.rowHeight.set(height);
        }
      });
      observer.observe(table);
      onCleanup(() => observer.disconnect());
    });
  }
}
