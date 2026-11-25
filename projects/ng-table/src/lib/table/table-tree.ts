import {computed, signal} from '@angular/core';
import {countActiveConditions} from '../advanced-filter';
import {buildTreeIndex, flattenNested, TreeIndex} from '../tree-data';
import {searchTerms} from '../filter-matching';
import type {NgTableComponent} from '../ng-table.component';

/** Données arborescentes : profondeur, repli et dépli des nœuds. */
export class TableTree<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  readonly treeActive = computed(
    () => this.table.treeData() && this.table.dataMode() === 'local' && (!!this.table.treeChildren() || !!this.table.treeParent()),
  );

  /** Lignes imbriquées mises à plat (et leurs parents), ou `null` hors mode `[treeChildren]`. */
  readonly treeNested = computed(() => {
    const children = this.table.treeChildren();
    return this.treeActive() && children ? flattenNested(this.table.rows(), children, (row) => this.table.data.rowKey(row)) : null;
  });

  readonly treeIndex = computed<TreeIndex | null>(() => {
    if (!this.treeActive()) {
      return null;
    }
    const nested = this.treeNested();
    const parentOf = this.table.treeParent();
    const keyOf = (row: T) => this.table.data.rowKey(row);
    return buildTreeIndex(this.table.data.sourceRows(), keyOf, nested ? (row) => nested.parents.get(keyOf(row)) : (row) => parentOf?.(row));
  });

  /** Un filtre ou une recherche est actif : l'arbre se déplie pour montrer les correspondances. */
  readonly treeFilterActive = computed(
    () =>
      Object.values(this.table.filtering.columnFilters()).some((value) => value.trim() !== '') ||
      searchTerms(this.table.filtering.globalSearchTerm()).length > 0 ||
      countActiveConditions(this.table.advancedFilter(), this.table.columns()) > 0,
  );

  /** Nœuds dont l'état diffère de l'état par défaut (déplié ou replié par l'utilisateur). */
  private readonly treeToggled = signal<ReadonlySet<unknown>>(new Set());

  /** « Tout déplier » / « Tout replier » : prend le pas sur `[treeDefaultExpanded]` jusqu'au prochain changement de données. */
  private readonly treeAll = signal<boolean | null>(null);

  readonly treeExpansion = computed(() => {
    const toggled = this.treeToggled();
    const all = this.treeAll();
    const initial = this.table.treeDefaultExpanded();
    const filtering = this.treeFilterActive();
    return (key: unknown, depth: number): boolean => {
      const base = filtering || (all ?? (initial === true || (typeof initial === 'number' && depth < initial)));
      return toggled.has(key) ? !base : base;
    };
  });

  treeDepth(row: T): number {
    return this.treeIndex()?.depth.get(this.table.data.rowKey(row)) ?? 0;
  }

  treeHasChildren(row: T): boolean {
    return (this.treeIndex()?.children.get(this.table.data.rowKey(row))?.length ?? 0) > 0;
  }

  isTreeExpanded(row: T): boolean {
    const key = this.table.data.rowKey(row);
    return this.treeExpansion()(key, this.treeIndex()?.depth.get(key) ?? 0);
  }

  /** `aria-expanded` d'une ligne d'arbre : seulement pour un nœud qui a des enfants. */
  treeAriaExpanded(row: T): boolean | null {
    return this.treeActive() && this.treeHasChildren(row) ? this.isTreeExpanded(row) : null;
  }

  onTreeToggle(event: Event, row: T): void {
    event.stopPropagation();
    this.setTreeExpanded(row, !this.isTreeExpanded(row));
  }

  /** Voir `NgTableComponent.setTreeExpanded`. */
  setTreeExpanded(row: T, expanded: boolean): void {
    if (!this.treeActive() || !this.treeHasChildren(row) || this.isTreeExpanded(row) === expanded) {
      return;
    }
    const key = this.table.data.rowKey(row);
    this.treeToggled.update((toggled) => {
      const next = new Set(toggled);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });
    this.table.treeToggle.emit({row, expanded});
  }

  /** Voir `NgTableComponent.expandAllTree`. */
  expandAllTree(): void {
    this.treeAll.set(true);
    this.treeToggled.set(new Set());
    this.table.announce([this.table.effectiveLabels().announceAllExpanded]);
  }

  /** Voir `NgTableComponent.collapseAllTree`. */
  collapseAllTree(): void {
    this.treeAll.set(false);
    this.treeToggled.set(new Set());
    this.table.announce([this.table.effectiveLabels().announceAllCollapsed]);
  }
}
