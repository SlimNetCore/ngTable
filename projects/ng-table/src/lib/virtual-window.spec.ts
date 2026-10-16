import {describe, expect, it} from 'vitest';
import {computeColumnWindow, computeVirtualLayout, computeVirtualRange, scrollTopForIndex, VIRTUAL_OVERSCAN} from './virtual-window';

describe('virtual-window', () => {
  it('rend la zone visible plus une marge de chaque côté', () => {
    // 500 px visibles, lignes de 50 px, défilé de 1 000 px : lignes 20 à 29 visibles.
    expect(computeVirtualRange(1000, 1000, 500, 50)).toEqual({start: 20 - VIRTUAL_OVERSCAN, end: 30 + VIRTUAL_OVERSCAN});
  });

  it('reste dans les bornes de la liste', () => {
    expect(computeVirtualRange(1000, 0, 500, 50)).toEqual({start: 0, end: 10 + VIRTUAL_OVERSCAN});
    // Position de défilement au-delà de la fin (liste qui a rétréci) : la dernière « page » de lignes.
    expect(computeVirtualRange(20, 5000, 500, 50)).toEqual({start: 10 - VIRTUAL_OVERSCAN, end: 20});
    expect(computeVirtualRange(0, 0, 500, 50)).toEqual({start: 0, end: 0});
  });

  describe('compression au-delà de la hauteur maximale', () => {
    const COUNT = 1_000_000;
    const H = 50;
    const V = 500;
    const MAX = 1_000_000; // 20 000 lignes « tiendraient » ; on en a 1 000 000

    it('sans compression, espacements = hauteur des lignes non rendues', () => {
      expect(computeVirtualLayout(100, 1000, V, H, 8, MAX)).toEqual({start: 12, end: 38, top: 600, bottom: 3100});
    });

    it('la hauteur totale reste la hauteur maximale, du haut jusqu’en bas de la liste', () => {
      for (const scrollTop of [0, 123_456, MAX / 2, MAX - V]) {
        const layout = computeVirtualLayout(COUNT, scrollTop, V, H, 8, MAX);
        expect(layout.top + (layout.end - layout.start) * H + layout.bottom).toBeCloseTo(MAX, 0);
      }
    });

    it('la fin de la liste est atteignable, et la ligne visée apparaît en haut de la zone', () => {
      const end = computeVirtualLayout(COUNT, MAX - V, V, H, 8, MAX);
      expect(end.end).toBe(COUNT);

      const target = 734_567;
      const scrollTop = scrollTopForIndex(target, COUNT, V, H, MAX);
      const layout = computeVirtualLayout(COUNT, scrollTop, V, H, 8, MAX);
      // Position à l'écran de la ligne visée : haut de la tranche + lignes qui la précèdent.
      expect(layout.top + (target - layout.start) * H - scrollTop).toBeCloseTo(0, 3);
    });
  });

  it('suppose une zone de 800 px tant qu’elle n’est pas mesurée', () => {
    expect(computeVirtualRange(1000, 0, 0, 40)).toEqual({start: 0, end: 20 + VIRTUAL_OVERSCAN});
  });

  describe('computeColumnWindow (colonnes)', () => {
    const widths = Array.from({length: 200}, () => 100); // 20 000 px

    it('ne rend que les colonnes de la zone visible et de la marge', () => {
      // Zone de 1 000 px défilée à 5 000 px, marge de 300 px : colonnes 47 à 62.
      expect(computeColumnWindow(widths, 5000, 1000, 300)).toEqual({start: 47, end: 63, left: 4700, right: 13_700});
    });

    it('aux bords : pas d’espacement à gauche au début, ni à droite à la fin', () => {
      expect(computeColumnWindow(widths, 0, 1000, 300)).toMatchObject({start: 0, left: 0});
      expect(computeColumnWindow(widths, 19_000, 1000, 300)).toMatchObject({end: 200, right: 0});
    });

    it('largeurs variables : la somme rendue + espacements = largeur totale', () => {
      const mixed = [80, 300, 120, 50, 400, 90, 200];
      const window = computeColumnWindow(mixed, 350, 300, 0);
      const rendered = mixed.slice(window.start, window.end).reduce((a, b) => a + b, 0);
      expect(window.left + rendered + window.right).toBe(1240);
      expect(window).toMatchObject({start: 1, end: 5}); // 380..680 de 350 à 650 visibles
    });
  });
});
