import {Component, TemplateRef, viewChild} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {NgTableColumn, NgTableComponent, NgTableTreeToggleEvent} from './ng-table.component';

interface Node {
  id: string;
  name: string;
  size: number;
  parent: string | null;
  kids?: Node[];
}

const FLAT: Node[] = [
  {id: 'docs', name: 'Documents', size: 0, parent: null},
  {id: 'cv', name: 'CV', size: 30, parent: 'docs'},
  {id: 'tax', name: 'Impôts', size: 0, parent: 'docs'},
  {id: 'tax26', name: 'Déclaration 2026', size: 200, parent: 'tax'},
  {id: 'pics', name: 'Images', size: 0, parent: null},
  {id: 'cat', name: 'Chat', size: 900, parent: 'pics'},
];

const COLUMNS: NgTableColumn<Node>[] = [
  {id: 'name', header: 'Nom', valueAccessor: (n) => n.name, sortable: true, filter: {type: 'text'}},
  {id: 'size', header: 'Taille', valueAccessor: (n) => n.size, sortable: true},
];

const create = async (inputs: Record<string, unknown> = {}): Promise<ComponentFixture<NgTableComponent<Node>>> => {
  const fixture = TestBed.createComponent(NgTableComponent<Node>);
  const all: Record<string, unknown> = {
    columns: COLUMNS,
    rows: FLAT,
    treeData: true,
    treeParent: (n: Node) => n.parent,
    rowKeyAccessor: (n: Node) => n.id,
    ...inputs,
  };
  for (const [name, value] of Object.entries(all)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return fixture;
};

const names = (fixture: ComponentFixture<unknown>) =>
  [...(fixture.nativeElement as HTMLElement).querySelectorAll('tr.data-row td.mat-column-name .cell-text')].map((el) => el.textContent?.trim());

const toggle = async (fixture: ComponentFixture<unknown>, rowIndex: number) => {
  const button = (fixture.nativeElement as HTMLElement).querySelectorAll('tr.data-row')[rowIndex].querySelector('button.ngt-tree-toggle') as HTMLButtonElement;
  button.click();
  await fixture.whenStable();
};

describe('données arborescentes', () => {
  it('affiche les racines repliées, avec un bouton sur les nœuds qui ont des enfants', async () => {
    const fixture = await create();
    expect(names(fixture)).toEqual(['Documents', 'Images']);
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tr.data-row');
    expect(rows[0].getAttribute('aria-expanded')).toBe('false');
    expect(rows[0].getAttribute('aria-level')).toBe('1');
    expect(rows[0].querySelector('button.ngt-tree-toggle')?.getAttribute('aria-label')).toBe('Déplier');
  });

  it('déplier montre les enfants, indentés ; replier les cache', async () => {
    const fixture = await create();
    const events: NgTableTreeToggleEvent<Node>[] = [];
    fixture.componentInstance.treeToggle.subscribe((e) => events.push(e));

    await toggle(fixture, 0);
    expect(names(fixture)).toEqual(['Documents', 'CV', 'Impôts', 'Images']);
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tr.data-row');
    expect((rows[1].querySelector('.ngt-tree-indent') as HTMLElement).style.width).toBe('20px');
    expect(rows[1].getAttribute('aria-level')).toBe('2');
    expect(rows[1].querySelector('button.ngt-tree-toggle')).toBeNull(); // CV est une feuille

    await toggle(fixture, 2); // Impôts
    expect(names(fixture)).toEqual(['Documents', 'CV', 'Impôts', 'Déclaration 2026', 'Images']);

    await toggle(fixture, 0);
    expect(names(fixture)).toEqual(['Documents', 'Images']);
    expect(events.map((e) => `${e.row.id}:${e.expanded}`)).toEqual(['docs:true', 'tax:true', 'docs:false']);
  });

  it('[treeDefaultExpanded] : tout, ou un nombre de niveaux ; expandAllTree / collapseAllTree', async () => {
    const all = await create({treeDefaultExpanded: true});
    expect(names(all)).toHaveLength(6);
    const oneLevel = await create({treeDefaultExpanded: 1});
    expect(names(oneLevel)).toEqual(['Documents', 'CV', 'Impôts', 'Images', 'Chat']);

    oneLevel.componentInstance.collapseAllTree();
    await oneLevel.whenStable();
    expect(names(oneLevel)).toEqual(['Documents', 'Images']);
    oneLevel.componentInstance.expandAllTree();
    await oneLevel.whenStable();
    expect(names(oneLevel)).toHaveLength(6);
  });

  it('le tri se fait entre frères, sans casser l’arbre', async () => {
    const fixture = await create({treeDefaultExpanded: true});
    fixture.componentInstance['onHeaderSort'](COLUMNS[1]); // taille croissante
    await fixture.whenStable();
    // Documents (racine) avant Images ; sous Documents : CV (30) avant Impôts (0)… trié par taille : Impôts (0), CV (30).
    expect(names(fixture)).toEqual(['Documents', 'Impôts', 'Déclaration 2026', 'CV', 'Images', 'Chat']);
    fixture.componentInstance['onHeaderSort'](COLUMNS[1]); // décroissante
    await fixture.whenStable();
    expect(names(fixture)).toEqual(['Documents', 'CV', 'Impôts', 'Déclaration 2026', 'Images', 'Chat']); // racines à égalité : ordre d'arrivée
  });

  it('un filtre garde les correspondances et leurs ancêtres, dépliés', async () => {
    const fixture = await create({filterDebounceMs: 0});
    fixture.componentInstance['commitFilterValue']('name', 'Déclaration');
    await fixture.whenStable();
    expect(names(fixture)).toEqual(['Documents', 'Impôts', 'Déclaration 2026']);

    fixture.componentInstance['commitFilterValue']('name', '');
    await fixture.whenStable();
    expect(names(fixture)).toEqual(['Documents', 'Images']);
  });

  it('lignes imbriquées : [treeChildren] aplatit les racines et leurs enfants', async () => {
    const nested: Node[] = [
      {id: 'a', name: 'A', size: 1, parent: null, kids: [{id: 'a1', name: 'A1', size: 2, parent: null}, {id: 'a2', name: 'A2', size: 3, parent: null, kids: [{id: 'a2x', name: 'A2X', size: 4, parent: null}]}]},
      {id: 'b', name: 'B', size: 5, parent: null},
    ];
    const fixture = await create({rows: nested, treeParent: null, treeChildren: (n: Node) => n.kids, treeDefaultExpanded: true});
    expect(names(fixture)).toEqual(['A', 'A1', 'A2', 'A2X', 'B']);
    const levels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('tr.data-row')].map((tr) => tr.getAttribute('aria-level'));
    expect(levels).toEqual(['1', '2', '2', '3', '1']);
  });

  it('Alt + flèches déplient et replient avec [cellNavigation]', async () => {
    const fixture = await create({cellNavigation: true});
    const firstCell = () => (fixture.nativeElement as HTMLElement).querySelector('tr.data-row td') as HTMLElement;
    firstCell().dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true}));
    await fixture.whenStable();
    expect(names(fixture)).toEqual(['Documents', 'CV', 'Impôts', 'Images']);
    firstCell().dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true}));
    await fixture.whenStable();
    expect(names(fixture)).toEqual(['Documents', 'Images']);
  });

  it('la pagination compte les lignes visibles', async () => {
    const fixture = await create({paginator: true, pageSize: 2, treeDefaultExpanded: true});
    expect(names(fixture)).toEqual(['Documents', 'CV']);
  });

  it('une mise à jour des lignes (transaction) est reprise par l’arbre', async () => {
    const fixture = await create({treeDefaultExpanded: true});
    fixture.componentInstance.applyTransaction({add: [{id: 'new', name: 'Nouveau', size: 1, parent: 'pics'}]});
    await fixture.whenStable();
    expect(names(fixture)).toEqual(['Documents', 'CV', 'Impôts', 'Déclaration 2026', 'Images', 'Chat', 'Nouveau']);
  });
});

describe('maître / détail imbriqué', () => {
  @Component({
    standalone: true,
    imports: [NgTableComponent],
    template: `
      <ng-template #detail let-order>
        <ng-table [columns]="lineColumns" [rows]="order.lines" ariaLabel="Lignes"/>
      </ng-template>
      <ng-table [columns]="orderColumns" [detailRowTemplate]="detail" [rows]="orders"/>
    `,
  })
  class HostComponent {
    readonly detail = viewChild<TemplateRef<unknown>>('detail');
    readonly orders = [
      {id: 1, ref: 'CMD-1', lines: [{sku: 'A', qty: 2}, {sku: 'B', qty: 5}]},
      {id: 2, ref: 'CMD-2', lines: [{sku: 'C', qty: 1}]},
    ];
    readonly orderColumns = [{id: 'ref', header: 'Commande', valueAccessor: (o: {ref: string}) => o.ref}];
    readonly lineColumns: NgTableColumn<{sku: string; qty: number}>[] = [
      {id: 'sku', header: 'Article', valueAccessor: (l) => l.sku},
      {id: 'qty', header: 'Quantité', valueAccessor: (l) => l.qty},
    ];
  }

  it('un tableau dans la ligne détail se déplie avec sa ligne maître', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('ng-table ng-table')).toHaveLength(0);

    (root.querySelector('tr.data-row') as HTMLElement).click();
    await fixture.whenStable();
    const nested = root.querySelectorAll('ng-table ng-table');
    expect(nested).toHaveLength(1);
    expect(nested[0].querySelectorAll('tr.data-row')).toHaveLength(2);
    expect(nested[0].querySelector('td.mat-column-sku')?.textContent?.trim()).toBe('A');
  });
});
