import {describe, expect, it} from 'vitest';
import {buildHeaderGroupLevels, HeaderGroupItem, headerGroupPath} from './header-groups';

const item = (id: string, path: string[] = [], pin?: 'left' | 'right'): HeaderGroupItem => ({id, path, pin});
const summary = (levels: ReturnType<typeof buildHeaderGroupLevels>) =>
  levels.map((level) => level.runs.map((run) => `${run.label || '·'}×${run.span}`).join(' '));

describe('header-groups', () => {
  it('headerGroupPath : texte, chemin, libellés vides écartés', () => {
    expect(headerGroupPath(undefined)).toEqual([]);
    expect(headerGroupPath('Identité')).toEqual(['Identité']);
    expect(headerGroupPath(['Identité', ' ', 'Contact'])).toEqual(['Identité', 'Contact']);
  });

  it('aucune colonne groupée : aucune ligne d’en-tête supplémentaire', () => {
    expect(buildHeaderGroupLevels([item('a'), item('b')])).toEqual([]);
  });

  it('fusionne les colonnes voisines du même groupe, avec des cellules vides pour les autres', () => {
    const levels = buildHeaderGroupLevels([item('ref'), item('nom', ['Identité']), item('prenom', ['Identité']), item('montant', ['Finance'])]);
    expect(summary(levels)).toEqual(['·×1 Identité×2 Finance×1']);
    expect(levels[0].ids).toHaveLength(3); // un identifiant par cellule
  });

  it('plusieurs niveaux : le sous-groupe reste sous son parent', () => {
    const levels = buildHeaderGroupLevels([
      item('nom', ['Identité', 'État civil']),
      item('prenom', ['Identité', 'État civil']),
      item('mail', ['Identité', 'Contact']),
      item('tel', ['Identité', 'Contact']),
      item('montant', ['Finance']),
    ]);
    expect(summary(levels)).toEqual(['Identité×4 Finance×1', 'État civil×2 Contact×2 ·×1']);
  });

  it('un groupe de même nom sous deux parents différents n’est pas fusionné', () => {
    const levels = buildHeaderGroupLevels([item('a', ['X', 'Détail']), item('b', ['Y', 'Détail'])]);
    expect(summary(levels)).toEqual(['X×1 Y×1', 'Détail×1 Détail×1']);
  });

  it('colonnes d’un même groupe séparées par une autre : deux cellules', () => {
    const levels = buildHeaderGroupLevels([item('a', ['G']), item('b'), item('c', ['G'])]);
    expect(summary(levels)).toEqual(['G×1 ·×1 G×1']);
  });

  it('un groupe ne traverse pas la limite des colonnes épinglées', () => {
    const levels = buildHeaderGroupLevels([item('ref', ['Identité'], 'left'), item('nom', ['Identité']), item('actions', ['Identité'], 'right')]);
    expect(summary(levels)).toEqual(['Identité×1 Identité×1 Identité×1']);
    expect(levels[0].runs.map((run) => run.pin)).toEqual(['left', undefined, 'right']);
  });

  it('les clés de cellules sont uniques', () => {
    const levels = buildHeaderGroupLevels([item('a', ['G', 'H']), item('b'), item('c', ['G', 'H'])]);
    const keys = levels.flatMap((level) => level.ids);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
