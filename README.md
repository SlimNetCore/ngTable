# @sbourahla/ng-table

[![npm version](https://img.shields.io/npm/v/@sbourahla/ng-table)](https://www.npmjs.com/package/@sbourahla/ng-table)
[![npm downloads](https://img.shields.io/npm/dm/@sbourahla/ng-table)](https://www.npmjs.com/package/@sbourahla/ng-table)
[![license](https://img.shields.io/npm/l/@sbourahla/ng-table)](https://github.com/SlimNetCore/ngTable)

**A powerful and configurable Angular Material data table component built for modern Angular applications.**

`@sbourahla/ng-table` provides a complete, flexible data-table experience with sorting, filtering, pagination, row selection, expandable detail rows, column resizing and reordering, saved views, context menus, responsive layouts, and local or remote data modes.

Built with **Angular standalone components and signals**, with no business dependency, no mandatory i18n dependency, and no network calls performed by the component.

![ng-table overview](https://raw.githubusercontent.com/SlimNetCore/ngTable/main/captures/img.png)

## 📦 Installation

```bash
npm install @sbourahla/ng-table
```

### Peer dependencies

- `@angular/core`
- `@angular/common`
- `@angular/material`
- `rxjs`

No additional i18n or business dependency is required.

## 🚀 Quick Start

```ts
import { Component, signal } from '@angular/core';
import {
  NgTableColumn,
  NgTableComponent
} from '@sbourahla/ng-table';

interface User {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

@Component({
  standalone: true,
  imports: [NgTableComponent],
  template: `
    <ng-table
      [columns]="columns"
      [rows]="rows()"
    />
  `
})
export class UserListComponent {
  readonly rows = signal<User[]>([
    { id: '1', name: 'Alice', email: 'alice@example.com', active: true },
    { id: '2', name: 'Bob', email: 'bob@example.com', active: false }
  ]);

  readonly columns: NgTableColumn<User>[] = [
    {
      id: 'name',
      header: 'Name',
      valueAccessor: user => user.name,
      sortable: true,
      filter: { type: 'text' }
    },
    {
      id: 'email',
      header: 'Email',
      valueAccessor: user => user.email,
      sortable: true
    },
    {
      id: 'active',
      header: 'Active',
      valueAccessor: user => user.active,
      filter: { type: 'boolean' }
    }
  ];
}
```

That's it. Sorting, filtering and rendering work immediately with the default configuration.

## Fonctionnalités

- **Colonnes** : visibilité (menu intégré), ordre (drag-and-drop natif HTML5), largeur (redimensionnable + auto-fit au double-clic), templates de cellule custom
- **Tri** — sur n'importe quelle colonne marquée `sortable`
- **Filtres** par colonne — texte, nombre, date/plage de dates, énuméré (select), booléen, ou un composant de filtre 100% custom ; en menu ou inline dans l'en-tête ; options chargées à la demande (`optionsLoader`) avec debounce automatique sur les champs texte
- **Sélection de lignes** (case à cocher), interne ou pilotée par le parent
- **Ligne détail** (master/detail), 3 modes (non contrôlé, par prédicat, par clé)
- **Menu contextuel** (clic droit) fourni par le parent
- **Copie rapide** d'une cellule en un clic
- **Vues sauvegardées** : l'utilisateur enregistre/active/supprime des configurations nommées (colonnes, ordre, tri, filtres, pagination) — persistées en `localStorage` par défaut, ou déléguées entièrement au parent (API, fichier...)
- **Deux modes de données** :
  - `local` (défaut) : tri/filtre/pagination appliqués côté client, zéro requête après le chargement initial
  - `remote` : le composant affiche `rows()` tel quel et notifie chaque changement de tri/filtre via un événement combiné unique, prêt à devenir une requête serveur
- **Responsive** : bascule automatique en vue mobile condensée sous 760px

Le composant ne fait **aucun appel réseau** : `rows()` est fourni par le parent (déjà chargé, ou paginé côté serveur selon le mode).

![Vue d'ensemble : sélection de lignes, filtres inline, colonne d'actions](https://raw.githubusercontent.com/SlimNetCore/ngTable/main/captures/img_1.png)

## Pattern contrôlé / non-contrôlé

Convention utilisée pour plusieurs features (visibilité colonnes, ordre colonnes, filtres, sélection, expansion détail, vues) :

- l'`input()` correspondant accepte `null` comme sentinelle **"non contrôlé"** → le composant gère alors un signal interne.
- si le parent fournit une valeur non-`null`, le composant devient **contrôlé** : il n'écrit plus dans son état interne, il se contente d'émettre l'`output()` correspondant et attend que le parent renvoie la nouvelle valeur via binding.

```html
<ng-table
  [columns]="columns"
  [columnVisibility]="visibleColumns()"
  (columnVisibilityChange)="visibleColumns.set($event)"
  [rows]="rows()"
/>
```

Si `[columnVisibility]` n'est pas bindé (ou reçoit `null`), le composant gère lui-même l'état via son menu "Colonnes", sans rien demander au parent.

## Tutoriel pas à pas — toutes les options en détail

Ce tutoriel construit **progressivement** une même liste (une gestion de commandes) en activant une fonctionnalité à la fois. Chaque étape est autonome (code complet, pas de "voir plus haut"), mais elles s'enchaînent dans un ordre logique — lisez-les dans l'ordre la première fois.

### Étape 0 — Le modèle de données

```ts
export interface LigneCommande {
  produit: string;
  quantite: number;
  prixUnitaire: number;
}

export interface Commande {
  id: string;
  reference: string;
  client: string;
  statut: 'BROUILLON' | 'VALIDEE' | 'EXPEDIEE' | 'ANNULEE';
  montant: number;
  dateCommande: string; // ISO 'YYYY-MM-DD'
  urgent: boolean;
  assigneA: string;
  lignes: LigneCommande[];
}
```

### Étape 1 — Table minimale

Le strict nécessaire : `columns` + `rows`. Aucune autre option n'est obligatoire.

```ts
import {Component, signal} from '@angular/core';
import {NgTableColumn, NgTableComponent} from '@sbourahla/ng-table';

@Component({
  standalone: true,
  imports: [NgTableComponent],
  template: `<ng-table [columns]="columns" [rows]="rows()" />`,
})
export class CommandeListComponent {
  readonly rows = signal<Commande[]>([
    {id: '1', reference: 'CMD-001', client: 'Dupont SA', statut: 'VALIDEE', montant: 1240.5, dateCommande: '2026-01-12', urgent: false, assigneA: 'Alice', lignes: []},
    {id: '2', reference: 'CMD-002', client: 'Martin SARL', statut: 'BROUILLON', montant: 320, dateCommande: '2026-01-14', urgent: true, assigneA: 'Bob', lignes: []},
  ]);

  readonly columns: NgTableColumn<Commande>[] = [
    {id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference},
    {id: 'client', header: 'Client', valueAccessor: (c) => c.client},
    {id: 'montant', header: 'Montant', valueAccessor: (c) => c.montant},
  ];
}
```

À ce stade : un tableau statique, sans tri ni filtre — `valueAccessor` fournit la valeur brute de chaque cellule, affichée telle quelle (`{{ cellValue }}` par défaut).

### Étape 2 — Tri

Ajoutez `sortable: true` sur les colonnes triables. Le clic sur l'en-tête bascule asc → desc → aucun tri, un `mat-icon` indique l'état.

```ts
readonly columns: NgTableColumn<Commande>[] = [
  {id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference, sortable: true},
  {id: 'client', header: 'Client', valueAccessor: (c) => c.client, sortable: true},
  {id: 'montant', header: 'Montant', valueAccessor: (c) => c.montant, sortable: true},
  {id: 'dateCommande', header: 'Date', valueAccessor: (c) => c.dateCommande, sortable: true},
];
```

Le tri compare directement la valeur de `valueAccessor` (nombres/chaînes/dates/booléens). Si la valeur affichée diffère de la valeur à trier (ex. une date formatée en cellule mais qu'on veut trier sur la date brute), utilisez `sortValueAccessor` :

```ts
{
  id: 'dateCommande',
  header: 'Date',
  valueAccessor: (c) => formatDateFr(c.dateCommande), // affiché : "12/01/2026"
  sortValueAccessor: (c) => new Date(c.dateCommande),  // trié sur la vraie date
  sortable: true,
}
```

Écoutez `(sortChange)` si vous avez besoin de connaître le tri courant en dehors du composant (ex. pour le renvoyer au serveur en mode `remote`, voir plus loin).

### Étape 3 — Filtres par colonne

Chaque type de filtre s'active via `filter: {type: ...}`.

**Texte** (le plus courant — recherche "contient", insensible à la casse) :

```ts
{id: 'client', header: 'Client', valueAccessor: (c) => c.client, filter: {type: 'text'}}
```

**Énuméré** (`enum`, options statiques — rendu en `<mat-select>`) :

```ts
{
  id: 'statut',
  header: 'Statut',
  valueAccessor: (c) => c.statut,
  filter: {
    type: 'enum',
    options: [
      {value: 'BROUILLON', label: 'Brouillon'},
      {value: 'VALIDEE', label: 'Validée'},
      {value: 'EXPEDIEE', label: 'Expédiée'},
      {value: 'ANNULEE', label: 'Annulée'},
    ],
  },
}
```

**Booléen** :

```ts
{id: 'urgent', header: 'Urgent', valueAccessor: (c) => c.urgent, filter: {type: 'boolean'}}
```

**Date / plage de dates** (`type: 'date'` affiche un sélecteur de plage — la valeur sérialisée est `"YYYY-MM-DD..YYYY-MM-DD"`) :

```ts
{id: 'dateCommande', header: 'Date', valueAccessor: (c) => c.dateCommande, filter: {type: 'date'}}
```

Sans `filter`, une colonne n'est simplement pas filtrable (pas d'icône, pas de menu).

**Filtrage custom** — si le filtrage "contient/égalité" par défaut ne convient pas (ex. filtrer sur un total calculé, ou sur plusieurs champs à la fois), fournissez `filterPredicate` : il remplace entièrement la logique de filtrage de cette colonne (le `type`/`options` du `filter` restent utilisés pour l'UI, seule la logique de correspondance change) :

```ts
{
  id: 'montant',
  header: 'Montant',
  valueAccessor: (c) => c.montant,
  filter: {type: 'text', placeholder: '> 1000'},
  filterPredicate: (row, filterValue) => {
    const threshold = Number(filterValue.replace('>', '').trim());
    return !Number.isNaN(threshold) && row.montant > threshold;
  },
}
```

### Étape 4 — Filtres en ligne (inline) vs en menu

Par défaut, chaque colonne filtrable affiche une icône dans l'en-tête ouvrant un mini-menu. Pour afficher le filtre **directement** dans l'en-tête (pas de clic nécessaire) :

```html
<ng-table [columns]="columns" [rows]="rows()" [inlineFilters]="true" />
```

Pour ne rendre inline que certaines colonnes (les autres restent en mode menu) :

```html
<ng-table [inlineFilters]="true" [inlineFilterColumnIds]="['reference', 'client', 'statut']" ... />
```

### Étape 5 — Options de filtre chargées à la demande

Pour une colonne `enum` dont les options viennent d'une API (ex. la liste des personnes assignables), utilisez `optionsLoader` au lieu de `options` — chargé au premier affichage du filtre (menu ouvert, ou immédiatement si `inlineFilters=true`), avec mémoïsation (un seul chargement par colonne) :

```ts
{
  id: 'assigneA',
  header: 'Assigné à',
  valueAccessor: (c) => c.assigneA,
  filter: {
    type: 'enum',
    optionsLoader: () => this.usersApi.list().pipe(
      map((users) => users.map((u) => ({value: u.id, label: u.nom}))),
    ),
  },
}
```

`optionsLoader` accepte un `Observable` ou une `Promise`. Pendant le chargement, un spinner s'affiche dans le menu ; en cas d'erreur ou de liste vide, un message s'affiche (personnalisable via `labels.refOptionsLoading`/`refOptionsEmpty`/`refOptionsLoadError`, voir l'étape sur la personnalisation des textes).

### Étape 6 — Filtre 100% custom

Pour un filtre dont l'UI ne correspond à aucun `type` standard (ex. un slider de montant, un multi-select spécifique), fournissez `component` : `ng-table` instancie ce composant à la place du renderer standard. Contrat minimal : `@Input() value: string` + `@Output() valueChange: EventEmitter<string>`.

```ts
@Component({
  standalone: true,
  template: `<input type="number" [value]="value" (input)="valueChange.emit($any($event.target).value)" />`,
})
export class MontantMinFilterComponent {
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();
}
```

```ts
{
  id: 'montant',
  header: 'Montant',
  valueAccessor: (c) => c.montant,
  filter: {component: MontantMinFilterComponent, componentInputs: {step: 50}},
  filterPredicate: (row, value) => !value || row.montant >= Number(value),
}
```

`componentInputs` passe des `@Input()` additionnels au composant custom (ici `step`).

### Étape 7 — Barre de filtres actifs + reset

Pour donner une vue d'ensemble des filtres actuellement actifs (avec suppression individuelle en un clic) :

```html
<ng-table [showActiveFiltersBar]="true" ... />
```

Le bouton "Réinitialiser les filtres" (global) est affiché par défaut ; pour le masquer :

```html
<ng-table [showResetFilters]="false" ... />
```

### Étape 8 — Rendu de cellule personnalisé

Par défaut, une cellule affiche `{{ valueAccessor(row) }}`. Pour un rendu riche (badge, icône, lien, composant), fournissez `cellTemplate` — un `ng-template` recevant `{$implicit, row, value, column}` :

```html
<ng-table [columns]="columns" [rows]="rows()" />

<ng-template #statutCell let-row>
  <span class="badge" [class.badge-danger]="row.statut === 'ANNULEE'">
    {{ row.statut }}
  </span>
</ng-template>
```

```ts
protected readonly statutCellTemplate = viewChild<TemplateRef<any>>('statutCell');

readonly columns = computed<NgTableColumn<Commande>[]>(() => [
  ...,
  {
    id: 'statut',
    header: 'Statut',
    valueAccessor: (c) => c.statut,
    cellTemplate: this.statutCellTemplate(),
  },
]);
```

(`columns` devient un `computed()` car `viewChild()` n'est disponible qu'après le premier rendu — pattern standard pour toute colonne avec `cellTemplate`.)

### Étape 8bis — Débordement du texte de cellule

Quand le texte d'une cellule dépasse la largeur de sa colonne, deux modes au choix via `textOverflow` (sans effet si `cellTemplate` est fourni — le template gère alors son propre rendu) :

```ts
{id: 'description', header: 'Description', valueAccessor: (c) => c.description, textOverflow: 'wrap'}
// ou, explicitement (c'est déjà le défaut) :
{id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference, textOverflow: 'truncate'}
```

- `'truncate'` (défaut) : une seule ligne, coupée avec "…" ; au survol, une tooltip affiche le texte complet — mais **uniquement si le texte est réellement tronqué** (comparaison `scrollWidth`/`clientWidth`), pas de tooltip superflue sinon.
- `'wrap'` : retour à la ligne normal, la ligne du tableau s'agrandit pour accueillir le texte complet.

### Étape 9 — Copie de cellule

Affiche un bouton "copier" au survol de la cellule, avec un feedback visuel bref :

```ts
{id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference, copy: true}
// ou, pour copier une valeur différente de celle affichée, avec un tooltip custom :
{id: 'reference', ..., copy: {valueAccessor: (c) => c.reference.toUpperCase(), tooltip: 'Copier la référence'}}
```

Écoutez `(cellCopied)` pour réagir (ex. afficher un snackbar) :

```html
<ng-table (cellCopied)="onCellCopied($event)" ... />
```

```ts
onCellCopied(event: NgTableCopyEvent<Commande>): void {
  this.snackBar.open(`Copié : ${event.value}`, '', {duration: 1500});
}
```

### Étape 10 — Redimensionnement et réordonnancement des colonnes

**Redimensionnement** : `resizable: true` ajoute une poignée sur la bordure droite de la colonne (glisser pour redimensionner, double-clic pour un auto-fit au contenu) :

```ts
{id: 'client', header: 'Client', valueAccessor: (c) => c.client, resizable: true, minWidthPx: 120, maxWidthPx: 400}
```

**Réordonnancement** : disponible sans rien activer — chaque en-tête a une poignée de drag-and-drop native (masquée en vue mobile). En mode non contrôlé, l'ordre est géré en interne. Pour le piloter/persister depuis le parent :

```html
<ng-table [columnOrder]="columnOrder()" (columnOrderChange)="columnOrder.set($event)" ... />
```

```ts
readonly columnOrder = signal<string[]>(['reference', 'client', 'statut', 'montant', 'dateCommande']);
```

### Étape 11 — Visibilité des colonnes

Un bouton "Colonnes" (menu à cases à cocher) est toujours présent — rien à activer. En mode non contrôlé, l'état de visibilité est géré en interne (toutes visibles par défaut, sauf `visible: false` explicite sur une colonne). Pour le piloter depuis le parent (ex. sauvegarder la préférence utilisateur) :

```html
<ng-table [columnVisibility]="visibleColumns()" (columnVisibilityChange)="visibleColumns.set($event)" ... />
```

```ts
readonly visibleColumns = signal<Record<string, boolean>>({
  reference: true,
  client: true,
  statut: true,
  montant: true,
  dateCommande: false, // masquée par défaut, activable via le menu "Colonnes"
});
```

### Étape 12 — Sélection de lignes et actions groupées

```html
<ng-table [rowSelectionEnabled]="true" (selectionChange)="onSelectionChange($event)" [rowKeyAccessor]="(row) => row.id" ... />

<button [disabled]="selectedCount() === 0" (click)="validateSelected()">
  Valider la sélection ({{ selectedCount() }})
</button>
```

```ts
readonly selectedRows = signal<Commande[]>([]);
readonly selectedCount = computed(() => this.selectedRows().length);

onSelectionChange(event: NgTableSelectionChangeEvent<Commande>): void {
  this.selectedRows.set(event.selectedRows);
}
```

`rowKeyAccessor` est recommandé dès que la sélection est utilisée, pour une clé de ligne fiable (ici `row.id`, mais utile si votre backend n'expose pas toujours un `id` stable). Mode contrôlé disponible via `[selectedRowKeys]`, symétrique au pattern de la visibilité des colonnes.

### Étape 13 — Ligne détail (master/detail)

Affichez le détail d'une commande (ses lignes) en dépliant la ligne au clic — mode non contrôlé, le plus simple :

```html
<ng-table
  [columns]="columns"
  [rows]="rows()"
  [detailRowTemplate]="detailTpl"
  [detailRowAccordion]="true"
/>

<ng-template #detailTpl let-row>
  <table class="lignes-commande">
    @for (ligne of row.lignes; track ligne.produit) {
      <tr>
        <td>{{ ligne.produit }}</td>
        <td>{{ ligne.quantite }} × {{ ligne.prixUnitaire }} €</td>
      </tr>
    }
  </table>
</ng-template>
```

- `[detailRowAccordion]="true"` : une seule ligne dépliée à la fois.
- `[detailRowToggleOnRowClick]="false"` : désactive le clic sur la ligne (utile si vous préférez un bouton dédié — appelez alors `toggleDetail(row)` par programmation via un `viewChild` du composant, ou pilotez en mode contrôlé, voir ci-dessous).
- `[detailRowCanExpand]="(row) => row.lignes.length > 0"` : empêche de déplier une commande sans lignes.

Pour piloter l'expansion depuis le parent (persistance, navigation) :

```html
[rowKeyAccessor]="(row) => row.id" [expandedRowKeys]="expandedIds()" (detailToggle)="onDetailToggle($event)"
```

```ts
readonly expandedIds = signal<string[]>([]);
onDetailToggle(event: NgTableDetailToggleEvent<Commande>): void {
  this.expandedIds.set(event.expandedKeys as string[]);
}
```

### Étape 14 — Menu contextuel (clic droit)

```html
<ng-table [rowContextMenuEnabled]="true" [rowContextMenuTemplate]="rowMenu" (rowContextMenu)="onRowContextMenu($event)" ... />

<ng-template #rowMenu let-row>
  <button mat-menu-item (click)="viewOrder(row)">
    <mat-icon>visibility</mat-icon><span>Voir</span>
  </button>
  <button mat-menu-item (click)="duplicateOrder(row)">
    <mat-icon>content_copy</mat-icon><span>Dupliquer</span>
  </button>
  <button mat-menu-item [disabled]="row.statut === 'ANNULEE'" (click)="cancelOrder(row)">
    <mat-icon>cancel</mat-icon><span>Annuler</span>
  </button>
</ng-template>
```

Le menu Material s'ouvre exactement au point de clic. `(rowContextMenu)` est émis en plus, si vous avez besoin de connaître la ligne/position en dehors du template (analytics, par exemple).

### Étape 15 — Colonne d'action mobile et responsive

Sous 760px, la table bascule automatiquement en vue condensée : toutes les colonnes disparaissent sauf celle marquée `mobileRowActions: true`, affichée pleine largeur :

```ts
{
  id: 'actions',
  header: 'Actions',
  valueAccessor: () => '',
  mobileRowActions: true,
  cellTemplate: this.actionsCellTemplate(),
}
```

Le même `cellTemplate` sert pour la cellule desktop (dans sa colonne normale) et pour la ligne d'actions mobile — pensez donc à un contenu qui reste lisible en pleine largeur (boutons empilables/`flex-wrap`).

### Étape 16 — Mode local complet, avec pagination interne

Toutes les commandes sont chargées une fois ; filtre/tri/pagination se font en mémoire, aucune requête ensuite :

```html
<ng-table
  [dataMode]="'local'"
  [pageTrackingEnabled]="true"
  [pageIndex]="pageIndex()"
  [pageSize]="pageSize()"
  [columns]="columns"
  [rows]="allCommandes()"
  (filteredCountChange)="filteredTotal.set($event)"
  (pageIndexChange)="pageIndex.set($event)"
/>
<mat-paginator
  [length]="filteredTotal()"
  [pageIndex]="pageIndex()"
  [pageSize]="pageSize()"
  (page)="pageIndex.set($event.pageIndex); pageSize.set($event.pageSize)"
/>
```

```ts
readonly allCommandes = signal<Commande[]>([]); // chargé une fois, ex. dans ngOnInit / un effect
readonly pageIndex = signal(0);
readonly pageSize = signal(10);
readonly filteredTotal = signal(0); // toujours le total APRÈS filtrage, fourni par ng-table
```

`filteredTotal` — et non `allCommandes().length` — car ng-table est seul à connaître le nombre de lignes après filtrage.

### Étape 17 — Mode remote complet, avec un backend

Chaque changement de filtre/tri **et** chaque navigation de page déclenchent un seul appel serveur, via une méthode unique :

```html
<ng-table
  [dataMode]="'remote'"
  [pageTrackingEnabled]="true"
  [pageIndex]="pageIndex()"
  [pageSize]="pageSize()"
  [columns]="columns"
  [rows]="serverRows()"
  [filters]="columnFilters()"
  (remoteQueryChange)="fetch($event)"
/>
<mat-paginator
  [length]="total()"
  [pageIndex]="pageIndex()"
  [pageSize]="pageSize()"
  (page)="fetch({sort: currentSort(), filters: columnFilters(), page: {index: $event.pageIndex, size: $event.pageSize}})"
/>
```

```ts
readonly serverRows = signal<Commande[]>([]);
readonly total = signal(0);
readonly pageIndex = signal(0);
readonly pageSize = signal(10);
readonly columnFilters = signal<Record<string, string>>({});
readonly currentSort = signal<NgTableSortChange>({columnId: '', direction: ''});

fetch(query: NgTableRemoteQuery): void {
  this.pageIndex.set(query.page.index);
  this.pageSize.set(query.page.size || this.pageSize());
  this.columnFilters.set(query.filters);
  this.currentSort.set(query.sort);

  this.api.searchCommandes(query).subscribe((res) => {
    this.serverRows.set(res.items);
    this.total.set(res.total);
  });
}
```

Point important : `ng-table` n'applique **plus aucun** filtrage/tri local dans ce mode — `serverRows()` doit déjà être exactement la page voulue, sinon la table affichera des résultats incohérents avec les filtres visibles.

### Étape 18 — Vues sauvegardées

Ajoutez un système "vues nommées" (colonnes/ordre/tri/filtres/pagination), persistées automatiquement :

```html
<ng-table
  [viewsEnabled]="true"
  [viewsStorageKey]="'commandes-list'"
  [columnVisibility]="visibleColumns()"
  (columnVisibilityChange)="visibleColumns.set($event)"
  (viewActivated)="onViewActivated($event)"
  ...
/>
```

```ts
// Nécessaire UNIQUEMENT parce que columnVisibility est ici contrôlé (voir Étape 11) —
// sans ça, activer une vue ne resynchroniserait pas le signal du parent.
onViewActivated(view: NgTableView | null): void {
  if (!view) return;
  this.visibleColumns.set({...view.state.columnVisibility});
}
```

Pour persister ailleurs qu'en `localStorage` (backend, fichier...), passez en mode contrôlé :

```html
<ng-table [viewsEnabled]="true" [viewsStore]="viewsStore()" (viewsStoreChange)="onViewsStoreChange($event)" ... />
```

```ts
onViewsStoreChange(store: NgTableViewsStore): void {
  this.viewsStore.set(store);
  this.viewsApi.save(store).subscribe();
}
```

### Étape 18bis — Export (CSV local ou génération serveur)

Un bouton "Exporter" dans la barre d'actions, avec deux modes au choix via `exportMode` :

**Mode `local`** (défaut) — `ng-table` génère lui-même le CSV, aucune requête réseau :

```html
<ng-table [exportEnabled]="true" [exportFilename]="'commandes'" ... />
```

Au clic, si les données locales tiennent sur plusieurs pages (`pageTrackingEnabled=true` avec plus d'une page), une boîte de dialogue demande la plage à exporter ("de la page 1 à la page X", X = le nombre total de pages après filtrage) ; sinon le fichier est généré immédiatement avec toutes les lignes filtrées/triées. Colonnes exportées : celles actuellement visibles, dans leur ordre courant.

```ts
{
  id: 'montant',
  header: 'Montant',
  valueAccessor: (c) => `${c.montant} €`,       // affiché en cellule
  exportValueAccessor: (c) => c.montant,        // exporté en CSV : valeur numérique brute
}
{id: 'actions', header: 'Actions', valueAccessor: () => '', cellTemplate: actionsTpl, exportable: false}
```

**Mode `remote`** — le back génère l'export (fichier volumineux, job asynchrone...) ; `ng-table` ne fait qu'émettre une demande, à vous de construire la requête et de gérer le résultat :

```html
<ng-table [exportEnabled]="true" [exportMode]="'remote'" (remoteExportRequested)="onExportRequested($event)" ... />
```

```ts
onExportRequested(query: NgTableRemoteQuery): void {
  // Ajoutez vos propres paramètres (ex. depuis un store applicatif) avant l'appel :
  this.exportApi.generate({...query, format: 'xlsx', locale: this.currentLocale()}).subscribe((res) => {
    window.open(res.downloadUrl, '_blank');
  });
}
```

`NgTableRemoteQuery` (`{sort, filters, page}`) reprend le tri/filtres/page courants — exactement ce qui alimente `remoteQueryChange`. Aucun appel serveur n'est fait par `ng-table` : c'est le seul mode qui a du sens pour un export portant sur des données que le composant n'a pas (le grid affiche peut-être une page, mais l'export porte sur l'ensemble des lignes correspondant aux filtres côté back).

### Étape 18ter — Indicateur de chargement

`[loading]="true"` affiche un overlay centré au milieu de la table (bloque l'interaction avec les lignes tant qu'il est visible) — c'est au parent de le piloter, `ng-table` ne sait pas lui-même qu'une requête est en cours :

```html
<ng-table [loading]="isLoading()" [columns]="columns" [rows]="rows()" />
```

```ts
readonly isLoading = signal(false);

fetch(query: NgTableRemoteQuery): void {
  this.isLoading.set(true);
  this.api.search(query).subscribe({
    next: (res) => { this.serverRows.set(res.items); this.total.set(res.total); },
    complete: () => this.isLoading.set(false),
  });
}
```

Sans rien fournir de plus, un spinner par défaut s'affiche (CSS pur, aucune dépendance). Pour un rendu custom (logo animé, barre de progression...), fournissez `[loadingTemplate]` :

```html
<ng-table [loading]="isLoading()" [loadingTemplate]="myLoader()" ... />
<ng-template #myLoader>
  <div class="mon-loader"><mat-spinner diameter="40" /></div>
</ng-template>
```

```ts
protected readonly myLoader = viewChild<TemplateRef<unknown>>('myLoader');
```

### Étape 19 — Personnaliser les textes et l'internationalisation

Sans rien faire, tous les textes sont en français. Pour surcharger ponctuellement :

```html
<ng-table [labels]="{resetFiltersButton: 'Effacer', noData: 'Aucune commande'}" ... />
```

Pour une vraie prise en charge multilingue (ex. avec `@ngx-translate/core`), calculez `labels` dans un `computed()` qui se recalcule au changement de langue, et traduisez `header`/`filter.label`/`copy.tooltip` de la même façon :

```ts
private readonly langTick = signal(0);

constructor() {
  this.translate.onLangChange.subscribe(() => this.langTick.update((v) => v + 1));
}

readonly tableLabels = computed<Partial<NgTableLabels>>(() => {
  this.langTick();
  return {
    columnsButton: this.translate.instant('COMMANDES.COLUMNS_BUTTON'),
    resetFiltersButton: this.translate.instant('COMMANDES.RESET_FILTERS'),
    filterBy: this.translate.instant('COMMON.FILTER_BY', {field: '{field}'}), // {field} : jeton propre à ng-table
    noData: this.translate.instant('COMMANDES.EMPTY'),
    // ... les autres clés de NgTableLabels selon vos besoins
  };
});

readonly columns = computed<NgTableColumn<Commande>[]>(() => {
  this.langTick();
  return [
    {id: 'reference', header: this.translate.instant('COMMANDES.COL_REFERENCE'), valueAccessor: (c) => c.reference},
    // ...
  ];
});
```

```html
<ng-table [labels]="tableLabels()" [columns]="columns()" ... />
```

### Étape 20 — Personnaliser le style

Sans rien faire, le composant a un style neutre par défaut. Pour l'adapter à votre charte (ex. une seule couleur d'accent) :

```css
:root {
  --app-primary: #7c3aed;
  --app-primary-soft: rgba(124, 58, 237, 0.16);
  --app-primary-outline: rgba(124, 58, 237, 0.34);
}
```

Liste complète des 14 variables (bordures, fonds, texte, ombre...) : voir "Personnaliser le style" plus bas.

### Étape 21 — Exemple complet "tout-en-un"

Récapitulatif combinant tout ce qui précède sur un seul écran (mode `remote`, vues, sélection, détail, menu contextuel) :

```html
<ng-table
  (cellCopied)="onCellCopied($event)"
  (columnVisibilityChange)="visibleColumns.set($event)"
  (detailToggle)="onDetailToggle($event)"
  (remoteQueryChange)="fetch($event)"
  (rowContextMenu)="onRowContextMenu($event)"
  (selectionChange)="onSelectionChange($event)"
  (viewActivated)="onViewActivated($event)"
  [columns]="columns()"
  [columnVisibility]="visibleColumns()"
  [dataMode]="'remote'"
  [detailRowTemplate]="detailTpl"
  [inlineFilterColumnIds]="['reference', 'client', 'statut']"
  [inlineFilters]="true"
  [labels]="tableLabels()"
  [pageIndex]="pageIndex()"
  [pageSize]="pageSize()"
  [pageTrackingEnabled]="true"
  [rowContextMenuEnabled]="true"
  [rowContextMenuTemplate]="rowMenu"
  [rowKeyAccessor]="(row) => row.id"
  [rowSelectionEnabled]="true"
  [rows]="serverRows()"
  [showActiveFiltersBar]="true"
  [viewsEnabled]="true"
  [viewsStorageKey]="'commandes-list'"
/>
<mat-paginator [length]="total()" [pageIndex]="pageIndex()" [pageSize]="pageSize()" (page)="onPageChange($event)" />

<ng-template #detailTpl let-row> ... </ng-template>
<ng-template #rowMenu let-row> ... </ng-template>
```

Chaque option activée ici a été introduite isolément dans les étapes précédentes — revenez-y pour le détail de son fonctionnement.

## Référence API

### `NgTableColumn<T>`

| Champ                                      | Type                                                                   | Description                                                                                                                                    |
|--------------------------------------------|------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| `id`                                       | `string`                                                               | Identifiant unique (visibilité, ordre, tri, filtres, vues).                                                                                    |
| `header`                                   | `string`                                                               | Libellé d'en-tête, affiché **tel quel** (texte déjà résolu — pas de clé i18n).                                                                 |
| `valueAccessor`                            | `(row: T) => unknown`                                                  | Valeur brute de la cellule (affichée si pas de `cellTemplate`).                                                                                |
| `visible?`                                 | `boolean`                                                              | Visibilité par défaut (mode non contrôlé), `true` si omis.                                                                                     |
| `sortable?`                                | `boolean`                                                              | Active le tri sur cette colonne.                                                                                                               |
| `resizable?`                               | `boolean`                                                              | Active le redimensionnement (drag sur la bordure du `<th>`, double-clic = auto-fit).                                                           |
| `widthPx?` / `minWidthPx?` / `maxWidthPx?` | `number`                                                               | Contraintes de largeur.                                                                                                                        |
| `cellTemplate?`                            | `TemplateRef<{$implicit: T; row: T; value: unknown; column}>`          | Template custom de cellule.                                                                                                                    |
| `textOverflow?`                            | `'truncate' \| 'wrap'`                                                 | Comportement du texte quand il dépasse la colonne (`'truncate'` par défaut, avec tooltip au survol si réellement tronqué). Sans effet avec `cellTemplate`. |
| `sortValueAccessor?`                       | `(row: T) => string \| number \| boolean \| Date \| null \| undefined` | Valeur utilisée pour le tri si différente de `valueAccessor`.                                                                                  |
| `filter?`                                  | `NgTableFilterConfig`                                                  | Configuration du filtre (voir plus bas).                                                                                                       |
| `filterPredicate?`                         | `(row: T, filterValue: string) => boolean`                             | Logique de filtrage custom (remplace le filtrage par défaut).                                                                                  |
| `mobileRowActions?`                        | `boolean`                                                              | Colonne d'actions condensée affichée en vue mobile (les autres colonnes sont masquées).                                                        |
| `copy?`                                    | `boolean \| {valueAccessor?, tooltip?}`                                | Bouton "copier" sur la cellule. `true` copie `valueAccessor(row)` ; l'objet permet un accessor/tooltip dédiés (`tooltip` = texte déjà résolu). |
| `exportable?`                              | `boolean`                                                               | Exclut la colonne de l'export CSV si `false` (utile pour une colonne d'actions/boutons). `true` par défaut.                                    |
| `exportValueAccessor?`                     | `(row: T) => string \| number \| boolean \| null \| undefined`         | Valeur exportée si différente de `valueAccessor` (ex. valeur brute plutôt que le rendu riche d'un `cellTemplate`).                              |

### `NgTableFilterConfig`

```ts
interface NgTableFilterConfig {
  type?: ColumnFilterType;   // 'text' | 'number' | 'date' | 'boolean' | 'enum' | 'search' | 'email' | ...
  options?: {value: string; label: string}[];   // options statiques (select) — label = texte déjà résolu
  optionsLoader?: () => Observable<...> | Promise<...>;  // options chargées à la demande
  placeholder?: string;
  label?: string;             // libellé affiché dans le menu de filtre / la barre de filtres actifs
  component?: Type<unknown>;  // renderer de filtre 100% custom
  componentInputs?: Record<string, unknown>;
}
```

- `type`/`options`/`placeholder` alimentent le rendu standard interne.
- `optionsLoader` charge les options à la demande (ouverture du menu filtre, ou en eager si `inlineFilters=true`), avec mémoïsation par colonne.
- `component`/`componentInputs` branchent un composant de filtre entièrement custom — il doit exposer `@Input() value` et `@Output() valueChange`.
- La valeur de filtre est toujours une **`string`** (y compris select/date) — c'est au `filterPredicate` ou au filtrage par défaut de l'interpréter.

### Inputs

| Input                       | Type                                                             | Défaut    | Description                                                                                                          |
|-----------------------------|--------------------------------------------------------------------|-----------|----------------------------------------------------------------------------------------------------------------------|
| `rows`                      | `any[]`                                                          | `[]`      | Données source.                                                                                                      |
| `columns`                   | `NgTableColumn<any>[]`                                           | `[]`      | Définition des colonnes.                                                                                             |
| `columnVisibility`          | `Record<string, boolean> \| null`                                | `null`    | Mode contrôlé de la visibilité.                                                                                      |
| `columnOrder`               | `ReadonlyArray<string> \| null`                                  | `null`    | Mode contrôlé de l'ordre des colonnes.                                                                               |
| `filters`                   | `Record<string, string> \| null`                                 | `null`    | Mode contrôlé des filtres.                                                                                           |
| `labels`                    | `Partial<NgTableLabels>`                                         | `{}`      | Textes à surcharger (voir "Personnaliser les textes").                                                              |
| `emptyLabel`                | `string \| null`                                                 | `null`    | Message si liste vide ; `null` = utilise `labels.noData`.                                                            |
| `loading`                   | `boolean`                                                        | `false`   | Affiche un overlay de chargement centré sur la table (bloque l'interaction tant qu'il est visible). Piloté par le parent. |
| `loadingTemplate`           | `TemplateRef<unknown> \| null`                                   | `null`    | Contenu custom de l'overlay de chargement ; `null` = spinner intégré.                                                 |
| `minTableWidthPx`           | `number`                                                         | `760`     | Largeur mini avant scroll horizontal (desktop).                                                                      |
| `rowClassFn`                | `(row) => string \| string[] \| Record<string, boolean> \| null` | `null`    | Classes CSS dynamiques par ligne.                                                                                    |
| `rowTrackBy`                | `TrackByFunction<any> \| null`                                   | `null`    | `trackBy` de rendu (perf) uniquement — n'affecte jamais la clé de sélection/expansion, qui vient de `rowKeyAccessor`/`row.id`. |
| `rowKeyAccessor`            | `(row) => unknown`                                               | `null`    | Clé métier stable (sélection, expansion, feedback copie, trackBy de rendu). Recommandé si `row.id` n'est pas fiable. |
| `detailRowTemplate`         | `TemplateRef<{$implicit, row}>`                                  | `null`    | Template de la ligne détail. `null` = pas de ligne détail.                                                           |
| `detailRowWhen`             | `(index, row) => boolean`                                        | `null`    | Mode contrôlé par index+row de l'expansion.                                                                          |
| `expandedRowKeys`           | `ReadonlyArray<unknown> \| null`                                 | `null`    | Mode contrôlé par clé de l'expansion.                                                                                |
| `detailRowToggleOnRowClick` | `boolean`                                                        | `true`    | Mode non contrôlé : clic sur la ligne = toggle détail.                                                               |
| `detailRowAccordion`        | `boolean`                                                        | `false`   | Mode non contrôlé : une seule ligne dépliée à la fois.                                                               |
| `detailRowCanExpand`        | `(row) => boolean`                                               | `null`    | Garde optionnelle.                                                                                                   |
| `showResetFilters`          | `boolean`                                                        | `true`    | Affiche le bouton "réinitialiser les filtres".                                                                       |
| `filterDebounceMs`          | `number`                                                         | `350`     | Délai avant prise en compte d'une saisie dans un filtre **texte** (`0` = immédiat). Les filtres à choix fixe (select/enum/booléen/date) ne sont jamais debouncés. |
| `rowSelectionEnabled`       | `boolean`                                                        | `false`   | Ajoute une colonne checkbox de sélection.                                                                            |
| `selectedRowKeys`           | `ReadonlyArray<unknown> \| null`                                 | `null`    | Mode contrôlé de la sélection.                                                                                       |
| `inlineFilters`             | `boolean`                                                        | `false`   | Filtres affichés directement dans l'en-tête (pas de menu).                                                           |
| `inlineFilterColumnIds`     | `ReadonlyArray<string> \| null`                                  | `null`    | Restreint les filtres inline à certaines colonnes.                                                                   |
| `showActiveFiltersBar`      | `boolean`                                                        | `false`   | Barre récapitulative des filtres actifs (suppression individuelle).                                                  |
| `rowContextMenuEnabled`     | `boolean`                                                        | `false`   | Active le clic droit sur les lignes.                                                                                 |
| `rowContextMenuTemplate`    | `TemplateRef<{$implicit: row, row}>`                             | `null`    | Contenu du menu contextuel.                                                                                          |
| `dataMode`                  | `'local' \| 'remote'`                                            | `'local'` | Voir "Mode local / distant".                                                                                         |
| `pageTrackingEnabled`       | `boolean`                                                        | `false`   | Voir "Pagination".                                                                                                   |
| `pageIndex`                 | `number`                                                         | `0`       | Page courante (0-based). Utilisé si `pageTrackingEnabled=true`.                                                      |
| `pageSize`                  | `number`                                                         | `10`      | Taille de page. Utilisé si `pageTrackingEnabled=true`.                                                               |
| `viewsEnabled`              | `boolean`                                                        | `false`   | Affiche/masque le bloc "Vues" (bouton + menu).                                                                       |
| `viewsStorageKey`           | `string \| null`                                                 | `null`    | Mode non contrôlé : clé de persistance `localStorage` des vues.                                                      |
| `viewsStore`                | `NgTableViewsStore \| null`                                      | `null`    | Mode contrôlé : le parent possède le store des vues.                                                                 |
| `exportEnabled`              | `boolean`                                                        | `false`   | Affiche le bouton d'export.                                                                                           |
| `exportMode`                 | `'local' \| 'remote'`                                            | `'local'` | Voir "Export".                                                                                                        |
| `exportFilename`             | `string`                                                         | `'export'`| Nom de fichier (sans extension) du CSV généré en mode `local`.                                                        |

### Outputs

| Output                   | Payload                                                                       | Description                                                                                                                                                                |
|--------------------------|-------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `rowClick`               | `any`                                                                         | Clic sur une ligne de données.                                                                                                                                             |
| `filtersChange`          | `Record<string, string>`                                                      | Tout changement de filtre.                                                                                                                                                 |
| `sortChange`             | `NgTableSortChange` (`{columnId, direction}`)                                 | Changement de tri.                                                                                                                                                         |
| `cellCopied`             | `NgTableCopyEvent` (`{columnId, value, row}`)                                 | Après un clic sur le bouton copier.                                                                                                                                        |
| `detailToggle`           | `NgTableDetailToggleEvent` (`{row, expanded, expandedKeys}`)                  | Ouverture/fermeture d'une ligne détail.                                                                                                                                    |
| `columnVisibilityChange` | `Record<string, boolean>`                                                     | Changement via le menu "Colonnes".                                                                                                                                         |
| `columnOrderChange`      | `string[]`                                                                    | Nouvel ordre des ids après un drag-and-drop d'en-tête.                                                                                                                     |
| `selectionChange`        | `NgTableSelectionChangeEvent` (`{row, selected, selectedKeys, selectedRows}`) | Sélection/désélection ou tout-sélectionner.                                                                                                                                |
| `rowContextMenu`         | `NgTableContextMenuEvent` (`{row, position}`)                                 | Ouverture du menu contextuel.                                                                                                                                              |
| `viewsStoreChange`       | `NgTableViewsStore`                                                           | Le store des vues a changé. En mode non contrôlé, miroir de ce qui vient d'être écrit en `localStorage` ; en mode contrôlé, **seul endroit** où le changement est notifié. |
| `viewActivated`          | `NgTableView \| null`                                                         | Une vue devient active (changement manuel ou auto au chargement).                                                                                                          |
| `viewPaginationRestore`  | `{pageIndex, pageSize}`                                                       | Émis quand la vue activée contient une pagination.                                                                                                                         |
| `remoteQueryChange`      | `NgTableRemoteQuery` (`{sort, filters, page}`)                                | **Mode `remote`.** Émis à chaque changement de tri/filtre, état complet, prêt pour une requête serveur unique.                                                             |
| `filteredCountChange`    | `number`                                                                      | **Mode `local` + `pageTrackingEnabled=true`.** Total après filtrage, pour `[length]` de votre paginator.                                                                   |
| `pageIndexChange`        | `number`                                                                      | **Mode `local` + `pageTrackingEnabled=true`.** Émis avec `0` quand un filtre/tri doit remettre la page à zéro.                                                             |
| `remoteExportRequested`  | `NgTableRemoteQuery` (`{sort, filters, page}`)                                | **`exportMode='remote'`.** L'utilisateur a cliqué sur "Exporter" — à vous de lancer la requête serveur (avec vos propres paramètres additionnels) et de gérer le fichier obtenu. |
| `localExportCompleted`   | `NgTableLocalExportEvent` (`{fromPage, toPage, rowCount}`)                    | **`exportMode='local'`.** Émis après la génération et le téléchargement du CSV — informatif (toast, analytics...).                                                         |

## Personnaliser les textes (`NgTableLabels`)

Aucune dépendance i18n : tous les textes de l'UI (boutons, aria-labels, messages) sont en dur (français par défaut). Trois façons de les changer, combinables — priorité : **défauts < `provideNgTableLabels()` < `[labels]`**.

### 1. Globalement, une fois pour toute l'application (recommandé)

`provideNgTableLabels()` prend une factory exécutée dans un contexte d'injection : elle peut donc injecter votre service de traduction et renvoyer un **`Signal`**, auquel cas toutes les tables se remettent à jour automatiquement au changement de langue, sans aucun binding `[labels]`.

```ts
// app.config.ts
import {computed, inject} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {TranslateService} from '@ngx-translate/core';
import {provideNgTableLabels} from '@sbourahla/ng-table';

export const appConfig: ApplicationConfig = {
  providers: [
    provideNgTableLabels(() => {
      const translate = inject(TranslateService);
      const lang = toSignal(translate.onLangChange, {initialValue: null});
      return computed(() => {
        lang(); // dépendance : recalcul à chaque changement de langue
        return {
          columnsButton: translate.instant('NG_TABLE.COLUMNS'),
          viewsButton: translate.instant('NG_TABLE.VIEWS'),
          resetFiltersButton: translate.instant('NG_TABLE.RESET_FILTERS'),
          noData: translate.instant('NG_TABLE.NO_DATA'),
          // `{field}` est le jeton interpolé par ng-table lui-même :
          filterBy: translate.instant('NG_TABLE.FILTER_BY', {field: '{field}'}),
        };
      });
    }),
  ],
};
```

### 2. Avec le pipe `translate`, directement dans le template

`[labels]` accepte un objet littéral construit dans le template — vous pouvez donc y utiliser le pipe `translate` (ou n'importe quel pipe) :

```html
<ng-table
  [labels]="{
    columnsButton: 'NG_TABLE.COLUMNS' | translate,
    viewsButton: 'NG_TABLE.VIEWS' | translate,
    resetFiltersButton: 'NG_TABLE.RESET_FILTERS' | translate
  }"
  [columns]="columns"
  [rows]="rows()"
/>
```

Un objet littéral est recréé à chaque cycle de détection, mais `ng-table` compare les labels **par valeur** en interne : tant que les textes ne changent pas réellement, rien n'est recalculé ni propagé aux sous-composants. C'est donc utilisable sans crainte pour la performance.

### 3. Ponctuellement, en TypeScript

```html
<ng-table [labels]="{resetFiltersButton: 'Effacer', noData: 'Aucune commande'}" ... />
```

### Liste des textes

```ts
export interface NgTableLabels {
  columnsButton: string;
  viewsButton: string;
  resetFiltersButton: string;
  clearFilter: string;
  activeFilters: string;
  filterBy: string;          // interpolé : "{field}" remplacé par le libellé de la colonne
  refOptionsLoading: string;
  refOptionsEmpty: string;
  refOptionsLoadError: string;
  dateStart: string;
  dateEnd: string;
  ok: string;
  cancel: string;
  all: string;
  search: string;
  noData: string;
  sort: string;
  sortAsc: string;
  sortDesc: string;
  copy: string;
  yes: string;
  no: string;
  viewNamePlaceholder: string;  // champ "nom de la vue"
  saveView: string;             // tooltip du bouton d'enregistrement d'une vue
  updateView: string;           // tooltip du bouton de mise à jour d'une vue existante
  deleteView: string;           // tooltip du bouton de suppression d'une vue
  noSavedViews: string;         // message quand aucune vue n'est enregistrée
  dragToReorder: string;        // tooltip de la poignée de réorganisation des colonnes
  exportButton: string;         // libellé du bouton d'export
  exportDialogTitle: string;    // titre de la boîte de dialogue de plage de pages
  exportFromPage: string;       // libellé "de la page"
  exportToPage: string;         // libellé "à la page"
  exportConfirm: string;        // libellé du bouton de confirmation de l'export
  loading: string;              // aria-label de l'overlay de chargement
}
```

De la même façon, `column.header`, `filter.label`, `copy.tooltip` et les `label` des `filter.options` sont du **texte déjà résolu** — traduisez-les avant de construire vos `NgTableColumn[]` (typiquement dans un `computed()` qui dépend du même signal de langue).

## Personnaliser le style (variables CSS)

`ng-table.component.css` consomme des variables CSS custom, **chacune avec une valeur de repli** — le composant a un style correct par défaut, sans configuration. Pour l'adapter à votre charte graphique, redéfinissez tout ou partie de ces variables globalement (`:root` ou équivalent) :

| Variable                | Rôle                                        | Défaut clair                        | Défaut sombre (suggestion)        |
|--------------------------|----------------------------------------------|--------------------------------------|-------------------------------------|
| `--app-border`          | Bordures fines                              | `rgba(15, 23, 42, 0.13)`            | `rgba(151, 196, 206, 0.14)`       |
| `--app-border-strong`   | Bordures marquées (panneaux, menus)         | `rgba(15, 23, 42, 0.24)`            | `rgba(151, 196, 206, 0.28)`       |
| `--app-surface`         | Fond des panneaux/menus                     | `#ffffff`                           | `rgba(10, 28, 36, 0.78)`          |
| `--app-surface-soft`    | Fond légèrement teinté                      | `#f7fbfe`                           | `rgba(15, 40, 49, 0.72)`          |
| `--app-surface-solid`   | Fond opaque (liste déroulante de recherche) | `#ffffff`                           | `#0d2430`                         |
| `--app-filter-panel-bg` | Fond du panneau de filtre                   | `#ffffff`                           | `rgba(9, 25, 33, 0.98)`           |
| `--app-field-bg`        | Fond des champs de saisie                   | `#ffffff`                           | `rgba(255, 255, 255, 0.06)`       |
| `--app-field-hover-bg`  | Fond des champs au survol                   | `#f7fbff`                           | `rgba(255, 255, 255, 0.09)`       |
| `--app-hover-surface`   | Fond au survol (ligne, option)              | `#f6fbff`                           | `rgba(255, 255, 255, 0.08)`       |
| `--app-frost`           | Fond du bouton "effacer"                    | `#ffffff`                           | `rgba(255, 255, 255, 0.04)`       |
| `--app-text`            | Texte principal                             | `#0d1d26`                           | `#eff8fb`                         |
| `--app-muted`           | Texte secondaire                            | `#4f6573`                           | `#8aa8b3`                         |
| `--app-primary`         | Couleur d'accent                            | `#3a7ca5`                           | `#61d8df`                         |
| `--app-primary-soft`    | Fond teinté à l'accent                      | `rgba(58, 124, 165, 0.16)`          | `rgba(97, 216, 223, 0.14)`        |
| `--app-primary-outline` | Contour teinté à l'accent                   | `rgba(58, 124, 165, 0.34)`          | `rgba(97, 216, 223, 0.38)`        |
| `--app-shadow-soft`     | Ombre portée                                | `0 8px 20px rgba(15, 23, 42, 0.09)` | `0 16px 48px rgba(0, 0, 0, 0.24)` |
| `--app-blur`            | Flou derrière un panneau flottant           | `0px`                                | `18px`                            |

Le composant utilise aussi `var(--mat-sys-error, #b3261e)` (badges/icônes d'erreur) — token standard du système de thématisation Angular Material, déjà disponible dès qu'un thème Material est appliqué globalement.

```css
/* Exemple : personnaliser uniquement l'accent */
:root {
  --app-primary: #7c3aed;
  --app-primary-soft: rgba(124, 58, 237, 0.16);
  --app-primary-outline: rgba(124, 58, 237, 0.34);
}
```

## Mode local / distant

`dataMode` détermine si le composant traite `rows()` comme le jeu de données complet (à filtrer/trier/paginer lui-même) ou comme une page déjà préparée par le serveur.

### Mode local (`dataMode='local'`, défaut)

Tri, filtrage et pagination (si `pageTrackingEnabled=true`) sont appliqués **côté client**, zéro appel réseau au-delà du chargement initial de `rows()`.

```html
<ng-table
  [dataMode]="'local'"
  [pageTrackingEnabled]="true"
  [pageIndex]="pageIndex()"
  [pageSize]="pageSize()"
  [columns]="columns"
  [rows]="allRowsLoadedOnce()"
  (filteredCountChange)="filteredTotal.set($event)"
  (pageIndexChange)="pageIndex.set($event)"
/>
<mat-paginator [length]="filteredTotal()" [pageIndex]="pageIndex()" [pageSize]="pageSize()"
               (page)="pageIndex.set($event.pageIndex); pageSize.set($event.pageSize)"/>
```

### Mode distant (`dataMode='remote'`)

Tri, filtrage et pagination sont délégués **entièrement au serveur** : `rows()` est affiché tel quel. Chaque changement de tri/filtre émet **un seul événement combiné** `(remoteQueryChange)` — `{sort, filters, page}` — prêt à devenir une requête HTTP unique. La navigation de page elle-même n'est **pas** captée par le composant (il ne rend aucun paginator) : appelez votre méthode de fetch directement depuis le `(page)` de votre propre paginator.

```html
<ng-table
  [dataMode]="'remote'"
  [pageTrackingEnabled]="true"
  [pageIndex]="pageIndex()"
  [pageSize]="pageSize()"
  [columns]="columns"
  [rows]="serverRows()"
  [filters]="columnFilters()"
  (remoteQueryChange)="onRemoteQueryChange($event)"
/>
<mat-paginator (page)="onPageChange($event)" [length]="total()" [pageIndex]="pageIndex()" [pageSize]="pageSize()"/>
```

```ts
onRemoteQueryChange(query: NgTableRemoteQuery): void {
  this.fetchRows(query); // { sort, filters, page } — un seul appel réseau
}
onPageChange(event: PageEvent): void {
  this.fetchRows({sort: this.currentSort(), filters: this.currentFilters(), page: {index: event.pageIndex, size: event.pageSize}});
}
```

⚠️ Basculer `[dataMode]` **à la volée sur une instance déjà affichée** change radicalement la sémantique de `rows()` — c'est un choix fixé au démarrage d'un écran, pas un état à faire varier dynamiquement pendant l'usage.

## Pagination

`pageTrackingEnabled` déclare que `[pageIndex]`/`[pageSize]` sont réellement pris en compte :

- **Mode `local`** : c'est là qu'il agit vraiment. `displayedRows()` est tronqué à la page courante, et `(filteredCountChange)` donne le total post-filtre pour votre paginator.
- **Mode `remote`** : effet mineur — change seulement la valeur embarquée dans `remoteQueryChange.page.size` (`pageSize()` si `true`, `0` sinon). La navigation de page reste toujours gérée par votre propre paginator, indépendamment de ce flag.

## Vues sauvegardées ("Views")

Système permettant à l'utilisateur de sauvegarder l'état complet d'affichage (colonnes visibles, ordre, tri, filtres, et pagination si `pageTrackingEnabled=true`) sous un nom, d'y revenir, d'en créer plusieurs, de les supprimer.

![Une vue nommée ("vue test") activée, affichée en chip à côté du bouton "Vues"](https://raw.githubusercontent.com/SlimNetCore/ngTable/main/captures/img_2.png)

```html
<ng-table
  [viewsEnabled]="true"
  [viewsStorageKey]="'my-list'"
  (viewActivated)="onViewActivated($event)"
  (viewPaginationRestore)="onViewPaginationRestore($event)"
/>
```

- `[viewsEnabled]="false"` (défaut) masque entièrement le bouton "Vues" — aucune UI, aucun coût.
- **Mode non contrôlé** (dès que `viewsStorageKey` est fourni) : persistance automatique dans `localStorage`, sous la clé namespacée `` `ng-table.views.${viewsStorageKey}` ``.
- **Mode contrôlé** (`[viewsStore]` fourni) : le composant n'écrit plus dans `localStorage`, il émet seulement `(viewsStoreChange)` — à vous de décider où stocker.
- Au chargement, la dernière vue active est automatiquement réappliquée si le store en contient une.
- Chaque vue de la liste a un bouton "mettre à jour" (icône `sync`) qui écrase son état sauvegardé avec l'affichage courant (colonnes, ordre, tri, filtres, pagination), sans avoir à retaper son nom dans le champ de création — contrairement à `saveCurrentAsView`, qui ne met à jour que par correspondance de nom. Appelable aussi directement : `updateView(view: NgTableView): void`.

**Point d'attention** : si `columnVisibility` est **contrôlé** par le parent, l'activation d'une vue ne suffit pas à faire réapparaître les bonnes colonnes visuellement — il faut resynchroniser explicitement via `(viewActivated)` :

```ts
onViewActivated(view: NgTableView | null): void {
  if (!view) return;
  this.visibleColumns.set({...view.state.columnVisibility});
}
```

## Ordre des colonnes (drag-and-drop)

Chaque en-tête a une poignée (`drag_indicator`) déclenchant un drag-and-drop HTML5 **natif** (pas Angular CDK — son repositionnement live par `transform` est incompatible avec la mise en page `<table>`/`display:table-cell`). Désactivé en vue mobile.

```html
<ng-table [columns]="columns" [columnOrder]="columnOrder()" (columnOrderChange)="columnOrder.set($event)" [rows]="rows()" />
```

## Ligne détail (master/detail)

![Ligne détail dépliée : détail des lignes d'une facture sous sa ligne parente](./docs/images/ng-table-overview.png)

Trois modes :

**1. Non contrôlé** (le plus courant) :

```html
<ng-table [columns]="columns" [rows]="rows()" [detailRowTemplate]="detailTpl" [detailRowAccordion]="true" />
<ng-template #detailTpl let-row><div>{{ row.notes }}</div></ng-template>
```

**2. Contrôlé par index+row** : `[detailRowWhen]="(index, row) => expandedIndexes().has(index)"`

**3. Contrôlé par clé** (recommandé pour piloter/persister l'expansion depuis le parent) :

```html
[rowKeyAccessor]="(row) => row.id" [expandedRowKeys]="expandedIds()" (detailToggle)="onDetailToggle($event)"
```

## Sélection de lignes

```html
<ng-table [rowSelectionEnabled]="true" (selectionChange)="onSelectionChange($event)" />
```

Non contrôlé par défaut (checkbox interne + case "tout sélectionner"). Contrôlé via `[selectedRowKeys]` (avec `rowKeyAccessor` si `row.id` n'est pas la clé naturelle) + `(selectionChange)`.

## Menu contextuel (clic droit)

```html
<ng-table [rowContextMenuEnabled]="true" [rowContextMenuTemplate]="rowMenu" (rowContextMenu)="onRowContextMenu($event)" />
<ng-template #rowMenu let-row>
  <button mat-menu-item (click)="openDetails(row)"><mat-icon>visibility</mat-icon><span>Voir</span></button>
</ng-template>
```

Le menu est positionné au point de clic exact (l'ancre technique est reparentée dans `document.body` à l'ouverture, pour éviter qu'un `backdrop-filter` ancêtre ne déplace le menu).

## Copie de cellule

```ts
{id: 'code', ..., copy: true}
// ou
{id: 'code', ..., copy: {valueAccessor: (row) => row.code.toUpperCase(), tooltip: 'Copier le code'}}
```

## Filtres : menu vs inline

- Par défaut, chaque colonne filtrable a une icône dans l'en-tête ouvrant un mini-menu.
- `inlineFilters=true` : filtre rendu directement dans la cellule d'en-tête. `inlineFilterColumnIds` restreint ce mode à certaines colonnes.
- `showActiveFiltersBar=true` ajoute une barre récapitulative sous la table, avec suppression individuelle.
- Les filtres texte sont **debouncés à 350 ms** (via `groupBy` + `mergeMap(debounce)`, un flux indépendant par colonne) avant de committer et déclencher `filtersChange`/`remoteQueryChange` — évite une requête par caractère tapé en mode `remote`. Configurable via `[filterDebounceMs]`. Les filtres à choix fixe (select/enum/boolean/date) committent immédiatement.

## Responsive

Sous 760px, la table bascule en vue mobile : seule la colonne marquée `mobileRowActions: true` reste visible (colonne d'actions condensée), la poignée de drag-and-drop est désactivée. Au-dessus, si la somme des largeurs dépasse `minTableWidthPx`, un scroll horizontal apparaît plutôt que de compresser les colonnes.

## Points d'attention

- **Performance** : en mode `local`, `displayedRows()` (filtre + tri) est recalculé à chaque changement de `rows`/`columns`/filtres/tri — pour de très gros volumes, préférez `dataMode='remote'`.
- **`rowKeyAccessor`** : recommandé dès que `rowSelectionEnabled`, `expandedRowKeys`, ou les vues sont utilisés sans `row.id` fiable et stable.
- **Le jeu de filtres est construit par le composant** : `columnFilters` est toujours dérivé de `columns()` (une entrée par colonne filtrable, jamais tronqué) — aucun consommateur n'a besoin d'énumérer lui-même ses colonnes filtrables ; un backend générique peut transmettre `remoteQueryChange.filters`/`filtersChange` tel quel.

## Licence

MIT

````