import {afterNextRender, computed, effect, signal, untracked} from '@angular/core';
import {gridRows, locateGridCell, nextGridPosition} from '../grid-navigation';
import {
  draftFromValue,
  EditChange,
  EditHistory,
  editorKindFor,
  EditRestore,
  NgTableEditorKind,
  parseDraft,
  sameCellValue,
} from '../cell-edit';
import type {NgTableCellEditEvent, NgTableColumn, NgTableFilterOption} from '../ng-table.models';
import type {NgTableComponent} from '../ng-table.component';

let nextEditorErrorId = 0;

/** Édition de cellules : éditeurs, validation, annuler et rétablir. */
export class TableCellEditing<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  /** Une colonne au moins est éditable : les cellules portent leur id de colonne (`data-ngt-col`). */
  readonly hasEditableColumns = computed(() => this.table.columns().some((column) => !!column.editable));

  /** Cellule en cours d'édition : repérée par la clé de sa ligne (stable au tri, au défilement). */
  readonly editing = signal<{ key: unknown; columnId: string; draft: string; error: string | null; cell: HTMLElement | null } | null>(null);

  private history = new EditHistory<T>(100);
  private readonly historyVersion = signal(0);

  /** Voir `NgTableComponent.canUndo`. */
  readonly canUndo = computed(() => {
    this.historyVersion(); // dépendance : l'historique n'est pas un signal
    return this.history.canUndo;
  });

  /** Voir `NgTableComponent.canRedo`. */
  readonly canRedo = computed(() => {
    this.historyVersion();
    return this.history.canRedo;
  });

  isEditable(row: T, column: NgTableColumn<T>): boolean {
    if (!column.editable || this.table.render.pinnedInfo().has(row)) {
      return false;
    }
    return typeof column.editable === 'function' ? column.editable(row) : true;
  }

  editorKind(column: NgTableColumn<T>): NgTableEditorKind {
    return editorKindFor(column);
  }

  editorOptions(column: NgTableColumn<T>): NgTableFilterOption[] {
    return column.editorOptions ?? column.filter?.options ?? [];
  }

  isEditing(row: T, column: NgTableColumn<T>): boolean {
    const editing = this.editing();
    return !!editing && editing.columnId === column.id && Object.is(editing.key, this.table.data.rowKey(row));
  }

  /** Case à cocher éditable : toujours affichée, un clic enregistre tout de suite. */
  isInlineCheckbox(row: T, column: NgTableColumn<T>): boolean {
    return this.hasEditableColumns() && this.editorKind(column) === 'checkbox' && this.isEditable(row, column);
  }

  columnOfCell(cell: Element): NgTableColumn<T> | null {
    const id = cell.getAttribute('data-ngt-col');
    return id ? (this.table.columnLayout.visibleColumns().find((column) => column.id === id) ?? null) : null;
  }

  private findRowByKey(key: unknown): T | undefined {
    return this.table.dataMode() === 'local' ? this.table.data.syncedStore().get(key) : this.table.paging.displayedRows().find((row) => Object.is(this.table.data.rowKey(row), key));
  }

  onCellDoubleClick(event: MouseEvent, row: T, column: NgTableColumn<T>): void {
    if (!this.hasEditableColumns() || (event.target as HTMLElement).closest('button, a, input, select, textarea')) {
      return;
    }
    this.startEdit(row, column, (event.currentTarget as HTMLElement) ?? null);
  }

  /**
   * Ouvre l'éditeur de la cellule (ou, pour une case à cocher, bascule sa valeur). `initial`
   * remplace le contenu : le caractère tapé pour démarrer. `false` si la cellule n'est pas éditable.
   */
  startEdit(row: T, column: NgTableColumn<T>, cell: HTMLElement | null, initial?: string): boolean {
    if (!this.isEditable(row, column)) {
      return false;
    }
    if (this.editing()) {
      this.finishEdit('none'); // une seule cellule en cours d'édition
    }
    const kind = this.editorKind(column);
    if (kind === 'checkbox') {
      this.commitValue(row, column, !column.valueAccessor(row), 'edit');
      return true;
    }
    const draft = initial !== undefined && kind !== 'select' ? initial : draftFromValue(kind, column.valueAccessor(row));
    this.editing.set({key: this.table.data.rowKey(row), columnId: column.id, draft, error: null, cell});
    afterNextRender(
      () => {
        const editor = this.table.hostElement.nativeElement.querySelector<HTMLInputElement | HTMLSelectElement>('.ngt-editor');
        editor?.focus();
        if (editor instanceof HTMLInputElement && editor.type === 'text') {
          if (initial !== undefined) {
            editor.setSelectionRange(draft.length, draft.length);
          } else {
            editor.select();
          }
        }
      },
      {injector: this.table.injector},
    );
    return true;
  }

  /** Voir `NgTableComponent.startEditing`. */
  startEditing(row: T, columnId: string): boolean {
    const column = this.table.columns().find((candidate) => candidate.id === columnId);
    return !!column && this.startEdit(row, column, null);
  }

  /** Voir `NgTableComponent.stopEditing`. */
  stopEditing(cancel = false): void {
    if (cancel) {
      this.cancelEdit();
    } else {
      this.finishEdit('none');
    }
  }

  onInlineCheckbox(row: T, column: NgTableColumn<T>, checked: boolean): void {
    this.commitValue(row, column, checked, 'edit');
  }

  onEditInput(value: string): void {
    this.editing.update((editing) => (editing ? {...editing, draft: value, error: null} : editing));
  }

  /**
   * Liste de l'éditeur : le choix est retenu, et validé par Entrée, Tab ou la sortie du champ. Valider à chaque
   * changement fermait l'éditeur dès la première flèche sous Windows, sur l'option voisine (WCAG 3.2.2).
   */
  onEditSelect(value: string): void {
    this.onEditInput(value);
  }

  onEditorKeydown(event: KeyboardEvent): void {
    event.stopPropagation(); // les touches de l'éditeur ne pilotent pas la grille
    if (event.key === 'Enter') {
      event.preventDefault();
      this.finishEdit('down');
    } else if (event.key === 'Tab') {
      event.preventDefault();
      this.finishEdit(event.shiftKey ? 'left' : 'right');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEdit();
    }
  }

  /** Perte de focus : valide ; une saisie invalide est abandonnée (et signalée par `cellEditRejected`). */
  onEditorBlur(): void {
    if (this.editing() && !this.finishEdit('none')) {
      // La saisie est refusée et le champ perd le focus : on dit pourquoi avant de revenir à l'ancienne valeur,
      // sinon la valeur reviendrait en arrière sans explication (WCAG 3.3.1).
      const error = this.editing()?.error;
      this.cancelEdit(false);
      if (error) {
        this.table.announce([error]);
      }
    }
  }

  /**
   * Valide la saisie en cours. `false` si elle est refusée : l'éditeur reste ouvert avec son
   * message d'erreur. Sinon l'édition se ferme et le focus passe à la cellule voisine (`move`).
   */
  private finishEdit(move: 'none' | 'stay' | 'down' | 'right' | 'left'): boolean {
    const editing = this.editing();
    if (!editing) {
      return true;
    }
    const column = this.table.columnLayout.visibleColumns().find((candidate) => candidate.id === editing.columnId);
    const row = this.findRowByKey(editing.key);
    if (!column || row === undefined) {
      this.editing.set(null);
      return true;
    }
    const labels = this.table.effectiveLabels();
    const parsed = parseDraft(this.editorKind(column), editing.draft);
    let error: string | null = parsed.ok ? null : parsed.error === 'number' ? labels.editInvalidNumber : labels.editInvalidDate;
    if (parsed.ok) {
      error = column.validate?.(parsed.value, row) ?? null;
    }
    if (error || !parsed.ok) {
      this.editing.set({...editing, error});
      this.table.cellEditRejected.emit({row, column, value: editing.draft, error: error ?? ''});
      return false;
    }
    this.editing.set(null);
    this.commitValue(row, column, parsed.value, 'edit');
    this.focusAfterEdit(editing.cell, move);
    return true;
  }

  private cancelEdit(refocus = true): void {
    const editing = this.editing();
    this.editing.set(null);
    if (refocus) {
      this.focusAfterEdit(editing?.cell ?? null, 'stay');
    }
  }

  private focusAfterEdit(cell: HTMLElement | null, move: 'none' | 'stay' | 'down' | 'right' | 'left'): void {
    if (!cell || !cell.isConnected || move === 'none') {
      return;
    }
    const table = this.table.tableElement()?.nativeElement;
    const key = move === 'down' ? 'ArrowDown' : move === 'right' ? 'ArrowRight' : move === 'left' ? 'ArrowLeft' : null;
    const located = key && this.table.keyboard.gridActive() && table ? locateGridCell(table, cell) : null;
    const columns = (cell.parentElement as HTMLTableRowElement | null)?.cells.length ?? 0;
    const next = located && key && table ? nextGridPosition(key, false, located.position, gridRows(table).length, columns) : null;
    if (next && table) {
      this.table.keyboard.focusGridCell(table, next, cell as HTMLTableCellElement);
    } else {
      if (cell.getAttribute('tabindex') === null) {
        cell.tabIndex = -1; // sans navigation par cellule, une cellule n'est pas focalisable : le focus tombait sur la page
      }
      cell.focus({preventScroll: true});
    }
  }

  /**
   * Applique une valeur à une cellule : validation, `valueSetter`, transaction (mode local),
   * historique et événement. `false` si la valeur ne change rien.
   */
  private commitValue(row: T, column: NgTableColumn<T>, value: unknown, source: 'edit' | 'paste'): boolean {
    const oldValue = column.valueAccessor(row);
    if (sameCellValue(oldValue, value)) {
      return false;
    }
    const newRow = column.valueSetter ? column.valueSetter(row, value) : null;
    if (newRow && this.table.dataMode() === 'local') {
      this.table.live.applyTransactionNow({update: [newRow]});
      this.history.record([{key: this.table.data.rowKey(row), columnId: column.id, previous: row, current: newRow}]);
      this.historyVersion.update((version) => version + 1);
    }
    this.table.cellEdited.emit({row, newRow, column, oldValue, newValue: value, source});
    this.table.announce([this.table.effectiveLabels().announceCellEdited.replace('{column}', column.header)]);
    return true;
  }

  /** Voir `NgTableComponent.undo`. */
  undo(): boolean {
    return this.restoreEdits(this.history.undo(), 'undo');
  }

  /** Voir `NgTableComponent.redo`. */
  redo(): boolean {
    return this.restoreEdits(this.history.redo(), 'redo');
  }

  private restoreEdits(restore: EditRestore<T> | null, source: 'undo' | 'redo'): boolean {
    if (!restore) {
      return false;
    }
    this.table.live.applyTransactionNow({update: restore.rows});
    this.historyVersion.update((version) => version + 1);
    for (const change of restore.changes) {
      const column = this.table.columns().find((candidate) => candidate.id === change.columnId);
      if (column) {
        const from = source === 'undo' ? change.current : change.previous;
        const to = source === 'undo' ? change.previous : change.current;
        this.table.cellEdited.emit({row: from, newRow: to, column, oldValue: column.valueAccessor(from), newValue: column.valueAccessor(to), source});
      }
    }
    const labels = this.table.effectiveLabels();
    this.table.announce([source === 'undo' ? labels.announceEditUndone : labels.announceEditRedone]);
    return true;
  }

  /** Écrit les valeurs collées dans les cellules éditables, en un seul lot annulable. Renvoie le nombre de cellules modifiées. */
  applyPastedValues(assignments: readonly { row: T; column: NgTableColumn<T>; value: string }[], source: 'paste' | 'fill' = 'paste'): number {
    if (this.table.dataMode() !== 'local') {
      return 0;
    }
    const latest = new Map<unknown, T>();
    const changes: EditChange<T>[] = [];
    const events: NgTableCellEditEvent<T>[] = [];
    let rejected = 0;
    for (const {row, column, value} of assignments) {
      if (!column.valueSetter || !this.isEditable(row, column)) {
        continue;
      }
      const key = this.table.data.rowKey(row);
      const current = latest.get(key) ?? this.findRowByKey(key) ?? row;
      const parsed = parseDraft(this.editorKind(column), value);
      const labels = this.table.effectiveLabels();
      const error = !parsed.ok ? (parsed.error === 'number' ? labels.editInvalidNumber : labels.editInvalidDate) : (column.validate?.(parsed.value, current) ?? null);
      if (error || !parsed.ok) {
        this.table.cellEditRejected.emit({row: current, column, value, error: error ?? ''});
        rejected++;
        continue;
      }
      const oldValue = column.valueAccessor(current);
      if (sameCellValue(oldValue, parsed.value)) {
        continue;
      }
      const next = column.valueSetter(current, parsed.value);
      latest.set(key, next);
      changes.push({key, columnId: column.id, previous: current, current: next});
      events.push({row: current, newRow: next, column, oldValue, newValue: parsed.value, source});
    }
    if (changes.length > 0) {
      this.table.live.applyTransactionNow({update: [...latest.values()]});
      this.history.record(changes);
      this.historyVersion.update((version) => version + 1);
      events.forEach((event) => this.table.cellEdited.emit(event));
      const labels = this.table.effectiveLabels();
      this.table.announce([
        events.length === 1 ? labels.announceCellEdited.replace('{column}', events[0].column.header) : labels.announceCellsEdited.replace('{count}', `${events.length}`),
        rejected > 0 ? labels.announceValuesRejected.replace('{count}', `${rejected}`) : '',
      ]);
    } else if (rejected > 0) {
      this.table.announce([this.table.effectiveLabels().announceValuesRejected.replace('{count}', `${rejected}`)]);
    }
    return changes.length;
  }

  /** Identifiant du message d'erreur de l'éditeur, relié au champ par `aria-describedby`. */
  readonly editorErrorId = `ngt-editor-error-${nextEditorErrorId++}`;

  /** Repart d'un historique vide quand `[undoRedoLimit]` change. */
  resetHistoryOnLimitChange(): void {
    // Taille de l'historique annuler / rétablir : en changer repart d'un historique vide.
    effect(() => {
      const limit = Math.max(1, this.table.undoRedoLimit());
      untracked(() => {
        this.history = new EditHistory<T>(limit);
        this.historyVersion.update((version) => version + 1);
      });
    });
  }
}
