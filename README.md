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
- **Filtres** par colonne — texte, nombre, date (jour unique), période (plage de dates), énuméré (select), booléen, ou un composant de filtre 100% custom ; en menu ou inline dans l'en-tête ; options chargées à la demande (`optionsLoader`) avec debounce automatique sur les champs texte
- **Sélection de lignes** (case à cocher), interne ou pilotée par le parent
- **Ligne détail** (master/detail), 3 modes (non contrôlé, par prédicat, par clé)
- **Menu contextuel** (clic droit) fourni par le parent
- **Copie rapide** d'une cellule en un clic
- **Vues sauvegardées** : l'utilisateur enregistre/active/supprime des configurations nommées (colonnes, ordre, largeurs, tri, filtres, pagination) — persistées en `localStorage` par défaut, ou déléguées entièrement au parent (API, fichier...)
- **Deux modes de données** :
  - `local` (défaut) : tri/filtre/pagination appliqués côté client, zéro requête après le chargement initial
  - `remote` : le composant affiche `rows()` tel quel et notifie chaque changement de tri/filtre via un événement combiné unique, prêt à devenir une requête serveur
- **Responsive** : bascule automatique en vue mobile condensée sous 760px

Le composant ne fait **aucun appel réseau** : `rows()` est fourni par le parent (déjà chargé, ou paginé côté serveur selon le mode).

![Vue d'ensemble : sélection de lignes, filtres inline, colonne d'actions](https://raw.githubusercontent.com/SlimNetCore/ngTable/main/captures/img_1.png)

## Typage

`NgTableComponent<T>` est générique. Dans un template, Angular infère `T` depuis `[rows]` et `[columns]`, sans rien à écrire. Les événements et les templates sont alors typés avec votre modèle :

```html
<ng-table [rows]="commandes()" [columns]="columns" (rowClick)="ouvrir($event)" />
<!-- $event est une Commande : une faute de propriété est signalée à la compilation -->
```

Pour que l'inférence fonctionne, typez vos colonnes avec votre modèle (`NgTableColumn<Commande>[]`). Côté TypeScript, `viewChild(NgTableComponent)` sans paramètre reste utilisable (`T = any`). Précisez le type pour bénéficier du typage : `viewChild.required<NgTableComponent<Commande>>(NgTableComponent)`.

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

> **Mettre à jour les données** : passez un nouveau tableau (`this.commandes.set([...])`), avec un nouvel objet pour chaque ligne modifiée. La table calcule filtres, tri, recherche et valeurs affichées une fois par changement de `rows` : une ligne modifiée sur place (même objet, même tableau) n'est pas relue. Les signaux lus dans un `valueAccessor` (langue, format...) sont en revanche suivis.

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

**Tri multi-colonnes** : avec `[multiSort]="true"`, Maj+clic sur un en-tête (ou Maj+Entrée au clavier) ajoute la colonne comme niveau de tri supplémentaire. Répéter Maj+clic fait tourner sa direction, puis retire ce niveau. Un clic simple revient à un tri unique. Le rang de chaque niveau s'affiche à côté de la flèche, et il est inclus dans le libellé accessible du bouton (« Trié croissant, priorité 2 »).

```html
<ng-table [multiSort]="true" (sortsChange)="onSorts($event)" ... />
```

- `(sortChange)` continue d'émettre le **tri principal** seul. `(sortsChange)` émet tous les niveaux, par priorité.
- En mode `remote`, `NgTableRemoteQuery.sorts` porte tous les niveaux. `sort` reste le tri principal, pour les backends qui n'en gèrent qu'un.
- Les vues sauvegardées enregistrent tous les niveaux (`NgTableViewState.sorts`).
- Les clés de tri sont calculées une fois par ligne, pas à chaque comparaison. Le tri est stable : à égalité, l'ordre d'origine est conservé. Les cellules vides restent en fin de liste, en tri croissant comme décroissant.

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

**Date** (`type: 'date'` — un **jour unique**, sélecteur de date simple, valeur sérialisée `"YYYY-MM-DD"`) :

```ts
{id: 'dateCommande', header: 'Date', valueAccessor: (c) => c.dateCommande, filter: {type: 'date'}}
```

**Période** (`type: 'range'` — **deux bornes**, sélecteur de plage, valeur sérialisée `"YYYY-MM-DD..YYYY-MM-DD"`) :

```ts
{id: 'dateCommande', header: 'Période', valueAccessor: (c) => c.dateCommande, filter: {type: 'range'}}
```

Les deux sont filtrés nativement par `ng-table` en mode `local`, sans `filterPredicate` à écrire :

- `date` : égalité sur le jour.
- `range` : **bornes incluses**, et chaque borne peut être vide pour une plage ouverte (`"2026-02-01.."` = à partir du 1er février, `"..2026-02-01"` = jusqu'au 1er février).

La valeur de cellule peut être une chaîne ISO (`"2026-01-12"`, `"2026-01-12T08:30:00Z"`), un objet `Date`, ou toute date parsable — elle est ramenée au jour pour la comparaison.

> **Changement de comportement** — avant la séparation des deux types, `type: 'date'` affichait un sélecteur de **plage**. Une colonne qui attendait ce comportement doit désormais déclarer `type: 'range'`. À l'inverse, `type: 'date'` devient ce que son nom annonce : un jour unique.

**Nombre** (`type: 'number'`) : un champ texte (clavier décimal sur mobile) qui accepte une **expression** :

| Saisie | Signification |
|--------|---------------|
| `150` ou `=150` | égal à 150 |
| `!=0` | différent de 0 |
| `>150`, `>=150`, `<20`, `<=20` | comparaisons |
| `100..200` | entre 100 et 200, bornes incluses (`100..` ou `..200` pour une plage ouverte) |

La virgule décimale est acceptée (`>12,5`). Une saisie qui n'est pas une expression numérique retombe sur une recherche texte « contient ».

**Plage numérique** (`type: 'numberRange'`) : deux champs Min / Max, valeur sérialisée `"min..max"` (une borne peut rester vide) :

```ts
{id: 'montant', header: 'Montant', valueAccessor: (c) => c.montant, filter: {type: 'numberRange'}}
```

**Opérateur texte** : les filtres texte font un « contient » insensible à la casse. `operator` change ce comportement :

```ts
{id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference,
 filter: {type: 'text', operator: 'startsWith'}}   // 'contains' (défaut) | 'equals' | 'startsWith' | 'endsWith'
```

**Enum multi-valeurs** : si l'utilisateur coche plusieurs options, une ligne correspond dès qu'elle vaut **l'une** d'elles (valeur sérialisée `"A,B"`).

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

### Étape 6bis — Recherche globale

Un champ « Rechercher… » en haut à gauche de la table, qui cherche dans toutes les colonnes visibles :

```html
<ng-table [globalSearchEnabled]="true" ... />
```

- Chaque mot saisi doit apparaître dans la ligne, pas forcément dans la même colonne. Par exemple, `dupont validée` trouve le client Dupont au statut Validée.
- La casse et les accents sont ignorés : `elodie` trouve `Élodie`.
- La saisie est debouncée comme les filtres texte (`[filterDebounceMs]`). Entrée applique la recherche tout de suite ; Échap efface le champ.
- La recherche se combine aux filtres de colonnes. Elle apparaît dans la barre des filtres actifs, et « Réinitialiser les filtres » l'efface aussi.
- Elle est enregistrée dans les vues sauvegardées.

Par défaut, la recherche porte sur la valeur de `valueAccessor`. `searchable` permet de changer ça, colonne par colonne :

```ts
{id: 'actions', header: '', valueAccessor: () => '', searchable: false},          // exclue
{id: 'statut', header: 'Statut', valueAccessor: (c) => c.statut,                   // code brut "VALIDEE"...
 searchable: (c) => STATUT_LABELS[c.statut]},                                      // ...mais on cherche le libellé affiché
```

En mode `remote`, rien n'est filtré côté client. Le texte saisi part dans `remoteQueryChange` (champ `search`), à vous de le transmettre au serveur. En mode contrôlé : `[globalSearch]` et `(globalSearchChange)`.

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

Quand le texte d'une cellule dépasse la largeur de sa colonne, deux modes au choix via `textOverflow` :

```ts
{id: 'description', header: 'Description', valueAccessor: (c) => c.description, textOverflow: 'wrap'}
// ou, explicitement (c'est déjà le défaut) :
{id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference, textOverflow: 'truncate'}
```

- `'truncate'` (défaut) : une seule ligne, coupée avec "…" ; au survol, une tooltip affiche le texte complet — mais **uniquement si le texte est réellement tronqué** (comparaison `scrollWidth`/`clientWidth`), pas de tooltip superflue sinon.
- `'wrap'` : retour à la ligne normal, la ligne du tableau s'agrandit pour accueillir le texte complet.

S'applique aussi bien à une colonne `cellTemplate` — par défaut `'truncate'`, exactement comme pour `valueAccessor` :

```ts
{id: 'notes', header: 'Notes', valueAccessor: (c) => c.notes, cellTemplate: notesCellTemplate}
// équivaut à textOverflow: 'truncate' — le rendu du template est forcé sur une seule ligne, coupé avec "…"
```

Dans ce cas, la tooltip de troncature n'est pas affichée (le rendu du template n'est pas résumable en texte simple) — seule la coupure visuelle avec "…" s'applique. Si le template doit pouvoir se répartir sur plusieurs lignes (plusieurs badges, icône + texte long...), passez explicitement `textOverflow: 'wrap'`.

**Le libellé d'en-tête aussi** : sans rien configurer, un `header` trop long pour sa colonne est coupé avec "…", avec la même tooltip au survol (même mécanisme, même variables CSS — voir "Tooltip de troncature" plus bas) affichant le titre complet, uniquement si réellement tronqué.

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

### Étape 10bis — En-tête fixe, colonnes épinglées, densité

Pour une longue liste sans pagination, limitez la hauteur et gardez l'en-tête visible :

```html
<ng-table [maxHeight]="'60vh'" [stickyHeader]="true" [density]="'compact'" ... />
```

Pour une table large, épinglez les colonnes clés : elles restent visibles pendant le défilement horizontal.

```ts
{id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference, pinned: 'left'},
{id: 'actions', header: '', valueAccessor: () => '', cellTemplate: actionsTpl, pinned: 'right'},
```

Les colonnes épinglées sont regroupées à leur bord, quel que soit l'ordre choisi par l'utilisateur. Leur ordre relatif reste respecté. Si une colonne est épinglée à gauche, la case de sélection l'est aussi.

**Colonne de référence choisie par l'utilisateur** : avec `[referenceColumnSelectable]="true"`, le menu « Colonnes » affiche une punaise à côté de chaque colonne. Un clic fixe cette colonne à gauche, en première position ; un second clic la libère. La punaise est désactivée pour une colonne masquée.

```html
<ng-table [referenceColumnSelectable]="true" [(referenceColumn)]="colonneFixe" ... />
```

`referenceColumn` vaut :
- `undefined` (défaut) : les `pinned: 'left'` déclarés sur les colonnes s'appliquent ;
- un id de colonne : cette colonne **seule** est fixée à gauche, à la place des `pinned: 'left'` déclarés. Les colonnes `pinned: 'right'` restent à droite ;
- `null` : aucune colonne fixée à gauche.

Le choix est enregistré dans les vues sauvegardées (`NgTableViewState.referenceColumnId`). Sans liaison, le composant le gère seul.

### Étape 10quater — Défilement virtuel (très longues listes)

Sans pagination, une table de 50 000 lignes crée 50 000 lignes dans le DOM : l'affichage et chaque changement deviennent lents. Avec `[virtualScroll]="true"`, seules les lignes visibles sont rendues, plus une marge de 8 lignes de chaque côté (une vingtaine en tout). La barre de défilement garde la hauteur de la liste complète.

```html
<ng-table [virtualScroll]="true" [maxHeight]="'70vh'" [rows]="cinquanteMilleLignes" ... />
```

- **Hauteur** : la zone a une hauteur fixe, `[maxHeight]` (70vh par défaut). L'en-tête y est toujours fixe.
- **Hauteur de ligne** : elle est **mesurée** sur la première ligne rendue, ce qui suit la densité compacte ou votre thème. Les lignes doivent avoir une **hauteur uniforme** : une ligne détail dépliée ou du texte sur plusieurs lignes (`textOverflow: 'wrap'`) décalent un peu la position.
- **Compatibilité** : filtres, tri, recherche, regroupement, sélection (« tout sélectionner » porte sur toutes les lignes), export et navigation clavier (`cellNavigation`) fonctionnent comme sans défilement virtuel. `displayedRows()` renvoie toujours toutes les lignes.
- **Limite des navigateurs** : un élément ne peut guère dépasser 30 millions de pixels de haut, soit environ 600 000 lignes de 52 px. Au-delà, préférez `dataMode='remote'` paginé.

### Étape 10ter — Regroupement et totaux

Les lignes peuvent être regroupées par la valeur d'une colonne (mode `local`), avec un en-tête par groupe : libellé, nombre de lignes et agrégats.

```html
<ng-table [groupingEnabled]="true" [showTotals]="true" [(groupBy)]="regroupement" ... />
```

```ts
{id: 'montant', header: 'Montant', valueAccessor: (c) => c.montant, aggregate: 'sum'},     // 'sum' | 'avg' | 'min' | 'max' | 'count'
{id: 'urgent', header: 'Urgent', valueAccessor: (c) => c.urgent ? 'Oui' : 'Non',
 aggregate: (rows) => `${rows.filter((c) => c.urgent).length} urgente(s)`},              // agrégat personnalisé
{id: 'actions', header: '', valueAccessor: () => '', groupable: false},                   // absente du menu « Grouper »
```

- **Le bouton « Grouper »** propose les colonnes triables ou filtrables (`groupable` pour forcer l'un ou l'autre), plus « Tout déplier » / « Tout replier ». Le choix s'enregistre dans les vues ; `[(groupBy)]` permet de le piloter depuis le parent.
- **Le libellé d'un groupe** reprend le libellé de l'option du filtre quand il y en a une (« Validée » plutôt que `VALIDEE`). Un groupe sans valeur s'appelle « (vide) » et vient en dernier.
- **Ordre** : les groupes suivent l'ordre de leur valeur, décroissant si la table est triée à l'envers sur cette colonne. Dans un groupe, les lignes gardent le tri courant.
- **Replier un groupe** : un clic sur son en-tête, ou Entrée / Espace au clavier. L'en-tête porte `aria-expanded`.
- **Pagination** (mode local) : elle porte sur les lignes, et un groupe replié compte pour une ligne. Un groupe coupé entre deux pages garde son en-tête sur chaque page. Ses agrégats portent toujours sur **tout** le groupe. `(filteredCountChange)` suit ce même compte, pour un paginateur externe.
- **Ligne de totaux** : `[showTotals]` affiche en bas de la table les agrégats sur toutes les lignes filtrées, avec ou sans regroupement.
- **En mode `remote`**, la table n'a qu'une page de lignes. Regrouper cette page seule donnerait des groupes coupés et des totaux faux. Le travail est donc partagé avec le serveur :
  1. `groupBy` part dans `NgTableRemoteQuery.groupBy`. Le serveur renvoie les lignes triées **d'abord** par cette colonne, puis par `sorts`.
  2. La table dessine un en-tête à chaque changement de valeur dans la page reçue. Un groupe à cheval sur deux pages a son en-tête sur chacune.
  3. `[groupSummaries]` donne **tous** les groupes, dans leur ordre, avec le nombre de lignes et les agrégats calculés sur tout le groupe. `key` est la valeur de la colonne en texte (jour `YYYY-MM-DD` pour une date, `''` si vide). Sans cette liste, l'en-tête n'affiche que le libellé (un compte limité à la page serait trompeur) et les groupes ne se replient pas.
  4. Avec `[groupSummaries]`, les groupes se replient. Replier ou déplier relance `remoteQueryChange` sur la même page, avec `collapsedGroups` (les clés repliées). Le serveur **exclut** les lignes de ces groupes : un groupe replié n'occupe aucune ligne de la pagination, et `totalCount` ne compte que les lignes des groupes dépliés. La table place l'en-tête d'un groupe replié à sa position dans la liste complète, grâce à l'ordre et aux comptes de `[groupSummaries]` (sur la dernière page s'il est en fin de liste). `count` reste le nombre total de lignes du groupe, affiché dans son en-tête.

  ```ts
  load(query: NgTableRemoteQuery) {
    this.api.commandes(query).subscribe((page) => {
      this.rows.set(page.rows);                     // triées par query.groupBy, puis par query.sorts, sans les groupes query.collapsedGroups
      this.total.set(page.total);                   // lignes des groupes dépliés seulement
      this.groupSummaries.set(page.groupSummaries); // [{key: 'VALIDEE', count: 480, aggregates: {montant: 125000}}, ...] : tous les groupes, dans l'ordre
    });
  }
  ```
  ```html
  <ng-table [dataMode]="'remote'" [groupingEnabled]="true" [groupSummaries]="groupSummaries()" (remoteQueryChange)="load($event)" ... />
  ```

### Étape 11 — Visibilité des colonnes

Un bouton "Colonnes" (menu à cases à cocher) est présent par défaut — rien à activer. Pour le masquer (par exemple si vous pilotez la visibilité autrement, ou ne voulez pas laisser l'utilisateur y toucher) :

```html
<ng-table [columnsMenuEnabled]="false" ... />
```

Ça ne masque QUE le bouton/menu : le mécanisme de visibilité lui-même (`visible: false` sur une colonne, ou `[columnVisibility]`/`(columnVisibilityChange)` en mode contrôlé, voir ci-dessous) continue de fonctionner normalement — utile si vous pilotez la visibilité depuis votre propre UI.

En mode non contrôlé, l'état de visibilité est géré en interne (toutes visibles par défaut, sauf `visible: false` explicite sur une colonne). Pour le piloter depuis le parent (ex. sauvegarder la préférence utilisateur) :

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

Toutes les commandes sont chargées une fois ; filtre/tri/pagination se font en mémoire, aucune requête ensuite.

**Le plus simple : le paginateur intégré.** Il n'y a rien à relier : le composant tient la page courante, revient en page 1 après un filtre, recule si les données rétrécissent, et restaure la pagination des vues.

```html
<ng-table [paginator]="true" [pageSize]="25" [pageSizeOptions]="[25, 50, 100]" [columns]="columns" [rows]="allCommandes()" />
```

Pour lire ou piloter la page depuis le parent : `[(pageIndex)]="page"` et `[(pageSize)]="taille"` (liaison bidirectionnelle).

**Avec votre propre `<mat-paginator>`** (placé ailleurs dans la page, par exemple) :

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

### Étape 17bis — Traduire votre `<mat-paginator>`

`ng-table` ne rend pas de pagination lui-même (voir les Étapes 16/17) — vous branchez votre propre `<mat-paginator>`. Son i18n est un mécanisme **entièrement séparé** de `labels`/`provideNgTableLabels()` : sans rien faire, ses textes ("Items per page", "of"...) restent en anglais même si le reste de la table est traduit. `NgTablePaginatorIntl` fournit une traduction française prête à l'emploi :

```ts
// Pour toute l'application (app.config.ts)
import {provideNgTablePaginatorIntl} from '@sbourahla/ng-table';

export const appConfig: ApplicationConfig = {
  providers: [provideNgTablePaginatorIntl(), /* ... */],
};
```

```ts
// Ou juste pour le composant qui affiche le <mat-paginator>
@Component({
  providers: [provideNgTablePaginatorIntl()],
  // ...
})
export class CommandeListComponent {}
```

Pour ne changer qu'un texte ponctuellement, étendez la classe plutôt que d'utiliser d'autres clés :

```ts
import {NgTablePaginatorIntl} from '@sbourahla/ng-table';
import {MatPaginatorIntl} from '@angular/material/paginator';

class MyPaginatorIntl extends NgTablePaginatorIntl {
  override itemsPerPageLabel = 'Lignes par page';
}

// providers du composant :
providers: [{provide: MatPaginatorIntl, useClass: MyPaginatorIntl}]
```

### Étape 18 — Vues sauvegardées

Ajoutez un système "vues nommées" (colonnes/ordre/largeurs/tri/filtres/pagination), persistées automatiquement :

```html
<ng-table
  [viewsEnabled]="true"
  [viewsStorageKey]="'commandes-list'"
  [columnVisibility]="visibleColumns()"
  (columnVisibilityChange)="visibleColumns.set($event)"
  (viewActivated)="onViewActivated($event)"
  [pageTrackingEnabled]="true"
  [pageIndex]="pageIndex()"
  [pageSize]="pageSize()"
  (pageIndexChange)="pageIndex.set($event)"
  (viewPaginationRestore)="pageIndex.set($event.pageIndex); pageSize.set($event.pageSize)"
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

ℹ️ Avec le paginateur intégré (`[paginator]="true"`), ce qui suit ne vous concerne pas : la pagination d'une vue est réappliquée automatiquement.

⚠️ **Piège fréquent** (paginateur externe) : `[pageIndex]`/`[pageSize]` sont **entièrement contrôlés** — comme `column­Visibility`, `sort`, `filters`... sauf qu'ici il n'y a pas de mode "non contrôlé" de secours (contrairement à `columnVisibility` qui gère un état interne si vous ne le bindez pas). Sans le binding `(viewPaginationRestore)` ci-dessus, la page/taille de page sauvegardées dans une vue ne sont **jamais réappliquées** à l'activation : ng-table les calcule et les émet, mais ne peut pas écrire lui-même dans vos propres signaux `pageIndex`/`pageSize`. C'est la cause la plus courante d'un "la taille de page ne se restaure pas en changeant de vue".

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

### Étape 18bis — Export (CSV / Excel local ou génération serveur)

Un bouton "Exporter" dans la barre d'actions, avec deux modes au choix via `exportMode` :

**Mode `local`** (défaut) — `ng-table` génère lui-même le fichier, aucune requête réseau :

```html
<ng-table [exportEnabled]="true" [exportFilename]="'commandes'" ... />

<!-- Excel (.xlsx) plutôt que CSV -->
<ng-table [exportEnabled]="true" [exportFormat]="'xlsx'" [exportFilename]="'commandes'" ... />
```

Le `.xlsx` est produit par la lib elle-même, **sans dépendance**. Les nombres et booléens restent typés, donc Excel peut les additionner et les trier. La ligne d'en-tête est en gras et figée. Une `Date` est exportée au format ISO (`2026-01-12`). Le CSV utilise `;` comme séparateur et un BOM UTF-8, pour qu'Excel en français l'ouvre correctement.

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

`NgTableRemoteQuery` (`{sort, sorts, filters, page, search, groupBy, collapsedGroups}`) reprend le tri/filtres/page/recherche globale courants — exactement ce qui alimente `remoteQueryChange`. Aucun appel serveur n'est fait par `ng-table` : c'est le seul mode qui a du sens pour un export portant sur des données que le composant n'a pas (le grid affiche peut-être une page, mais l'export porte sur l'ensemble des lignes correspondant aux filtres côté back).

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
| `textOverflow?`                            | `'truncate' \| 'wrap'`                                                 | Comportement du texte quand il dépasse la colonne, `valueAccessor` ou `cellTemplate` (`'truncate'` par défaut dans les deux cas ; tooltip au survol si réellement tronqué, sauf pour `cellTemplate`). |
| `sortValueAccessor?`                       | `(row: T) => string \| number \| boolean \| Date \| null \| undefined` | Valeur utilisée pour le tri si différente de `valueAccessor`.                                                                                  |
| `filter?`                                  | `NgTableFilterConfig`                                                  | Configuration du filtre (voir plus bas).                                                                                                       |
| `filterPredicate?`                         | `(row: T, filterValue: string) => boolean`                             | Logique de filtrage custom (remplace le filtrage par défaut).                                                                                  |
| `mobileRowActions?`                        | `boolean`                                                              | Colonne d'actions condensée affichée en vue mobile (les autres colonnes sont masquées).                                                        |
| `copy?`                                    | `boolean \| {valueAccessor?, tooltip?}`                                | Bouton "copier" sur la cellule. `true` copie `valueAccessor(row)` ; l'objet permet un accessor/tooltip dédiés (`tooltip` = texte déjà résolu). |
| `exportable?`                              | `boolean`                                                               | Exclut la colonne de l'export CSV si `false` (utile pour une colonne d'actions/boutons). `true` par défaut.                                    |
| `exportValueAccessor?`                     | `(row: T) => string \| number \| boolean \| null \| undefined`         | Valeur exportée si différente de `valueAccessor` (ex. valeur brute plutôt que le rendu riche d'un `cellTemplate`).                              |
| `searchable?`                              | `boolean \| (row: T) => string`                                        | Recherche globale : `false` exclut la colonne ; une fonction fournit le texte cherché. Défaut : la valeur de `valueAccessor`.                   |
| `aggregate?`                               | `'sum' \| 'avg' \| 'min' \| 'max' \| 'count' \| (rows: T[]) => unknown` | Agrégat affiché dans les en-têtes de groupe et la ligne de totaux.                                                                             |
| `groupable?`                               | `boolean`                                                              | Proposée dans le menu « Grouper ». Défaut : oui si la colonne est triable ou filtrable.                                                         |
| `pinned?`                                  | `'left' \| 'right'`                                                    | Épingle la colonne au bord gauche/droit pendant le défilement horizontal. Les colonnes épinglées sont regroupées à leur bord, dans leur ordre courant. |

### `NgTableFilterConfig`

```ts
interface NgTableFilterConfig {
  type?: ColumnFilterType;   // 'text' | 'number' | 'numberRange' | 'date' (jour unique) | 'range' (période) | 'boolean' | 'enum' | 'search' | 'email' | ...
  operator?: NgTableTextOperator;  // filtres texte : 'contains' (défaut) | 'equals' | 'startsWith' | 'endsWith'
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
| `rows`                      | `T[]`                                                            | `[]`      | Données source. `T` est inféré depuis `[rows]` / `[columns]` (voir « Typage »).                                    |
| `columns`                   | `NgTableColumn<T>[]`                                             | `[]`      | Définition des colonnes.                                                                                             |
| `columnVisibility`          | `Record<string, boolean> \| null`                                | `null`    | Mode contrôlé de la visibilité.                                                                                      |
| `columnOrder`               | `ReadonlyArray<string> \| null`                                  | `null`    | Mode contrôlé de l'ordre des colonnes.                                                                               |
| `filters`                   | `Record<string, string> \| null`                                 | `null`    | Mode contrôlé des filtres.                                                                                           |
| `labels`                    | `Partial<NgTableLabels>`                                         | `{}`      | Textes à surcharger (voir "Personnaliser les textes").                                                              |
| `ariaLabel`                 | `string \| null`                                                 | `null`    | `aria-label` du `<table>` (ex. "Liste des commandes"). `null` = `labels.tableLabel` (générique, toujours présent).   |
| `emptyLabel`                | `string \| null`                                                 | `null`    | Message si liste vide ; `null` = utilise `labels.noData`.                                                            |
| `loading`                   | `boolean`                                                        | `false`   | Affiche un overlay de chargement centré sur la table (bloque l'interaction tant qu'il est visible). Piloté par le parent. |
| `loadingTemplate`           | `TemplateRef<unknown> \| null`                                   | `null`    | Contenu custom de l'overlay de chargement ; `null` = spinner intégré.                                                 |
| `minTableWidthPx`           | `number`                                                         | `760`     | Largeur mini avant scroll horizontal (desktop). Le tableau ne descend jamais sous la somme des largeurs mini de ses colonnes visibles (`widthPx`, sinon `minWidthPx`, sinon 120 px) : au-delà, il défile au lieu d'écraser les en-têtes. |
| `rowClassFn`                | `(row) => string \| string[] \| Record<string, boolean> \| null` | `null`    | Classes CSS dynamiques par ligne. Calculées une fois par ligne rendue ; les signaux lus dans la fonction sont suivis. |
| `rowTrackBy`                | `TrackByFunction<any> \| null`                                   | `null`    | `trackBy` de rendu (perf) uniquement — n'affecte jamais la clé de sélection/expansion, qui vient de `rowKeyAccessor`/`row.id`. |
| `rowKeyAccessor`            | `(row) => unknown`                                               | `null`    | Clé métier stable (sélection, expansion, feedback copie, trackBy de rendu). Recommandé si `row.id` n'est pas fiable. |
| `detailRowTemplate`         | `TemplateRef<{$implicit, row}>`                                  | `null`    | Template de la ligne détail. `null` = pas de ligne détail.                                                           |
| `detailRowWhen`             | `(index, row) => boolean`                                        | `null`    | Mode contrôlé par index+row de l'expansion.                                                                          |
| `expandedRowKeys`           | `ReadonlyArray<unknown> \| null`                                 | `null`    | Mode contrôlé par clé de l'expansion.                                                                                |
| `detailRowToggleOnRowClick` | `boolean`                                                        | `true`    | Mode non contrôlé : clic sur la ligne = toggle détail.                                                               |
| `detailRowAccordion`        | `boolean`                                                        | `false`   | Mode non contrôlé : une seule ligne dépliée à la fois.                                                               |
| `detailRowCanExpand`        | `(row) => boolean`                                               | `null`    | Garde optionnelle.                                                                                                   |
| `showResetFilters`          | `boolean`                                                        | `true`    | Affiche le bouton "réinitialiser les filtres".                                                                       |
| `referenceColumnSelectable` | `boolean`                                                        | `false`   | Punaise « colonne de référence » dans le menu « Colonnes » (voir Étape 10bis).                                       |
| `referenceColumn`           | `string \| null \| undefined` (`model`)                           | `undefined` | Colonne fixée à gauche ; liable en `[(referenceColumn)]`, émet `(referenceColumnChange)`.                        |
| `columnsMenuEnabled`        | `boolean`                                                        | `true`    | Affiche le bouton "Colonnes" (sélecteur de visibilité). Ne désactive que le bouton — le mécanisme de visibilité (`visible: false`, `[columnVisibility]`) reste actif. |
| `filterDebounceMs`          | `number`                                                         | `350`     | Délai avant prise en compte d'une saisie au clavier (texte, nombre, recherche...) (`0` = immédiat). Les filtres à choix fixe (enum/booléen/date/période) ne sont jamais debouncés. |
| `cellNavigation`            | `boolean`                                                        | `false`   | Navigation clavier cellule par cellule (motif « grid » WAI-ARIA), voir « Accessibilité ».                            |
| `virtualScroll`             | `boolean`                                                        | `false`   | Défilement virtuel : seules les lignes visibles sont rendues (voir Étape 10quater).                                   |
| `groupingEnabled`           | `boolean`                                                        | `false`   | Bouton « Grouper » (local et remote), voir Étape 10ter.                                                              |
| `groupBy`                   | `string \| null` (`model`)                                       | `null`    | Colonne de regroupement ; liable en `[(groupBy)]`, émet `(groupByChange)`.                                          |
| `groupSummaries`            | `readonly NgTableGroupSummary[] \| null`                         | `null`    | Mode `remote` + regroupement : tous les groupes, dans l'ordre, avec compte et agrégats calculés par le serveur. Rend les groupes repliables. |
| `showTotals`                | `boolean`                                                        | `false`   | Ligne de totaux (colonnes avec `aggregate`, mode local).                                                             |
| `multiSort`                 | `boolean`                                                        | `false`   | Maj+clic sur un en-tête ajoute un niveau de tri.                                                                     |
| `globalSearchEnabled`       | `boolean`                                                        | `false`   | Champ de recherche globale dans la barre d'actions (voir Étape 6bis).                                               |
| `globalSearch`              | `string \| null`                                                 | `null`    | Mode contrôlé de la recherche globale.                                                                               |
| `rowSelectionEnabled`       | `boolean`                                                        | `false`   | Ajoute une colonne checkbox de sélection.                                                                            |
| `selectedRowKeys`           | `ReadonlyArray<unknown> \| null`                                 | `null`    | Mode contrôlé de la sélection.                                                                                       |
| `inlineFilters`             | `boolean`                                                        | `false`   | Filtres affichés directement dans l'en-tête (pas de menu).                                                           |
| `inlineFilterColumnIds`     | `ReadonlyArray<string> \| null`                                  | `null`    | Restreint les filtres inline à certaines colonnes.                                                                   |
| `showActiveFiltersBar`      | `boolean`                                                        | `false`   | Barre récapitulative des filtres actifs (suppression individuelle).                                                  |
| `rowContextMenuEnabled`     | `boolean`                                                        | `false`   | Active le clic droit sur les lignes.                                                                                 |
| `rowContextMenuTemplate`    | `TemplateRef<{$implicit: row, row}>`                             | `null`    | Contenu du menu contextuel.                                                                                          |
| `dataMode`                  | `'local' \| 'remote'`                                            | `'local'` | Voir "Mode local / distant".                                                                                         |
| `pageTrackingEnabled`       | `boolean`                                                        | `false`   | Voir "Pagination".                                                                                                   |
| `pageIndex`                 | `number` (`model`)                                               | `0`       | Page courante (0-based), liable en `[(pageIndex)]`. Utilisée si la pagination est active.                            |
| `pageSize`                  | `number` (`model`)                                               | `10`      | Taille de page, liable en `[(pageSize)]`.                                                                            |
| `paginator`                 | `boolean`                                                        | `false`   | Paginateur intégré, déjà branché (active la pagination).                                                             |
| `pageSizeOptions`           | `readonly number[]`                                              | `[10, 25, 50, 100]` | Tailles proposées par le paginateur intégré.                                                               |
| `totalCount`                | `number \| null`                                                 | `null`    | Mode `remote` + paginateur intégré : total de lignes côté serveur.                                                   |
| `viewsEnabled`              | `boolean`                                                        | `false`   | Affiche/masque le bloc "Vues" (bouton + menu).                                                                       |
| `viewsStorageKey`           | `string \| null`                                                 | `null`    | Mode non contrôlé : clé de persistance `localStorage` des vues.                                                      |
| `viewsStore`                | `NgTableViewsStore \| null`                                      | `null`    | Mode contrôlé : le parent possède le store des vues.                                                                 |
| `viewsImportExportEnabled`  | `boolean`                                                        | `false`   | Boutons « Exporter » / « Importer » dans le menu des vues (fichier JSON).                                            |
| `exportEnabled`              | `boolean`                                                        | `false`   | Affiche le bouton d'export.                                                                                           |
| `exportMode`                 | `'local' \| 'remote'`                                            | `'local'` | Voir "Export".                                                                                                        |
| `exportFilename`             | `string`                                                         | `'export'`| Nom de fichier (sans extension) du fichier généré en mode `local`.                                                    |
| `exportFormat`               | `'csv' \| 'xlsx'`                                                | `'csv'`   | Format du fichier généré en mode `local`.                                                                             |
| `density`                    | `'default' \| 'compact'`                                         | `'default'` | Hauteur des lignes et de l'en-tête.                                                                                 |
| `maxHeight`                  | `string \| null`                                                 | `null`    | Hauteur maximale de la zone de la table (ex. `'480px'`, `'60vh'`) ; au-delà, défilement vertical.                    |
| `stickyHeader`               | `boolean`                                                        | `false`   | Garde l'en-tête visible pendant le défilement (à combiner avec `maxHeight`).                                         |

### Méthodes publiques

Accessibles via `viewChild.required<NgTableComponent<Commande>>(NgTableComponent)`. Les autres membres sont `protected` : ils servent au template et peuvent changer sans préavis.

| Méthode / signal | Rôle |
|------------------|------|
| `displayedRows()` | Lignes affichées (filtrées, triées, paginées en mode local). |
| `visibleColumns()` | Colonnes visibles, dans l'ordre d'affichage. |
| `selectedRowsCount()`, `isRowSelected(row)` | État de la sélection. |
| `clearFilter(columnId)`, `clearAllFilters()`, `clearGlobalSearch()` | Effacer un filtre, tous les filtres et la recherche, ou la recherche seule. |
| `activeFilterSummaries()` | Filtres actifs (`{columnId, label, value}`), comme dans la barre des filtres. |
| `toggleDetail(row)`, `collapseAllDetails()`, `isRowExpanded(row)`, `expandedDetailCount()` | Lignes détail (mode non contrôlé). |
| `viewsList()`, `activeView()`, `activeViewId()` | Vues sauvegardées. |
| `saveCurrentAsView(name)`, `updateView(view)`, `activateView(view)`, `deleteView(view)` | Gérer les vues. |
| `toggleDefaultView(view)`, `isDefaultView(view)` | Vue par défaut. |
| `exportViews()`, `importViews(json, mode?)`, `downloadViews()` | Partager des vues. |
| `openExportDialog()` | Lancer l'export, comme le bouton « Exporter ». |
| `expandAllGroups()`, `collapseAllGroups()` | Déplier / replier tous les groupes. |
| `getQueryState()`, `applyQueryState(partiel)` | Lire / appliquer tri, filtres, recherche, page et regroupement (`NgTableQueryState`) en une fois. |

### Outputs

| Output                   | Payload                                                                       | Description                                                                                                                                                                |
|--------------------------|-------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `rowClick`               | `T`                                                                           | Clic sur une ligne de données.                                                                                                                                             |
| `sortsChange`            | `NgTableSortChange[]`                                                         | Tous les niveaux de tri, par priorité, à chaque clic de tri.                                                                                                               |
| `queryStateChange`       | `NgTableQueryState` (`{sorts, filters, search, pageIndex, pageSize, groupBy, collapsedGroups}`) | Tri, filtres, recherche ou page ont changé, quelle qu'en soit l'origine. Émis aussi une fois au démarrage.                                                                 |
| `filtersChange`          | `Record<string, string>`                                                      | Tout changement de filtre.                                                                                                                                                 |
| `globalSearchChange`     | `string`                                                                      | Recherche globale appliquée (après debounce ; `''` quand elle est effacée).                                                                                                |
| `sortChange`             | `NgTableSortChange` (`{columnId, direction}`)                                 | Changement de tri.                                                                                                                                                         |
| `cellCopied`             | `NgTableCopyEvent` (`{columnId, value, row}`)                                 | Après un clic sur le bouton copier.                                                                                                                                        |
| `detailToggle`           | `NgTableDetailToggleEvent<T>` (`{row, expanded, expandedKeys}`)               | Ouverture/fermeture d'une ligne détail (`row` vaut `null` après `collapseAllDetails()`).                                                                                                                                 |
| `columnVisibilityChange` | `Record<string, boolean>`                                                     | Changement via le menu "Colonnes".                                                                                                                                         |
| `columnOrderChange`      | `string[]`                                                                    | Nouvel ordre des ids après un drag-and-drop d'en-tête.                                                                                                                     |
| `selectionChange`        | `NgTableSelectionChangeEvent` (`{row, selected, selectedKeys, selectedRows}`) | Sélection/désélection ou tout-sélectionner.                                                                                                                                |
| `rowContextMenu`         | `NgTableContextMenuEvent` (`{row, position}`)                                 | Ouverture du menu contextuel.                                                                                                                                              |
| `viewsStoreChange`       | `NgTableViewsStore`                                                           | Le store des vues a changé. En mode non contrôlé, miroir de ce qui vient d'être écrit en `localStorage` ; en mode contrôlé, **seul endroit** où le changement est notifié. |
| `viewsImported`          | `NgTableViewsImportEvent` (`{imported, mode}`)                                | Après chaque import de vues (`imported: 0` = fichier invalide, rien n'a changé).                                                                                             |
| `viewActivated`          | `NgTableView \| null`                                                         | Une vue devient active (changement manuel ou auto au chargement).                                                                                                          |
| `viewPaginationRestore`  | `{pageIndex, pageSize}`                                                       | Émis quand la vue activée contient une pagination.                                                                                                                         |
| `remoteQueryChange`      | `NgTableRemoteQuery` (`{sort, sorts, filters, page, search, groupBy, collapsedGroups}`)       | **Mode `remote`.** Émis à chaque changement de tri/filtre, état complet, prêt pour une requête serveur unique.                                                             |
| `filteredCountChange`    | `number`                                                                      | **Mode `local` + `pageTrackingEnabled=true`.** Total après filtrage, pour `[length]` de votre paginator.                                                                   |
| `pageIndexChange`        | `number`                                                                      | **Mode `local` + `pageTrackingEnabled=true`.** Émis avec `0` quand un filtre/tri doit remettre la page à zéro.                                                             |
| `remoteExportRequested`  | `NgTableRemoteQuery` (`{sort, sorts, filters, page, search, groupBy, collapsedGroups}`)       | **`exportMode='remote'`.** L'utilisateur a cliqué sur "Exporter" — à vous de lancer la requête serveur (avec vos propres paramètres additionnels) et de gérer le fichier obtenu. |
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
  loading: string;              // aria-label de l'overlay de chargement (et texte accessible affiché dedans)
  tableLabel: string;           // aria-label par défaut du <table> si [ariaLabel] n'est pas fourni
  selectAllRows: string;        // aria-label de la case "tout sélectionner"
  selectRow: string;            // aria-label d'une case de ligne — {index} = numéro de ligne (1-based)
  dragHandleLabel: string;      // aria-label de la poignée de réorganisation (glisser OU flèches gauche/droite)
  resizeHandleLabel: string;    // aria-label de la poignée de redimensionnement (glisser OU flèches gauche/droite)
  numberMin: string;            // placeholder de la borne basse d'un filtre numberRange
  numberMax: string;            // placeholder de la borne haute d'un filtre numberRange
  globalSearchPlaceholder: string; // placeholder du champ de recherche globale
  globalSearchLabel: string;    // nom accessible du champ, et libellé de sa pastille dans la barre des filtres actifs
  clearGlobalSearch: string;    // bouton d'effacement de la recherche
  setDefaultView: string;       // étoile d'une vue : « ouvrir la liste sur cette vue »
  unsetDefaultView: string;     // étoile de la vue par défaut : la retirer
  exportViews: string;          // bouton « Exporter » du menu des vues
  importViews: string;          // bouton « Importer » du menu des vues
  viewsImported: string;        // message après import ; {count} = nombre de vues
  viewsImportInvalid: string;   // message après import d'un fichier invalide
  announceSortAsc: string;      // annonce lecteur d'écran : '{column}, tri croissant'
  announceSortDesc: string;     // annonce lecteur d'écran : '{column}, tri décroissant'
  announceSortCleared: string;  // annonce lecteur d'écran : tri retiré
  announceRowCount: string;     // annonce lecteur d'écran : '{count} ligne(s) affichée(s)' (mode local)
  announceNoRows: string;       // annonce lecteur d'écran : aucune ligne ne correspond (mode local)
  sortPriority: string;         // 'priorité {priority}', ajouté au libellé du bouton de tri (tri multi-colonnes)
  multiSortHint: string;        // infobulle des en-têtes triables avec [multiSort]
  setReferenceColumn: string;   // punaise du menu Colonnes : fixer « {column} » à gauche
  unsetReferenceColumn: string; // punaise de la colonne de référence : la libérer
  groupButton: string;          // bouton « Grouper »
  groupNone: string;            // menu Grouper : aucun regroupement
  groupCount: string;           // '{count} ligne(s)' dans l'en-tête de groupe
  groupEmpty: string;           // libellé d'un groupe sans valeur
  expandAllGroups: string;      // menu Grouper : tout déplier
  collapseAllGroups: string;    // menu Grouper : tout replier
  aggregateSum: string;         // préfixes des agrégats : 'Σ', 'Moy.', 'Min', 'Max', 'Nb'
  aggregateAvg: string;
  aggregateMin: string;
  aggregateMax: string;
  aggregateCount: string;
  totalsLabel: string;          // libellé de la ligne de totaux
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

### Tooltip de troncature

La tooltip affichée au survol d'une cellule tronquée (`textOverflow: 'truncate'`) **ou d'un libellé d'en-tête tronqué** suit déjà la charte par défaut (elle reprend `--app-text` / `--app-surface`) — les deux partagent exactement le même mécanisme et les mêmes variables, une seule surcharge les couvre toutes les deux. Chaque aspect reste surchargeable indépendamment :

| Variable                  | Rôle                         | Défaut                                 |
|---------------------------|------------------------------|----------------------------------------|
| `--ngt-tooltip-bg`        | Fond de la bulle             | `var(--app-text, #0d1d26)`             |
| `--ngt-tooltip-color`     | Couleur du texte             | `var(--app-surface, #ffffff)`          |
| `--ngt-tooltip-radius`    | Rayon des coins              | `10px`                                 |
| `--ngt-tooltip-padding`   | Marge intérieure             | `8px 12px`                             |
| `--ngt-tooltip-max-width` | Largeur maxi de la bulle     | `420px`                                |
| `--ngt-tooltip-border`    | Bordure                      | `1px solid rgba(255, 255, 255, 0.08)`  |
| `--ngt-tooltip-shadow`    | Ombre portée                 | `0 10px 30px rgba(15, 23, 42, 0.28)`   |
| `--ngt-tooltip-font-family` | Police                     | `inherit`                              |
| `--ngt-tooltip-font-size` | Taille de police             | `0.78rem`                              |
| `--ngt-tooltip-font-weight` | Graisse                    | `400`                                  |
| `--ngt-tooltip-line-height` | Interligne                 | `1.45`                                 |

```css
:root {
  --ngt-tooltip-bg: #4c1d95;
  --ngt-tooltip-color: #f5f3ff;
  --ngt-tooltip-radius: 16px;
  --ngt-tooltip-max-width: 520px;
}
```

⚠️ **À déclarer globalement** (`:root`, `html`, `body`...), **pas** sur l'élément `<ng-table>` : la tooltip est rendue par le CDK dans son conteneur d'overlay, à la racine du `<body>`, donc hors de l'arbre DOM de la table — des variables posées sur `<ng-table>` ne l'atteindraient jamais.

Pour un contrôle total au-delà de ces variables, la bulle porte la classe `.ngt-truncate-tooltip` (la surface visible étant `.ngt-truncate-tooltip .mat-mdc-tooltip-surface`).

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

Deux façons de paginer :

- **`[paginator]="true"`** : un `<mat-paginator>` intégré, déjà branché. En mode `remote`, fournissez `[totalCount]` (le total côté serveur). Chaque changement de page émet alors `remoteQueryChange` avec la nouvelle page.
- **`pageTrackingEnabled`** avec votre propre paginateur, comme ci-dessous.

`pageIndex` et `pageSize` sont des `model()` : ils acceptent `[(pageIndex)]`, et le composant les met à jour lui-même (retour en page 0 après un filtre, restauration d'une vue). Chaque changement émet `(pageIndexChange)` / `(pageSizeChange)`.

`pageTrackingEnabled` déclare que `[pageIndex]`/`[pageSize]` sont réellement pris en compte :

- **Mode `local`** : c'est là qu'il agit vraiment. `displayedRows()` est tronqué à la page courante, et `(filteredCountChange)` donne le total post-filtre pour votre paginator.
- **Mode `remote`** : effet mineur — change seulement la valeur embarquée dans `remoteQueryChange.page.size` (`pageSize()` si `true`, `0` sinon). La navigation de page reste toujours gérée par votre propre paginator, indépendamment de ce flag.

## Vues sauvegardées ("Views")

Système permettant à l'utilisateur de sauvegarder l'état complet d'affichage (colonnes visibles, ordre, **largeurs redimensionnées**, tri, filtres, et pagination si `pageTrackingEnabled=true`) sous un nom, d'y revenir, d'en créer plusieurs, de les supprimer.

```ts
interface NgTableViewState {
  columnVisibility: Record<string, boolean>;
  columnOrder: string[];
  columnWidths?: Record<string, number>;  // largeurs (px) issues du resize, par id de colonne
  sort: NgTableSortChange;
  sorts?: NgTableSortChange[];            // tous les niveaux, avec [multiSort]
  filters: Record<string, string>;
  search?: string;                        // recherche globale
  pageIndex?: number;                     // seulement si pageTrackingEnabled=true
  pageSize?: number;
}

interface NgTableViewsStore {
  views: NgTableView[];
  activeViewId: string | null;
  defaultViewId?: string | null;          // vue appliquée à l'ouverture
}
```

Les largeurs sont capturées à l'enregistrement (bouton "enregistrer" ou "mettre à jour" d'une vue) et réappliquées à l'activation, qu'elles viennent d'un drag sur la poignée de redimensionnement ou d'un auto-fit au double-clic. `columnWidths` est optionnel : une vue enregistrée avant l'ajout de cette option s'active sans erreur et conserve simplement les largeurs courantes.

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
- Au chargement, la **vue par défaut** est appliquée si l'utilisateur en a choisi une (étoile à côté de la vue). Sinon, c'est la dernière vue active. Un nouveau clic sur l'étoile retire la vue par défaut. Supprimer la vue active fait basculer sur la vue par défaut, ou à défaut sur la première vue restante. Appelable aussi en code : `toggleDefaultView(view)`, `isDefaultView(view)`.
- Chaque vue de la liste a un bouton "mettre à jour" (icône `sync`, qui passe brièvement en coche verte après le clic) qui écrase son état sauvegardé avec l'affichage courant (colonnes, ordre, largeurs, tri, filtres, pagination), sans avoir à retaper son nom dans le champ de création — contrairement à `saveCurrentAsView`, qui ne met à jour que par correspondance de nom. Appelable aussi directement : `updateView(view: NgTableView): void`.

### Partager des vues (export / import)

`[viewsImportExportEnabled]="true"` ajoute deux boutons en bas du menu des vues :

- **Exporter** télécharge toutes les vues dans un fichier `<viewsStorageKey>-vues.json`. C'est le même format versionné que le `localStorage`.
- **Importer** lit un tel fichier et **fusionne** son contenu : les nouvelles vues sont ajoutées, et une vue du même nom est remplacée. La vue affichée ne change pas. Les vues malformées sont ignorées. Un fichier invalide ne modifie rien et affiche un message.

Cela permet de transmettre ses vues à un collègue, ou de les retrouver sur un autre poste. Les mêmes opérations sont disponibles en code :

```ts
const json = this.table().exportViews();          // string JSON
this.table().importViews(json);                    // fusion (défaut) ; renvoie le nombre de vues importées
this.table().importViews(json, 'replace');         // remplace toutes les vues et applique la vue active du fichier
```

`(viewsImported)` émet `{imported, mode}` après chaque import. `imported` vaut 0 si le fichier était invalide.

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

## Accessibilité

`ng-table` vise WCAG 2.1 AA et les patterns WAI-ARIA APG (table triable, window splitter, menu contextuel). Rien à activer : le tableau de base est utilisable au clavier et par lecteur d'écran dès l'installation.

### Nom accessible de la table

```html
<ng-table [ariaLabel]="'Liste des commandes'" ... />
```

Sans `[ariaLabel]`, `labels.tableLabel` ("Tableau de données" par défaut) s'applique — un `<table>` doit toujours avoir un nom accessible (WCAG 1.3.1 / 4.1.2), donc plutôt un défaut générique que rien du tout.

### Tri (`aria-sort`)

Chaque `<th>` triable expose `aria-sort="ascending" | "descending" | "none"`, conforme au pattern APG "Table". Une colonne non triable ne porte pas l'attribut du tout — un `aria-sort="none"` dessus laisserait croire à tort qu'elle est triable.

### Sélection de lignes

Les cases à cocher (`rowSelectionEnabled`) ont un `aria-label` explicite — `labels.selectAllRows` pour "tout sélectionner", `labels.selectRow` (`{index}` interpolé, 1-based) pour chaque ligne — au lieu d'être des cases muettes.

### Réordonnancement et redimensionnement des colonnes au clavier

Les deux étaient **uniquement à la souris** avant cette passe (drag-and-drop HTML5 natif et `mousedown`/`mousemove`, sans équivalent clavier — une violation WCAG 2.1.1). Les deux poignées sont maintenant des contrôles focusables (`tabindex="0"`) :

- **Poignée de réorganisation** (`role="button"`, `labels.dragHandleLabel`) : flèches gauche/droite au clavier, glisser-déposer à la souris — les deux appellent le même code de réordonnancement, donc un résultat identique quel que soit le mode.
- **Poignée de redimensionnement** (`role="separator"` + `aria-orientation="vertical"` + `aria-valuenow`/`aria-valuemin`/`aria-valuemax`, `labels.resizeHandleLabel` — le pattern APG "Window Splitter") : flèches gauche/droite pour ±16px, glisser à la souris, double-clic pour l'auto-fit (souris uniquement, l'auto-fit clavier n'a pas d'équivalent direct).

### Lignes interactives

Une ligne ne devient un arrêt de tabulation (`tabindex="0"`) **que si elle fait quelque chose** — détail expansible (`detailRowTemplate`) ou menu contextuel (`rowContextMenuEnabled`) — pour ne pas cribler un grand tableau d'arrêts de tabulation inutiles sur des lignes purement informatives :

- **Entrée / Espace** : équivalent clavier du clic (bascule le détail).
- **Touche Menu, ou Maj+F10** : équivalent clavier standard du clic droit — ouvre le menu contextuel (`rowContextMenuEnabled`), ancré au coin de la ligne (pas de coordonnées souris disponibles au clavier).

### Navigation cellule par cellule (`[cellNavigation]`)

Par défaut, chaque bouton des cellules (copier, actions...) est un arrêt de tabulation. Sur une longue liste, atteindre la suite de la page au clavier devient pénible. Avec `[cellNavigation]="true"`, la table suit le motif « grid » de WAI-ARIA APG :

| Touche | Effet |
|--------|-------|
| Tab | Entre dans la table sur la dernière cellule active (un seul arrêt de tabulation pour tout le corps de la table), puis en ressort. |
| Flèches | Cellule voisine. |
| Début / Fin | Première / dernière cellule de la ligne ; avec Ctrl : première cellule de la table / dernière cellule. |
| Page préc. / Page suiv. | 10 lignes plus haut / plus bas. |
| Entrée ou F2 | Donne le focus au premier bouton ou champ de la cellule ; Échap revient à la cellule. |
| Entrée (cellule sans bouton) | Active la ligne : `(rowClick)`, ouverture de la ligne détail. |
| Espace | Sélectionne / désélectionne la ligne (`[rowSelectionEnabled]`). |
| Maj+F10 ou touche Menu | Menu contextuel de la ligne. |

La table porte alors `role="grid"`. Les contrôles de l'en-tête (tri, filtres, réordonnancement) restent atteignables par Tab, comme avant.

### Annonces des changements (`aria-live`)

Trier ou filtrer modifie la liste sans déplacer le focus. Sans annonce, un utilisateur de lecteur d'écran ne sait pas que le contenu a changé (WCAG 4.1.3). La table contient donc une région `role="status"`, invisible à l'écran, qui annonce :

- le tri : « Nom, tri croissant », « Nom, tri décroissant », « Tri retiré » ;
- en mode `local`, le nombre de lignes après chaque tri, filtre ou recherche : « 12 ligne(s) affichée(s) », ou « Aucune ligne ne correspond ».

En mode `remote`, seul le tri est annoncé. Le nombre de lignes n'est connu qu'à la réponse du serveur. Tous ces textes sont personnalisables (`announceSortAsc`, `announceSortDesc`, `announceSortCleared`, `announceRowCount`, `announceNoRows`).

### Chargement

L'overlay (`[loading]`) porte `role="status"` + `aria-live="polite"`, et le conteneur de la table `aria-busy="true"` pendant le chargement. Le spinner par défaut est accompagné d'un texte réservé aux lecteurs d'écran (`labels.loading`, visuellement masqué via la classe utilitaire `.ngt-visually-hidden`) — un `role="status"` sans aucun texte associé n'est pas annoncé de façon fiable par tous les lecteurs d'écran. Un `[loadingTemplate]` custom est responsable de son propre contenu accessible.

### Icônes et boutons

Toutes les `<mat-icon>` purement décoratives (à côté d'un texte visible, ou dont le bouton porte déjà un `aria-label`) sont `aria-hidden="true"`, pour éviter qu'un lecteur d'écran ne lise deux fois la même information (le nom de l'icône ligature, puis le texte). Chaque bouton icône-seul (copier, sauvegarder/mettre à jour/supprimer une vue...) a désormais un `aria-label` explicite — certains ne s'appuyaient auparavant que sur `title` (fonctionne, mais faible : pas de survol tactile, lu de façon inconsistante par certains lecteurs d'écran) ou, pour le bouton copier, uniquement sur `matTooltip` (qui documente via `aria-describedby`, pas `aria-label` — un bouton icône-seul sans l'un des deux n'a **aucun** nom accessible, violation WCAG 4.1.2).

### HTML valide

Le menu "Colonnes" imbriquait un `<mat-checkbox>` (lui-même interactif) dans un `<button mat-menu-item>` — contenu interactif dans un `<button>`, invalide en HTML et source de confusion pour la navigation clavier/lecteur d'écran. Remplacé par un `<div mat-menu-item>` (le sélecteur `[mat-menu-item]` n'exige pas un `<button>`).

### Ce qui reste à la charge du consommateur

- **Contraste des couleurs** : les variables `--app-*` (voir "Personnaliser le style") sont sous votre contrôle — vérifiez le contraste de votre charte (WCAG 1.4.3, ratio 4.5:1 pour le texte standard).
- **`cellTemplate` / `rowContextMenuTemplate` / `loadingTemplate`** : leur contenu est libre — à vous de leur donner des noms accessibles (boutons, liens, contrôles de formulaire) et de respecter la même rigueur clavier.
- **`ariaLabel`** : pensez à le renseigner avec un intitulé propre à votre écran (ex. "Liste des commandes") plutôt que de garder le défaut générique.

## État dans l'URL (`ngTableUrlState`)

Le tri, les filtres, la recherche et la page peuvent vivre dans l'URL. Un lien copié rouvre alors la liste dans le même état, et un rechargement de page ne perd rien. La directive est dans un point d'entrée séparé, `@sbourahla/ng-table/router` : seul ce point d'entrée dépend de `@angular/router`, qui reste une dépendance optionnelle.

```ts
import {NgTableUrlStateDirective} from '@sbourahla/ng-table/router';

@Component({imports: [NgTableComponent, NgTableUrlStateDirective], ...})
```

```html
<ng-table [ngTableUrlState]="'cmd'" ... />
```

L'URL obtenue est lisible : `?cmd.s=montant:desc,client:asc&cmd.q=dupont&cmd.p=2&cmd.f.statut=VALIDEE`.

- `s` porte le tri (plusieurs niveaux avec `[multiSort]`), `q` la recherche, `p` la page (**à partir de 1**, comme à l'écran), `ps` la taille de page si elle a changé, `g` la colonne de regroupement, et `f.<colonne>` chaque filtre. Les valeurs par défaut sont omises. Les groupes repliés ne vont pas dans l'URL (état d'affichage passager).
- Le **préfixe** (`'cmd'`) permet plusieurs tables sur une même page, et évite les conflits avec vos propres paramètres. Sans préfixe (`<ng-table ngTableUrlState>`), les noms sont `s`, `q`, `p`...
- Au chargement, l'URL l'emporte sur la vue par défaut. Une URL sans paramètre de table ne l'efface pas : c'est la vue restaurée qui est alors écrite dans l'URL.
- Les changements remplacent l'entrée d'historique courante (`replaceUrl`), pour ne pas créer une entrée par frappe. Une navigation vers la même page avec d'autres paramètres est appliquée à la table (lien interne, Précédent / Suivant entre deux pages).

Sans la directive, les mêmes briques restent disponibles pour synchroniser ailleurs (store, `sessionStorage`...). `getQueryState()` et `applyQueryState(partiel)` lisent et appliquent l'état. `(queryStateChange)` émet à chaque changement.

## Tester votre table (`NgTableHarness`)

Le paquet fournit un [harness de test Angular CDK](https://material.angular.dev/cdk/test-harnesses/overview) dans `@sbourahla/ng-table/testing`. Vos tests passent par ce que voit l'utilisateur (libellés d'en-tête, textes des cellules, attributs ARIA) plutôt que par le DOM interne du composant. Ils ne cassent donc pas quand ce DOM évolue.

```ts
import {TestbedHarnessEnvironment} from '@angular/cdk/testing/testbed';
import {NgTableHarness} from '@sbourahla/ng-table/testing';

const loader = TestbedHarnessEnvironment.loader(fixture);
const table = await loader.getHarness(NgTableHarness.with({ariaLabel: 'Liste des commandes'}));

await table.sortBy('Montant');                       // Maj+clic : sortBy('Client', {additive: true})
expect(await table.getColumnTexts('Client')).toEqual(['Martin', 'Dupont']);

await table.search('dupont');                        // appliquée tout de suite, sans attendre le debounce
expect(await table.getRowCount()).toBe(1);

const [row] = await table.getRows();
await row.toggleSelection();
await (await table.getPaginator())?.goToNextPage();  // MatPaginatorHarness du paginateur intégré
```

| Méthode | Rôle |
|---------|------|
| `getRowCount()`, `getRows()` | Lignes affichées ; chaque `NgTableRowHarness` offre `getCellTexts()`, `click()`, `toggleSelection()`, `isSelected()`. |
| `getHeaderTexts()`, `getCellTexts()`, `getColumnTexts(header)` | Contenu, colonne identifiée par son libellé. Le texte des boutons (copier...) est exclu. |
| `sortBy(header, {additive?})`, `getSortDirection(header)` | Tri. |
| `search(text)`, `getSearchValue()` | Recherche globale. |
| `getPaginator()` | `MatPaginatorHarness` du paginateur intégré, ou `null`. |
| `getEmptyText()`, `isLoading()`, `getLiveAnnouncement()`, `getAriaLabel()` | États affichés et accessibilité. |

## Points d'attention

- **Performance** : en mode `local`, `displayedRows()` (filtre + tri) est recalculé à chaque changement de `rows`/`columns`/filtres/tri — pour de très gros volumes, préférez `dataMode='remote'`. Réordonner les colonnes (glisser-déposer ou flèches clavier) n'en fait **volontairement pas partie** : ça ne change ni les lignes filtrées ni leur tri, donc `displayedRows()` n'est pas recalculé — seul l'ordre d'affichage des colonnes change. Le coût restant (déplacer les cellules dans le DOM pour refléter le nouvel ordre) vient d'Angular CDK Table et grandit avec le nombre de lignes **rendues** ; pour une très grosse liste sans pagination, activer `pageTrackingEnabled` (ou passer en `dataMode='remote'` paginé) réduit ce nombre et rend le réordonnancement visiblement plus rapide.
- **`rowKeyAccessor`** : recommandé dès que `rowSelectionEnabled`, `expandedRowKeys`, ou les vues sont utilisés sans `row.id` fiable et stable.
- **Le jeu de filtres est construit par le composant** : `columnFilters` est toujours dérivé de `columns()` (une entrée par colonne filtrable, jamais tronqué) — aucun consommateur n'a besoin d'énumérer lui-même ses colonnes filtrables ; un backend générique peut transmettre `remoteQueryChange.filters`/`filtersChange` tel quel.

## Développement

Le repo est un workspace Angular : la lib est dans `projects/ng-table`, une application de démo dans `projects/demo`.

| Commande | Rôle |
|----------|------|
| `npm start` | Lance la démo. Elle importe la lib depuis ses **sources** : une modification est visible immédiatement, sans rebuild. |
| `npm test` / `npm run test:ci` | Tests unitaires (Vitest), en continu / une seule passe. |
| `npm run lint` | Lint (angular-eslint). |
| `npm run build` | Construit le paquet publiable dans `dist/ng-table` (README et LICENSE inclus). |

La démo présente la lib en trois modes, un par page :

| Mode | URL | Contenu |
|------|-----|---------|
| Simple | `/simple` | Le minimum : colonnes, recherche, paginateur intégré. Le code de la page est affiché. |
| Avancé | `/avance` | Toutes les options d'affichage et d'interaction en mode local, activables depuis un panneau de réglages : types de filtres, épinglage, détail, menu contextuel, vues, export, pagination intégrée ou paginateur personnalisé, 50 000 lignes... |
| Expert | `/expert` | Faux serveur (mode `remote`), état contrôlé par le parent, filtre personnalisé, `applyQueryState()`, export serveur, journal des événements. |

Suivi des évolutions : `CHANGELOG.md` ; feuille de route : `ROADMAP.md`.

## Licence

MIT

````