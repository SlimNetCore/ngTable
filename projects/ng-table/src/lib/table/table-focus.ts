import {afterEveryRender, afterNextRender} from '@angular/core';
import {gridCellAt} from '../grid-navigation';
import type {NgTableComponent} from '../ng-table.component';

/** Conservation du focus quand l'élément focalisé disparaît ou est rendu à nouveau. */
export class TableFocus<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  private lastFocused: HTMLElement | null = null;
  private lastFocusZone = '';

  /** Où replacer le focus quand le contrôle qui l'avait a disparu : le voisin le plus proche qui existe encore. */
  focusFallback(zone: string): HTMLElement | null {
    const host = this.table.hostElement.nativeElement;
    const pick = (selector: string) => host.querySelector<HTMLElement>(selector);
    const table = this.table.tableElement()?.nativeElement;
    const cell = this.table.keyboard.gridActive() && table ? gridCellAt(table, this.table.keyboard.activeGridCell()) : null;
    const byZone: Record<string, string[]> = {
      'global-search': ['.global-search__input'],
      'active-filters-bar': ['.active-filter-chip__clear', '.global-search__input'],
      'ngt-side-panel': ['.ngt-side-panel-toggle'],
      'ngt-group-panel': ['.ngt-group-chip__remove', '.ngt-group-panel__add'],
    };
    for (const selector of byZone[zone] ?? []) {
      const target = pick(selector);
      if (target) {
        return target;
      }
    }
    if (cell) {
      return cell;
    }
    const wrap = this.table.tableWrapElement()?.nativeElement ?? null;
    if (wrap && wrap.getAttribute('tabindex') === null) {
      wrap.tabIndex = -1;
    }
    return pick('.global-search__input') ?? pick('.list-actions button:not([disabled])') ?? wrap;
  }

  /** Après un rendu, remet le focus sur l'élément que `find` désigne (un déplacement dans le document le fait perdre). */
  refocusAfterRender(find: () => HTMLElement | null | undefined): void {
    afterNextRender(
      () => {
        const target = find();
        if (target && document.activeElement !== target) {
          target.focus();
        }
      },
      {injector: this.table.injector},
    );
  }

  /** Replace le focus sur un voisin stable quand l'élément qui l'avait disparaît (WCAG 2.4.3). */
  restoreLostFocus(): void {
    // Focus perdu (WCAG 2.4.3) : quand le contrôle qui avait le focus disparaît (croix d'une puce de filtre, « effacer
    // la recherche », barre d'actions après « désélectionner », panneau fermé...), le navigateur renvoie le focus au
    // début de la page. On le replace sur un voisin stable de la table.
    const hostElement = this.table.hostElement.nativeElement;
    const onFocusIn = (event: FocusEvent): void => {
      this.lastFocused = event.target instanceof HTMLElement ? event.target : null;
      this.lastFocusZone = this.lastFocused?.closest('.global-search, .active-filters-bar, .ngt-side-panel, .ngt-group-panel')?.className.split(' ')[0] ?? '';
    };
    const onFocusOut = (event: FocusEvent): void => {
      // Le focus part ailleurs dans la page, de la volonté de l'utilisateur : rien à rattraper.
      if (event.relatedTarget instanceof Node && !hostElement.contains(event.relatedTarget)) {
        this.lastFocused = null;
      }
    };
    hostElement.addEventListener('focusin', onFocusIn);
    hostElement.addEventListener('focusout', onFocusOut);
    this.table.destroyRef.onDestroy(() => {
      hostElement.removeEventListener('focusin', onFocusIn);
      hostElement.removeEventListener('focusout', onFocusOut);
    });
    afterEveryRender(() => {
      // Saut avec réutilisation des lignes : la cellule au focus a changé de contenu sans que le focus bouge.
      if (this.table.reuse.rowSlotJumps !== this.table.keyboard.rowSlotJumpsSeen) {
        this.table.keyboard.rowSlotJumpsSeen = this.table.reuse.rowSlotJumps;
        this.table.keyboard.announceFocusedCellAfterJump();
      }
      const lost = this.lastFocused;
      if (!lost || (lost.isConnected && lost.getClientRects().length > 0)) {
        return;
      }
      this.lastFocused = null;
      if (document.activeElement && document.activeElement !== document.body) {
        return; // le focus est déjà ailleurs
      }
      this.focusFallback(this.lastFocusZone)?.focus({preventScroll: true});
    });
  }
}
