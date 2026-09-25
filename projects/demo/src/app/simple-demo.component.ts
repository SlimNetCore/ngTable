import {ChangeDetectionStrategy, Component} from '@angular/core';
import {NgTableColumn, NgTableComponent} from '@sbourahla/ng-table';
import {Commande, generateCommandes, STATUT_LABELS} from './demo-data';

const STATUTS = Object.values(STATUT_LABELS).map((label) => ({value: label, label}));

/**
 * Mode simple : le minimum pour une liste utile. Données en mémoire, colonnes
 * déclarées une fois, tout le reste (tri, filtres, recherche, pagination) est
 * fourni par ng-table sans code supplémentaire.
 */
@Component({
  selector: 'app-simple-demo',
  standalone: true,
  imports: [NgTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="demo-intro">
      Le minimum : des lignes, des colonnes, et trois options. Tri, filtres par colonne, recherche globale
      et pagination fonctionnent sans code supplémentaire.
    </p>

    <ng-table
      [ariaLabel]="'Commandes'"
      [columns]="columns"
      [rows]="rows"
      [globalSearchEnabled]="true"
      [paginator]="true"
      [showActiveFiltersBar]="true"
    />

    <div class="demo-card" style="margin-top: 16px">
      <h2>Le code de cette page</h2>
      <pre class="demo-code">{{ code }}</pre>
    </div>
  `,
})
export class SimpleDemoComponent {
  protected readonly rows = generateCommandes(120);

  protected readonly columns: NgTableColumn<Commande>[] = [
    {id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference, sortable: true, filter: {type: 'text'}},
    {id: 'client', header: 'Client', valueAccessor: (c) => c.client, sortable: true, filter: {type: 'text'}},
    {
      id: 'statut',
      header: 'Statut',
      valueAccessor: (c) => STATUT_LABELS[c.statut],
      sortable: true,
      filter: {type: 'enum', options: STATUTS},
    },
    {id: 'montant', header: 'Montant (€)', valueAccessor: (c) => c.montant, sortable: true, filter: {type: 'number'}},
    {id: 'dateCommande', header: 'Date', valueAccessor: (c) => c.dateCommande, sortable: true, filter: {type: 'range'}},
  ];

  protected readonly code = `<ng-table
  [columns]="columns"
  [rows]="rows"
  [globalSearchEnabled]="true"
  [paginator]="true"
  [showActiveFiltersBar]="true"
/>

columns: NgTableColumn<Commande>[] = [
  {id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference, sortable: true, filter: {type: 'text'}},
  {id: 'client', header: 'Client', valueAccessor: (c) => c.client, sortable: true, filter: {type: 'text'}},
  {id: 'statut', header: 'Statut', valueAccessor: (c) => STATUT_LABELS[c.statut], sortable: true,
   filter: {type: 'enum', options: STATUTS}},  // [{value: 'Validée', label: 'Validée'}, ...]
  {id: 'montant', header: 'Montant (€)', valueAccessor: (c) => c.montant, sortable: true, filter: {type: 'number'}},
  {id: 'dateCommande', header: 'Date', valueAccessor: (c) => c.dateCommande, sortable: true, filter: {type: 'range'}},
];`;
}
