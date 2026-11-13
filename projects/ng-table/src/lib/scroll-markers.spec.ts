import {describe, expect, it} from 'vitest';
import {buildScrollMarkers, MARKER_SPACING_PX, NgTableMarkedRow, scrollTopForMarker} from './scroll-markers';

const row = (index: number, position: number, kind: NgTableMarkedRow['kind'] = 'selection'): NgTableMarkedRow => ({index, position, kind});

describe('scroll-markers', () => {
  it('place chaque trait à la position exacte de sa ligne, pas arrondie à une case', () => {
    const markers = buildScrollMarkers([row(0, 0.0123), row(500, 0.5017, 'danger'), row(999, 0.9991)], 400);
    expect(markers.map((marker) => `${marker.kind}:${marker.index}@${marker.top.toFixed(2)}`)).toEqual(['selection:0@1.23', 'danger:500@50.17', 'selection:999@99.91']);
    expect(markers.map((marker) => marker.position)).toEqual([0.0123, 0.5017, 0.9991]);
  });

  it('deux lignes trop proches pour être distinguées partagent un trait : la plus importante, sinon la première', () => {
    // Barre de 400 px : deux lignes à moins de 4 px (1 %) l'une de l'autre tombent sur le même trait.
    const close = buildScrollMarkers([row(10, 0.5001), row(11, 0.5002), row(12, 0.5003, 'danger'), row(13, 0.5004, 'warning')], 400);
    expect(close).toHaveLength(1);
    expect(close[0]).toMatchObject({kind: 'danger', index: 12, position: 0.5003});
    expect(close[0].top).toBeCloseTo(50.03, 6);
    const same = buildScrollMarkers([row(20, 0.2001), row(21, 0.2002)], 400);
    expect(same.map((marker) => marker.index)).toEqual([20]);
  });

  it('jamais deux traits à moins de l’écart minimal, même avec des milliers de lignes marquées', () => {
    const rows = Array.from({length: 20_000}, (_, index) => row(index, index / 20_000));
    const markers = buildScrollMarkers(rows, 380);
    expect(markers.length).toBeLessThanOrEqual(Math.floor(380 / MARKER_SPACING_PX));
    expect(markers.every((marker, i) => i === 0 || marker.top > markers[i - 1].top)).toBe(true);
  });

  it('une barre plus haute distingue plus de lignes', () => {
    const rows = Array.from({length: 1000}, (_, index) => row(index, index / 1000));
    expect(buildScrollMarkers(rows, 800).length).toBeGreaterThan(buildScrollMarkers(rows, 200).length);
  });

  it('ignore les positions hors du contenu ; sans ligne marquée : aucun trait ; hauteur inconnue : valeur de repli', () => {
    expect(buildScrollMarkers([row(1, -0.1), row(2, 1.2), row(3, Number.NaN)], 400)).toEqual([]);
    expect(buildScrollMarkers([], 400)).toEqual([]);
    expect(buildScrollMarkers([row(1, 0.5)], 0)).toHaveLength(1);
  });

  it('scrollTopForMarker : la ligne arrive au milieu de la zone, sans dépasser les butées', () => {
    // Contenu de 10 000 px, zone de 400 px, lignes de 40 px. Ligne à 50 % : elle commence à 5 000 px.
    const top = scrollTopForMarker(0.5, 10_000, 400, 40);
    expect(top).toBe(4820);
    expect(5000 - top, 'la ligne commence 180 px sous le haut de la zone : centrée').toBe((400 - 40) / 2);
    expect(scrollTopForMarker(0, 10_000, 400, 40)).toBe(0);
    expect(scrollTopForMarker(1, 10_000, 400, 40)).toBe(9600);
    expect(scrollTopForMarker(0.5, 300, 400, 40), 'contenu plus court que la zone').toBe(0);
  });
});
