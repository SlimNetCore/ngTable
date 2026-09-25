# Changelog

Toutes les évolutions notables de `@sbourahla/ng-table`. Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions suivant [SemVer](https://semver.org/lang/fr/).

## [Non publié] — vers 1.0.0

Voir aussi `ROADMAP.md` pour le suivi détaillé.

### Outillage
- Repo restructuré en workspace Angular : la lib est dans `projects/ng-table`, une application de démo dans `projects/demo` (`npm start`).
- Tests exécutables avec Vitest (`npm test`, `npm run test:ci`), lint avec angular-eslint (`npm run lint`), CI GitHub Actions.

### Ajouté
- `NG_TABLE_LABELS_EN` : textes anglais prêts à l'emploi (`provideNgTableLabels(() => NG_TABLE_LABELS_EN)`).
- `ColumnFilterType` est exporté par l'API publique.
- `@angular/cdk` est déclaré en peerDependency (déjà requis de fait via Material) ; `@angular/router` en peerDependency optionnelle.
- `[stickyHeader]` et `[maxHeight]` : en-tête fixe dans une zone de défilement verticale.
- `column.pinned: 'left' | 'right'` : colonnes épinglées pendant le défilement horizontal.
- `[density]="'compact'"` : lignes et en-têtes plus serrés.
- Filtre `type: 'numberRange'` (deux champs min/max).
- Filtre `type: 'number'` : expressions `>150`, `<=20`, `!=0`, `=5`, `100..200` (virgule décimale acceptée).
- `filter.operator` pour les filtres texte : `'contains'` (défaut), `'equals'`, `'startsWith'`, `'endsWith'`.
- Recherche globale : `[globalSearchEnabled]`, mode contrôlé `[globalSearch]` / `(globalSearchChange)`, et `column.searchable` pour exclure une colonne ou fournir le texte cherché. Chaque mot doit apparaître dans la ligne ; casse et accents ignorés. La recherche est enregistrée dans les vues, et `NgTableRemoteQuery` gagne un champ `search`.
- Labels `globalSearchPlaceholder`, `globalSearchLabel`, `clearGlobalSearch`.
- `[exportFormat]="'xlsx'"` : export Excel natif, sans dépendance ; nombres et booléens restent typés, en-tête en gras et figé.

### Corrigé
- Un filtre `enum` avec plusieurs valeurs cochées ne matchait plus aucune ligne.
- Le libellé accessible des cases de sélection de ligne affichait « ligne NaN », et `detailRowWhen` recevait un index `undefined` (`index` n'existe pas avec `multiTemplateDataRows`).

### Modifié
- Les vues stockées en `localStorage` portent une version de schéma ; les vues malformées sont ignorées au lieu de casser l'affichage, et une vue active qui n'existe plus est oubliée. Les stores existants sont relus sans perte.
- « Réinitialiser les filtres » efface aussi la recherche globale.
- Tous les filtres saisis au clavier (`number`, `search`...) sont debouncés comme `text`.

### Performance
- État de sélection mémoïsé : plus d'`Array.includes` par ligne en mode contrôlé, ni de `Set` recréé à chaque vérification.

## [0.4.4]

### Ajouté
- `[columnsMenuEnabled]` pour masquer le bouton « Colonnes ».

## [0.4.3]

### Performance
- Réordonner les colonnes ne refiltre/retrie plus toutes les lignes.

## [0.4.2]

### Corrigé
- Activer une vue avec pagination sauvegardée ne remet plus la page à 0 ; en mode `remote`, `remoteQueryChange` porte la page restaurée.

## [0.4.1]

### Ajouté
- `NgTablePaginatorIntl` / `provideNgTablePaginatorIntl()` : traduction française de `<mat-paginator>`.

## [0.3.0]

### Ajouté
- Accessibilité : `aria-sort`, libellés des cases de sélection, réordonnancement et redimensionnement des colonnes au clavier, lignes activables au clavier, `[ariaLabel]`.

## [0.2.0]

### Modifié (cassant)
- `filter.type: 'date'` filtre désormais un **jour unique** ; l'ancienne plage de dates devient `filter.type: 'range'`.

### Ajouté
- Tooltip de troncature paramétrable (`--ngt-tooltip-*`), aussi sur les en-têtes.
