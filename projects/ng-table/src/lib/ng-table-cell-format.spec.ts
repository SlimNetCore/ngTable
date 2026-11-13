import {provideZonelessChangeDetection} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {NgTableColumn, NgTableComponent} from './ng-table.component';

interface Row {
  id: string;
  client: string;
  statut: string;
  montant: number | null;
  avancement: number;
  note: number;
  marge: number;
}

const ROWS: Row[] = [
  {id: 'a', client: 'Dupont SA', statut: 'Validée', montant: 100, avancement: 40, note: 3.5, marge: 20},
  {id: 'b', client: 'Bernard & Fils', statut: 'Annulée', montant: 400, avancement: 100, note: 5, marge: -10},
  {id: 'c', client: 'Leroy', statut: 'Autre', montant: null, avancement: 0, note: 0, marge: 0},
];

const COLUMNS: NgTableColumn<Row>[] = [
  {id: 'client', header: 'Client', valueAccessor: (r) => r.client, cell: {type: 'avatar'}},
  {id: 'ref', header: 'Fiche', valueAccessor: (r) => r.id, cell: {type: 'link', href: (r) => (r.id === 'c' ? null : `/fiches/${r.id}`), external: true}},
  {id: 'statut', header: 'Statut', valueAccessor: (r) => r.statut, cell: {type: 'badge', tone: {Validée: 'success', Annulée: 'danger'}}},
  {id: 'montant', header: 'Montant', valueAccessor: (r) => r.montant, filter: {type: 'number'}, cell: {type: 'dataBar'}},
  {id: 'avancement', header: 'Avancement', valueAccessor: (r) => r.avancement, cell: {type: 'progress'}},
  {id: 'note', header: 'Note', valueAccessor: (r) => r.note, cell: {type: 'rating'}},
  {id: 'marge', header: 'Marge', valueAccessor: (r) => r.marge, cell: {type: 'colorScale', diverging: true}},
];

describe('cellules prêtes à l’emploi (NgTableColumn.cell)', () => {
  let fixture: ComponentFixture<NgTableComponent<Row>>;
  const root = () => fixture.nativeElement as HTMLElement;
  /** Cellules de la colonne n° `index` (à partir de 0), une par ligne. */
  const cells = (index: number) => [...root().querySelectorAll<HTMLElement>(`tr.data-row td:nth-child(${index + 1})`)];

  beforeEach(async () => {
    TestBed.configureTestingModule({providers: [provideZonelessChangeDetection()]});
    fixture = TestBed.createComponent(NgTableComponent<Row>);
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('rows', ROWS);
    await fixture.whenStable();
  });

  it('avatar : initiales masquées aux lecteurs d’écran, suivies du texte', () => {
    const avatars = cells(0).map((cell) => cell.querySelector('.ngt-avatar'));
    expect(avatars.map((avatar) => avatar?.textContent?.trim())).toEqual(['DS', 'BF', 'L']);
    expect(avatars.every((avatar) => avatar?.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(cells(0)[0].querySelector('.ngt-avatar__text')?.textContent).toBe('Dupont SA');
  });

  it('lien : adresse, nouvel onglet protégé, texte simple sans adresse', () => {
    const link = cells(1)[0].querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/fiches/a');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(cells(1)[2].querySelector('a')).toBeNull();
    expect(cells(1)[2].textContent?.trim()).toBe('c');
  });

  it('lien : un clic ne déclenche pas le clic de ligne', () => {
    const clicks: Row[] = [];
    fixture.componentInstance.rowClick.subscribe((row) => clicks.push(row));
    const link = cells(1)[0].querySelector('a')!;
    link.addEventListener('click', (event) => event.preventDefault());
    link.click();
    expect(clicks).toEqual([]);
  });

  it('pastille : la teinte suit la valeur, le texte reste affiché', () => {
    const badges = cells(2).map((cell) => cell.querySelector('.ngt-badge')!);
    expect(badges.map((badge) => badge.getAttribute('data-tone'))).toEqual(['success', 'danger', 'neutral']);
    expect(badges.map((badge) => badge.textContent)).toEqual(['Validée', 'Annulée', 'Autre']);
  });

  it('barre de données : proportionnelle à la colonne, le nombre reste affiché, rien pour une cellule vide', () => {
    const widths = cells(3).map((cell) => cell.querySelector<HTMLElement>('.ngt-data-bar__fill')?.style.width ?? null);
    expect(widths).toEqual(['25%', '100%', null]);
    expect(cells(3).map((cell) => cell.querySelector('.ngt-data-bar__value')?.textContent)).toEqual(['100', '400', '']);
  });

  it('barre de données : l’étendue suit les lignes filtrées', async () => {
    fixture.componentInstance['columnFilters'].set({montant: '<200'});
    await fixture.whenStable();
    expect(cells(3).map((cell) => cell.querySelector<HTMLElement>('.ngt-data-bar__fill')?.style.width)).toEqual(['100%']);
  });

  it('progression : rôle progressbar et pourcentage affiché', () => {
    const bars = cells(4).map((cell) => cell.querySelector('[role="progressbar"]')!);
    expect(bars.map((bar) => bar.getAttribute('aria-valuenow'))).toEqual(['40', '100', '0']);
    expect(bars[0].getAttribute('aria-label'), 'nom accessible : l’en-tête de la colonne').toBe('Avancement');
    expect(cells(4)[0].querySelector('.ngt-progress__value')?.textContent).toBe('40 %');
    expect(cells(4)[0].querySelector<HTMLElement>('.ngt-progress__fill')?.style.width).toBe('40%');
  });

  it('note : cinq étoiles, nom accessible traduit', () => {
    const rating = cells(5)[0].querySelector('.ngt-rating')!;
    expect(rating.getAttribute('aria-label')).toBe('3.5 sur 5');
    expect([...rating.querySelectorAll('.ngt-rating__star')].map((star) => star.getAttribute('data-star'))).toEqual(['full', 'full', 'full', 'half', 'empty']);
  });

  it('dégradé divergent : intensité selon la distance à zéro, côté négatif marqué, nombre affiché', () => {
    const scales = cells(6).map((cell) => cell.querySelector<HTMLElement>('.ngt-color-scale')!);
    expect(scales.map((scale) => scale.style.getPropertyValue('--ngt-scale-ratio'))).toEqual(['1', '0.5', '0']);
    expect(scales.map((scale) => scale.classList.contains('ngt-color-scale--negative'))).toEqual([false, true, false]);
    expect(scales.map((scale) => scale.textContent)).toEqual(['20', '-10', '0']);
  });
});
