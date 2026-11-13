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
      [highlightSearch]="true"
      [paginator]="true"
      [showActiveFiltersBar]="true"
    />

    <div class="demo-card" style="margin-top: 16px">
      <h2>Cellules prêtes à l'emploi</h2>
      <p class="demo-intro">
        Avatar, lien, pastille, barre de données, barre de progression, note et dégradé de couleur : une option
        <code>cell</code> par colonne, sans gabarit à écrire.
      </p>
      <ng-table [ariaLabel]="'Commandes mises en forme'" [columns]="formatColumns" [rows]="formatRows" [density]="'compact'"/>
      <pre class="demo-code" tabindex="0">{{ formatCode }}</pre>
    </div>

    <div class="demo-card" style="margin-top: 16px">
      <h2>Le code de cette page</h2>
      <pre class="demo-code" tabindex="0">{{ code }}</pre>
    </div>
  `,
})
export class SimpleDemoComponent {
  protected readonly rows = generateCommandes(120);

  protected readonly columns: NgTableColumn<Commande>[] = [
    {id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference, sortable: true, filter: {type: 'text'}},
    {id: 'client', header: 'Client', valueAccessor: (c) => c.client, sortable: true, filter: {type: 'set'}},
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

  /** Huit commandes, avec trois valeurs calculées pour montrer les mises en forme. */
  protected readonly formatRows = this.rows.slice(0, 8).map((commande, index) => ({
    ...commande,
    avancement: (index * 37) % 101,
    note: 1 + ((index * 7) % 9) / 2,
    marge: Math.round(((index * 53) % 61) - 22),
  }));

  protected readonly formatColumns: NgTableColumn<Commande & {avancement: number; note: number; marge: number}>[] = [
    {id: 'client', header: 'Client', valueAccessor: (c) => c.client, sortable: true, cell: {type: 'avatar'}},
    {
      id: 'reference',
      header: 'Référence',
      valueAccessor: (c) => c.reference,
      cell: {type: 'link', href: (c) => `https://example.com/commandes/${c.reference}`, external: true},
    },
    {
      id: 'statut',
      header: 'Statut',
      valueAccessor: (c) => STATUT_LABELS[c.statut],
      sortable: true,
      cell: {type: 'badge', tone: {Brouillon: 'neutral', Validée: 'info', Expédiée: 'success', Annulée: 'danger'}},
    },
    {id: 'montant', header: 'Montant (€)', valueAccessor: (c) => c.montant, sortable: true, cell: {type: 'dataBar'}},
    {id: 'avancement', header: 'Avancement', valueAccessor: (c) => c.avancement, sortable: true, cell: {type: 'progress'}},
    {id: 'note', header: 'Note', valueAccessor: (c) => c.note, sortable: true, cell: {type: 'rating'}},
    {id: 'marge', header: 'Marge (%)', valueAccessor: (c) => c.marge, sortable: true, cell: {type: 'colorScale', diverging: true}},
  ];

  protected readonly formatCode = `columns: NgTableColumn<Commande>[] = [
  {id: 'client', header: 'Client', valueAccessor: (c) => c.client, cell: {type: 'avatar'}},
  {id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference,
   cell: {type: 'link', href: (c) => '/commandes/' + c.reference}},
  {id: 'statut', header: 'Statut', valueAccessor: (c) => c.statut,
   cell: {type: 'badge', tone: {Validée: 'info', Expédiée: 'success', Annulée: 'danger'}}},
  {id: 'montant', header: 'Montant (€)', valueAccessor: (c) => c.montant, cell: {type: 'dataBar'}},
  {id: 'avancement', header: 'Avancement', valueAccessor: (c) => c.avancement, cell: {type: 'progress'}},
  {id: 'note', header: 'Note', valueAccessor: (c) => c.note, cell: {type: 'rating'}},
  {id: 'marge', header: 'Marge (%)', valueAccessor: (c) => c.marge, cell: {type: 'colorScale', diverging: true}},
];`;

  protected readonly code = `<ng-table
  [columns]="columns"
  [rows]="rows"
  [globalSearchEnabled]="true"
  [highlightSearch]="true"
  [paginator]="true"
  [showActiveFiltersBar]="true"
/>

columns: NgTableColumn<Commande>[] = [
  {id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference, sortable: true, filter: {type: 'text'}},
  {id: 'client', header: 'Client', valueAccessor: (c) => c.client, sortable: true, filter: {type: 'set'}},
  {id: 'statut', header: 'Statut', valueAccessor: (c) => STATUT_LABELS[c.statut], sortable: true,
   filter: {type: 'enum', options: STATUTS}},  // [{value: 'Validée', label: 'Validée'}, ...]
  {id: 'montant', header: 'Montant (€)', valueAccessor: (c) => c.montant, sortable: true, filter: {type: 'number'}},
  {id: 'dateCommande', header: 'Date', valueAccessor: (c) => c.dateCommande, sortable: true, filter: {type: 'range'}},
];`;
}
