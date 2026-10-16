import {describe, expect, it} from 'vitest';
import {asciiComparator, isPrintableAscii} from './ascii-collation';

const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
const sign = (value: number) => (value < 0 ? -1 : value > 0 ? 1 : 0);

describe('ascii-collation', () => {
  it('reconnaît l’ASCII imprimable', () => {
    expect(isPrintableAscii('CMD-0001 (a)')).toBe(true);
    expect(isPrintableAscii('é')).toBe(false);
    expect(isPrintableAscii('a\tb')).toBe(false);
    expect(isPrintableAscii('')).toBe(true);
  });

  it('est disponible pour le collateur de la table, et donne le même ordre que lui', () => {
    const compare = asciiComparator(collator);
    expect(compare, 'le comparateur rapide doit être équivalent au collateur dans cet environnement').not.toBeNull();
    let seed = 7;
    const next = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const alphabet = 'abcABC019 -_./:#()';
    const make = () => Array.from({length: Math.floor(next() * 12)}, () => alphabet[Math.floor(next() * alphabet.length)]).join('');
    for (let i = 0; i < 20_000; i++) {
      const a = make();
      const b = make();
      if (sign(compare!(a, b)) !== sign(collator.compare(a, b))) {
        throw new Error(`« ${a} » / « ${b} » : ${collator.compare(a, b)} attendu, ${compare!(a, b)} obtenu`);
      }
    }
  });

  it('trie les références comme un humain : les nombres par valeur, sans tenir compte de la casse', () => {
    const compare = asciiComparator(collator)!;
    const sorted = ['CMD-10', 'cmd-2', 'CMD-1', 'Cmd-02', 'cmd-100'].sort(compare);
    expect(sorted.map((s) => s.toLowerCase())).toEqual(['cmd-1', 'cmd-2', 'cmd-02', 'cmd-10', 'cmd-100']);
  });

  it('un collateur sensible à la casse n’a pas de comparateur rapide faux : il est équivalent ou absent', () => {
    const strict = new Intl.Collator('fr', {sensitivity: 'variant'});
    const compare = asciiComparator(strict);
    if (compare) {
      for (const [a, b] of [['a', 'A'], ['A', 'a'], ['b', 'A'], ['a1', 'a01']]) {
        expect(sign(compare(a, b))).toBe(sign(strict.compare(a, b)));
      }
    } else {
      expect(compare).toBeNull();
    }
  });
});
