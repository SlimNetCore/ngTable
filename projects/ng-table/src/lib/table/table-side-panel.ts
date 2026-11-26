import {signal} from '@angular/core';
import type {NgTableComponent} from '../ng-table.component';

/** Panneau latéral : ouverture, onglets. */
export class TableSidePanel<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  readonly sidePanelTab = signal<'columns' | 'filters'>('columns');

  /** Un clic à l'extérieur ferme le panneau, sauf s'il est fixé. */
  onDocumentClick(event: Event): void {
    if (!this.table.sidePanelOpen() || this.table.sidePanelPinned()) {
      return;
    }
    const target = event.target as Element | null;
    if (target?.closest('.ngt-side-panel, .ngt-side-panel-toggle') || !target?.isConnected) {
      return; // dans le panneau, sur son bouton, ou sur un élément retiré du DOM par ce clic
    }
    this.table.sidePanelOpen.set(false);
  }

  /** Voir `NgTableComponent.toggleSidePanel`. */
  toggleSidePanel(tab?: 'columns' | 'filters'): void {
    const switching = !!tab && this.sidePanelTab() !== tab;
    if (tab) {
      this.sidePanelTab.set(tab);
    }
    // Un onglet différent de l'onglet affiché reste ouvert ; sinon on bascule ouvert / fermé.
    this.table.sidePanelOpen.update((open) => (switching && open ? true : !open));
  }

  /** Préfixe des identifiants du panneau latéral (onglets reliés à leur contenu). */
  get sidePanelId(): string {
    return this.table.cellEditing.editorErrorId.replace('editor-error', 'side-panel');
  }

  /** Onglets du panneau latéral (motif « tabs ») : les flèches, Début et Fin changent d'onglet et le focus suit. */
  onSidePanelTabsKeydown(event: KeyboardEvent): void {
    const current = this.sidePanelTab();
    let next: 'columns' | 'filters' | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      next = current === 'columns' ? 'filters' : 'columns';
    } else if (event.key === 'Home') {
      next = 'columns';
    } else if (event.key === 'End') {
      next = 'filters';
    }
    if (!next) {
      return;
    }
    event.preventDefault();
    this.sidePanelTab.set(next);
    (event.currentTarget as HTMLElement).querySelector<HTMLElement>(`[id$="-tab-${next}"]`)?.focus();
  }
}
