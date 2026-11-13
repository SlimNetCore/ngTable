import {Component, provideZonelessChangeDetection, signal, TemplateRef, viewChild} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {NgTableColumn, NgTableComponent, NgTableDetailToggleEvent} from './ng-table.component';

interface Row {
  id: string;
  nom: string;
  lignes: number;
}

const ROWS: Row[] = [
  {id: 'a', nom: 'Alpha', lignes: 2},
  {id: 'b', nom: 'Bravo', lignes: 0},
  {id: 'c', nom: 'Charlie', lignes: 1},
];
const COLUMNS: NgTableColumn<Row>[] = [{id: 'nom', header: 'Nom', valueAccessor: (row) => row.nom}];

@Component({
  imports: [NgTableComponent],
  template: `
    <ng-table
      (detailToggle)="events.push($event); onToggle($event)"
      (rowClick)="clicks.push($event.id)"
      [columns]="columns"
      [detailRowAccordion]="accordion()"
      [detailRowCanExpand]="canExpand()"
      [detailRowTemplate]="detail() ? tpl : null"
      [detailRowToggleButton]="button()"
      [detailRowToggleOnRowClick]="rowClickToggles()"
      [expandedRowKeys]="controlledKeys()"
      [rowSelectionEnabled]="selection()"
      [rows]="rows"
    />
    <ng-template #tpl let-row><p class="detail-content">Détail de {{ row.nom }}</p></ng-template>
  `,
})
class HostComponent {
  readonly table = viewChild.required(NgTableComponent);
  readonly tpl = viewChild.required<TemplateRef<unknown>>('tpl');
  readonly rows = ROWS;
  readonly columns = COLUMNS;
  readonly detail = signal(true);
  readonly button = signal(true);
  readonly accordion = signal(false);
  readonly selection = signal(false);
  readonly rowClickToggles = signal(true);
  readonly canExpand = signal<((row: Row) => boolean) | null>(null);
  readonly controlledKeys = signal<readonly unknown[] | null>(null);
  readonly events: NgTableDetailToggleEvent<Row>[] = [];
  readonly clicks: string[] = [];
  /** Mode contrôlé : le parent applique les clés que le bouton propose. */
  applyKeys = false;

  onToggle(event: NgTableDetailToggleEvent<Row>): void {
    if (this.applyKeys) {
      this.controlledKeys.set(event.expandedKeys);
    }
  }
}

describe('master / detail : bouton natif déplier / replier', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let root: HTMLElement;

  const buttons = () => [...root.querySelectorAll<HTMLButtonElement>('button.ngt-detail-toggle')];
  const visibleDetails = () => [...root.querySelectorAll('.detail-content')].map((element) => element.textContent?.trim());
  const stable = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({providers: [provideZonelessChangeDetection()]});
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    root = fixture.nativeElement as HTMLElement;
    await stable();
  });

  it('apparaît dès qu’un detailRowTemplate est fourni : une colonne en tête, un bouton par ligne', () => {
    expect(buttons()).toHaveLength(3);
    const firstCell = root.querySelector('tr.data-row td');
    expect(firstCell?.classList.contains('detail-toggle-cell')).toBe(true);
    expect(root.querySelector('th.detail-toggle-cell')?.textContent?.trim()).toBe('Détail'); // en-tête pour lecteur d'écran
  });

  it('disparaît sans template, et avec [detailRowToggleButton]="false"', async () => {
    host.detail.set(false);
    await stable();
    expect(buttons()).toHaveLength(0);
    expect(root.querySelector('.detail-toggle-cell')).toBeNull();

    host.detail.set(true);
    host.button.set(false);
    await stable();
    expect(buttons()).toHaveLength(0);
    expect(root.querySelector('.detail-toggle-cell')).toBeNull();
  });

  it('un clic déplie puis replie, avec aria-expanded et un libellé qui suit l’état', async () => {
    const button = buttons()[0];
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Afficher le détail');

    button.click();
    await stable();
    expect(visibleDetails()).toEqual(['Détail de Alpha']);
    expect(buttons()[0].getAttribute('aria-expanded')).toBe('true');
    expect(buttons()[0].getAttribute('aria-label')).toBe('Masquer le détail');
    expect(buttons()[0].classList.contains('ngt-detail-toggle--open')).toBe(true);

    buttons()[0].click();
    await stable();
    expect(visibleDetails()).toEqual([]);
    expect(host.events.map((event) => event.expanded)).toEqual([true, false]);
  });

  it('le clic sur le bouton ne compte qu’une fois : pas de (rowClick), pas de double bascule', async () => {
    buttons()[0].click();
    await stable();
    expect(host.clicks).toEqual([]);
    expect(host.table().isRowExpanded(ROWS[0])).toBe(true);
    expect(host.events).toHaveLength(1);
  });

  it('fonctionne quand le clic sur la ligne est désactivé', async () => {
    host.rowClickToggles.set(false);
    await stable();
    (root.querySelector('tr.data-row') as HTMLElement).click();
    await stable();
    expect(visibleDetails()).toEqual([]);
    buttons()[0].click();
    await stable();
    expect(visibleDetails()).toEqual(['Détail de Alpha']);
  });

  it('accordéon : déplier une ligne replie l’autre', async () => {
    host.accordion.set(true);
    await stable();
    buttons()[0].click();
    await stable();
    buttons()[2].click();
    await stable();
    expect(visibleDetails()).toEqual(['Détail de Charlie']);
  });

  it('detailRowCanExpand : pas de bouton sur une ligne qui ne se déplie pas', async () => {
    host.canExpand.set((row) => row.lignes > 0);
    await stable();
    const perRow = [...root.querySelectorAll('tr.data-row')].map((row) => !!row.querySelector('button.ngt-detail-toggle'));
    expect(perRow).toEqual([true, false, true]);
    expect(root.querySelectorAll('tr.data-row td.detail-toggle-cell')).toHaveLength(3); // la colonne reste alignée
  });

  it('se place avant la case de sélection', async () => {
    host.selection.set(true);
    await stable();
    const cells = [...root.querySelectorAll('tr.data-row')[0].querySelectorAll('td')].slice(0, 2).map((cell) => cell.className);
    expect(cells[0]).toContain('detail-toggle-cell');
    expect(cells[1]).toContain('selection-cell');
  });

  it('mode contrôlé par clés : le bouton n’écrit aucun état, il émet les clés à appliquer', async () => {
    host.controlledKeys.set([]);
    await stable();
    buttons()[0].click();
    await stable();
    expect(host.events.at(-1)).toMatchObject({expanded: true, expandedKeys: ['a']});
    expect(visibleDetails()).toEqual([]); // le parent n'a rien appliqué : rien ne s'ouvre

    host.applyKeys = true;
    buttons()[0].click();
    await stable();
    buttons()[2].click();
    await stable();
    expect(host.controlledKeys()).toEqual(['a', 'c']);
    expect(visibleDetails()).toEqual(['Détail de Alpha', 'Détail de Charlie']);

    buttons()[0].click();
    await stable();
    expect(host.events.at(-1)).toMatchObject({expanded: false, expandedKeys: ['c']});
    expect(visibleDetails()).toEqual(['Détail de Charlie']);
  });

  it('Entrée sur le bouton ne remonte pas à la ligne (une seule bascule)', async () => {
    const button = buttons()[0];
    const event = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true});
    button.dispatchEvent(event);
    await stable();
    expect(host.table().isRowExpanded(ROWS[0])).toBe(false); // le navigateur transforme Entrée en clic ; ici seul keydown est émis
    expect(host.events).toHaveLength(0);
  });
});
