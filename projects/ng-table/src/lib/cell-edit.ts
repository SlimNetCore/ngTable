/**
 * Édition de cellules : choix de l'éditeur, lecture de ce que l'utilisateur a saisi, et
 * historique annuler / rétablir. Fonctions et classes pures, sans dépendance Angular.
 */
import {toIsoDay} from './filter-matching';

export type NgTableEditorKind = 'text' | 'number' | 'date' | 'select' | 'checkbox';

/** Ce que `editorKindFor` doit savoir d'une colonne. */
export interface EditorColumnLike {
  editor?: NgTableEditorKind;
  filter?: { type?: string };
}

/**
 * Éditeur d'une colonne : celui déclaré, sinon déduit du filtre (nombre, date, booléen,
 * liste de valeurs), sinon un champ texte.
 */
export function editorKindFor(column: EditorColumnLike): NgTableEditorKind {
  if (column.editor) {
    return column.editor;
  }
  switch (column.filter?.type) {
    case 'number':
    case 'numberRange':
      return 'number';
    case 'date':
      return 'date';
    case 'boolean':
      return 'checkbox';
    case 'enum':
      return 'select';
    default:
      return 'text';
  }
}

/** Texte proposé dans l'éditeur pour la valeur actuelle de la cellule. */
export function draftFromValue(kind: NgTableEditorKind, value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (kind === 'date') {
    return toIsoDay(value); // `<input type="date">` attend AAAA-MM-JJ
  }
  return `${value}`;
}

export type ParsedDraft = { ok: true; value: unknown } | { ok: false; error: 'number' | 'date' };

/**
 * Valeur correspondant à un texte saisi. Nombre : virgule ou point décimal, espaces
 * ignorés, vide = `null`. Date : AAAA-MM-JJ valide, vide = `null`. Texte et liste : tel quel.
 */
export function parseDraft(kind: NgTableEditorKind, draft: string): ParsedDraft {
  switch (kind) {
    case 'number': {
      const text = draft.trim().replace(/\s/g, '').replace(',', '.');
      if (text === '') {
        return {ok: true, value: null};
      }
      const value = Number(text);
      return Number.isFinite(value) ? {ok: true, value} : {ok: false, error: 'number'};
    }
    case 'date': {
      const text = draft.trim();
      if (text === '') {
        return {ok: true, value: null};
      }
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(text) && toIsoDay(new Date(`${text}T00:00:00`)) === text;
      return valid ? {ok: true, value: text} : {ok: false, error: 'date'};
    }
    case 'checkbox': {
      const text = draft.trim().toLowerCase();
      return {ok: true, value: text === 'true' || text === '1' || text === 'oui' || text === 'yes'};
    }
    default:
      return {ok: true, value: draft};
  }
}

/** Deux valeurs de cellule sont-elles identiques (pour ne pas enregistrer une édition sans effet) ? */
export function sameCellValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  // Une cellule vide peut être `null`, `undefined` ou `''` selon la source : même chose pour l'utilisateur.
  const empty = (value: unknown) => value === null || value === undefined || value === '';
  return Object.is(a, b) || (empty(a) && empty(b)) || (typeof a !== 'object' && typeof b !== 'object' && `${a}` === `${b}`);
}

/** Une modification d'une cellule : la ligne avant et après, pour pouvoir la défaire ou la refaire. */
export interface EditChange<T> {
  key: unknown;
  columnId: string;
  previous: T;
  current: T;
}

/** Lignes à réécrire pour défaire ou refaire un lot de modifications (une par clé de ligne). */
export interface EditRestore<T> {
  rows: T[];
  changes: EditChange<T>[];
}

/**
 * Historique annuler / rétablir. Un « lot » regroupe les modifications d'une même action
 * (une saisie, un collage de plusieurs cellules) : un seul Ctrl+Z les défait toutes.
 */
export class EditHistory<T> {
  private undoStack: EditChange<T>[][] = [];
  private redoStack: EditChange<T>[][] = [];

  constructor(private readonly limit = 100) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Enregistre un lot ; une nouvelle modification efface ce qu'on pouvait rétablir. */
  record(batch: EditChange<T>[]): void {
    if (batch.length === 0) {
      return;
    }
    this.undoStack.push(batch);
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /** Dernier lot et lignes à remettre (leur état d'avant), ou `null` s'il n'y en a pas. */
  undo(): EditRestore<T> | null {
    const batch = this.undoStack.pop();
    if (!batch) {
      return null;
    }
    this.redoStack.push(batch);
    // Plusieurs changements sur la même ligne : on remet l'état d'avant le premier.
    const first = new Map<unknown, T>();
    for (const change of batch) {
      if (!first.has(change.key)) {
        first.set(change.key, change.previous);
      }
    }
    return {rows: [...first.values()], changes: batch};
  }

  /** Dernier lot défait et lignes à réécrire (leur état d'après le dernier changement). */
  redo(): EditRestore<T> | null {
    const batch = this.redoStack.pop();
    if (!batch) {
      return null;
    }
    this.undoStack.push(batch);
    const last = new Map<unknown, T>();
    for (const change of batch) {
      last.set(change.key, change.current);
    }
    return {rows: [...last.values()], changes: batch};
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
