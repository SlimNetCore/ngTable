import {describe, expect, it} from 'vitest';
import {buildScrollMarkers} from './scroll-markers';

describe('scroll-markers', () => {
  it('place chaque repère à la hauteur de sa ligne dans la liste', () => {
    expect(buildScrollMarkers(1000, [{index: 0, kind: 'selection'}, {index: 500, kind: 'danger'}, {index: 999, kind: 'selection'}])).toEqual([
      {top: 0, kind: 'selection'},
      {top: 50, kind: 'danger'},
      {top: 99.5, kind: 'selection'},
    ]);
  });

  it('petite liste : une case par ligne', () => {
    expect(buildScrollMarkers(4, [{index: 1, kind: 'info'}, {index: 3, kind: 'selection'}])).toEqual([
      {top: 25, kind: 'info'},
      {top: 75, kind: 'selection'},
    ]);
  });

  it('jamais plus de repères que de cases, même avec des milliers de lignes marquées', () => {
    const marks = Array.from({length: 50_000}, (_, index) => ({index: index * 2, kind: 'selection' as const}));
    const markers = buildScrollMarkers(100_000, marks, 200);
    expect(markers).toHaveLength(200);
    expect(markers.every((marker, i) => i === 0 || marker.top > markers[i - 1].top)).toBe(true);
  });

  it('dans une même case, le repère le plus important l’emporte', () => {
    const markers = buildScrollMarkers(10_000, [
      {index: 100, kind: 'selection'},
      {index: 101, kind: 'danger'},
      {index: 102, kind: 'warning'},
      {index: 5000, kind: 'warning'},
      {index: 5001, kind: 'selection'},
    ]);
    expect(markers.map((marker) => marker.kind)).toEqual(['danger', 'warning']);
  });

  it('ignore les positions hors de la liste ; liste vide : aucun repère', () => {
    expect(buildScrollMarkers(10, [{index: -1, kind: 'info'}, {index: 10, kind: 'info'}])).toEqual([]);
    expect(buildScrollMarkers(0, [{index: 0, kind: 'info'}])).toEqual([]);
  });
});
