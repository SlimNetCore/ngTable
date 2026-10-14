import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {NgTableChartComponent} from './ng-table-chart.component';
import {NgTableColumn, NgTableComponent} from './ng-table.component';
import {NgTableChartData} from './chart';

interface Row {
  id: string;
  name: string;
  amount: number;
  trend: number[];
}

const ROWS: Row[] = [
  {id: '1', name: 'Nord', amount: 10, trend: [1, 3, 2, 5]},
  {id: '2', name: 'Sud', amount: 20, trend: [4, 4, 4]},
  {id: '3', name: 'Est', amount: 30, trend: []},
];

const COLUMNS: NgTableColumn<Row>[] = [
  {id: 'name', header: 'Nom', valueAccessor: (r) => r.name},
  {id: 'amount', header: 'Montant', valueAccessor: (r) => r.amount},
  {id: 'trend', header: 'Tendance', valueAccessor: (r) => r.trend, sparkline: {type: 'area', width: 80, height: 20}},
];

describe('colonne sparkline', () => {
  it('dessine un mini-graphique par cellule qui a une série, et rien pour une série vide', async () => {
    const fixture = TestBed.createComponent(NgTableComponent<Row>);
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('rows', ROWS);
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const cells = [...root.querySelectorAll('tr.data-row')].map((tr) => tr.querySelector('td.mat-column-trend')!);
    expect(cells[0].querySelectorAll('svg.ngt-sparkline')).toHaveLength(1);
    expect(cells[0].querySelector('svg')?.getAttribute('width')).toBe('80');
    expect(cells[0].querySelector('path.ngt-sparkline__area')).not.toBeNull();
    expect(cells[0].querySelector('svg')?.getAttribute('aria-label')).toBe('1, 3, 2, 5');
    expect(cells[2].querySelector('svg')).toBeNull();
  });
});

describe('graphique de plage', () => {
  it('rangeChartData() suit la plage sélectionnée', async () => {
    const fixture = TestBed.createComponent(NgTableComponent<Row>);
    fixture.componentRef.setInput('columns', COLUMNS.slice(0, 2));
    fixture.componentRef.setInput('rows', ROWS);
    fixture.componentRef.setInput('rangeSelection', true);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    expect(component.rangeChartData()).toBeNull();

    const cell = (row: number, id: string) => (fixture.nativeElement as HTMLElement).querySelectorAll('tr.data-row')[row].querySelector(`td.mat-column-${id}`)!;
    const mouse = (target: Element, type: string) => target.dispatchEvent(new MouseEvent(type, {bubbles: true, cancelable: true, button: 0}));
    mouse(cell(0, 'name'), 'mousedown');
    mouse(cell(1, 'amount'), 'mousemove');
    mouse(document.body, 'mouseup');
    await fixture.whenStable();

    expect(component.rangeChartData()).toEqual({categories: ['Nord', 'Sud'], series: [{name: 'Montant', values: [10, 20]}]});
  });
});

describe('NgTableChartComponent', () => {
  const data: NgTableChartData = {categories: ['Nord', 'Sud'], series: [{name: 'Montant', values: [10, 20]}, {name: 'Coût', values: [5, null]}]};

  const render = async (type: string, value: NgTableChartData | null = data) => {
    const fixture = TestBed.createComponent(NgTableChartComponent);
    fixture.componentRef.setInput('data', value);
    fixture.componentRef.setInput('type', type);
    fixture.componentRef.setInput('title', 'Ventes');
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('barres : une par valeur, avec infobulle, légende et tableau de données pour les lecteurs d’écran', async () => {
    const root = await render('bar');
    expect(root.querySelectorAll('rect.ngt-chart__shape')).toHaveLength(3);
    expect(root.querySelector('rect title')?.textContent).toContain('Montant — Nord : 10');
    expect([...root.querySelectorAll('.ngt-chart__legend-item')].map((li) => li.textContent?.trim())).toEqual(['Montant', 'Coût']);
    expect(root.querySelector('svg')?.getAttribute('role')).toBe('img');
    expect(root.querySelectorAll('table.ngt-chart__data tbody tr')).toHaveLength(2);
    expect(root.querySelector('figcaption')?.textContent).toBe('Ventes');
  });

  it('courbes et zones : une courbe par série ; secteurs : une part par catégorie', async () => {
    expect((await render('line')).querySelectorAll('path.ngt-chart__line')).toHaveLength(2);
    expect((await render('area')).querySelectorAll('path.ngt-chart__area')).toHaveLength(2);
    const pie = await render('pie');
    expect(pie.querySelectorAll('path.ngt-chart__slice')).toHaveLength(2);
    expect([...pie.querySelectorAll('.ngt-chart__legend-item')].map((li) => li.textContent?.trim())).toEqual(['Nord', 'Sud']);
    expect(pie.querySelector('path.ngt-chart__slice title')?.textContent).toContain('33');
  });

  describe('zoom', () => {
    const many: NgTableChartData = {
      categories: Array.from({length: 40}, (_, i) => `c${i}`),
      series: [{name: 'v', values: Array.from({length: 40}, (_, i) => i)}],
    };
    const make = async (type = 'bar') => {
      const fixture = TestBed.createComponent(NgTableChartComponent);
      fixture.componentRef.setInput('data', many);
      fixture.componentRef.setInput('type', type);
      await fixture.whenStable();
      return fixture;
    };
    const bars = (fixture: {nativeElement: unknown}) => (fixture.nativeElement as HTMLElement).querySelectorAll('rect.ngt-chart__shape').length;
    const click = async (fixture: {nativeElement: unknown; whenStable: () => Promise<unknown>}, label: string) => {
      ((fixture.nativeElement as HTMLElement).querySelector(`.ngt-chart__toolbar button[aria-label="${label}"]`) as HTMLButtonElement).click();
      await fixture.whenStable();
    };

    it('les boutons zooment, déplacent et remettent la vue complète', async () => {
      const fixture = await make();
      const ranges: unknown[] = [];
      fixture.componentInstance.zoomChange.subscribe((r) => ranges.push(r));
      expect(bars(fixture)).toBe(40);

      await click(fixture, 'Zoomer');
      expect(bars(fixture)).toBe(20);
      await click(fixture, 'Vers la droite');
      expect((fixture.nativeElement as HTMLElement).querySelector('.ngt-chart__window')?.textContent).toContain('/ 40');
      expect(ranges.at(-1)).toMatchObject({end: 35});

      const resetButton = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.ngt-chart__toolbar button')].find((b) => b.textContent === 'Tout') as HTMLButtonElement;
      resetButton.click();
      await fixture.whenStable();
      expect(bars(fixture)).toBe(40);
      expect(ranges.at(-1)).toBeNull();
    });

    it('le clavier zoome avec + et dézoome avec −', async () => {
      const fixture = await make('line');
      const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;
      svg.dispatchEvent(new KeyboardEvent('keydown', {key: '+', bubbles: true, cancelable: true}));
      await fixture.whenStable();
      expect((fixture.nativeElement as HTMLElement).querySelectorAll('circle.ngt-chart__point')).toHaveLength(20);
      svg.dispatchEvent(new KeyboardEvent('keydown', {key: '-', bubbles: true, cancelable: true}));
      await fixture.whenStable();
      expect((fixture.nativeElement as HTMLElement).querySelectorAll('circle.ngt-chart__point')).toHaveLength(40);
    });

    it('Ctrl + molette zoome ; la molette seule laisse défiler la page', async () => {
      const fixture = await make();
      const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;
      const plain = new WheelEvent('wheel', {deltaY: -100, bubbles: true, cancelable: true});
      svg.dispatchEvent(plain);
      expect(plain.defaultPrevented).toBe(false);
      const withCtrl = new WheelEvent('wheel', {deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true});
      svg.dispatchEvent(withCtrl);
      await fixture.whenStable();
      expect(withCtrl.defaultPrevented).toBe(true);
      expect(bars(fixture)).toBeLessThan(40);
    });

    it('un nouveau jeu de données repart de la vue complète ; pas de barre de zoom pour un secteur', async () => {
      const fixture = await make();
      await click(fixture, 'Zoomer');
      fixture.componentRef.setInput('data', {...many});
      await fixture.whenStable();
      expect(bars(fixture)).toBe(40);
      fixture.componentRef.setInput('type', 'pie');
      await fixture.whenStable();
      expect((fixture.nativeElement as HTMLElement).querySelector('.ngt-chart__toolbar')).toBeNull();
    });
  });

  it('sans données, rien n’est dessiné', async () => {
    expect((await render('bar', null)).querySelector('svg')).toBeNull();
  });
});
