import {computed} from '@angular/core';
import type {NgTableComponent} from '../ng-table.component';

/** Réutilisation des lignes rendues pendant le défilement virtuel. */
export class TableRowReuse<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  /** La réutilisation des lignes s'applique (voir `[rowReuse]`). */
  readonly rowReuseActive = computed(() => {
    const mode = this.table.rowReuse();
    if (!this.table.viewport.virtualActive() || mode === false) {
      return false;
    }
    return mode === true || (!this.table.detailRowTemplate() && !this.table.columnLayout.renderedColumns().some((column) => column.cellTemplate));
  });

  /** Tranche rendue au dernier calcul : liste d'origine, première position, et identité de chaque ligne rendue. */
  private rowSlotState: {source: unknown; start: number; keys: string[]} = {source: null, start: 0, keys: []};

  private rowSlotCounter = 0;
  rowSlotJumps = 0;

  /** Dernier emplacement occupé par chaque élément rendu (voir `resolvedTrackBy`). */
  readonly rowSlotOfItem = new WeakMap<object, string>();

  /**
   * Identité de chaque élément de la tranche rendue, par position dans la liste affichée.
   *
   * - Déplacement SANS recouvrement avec la tranche précédente (saut, tri, filtre) : les identités sont reprises dans
   *   l'ordre. Le tableau n'insère, ne retire ni ne déplace aucune ligne : il change seulement leur contenu.
   * - Déplacement AVEC recouvrement (défilement d'une ou plusieurs lignes) : les lignes déjà rendues gardent leur
   *   identité, celles qui entrent en reçoivent une neuve. Une ligne est créée, une autre détruite, comme sans
   *   réutilisation. Reprendre l'identité de la ligne qui sort obligerait le tableau à déplacer toutes les autres
   *   dans le document, ce qui coûte plus que d'en créer une (mesuré).
   */
  readonly rowSlots = computed(() => {
    const byIndex = new Map<number, string>();
    const range = this.table.viewport.virtualRange();
    if (!range || !this.rowReuseActive()) {
      this.rowSlotState = {source: null, start: 0, keys: []};
      return byIndex;
    }
    let source: unknown;
    if (this.table.remote.blockMode()) {
      this.table.remote.blockVersion();
      source = this.table.remote.blockCache;
    } else {
      source = this.table.paging.pageItems();
    }
    const previous = this.rowSlotState;
    const overlaps = previous.source === source && range.start < previous.start + previous.keys.length && range.end > previous.start;
    if (previous.source === source && !overlaps && previous.keys.length > 0) {
      this.rowSlotJumps++; // même liste, autre endroit : les lignes rendues changent de contenu sur place
    }
    const keys: string[] = [];
    for (let index = range.start; index < range.end; index++) {
      const reused = overlaps ? previous.keys[index - previous.start] : previous.keys[index - range.start];
      const key = reused ?? `__slot_${this.rowSlotCounter++}`;
      keys.push(key);
      byIndex.set(index, key);
    }
    this.rowSlotState = {source, start: range.start, keys};
    return byIndex;
  });

  /** Position, dans la liste affichée, de chaque élément rendu (pour retrouver son identité). */
  readonly rowSlotIndexes = computed(() => {
    const indexes = new Map<unknown, number>();
    const range = this.table.viewport.virtualRange();
    if (!range || !this.rowReuseActive() || this.table.remote.blockMode()) {
      return indexes;
    }
    const items = this.table.paging.pageItems();
    for (let index = range.start; index < range.end; index++) {
      indexes.set(items[index], index);
    }
    return indexes;
  });
}
