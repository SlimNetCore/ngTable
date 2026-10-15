import {describe, expect, it} from 'vitest';
import {NgTableSelectionAction, resolveSelectionActions} from './selection-actions';

interface Order {
  id: number;
  statut: 'BROUILLON' | 'VALIDEE';
}

const drafts: Order[] = [{id: 1, statut: 'BROUILLON'}, {id: 2, statut: 'BROUILLON'}];
const mixed: Order[] = [{id: 1, statut: 'BROUILLON'}, {id: 3, statut: 'VALIDEE'}];

const actions: NgTableSelectionAction<Order>[] = [
  {id: 'validate', label: 'Valider', when: (rows) => rows.every((row) => row.statut === 'BROUILLON')},
  {id: 'ship', label: 'Expédier', when: (rows) => rows.every((row) => row.statut === 'VALIDEE'), otherwise: 'disable', disabledReason: 'Seules les commandes validées peuvent être expédiées'},
  {id: 'edit', label: 'Modifier', maxRows: 1, otherwise: 'disable'},
  {id: 'merge', label: 'Fusionner', minRows: 2},
  {id: 'delete', label: 'Supprimer', appearance: 'danger'},
];

const ids = (rows: readonly Order[]) => resolveSelectionActions(actions, rows).map((item) => `${item.action.id}${item.enabled ? '' : '!'}`);

describe('actions de la barre de sélection', () => {
  it('une règle non respectée masque l’action, ou la grise avec sa raison', () => {
    expect(ids(drafts)).toEqual(['validate', 'ship!', 'edit!', 'merge', 'delete']);
    const ship = resolveSelectionActions(actions, drafts).find((item) => item.action.id === 'ship');
    expect(ship?.reason).toBe('Seules les commandes validées peuvent être expédiées');
  });

  it('une sélection mixte ne respecte aucune des deux règles de statut', () => {
    expect(ids(mixed)).toEqual(['ship!', 'edit!', 'merge', 'delete']);
  });

  it('nombre de lignes : minRows et maxRows, avec une raison par défaut en français', () => {
    expect(ids([drafts[0]])).toEqual(['validate', 'ship!', 'edit', 'delete']); // une seule ligne : « Fusionner » (min 2) disparaît
    const edit = resolveSelectionActions(actions, drafts).find((item) => item.action.id === 'edit');
    expect(edit?.enabled).toBe(false);
    expect(edit?.reason).toBe('Disponible pour une seule ligne');
  });

  it('une action grisée peut calculer sa raison depuis la sélection', () => {
    const [item] = resolveSelectionActions<Order>(
      [{id: 'x', label: 'X', when: () => false, otherwise: 'disable', disabledReason: (rows) => `${rows.length} commandes, aucune ne convient`}],
      drafts,
    );
    expect(item.reason).toBe('2 commandes, aucune ne convient');
  });

  it('une règle qui échoue (exception) est traitée comme non respectée, sans casser la barre', () => {
    const risky: NgTableSelectionAction<Order>[] = [{id: 'boom', label: 'Boom', when: () => { throw new Error('règle cassée'); }}, {id: 'ok', label: 'Ok'}];
    expect(resolveSelectionActions(risky, drafts).map((item) => item.action.id)).toEqual(['ok']);
  });

  it('sans sélection, seules les actions qui acceptent 0 ligne restent', () => {
    expect(resolveSelectionActions(actions, []).map((item) => item.action.id)).toEqual(['ship', 'edit']);
    expect(resolveSelectionActions([{id: 'new', label: 'Nouvelle', minRows: 0}], []).map((item) => item.enabled)).toEqual([true]);
  });
});
