import {describe, expect, it} from 'vitest';
import {computeVirtualRange, VIRTUAL_OVERSCAN} from './virtual-window';

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

  it('suppose une zone de 800 px tant qu’elle n’est pas mesurée', () => {
    expect(computeVirtualRange(1000, 0, 0, 40)).toEqual({start: 0, end: 20 + VIRTUAL_OVERSCAN});
  });
});
