import {describe, expect, it} from 'vitest';
import {normalizeSearchText, searchTerms} from './filter-matching';
import {highlightParts} from './search-highlight';

const show = (text: string, query: string) =>
  highlightParts(text, searchTerms(query))
    .map((part) => (part.hit ? `[${part.text}]` : part.text))
    .join('');

describe('search-highlight', () => {
  it('marque chaque occurrence, casse ignorée, en gardant le texte d’origine', () => {
    expect(show('Dupont SA, dupont SARL', 'DUP')).toBe('[Dup]ont SA, [dup]ont SARL');
    expect(show('CMD-000042', '42')).toBe('CMD-0000[42]');
  });

  it('ignore les accents dans les deux sens', () => {
    expect(show('Élodie Validée', 'elodie')).toBe('[Élodie] Validée');
    expect(show('Elodie', 'élo')).toBe('[Elo]die');
    // Texte déjà décomposé (lettre + accent combinant) : l'accent reste avec sa lettre.
    expect(show('Valérie', 'vale')).toBe('[Valé]rie');
  });

  it('plusieurs mots ; les correspondances qui se chevauchent ou se touchent sont réunies', () => {
    expect(show('Bernard & Fils', 'fils bern')).toBe('[Bern]ard & [Fils]');
    expect(show('abcdef', 'abc bcd')).toBe('[abcd]ef');
    expect(show('abcdef', 'ab cd')).toBe('[abcd]ef');
    expect(show('aaaa', 'aa')).toBe('[aaaa]');
  });

  it('sans correspondance, sans mot ou sans texte : un seul morceau non marqué', () => {
    expect(highlightParts('Dupont', ['xyz'])).toEqual([{text: 'Dupont', hit: false}]);
    expect(highlightParts('Dupont', [])).toEqual([{text: 'Dupont', hit: false}]);
    expect(highlightParts('', ['a'])).toEqual([{text: '', hit: false}]);
  });

  it('caractères hors du plan de base (émojis) : jamais coupés en deux', () => {
    expect(show('😀 Café 😀', 'cafe')).toBe('😀 [Café] 😀');
  });

  it('les morceaux recomposent toujours le texte, et un morceau marqué contient un mot cherché (2 000 tirages)', () => {
    let seed = 5;
    const next = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const alphabet = ['a', 'b', 'é', 'E', ' ', 'ç', 'Ô', '1', '-', 'é', '😀', 'ß', 'İ'];
    const word = (length: number) => Array.from({length}, () => alphabet[Math.floor(next() * alphabet.length)]).join('');
    for (let round = 0; round < 2000; round++) {
      const text = word(1 + Math.floor(next() * 14));
      const terms = searchTerms(`${word(1 + Math.floor(next() * 3))} ${word(1 + Math.floor(next() * 2))}`);
      const parts = highlightParts(text, terms);
      expect(parts.map((part) => part.text).join(''), `${text} / ${terms.join(',')}`).toBe(text);
      for (const part of parts.filter((each) => each.hit)) {
        const normalized = normalizeSearchText(part.text);
        expect(terms.some((term) => normalized.includes(term) || term.includes(normalized)), `${text} / ${terms.join(',')} → ${part.text}`).toBe(true);
      }
      // Rien d'oublié : si un mot est dans le texte normalisé, au moins un morceau est marqué.
      if (terms.some((term) => normalizeSearchText(text).includes(term))) {
        expect(parts.some((part) => part.hit), `${text} / ${terms.join(',')}`).toBe(true);
      }
    }
  });
});
