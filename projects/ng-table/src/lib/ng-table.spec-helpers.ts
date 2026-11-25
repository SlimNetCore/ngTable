import {provideZonelessChangeDetection} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, vi} from 'vitest';
import {NgTableComponent} from './ng-table.component';
import type {NgTableColumn} from './ng-table.models';

export interface Row {
  id: string;
  nom: string;
  montant: number;
  statut: string;
  actif: boolean;
  date: string;
}

export const ROWS: Row[] = [
  {id: '1', nom: 'Charlie', montant: 300, statut: 'VALIDEE', actif: true, date: '2026-03-02'},
  {id: '2', nom: 'alice', montant: 100, statut: 'BROUILLON', actif: false, date: '2026-01-15'},
  {id: '3', nom: 'Bob', montant: 200, statut: 'VALIDEE', actif: true, date: '2026-02-20'},
];

export function columns(): NgTableColumn<Row>[] {
  return [
    {id: 'nom', header: 'Nom', valueAccessor: (r) => r.nom, sortable: true, filter: {type: 'text'}, copy: true},
    {id: 'montant', header: 'Montant', valueAccessor: (r) => r.montant, sortable: true},
    {
      id: 'statut',
      header: 'Statut',
      valueAccessor: (r) => r.statut,
      filter: {
        type: 'enum',
        label: 'Statut',
        options: [
          {value: 'VALIDEE', label: 'Validée'},
          {value: 'BROUILLON', label: 'Brouillon'},
        ],
      },
    },
    {id: 'actif', header: 'Actif', valueAccessor: (r) => r.actif, filter: {type: 'boolean'}},
  ];
}

export interface Harness {
  fixture: ComponentFixture<NgTableComponent>;
  component: NgTableComponent;
  setInput: (name: string, value: unknown) => Promise<void>;
}

export async function createTable(inputs: Record<string, unknown> = {}): Promise<Harness> {
  const fixture = TestBed.createComponent(NgTableComponent);
  const component = fixture.componentInstance;

  const allInputs: Record<string, unknown> = {columns: columns(), rows: ROWS, ...inputs};
  for (const [name, value] of Object.entries(allInputs)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();

  return {
    fixture,
    component,
    setInput: async (name, value) => {
      fixture.componentRef.setInput(name, value);
      await fixture.whenStable();
    },
  };
}

/** jsdom n'implémente pas `Blob.text()`. */
export function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

export function ids(rows: unknown[]): string[] {
  return (rows as Row[]).map((r) => r.id);
}

/** Mise en place commune aux tests de `NgTableComponent` : stockage vidé, détection sans zone, simulations rétablies. */
export function setupNgTableSpec(): void {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({providers: [provideZonelessChangeDetection()]});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks(); // un test qui échoue avant son `mockRestore()` ne doit pas contaminer les suivants
    TestBed.resetTestingModule();
  });
}
