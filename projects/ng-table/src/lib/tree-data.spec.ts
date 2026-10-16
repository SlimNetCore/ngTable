import {describe, expect, it} from 'vitest';
import {buildTreeIndex, flattenNested, layoutTree, withAncestors} from './tree-data';

interface Node {
  id: string;
  parent?: string | null;
  kids?: Node[];
}

const key = (n: Node) => n.id;
const flat: Node[] = [
  {id: 'a'},
  {id: 'a1', parent: 'a'},
  {id: 'a2', parent: 'a'},
  {id: 'a1x', parent: 'a1'},
  {id: 'b'},
  {id: 'b1', parent: 'b'},
];
const ids = (list: Node[]) => list.map((n) => n.id).join(',');

describe('tree-data', () => {
  describe('flattenNested', () => {
    it('met à plat parents avant enfants, dans l’ordre, et retient les parents', () => {
      const nested: Node[] = [
        {id: 'a', kids: [{id: 'a1', kids: [{id: 'a1x'}]}, {id: 'a2'}]},
        {id: 'b', kids: [{id: 'b1'}]},
      ];
      const {rows, parents} = flattenNested(nested, (n) => n.kids, key);
      expect(ids(rows)).toBe('a,a1,a1x,a2,b,b1');
      expect(parents.get('a1x')).toBe('a1');
      expect(parents.has('a')).toBe(false);
    });

    it('ignore les doublons et les cycles, et supporte une grande profondeur', () => {
      const loop: Node = {id: 'x', kids: []};
      loop.kids!.push(loop);
      expect(ids(flattenNested([loop], (n) => n.kids, key).rows)).toBe('x');

      let deep: Node = {id: 'n0'};
      const root = deep;
      for (let i = 1; i < 50_000; i++) {
        const next: Node = {id: `n${i}`};
        deep.kids = [next];
        deep = next;
      }
      expect(flattenNested([root], (n) => n.kids, key).rows).toHaveLength(50_000);
    });
  });

  describe('buildTreeIndex', () => {
    it('relie parents et enfants et calcule les profondeurs', () => {
      const index = buildTreeIndex(flat, key, (n) => n.parent);
      expect(index.children.get('a')).toEqual(['a1', 'a2']);
      expect(index.depth.get('a1x')).toBe(2);
      expect(index.depth.get('b')).toBe(0);
    });

    it('un parent inconnu ou soi-même fait une racine ; un cycle est coupé', () => {
      const rows: Node[] = [{id: 'o', parent: 'absent'}, {id: 's', parent: 's'}, {id: 'c1', parent: 'c2'}, {id: 'c2', parent: 'c1'}];
      const index = buildTreeIndex(rows, key, (n) => n.parent);
      expect(index.depth.get('o')).toBe(0);
      expect(index.depth.get('s')).toBe(0);
      expect([index.depth.get('c1'), index.depth.get('c2')].sort()).toEqual([0, 1]);
    });
  });

  describe('withAncestors', () => {
    it('ajoute tous les ancêtres des lignes retenues', () => {
      const index = buildTreeIndex(flat, key, (n) => n.parent);
      expect([...withAncestors(['a1x'], index)].sort()).toEqual(['a', 'a1', 'a1x']);
      expect([...withAncestors(['a1x', 'a2'], index)].sort()).toEqual(['a', 'a1', 'a1x', 'a2']);
    });
  });

  describe('layoutTree', () => {
    const index = buildTreeIndex(flat, key, (n) => n.parent);

    it('affiche les nœuds dépliés et cache les descendants des nœuds repliés', () => {
      expect(ids(layoutTree(flat, key, index, () => true))).toBe('a,a1,a1x,a2,b,b1');
      expect(ids(layoutTree(flat, key, index, () => false))).toBe('a,b');
      expect(ids(layoutTree(flat, key, index, (k) => k === 'a'))).toBe('a,a1,a2,b');
    });

    it('suit l’ordre de la liste triée entre frères, quel que soit l’ordre d’arrivée', () => {
      const reversed = [...flat].reverse();
      expect(ids(layoutTree(reversed, key, index, () => true))).toBe('b,b1,a,a2,a1,a1x');
    });

    it('une ligne dont le parent est absent de la liste devient une racine', () => {
      const filtered = flat.filter((n) => n.id !== 'a1');
      expect(ids(layoutTree(filtered, key, index, () => true))).toBe('a,a2,a1x,b,b1');
    });
  });
});
