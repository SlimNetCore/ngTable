import {describe, expect, it} from 'vitest';
import {
  formatRangeValue,
  matchesDate,
  matchesNumberExpression,
  matchesNumberRange,
  matchesSearchTerms,
  matchesText,
  normalizeSearchText,
  searchTerms,
} from './filter-matching';

describe('filter-matching', () => {
  describe('recherche globale', () => {
    it('ignore la casse et les accents', () => {
      expect(normalizeSearchText('Élodie VALIDÉE')).toBe('elodie validee');
      expect(normalizeSearchText(null)).toBe('');
    });

    it('découpe la saisie en mots, espaces multiples ignorés', () => {
      expect(searchTerms('  Dupont   validée ')).toEqual(['dupont', 'validee']);
      expect(searchTerms('   ')).toEqual([]);
    });

    it('exige chaque mot, dans n’importe quelle colonne', () => {
      const haystack = ['dupont sa', 'validee', '1240.5'].join('\n');
      expect(matchesSearchTerms(haystack, ['dupont', 'validee'])).toBe(true);
      expect(matchesSearchTerms(haystack, ['dupont', 'annulee'])).toBe(false);
      expect(matchesSearchTerms(haystack, [])).toBe(true);
    });
  });

  describe('matchesText', () => {
    it('applique chaque opérateur, sans tenir compte de la casse', () => {
      expect(matchesText('Dupont SA', 'pont')).toBe(true);
      expect(matchesText('Dupont SA', 'dupont sa', 'equals')).toBe(true);
      expect(matchesText('Dupont SA', 'dupont', 'equals')).toBe(false);
      expect(matchesText('Dupont SA', 'DUP', 'startsWith')).toBe(true);
      expect(matchesText('Dupont SA', 'pont', 'startsWith')).toBe(false);
      expect(matchesText('Dupont SA', ' sa', 'endsWith')).toBe(true);
    });
  });

  describe('matchesNumberExpression', () => {
    it('gère égalité, comparaisons et différence', () => {
      expect(matchesNumberExpression(42, '42')).toBe(true);
      expect(matchesNumberExpression(42, '=42')).toBe(true);
      expect(matchesNumberExpression(42, '!=42')).toBe(false);
      expect(matchesNumberExpression(42, '>40')).toBe(true);
      expect(matchesNumberExpression(42, '>=42')).toBe(true);
      expect(matchesNumberExpression(42, '<42')).toBe(false);
      expect(matchesNumberExpression(42, '<= 42')).toBe(true);
    });

    it('gère les plages, bornes incluses et ouvertes', () => {
      expect(matchesNumberExpression(10, '10..50')).toBe(true);
      expect(matchesNumberExpression(50, '10..50')).toBe(true);
      expect(matchesNumberExpression(51, '10..50')).toBe(false);
      expect(matchesNumberExpression(1000, '10..')).toBe(true);
      expect(matchesNumberExpression(-5, '..0')).toBe(true);
    });

    it('accepte la virgule décimale et les nombres sous forme de chaîne', () => {
      expect(matchesNumberExpression('12.5', '>12,4')).toBe(true);
      expect(matchesNumberExpression(1.5, '1.5..3')).toBe(true);
    });

    it('renvoie null pour une saisie non numérique (repli sur la recherche texte)', () => {
      expect(matchesNumberExpression(42, 'abc')).toBeNull();
      expect(matchesNumberExpression(42, '>')).toBeNull();
    });

    it('ne matche pas une cellule non numérique', () => {
      expect(matchesNumberExpression('n/a', '>10')).toBe(false);
    });
  });

  describe('matchesNumberRange', () => {
    it('renvoie null quand aucune borne n’est renseignée', () => {
      expect(matchesNumberRange(5, '..')).toBeNull();
    });
  });

  describe('matchesDate', () => {
    it('compare un jour exact, depuis une chaîne ISO ou un objet Date', () => {
      expect(matchesDate('2026-02-20T08:30:00Z', '2026-02-20', 'date')).toBe(true);
      expect(matchesDate(new Date(2026, 1, 20), '2026-02-20', 'date')).toBe(true);
    });

    it('filtre une période avec bornes ouvertes', () => {
      expect(matchesDate('2026-03-02', '2026-02-01..', 'range')).toBe(true);
      expect(matchesDate('2026-01-15', '2026-02-01..', 'range')).toBe(false);
    });
  });

  describe('formatRangeValue', () => {
    it('affiche les deux bornes, ou la seule renseignée', () => {
      expect(formatRangeValue('10..50')).toBe('10 → 50');
      expect(formatRangeValue('10..')).toBe('≥ 10');
      expect(formatRangeValue('..50')).toBe('≤ 50');
    });
  });
});
