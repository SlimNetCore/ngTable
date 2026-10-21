/**
 * Thème de `ng-table` : des jetons de conception (variables CSS `--ngt-*`) que n'importe quelle application peut
 * redéfinir, et un thème sombre. Fonctions et tables sans dépendance Angular.
 *
 * Chaque style de la bibliothèque lit `var(--ngt-NOM, var(--app-ANCIEN, valeur claire))` : le jeton public d'abord,
 * puis l'ancien nom `--app-*` (compatibilité), puis la valeur par défaut. Rien n'est déclaré sur l'élément en thème
 * clair : un jeton posé sur n'importe quel ancêtre (`:root`, un conteneur, `ng-table` lui-même) s'applique donc.
 */

export interface NgTableToken {
  /** Nom du jeton, sans `--ngt-`. */
  name: string;
  /** Valeur du thème clair (celle de repli dans les styles). */
  light: string;
  /** Valeur du thème sombre. */
  dark: string;
  /** Ancien nom `--app-*` encore lu en repli. */
  legacy?: string[];
  /** À quoi sert le jeton. */
  description: string;
  /** size : une dimension, identique en clair et en sombre (absente du thème sombre généré). Défaut : une couleur. */
  kind?: 'color' | 'size';
}

export const NG_TABLE_TOKENS: readonly NgTableToken[] = [
  {name: 'primary', light: '#2f6fa8', dark: '#7fb4d6', legacy: ['app-primary'], description: 'Couleur d’accent : tri actif, focus, sélection, boutons.'},
  {name: 'primary-soft', light: 'rgba(47, 111, 168, 0.1)', dark: 'rgba(127, 180, 214, 0.18)', legacy: ['app-primary-soft'], description: 'Fond léger de l’accent (survol, plage, ligne sélectionnée).'},
  {name: 'primary-outline', light: 'rgba(47, 111, 168, 0.32)', dark: 'rgba(127, 180, 214, 0.42)', legacy: ['app-primary-outline'], description: 'Contour de l’accent.'},
  {name: 'text', light: '#14212b', dark: '#e7edf3', legacy: ['app-text'], description: 'Texte principal.'},
  {name: 'text-muted', light: '#5f7080', dark: '#93a4b4', legacy: ['app-muted', 'app-text-muted'], description: 'Texte secondaire, icônes, en-têtes.'},
  {name: 'border', light: 'rgba(20, 33, 43, 0.09)', dark: 'rgba(255, 255, 255, 0.1)', legacy: ['app-border'], description: 'Séparateurs et contours.'},
  {name: 'border-strong', light: 'rgba(20, 33, 43, 0.18)', dark: 'rgba(255, 255, 255, 0.2)', legacy: ['app-border-strong'], description: 'Contours des champs et des cartes.'},
  {name: 'surface', light: '#ffffff', dark: '#11171d', legacy: ['app-surface', 'app-surface-solid', 'app-frost'], description: 'Fond du tableau et des panneaux.'},
  {name: 'surface-alt', light: '#f4f6f9', dark: '#19212a', legacy: ['app-surface-alt'], description: 'Fond des lignes épinglées, des totaux et des puces.'},
  {name: 'surface-soft', light: '#f8fafc', dark: '#151c24', legacy: ['app-surface-soft'], description: 'Fond très léger (en-têtes, zones de dépôt).'},
  {name: 'hover-surface', light: '#f3f7fb', dark: '#1c2630', legacy: ['app-hover-surface'], description: 'Fond d’une ligne ou d’un élément survolé.'},
  {name: 'field-bg', light: '#ffffff', dark: '#161d25', legacy: ['app-field-bg'], description: 'Fond des champs de saisie.'},
  {name: 'field-hover-bg', light: '#f8fafc', dark: '#1d2630', legacy: ['app-field-hover-bg'], description: 'Fond d’un champ survolé.'},
  {name: 'filter-panel-bg', light: '#ffffff', dark: '#171f27', legacy: ['app-filter-panel-bg'], description: 'Fond des panneaux de filtre.'},
  {name: 'shadow-soft', light: '0 1px 2px rgba(16, 24, 40, 0.04), 0 12px 28px -12px rgba(16, 24, 40, 0.16)', dark: '0 1px 2px rgba(0, 0, 0, 0.4), 0 12px 28px -12px rgba(0, 0, 0, 0.6)', legacy: ['app-shadow-soft'], description: 'Ombre des cartes et des panneaux.'},
  {name: 'danger', light: '#b3261e', dark: '#f2b8b5', legacy: ['mat-sys-error'], description: 'Erreurs : validation d’une saisie, valeur négative.'},
  {name: 'success', light: '#2e7d32', dark: '#7fdba3', description: 'Succès : confirmation d’une action (vue mise à jour).'},
  {name: 'warning', light: '#c98a00', dark: '#f0c15a', description: 'Avertissement, favori : vue par défaut, ligne mise en avant.'},
  {name: 'on-primary', light: '#ffffff', dark: '#0b1620', description: 'Texte posé sur un fond d’accent ou d’erreur (pastilles, bouton plein).'},
  {name: 'chart-1', light: '#2f6fa8', dark: '#7fb4d6', description: 'Graphiques : série 1 (les suivantes tournent sur 8 couleurs).'},
  {name: 'chart-2', light: '#e07a3f', dark: '#f0955f', description: 'Graphiques : série 2.'},
  {name: 'chart-3', light: '#5fa36b', dark: '#86c493', description: 'Graphiques : série 3.'},
  {name: 'chart-4', light: '#b5527e', dark: '#d77fa6', description: 'Graphiques : série 4.'},
  {name: 'chart-5', light: '#8a6fd1', dark: '#b3a0ea', description: 'Graphiques : série 5.'},
  {name: 'chart-6', light: '#d1a83f', dark: '#e6c460', description: 'Graphiques : série 6.'},
  {name: 'chart-7', light: '#3fa7a0', dark: '#6cc9c2', description: 'Graphiques : série 7.'},
  {name: 'chart-8', light: '#8c8c8c', dark: '#a9b3bd', description: 'Graphiques : série 8.'},
  {name: 'radius-card', light: '16px', dark: '16px', kind: 'size', description: 'Rayon des cartes et des panneaux de filtre.'},
  {name: 'radius-control', light: '10px', dark: '10px', kind: 'size', description: 'Rayon des champs, des listes et des menus (les boutons restent des pastilles).'},
  {name: 'row-height', light: '48px', dark: '48px', kind: 'size', description: 'Hauteur d’une ligne (la densité compacte la remplace).'},
  {name: 'header-height', light: '46px', dark: '46px', kind: 'size', description: 'Hauteur de la ligne d’en-têtes.'},  {name: 'radius-button', light: '999px', dark: '999px', kind: 'size', description: 'Rayon des boutons (pastille par défaut ; 8px pour des boutons carrés arrondis).'},
  {name: 'row-height-compact', light: '36px', dark: '36px', kind: 'size', description: 'Hauteur d’une ligne en densité compacte.'},
  {name: 'header-height-compact', light: '44px', dark: '44px', kind: 'size', description: 'Hauteur de la ligne d’en-têtes en densité compacte.'},
  {name: 'font-family', light: 'inherit', dark: 'inherit', kind: 'size', description: 'Police du tableau et de ses panneaux (celle de la page par défaut).'},
  {name: 'font-size', light: '0.84rem', dark: '0.84rem', kind: 'size', description: 'Taille du texte des cellules.'},
  {name: 'header-font-size', light: '0.8125rem', dark: '0.8125rem', kind: 'size', description: 'Taille du texte des en-têtes.'},
  {name: 'header-font-weight', light: '600', dark: '600', kind: 'size', description: 'Graisse du texte des en-têtes.'},];

const PREFIX = '--ngt-';

/** `{'--ngt-primary': '#2f6fa8', ...}` : à appliquer sur `:root` ou sur un conteneur pour imposer un thème. */
export const NG_TABLE_THEME_LIGHT: Readonly<Record<string, string>> = Object.fromEntries(NG_TABLE_TOKENS.map((token) => [PREFIX + token.name, token.light]));
export const NG_TABLE_THEME_DARK: Readonly<Record<string, string>> = Object.fromEntries(NG_TABLE_TOKENS.map((token) => [PREFIX + token.name, token.dark]));

/**
 * Jetons redéfinis par l'apparence « material » (`provideNgTableLook('material')`, classe `ngt-look-material` sur `<html>`) :
 * texte noir en thème clair, blanc en thème sombre. Seuls le texte et les icônes changent ; les traits des boutons, des champs
 * et des cartes (`--ngt-border`, `--ngt-border-strong`) gardent leur nuance, et les lignes de la grille sont noircies par une
 * règle dédiée (ng-table.component.css).
 */
export const NG_TABLE_LOOK_OVERRIDES: {readonly light: Readonly<Record<string, string>>; readonly dark: Readonly<Record<string, string>>} = {
  light: {'--ngt-text': '#000000', '--ngt-text-muted': '#000000'},
  dark: {'--ngt-text': '#ffffff', '--ngt-text-muted': '#ffffff'},
};

/** Lecture d'un jeton dans un style : `var(--ngt-NOM, var(--app-ANCIEN, valeur claire))`. */
export function ngTableVar(name: string): string {
  const token = NG_TABLE_TOKENS.find((candidate) => candidate.name === name);
  if (!token) {
    throw new Error(`Jeton de thème inconnu : ${name}`);
  }
  const legacy = (token.legacy ?? []).reduceRight((fallback, old) => `var(--${old}, ${fallback})`, token.light);
  return `var(${PREFIX}${name}, ${legacy})`;
}

/**
 * En thème sombre, les composants Angular Material de la table (cellules, menus, pagination, cases à cocher, champs)
 * lisent leurs couleurs dans les variables système `--mat-sys-*` : on les fait suivre les jetons `--ngt-*`. Seulement
 * en thème sombre : en thème clair, ils gardent le thème Material de l'application.
 */
export const NG_TABLE_MATERIAL_BRIDGE: Readonly<Record<string, string>> = {
  '--mat-sys-surface': 'var(--ngt-surface, #11171d)',
  '--mat-sys-background': 'var(--ngt-surface, #11171d)',
  '--mat-sys-surface-container': 'var(--ngt-surface-alt, #19212a)',
  '--mat-sys-surface-container-low': 'var(--ngt-surface, #11171d)',
  '--mat-sys-surface-container-lowest': 'var(--ngt-surface, #11171d)',
  '--mat-sys-surface-container-high': 'var(--ngt-surface-alt, #19212a)',
  '--mat-sys-surface-container-highest': 'var(--ngt-hover-surface, #1c2630)',
  '--mat-sys-surface-variant': 'var(--ngt-surface-alt, #19212a)',
  '--mat-sys-on-surface': 'var(--ngt-text, #e7edf3)',
  '--mat-sys-on-background': 'var(--ngt-text, #e7edf3)',
  '--mat-sys-on-surface-variant': 'var(--ngt-text-muted, #93a4b4)',
  '--mat-sys-outline': 'var(--ngt-border-strong, rgba(255, 255, 255, 0.3))',
  '--mat-sys-outline-variant': 'var(--ngt-border, rgba(255, 255, 255, 0.16))',
  '--mat-sys-primary': 'var(--ngt-primary, #7fb4d6)',
  '--mat-sys-on-primary': '#0b1620',
  '--mat-sys-secondary-container': 'var(--ngt-primary-soft, rgba(127, 180, 214, 0.24))',
  '--mat-sys-on-secondary-container': 'var(--ngt-text, #e7edf3)',
  '--mat-sys-error': 'var(--ngt-danger, #f2b8b5)',
};

/*
 * Le thème sombre s'obtient de trois façons : `[theme]="'dark'"` sur le composant, `[theme]="'auto'"` (suit
 * `prefers-color-scheme`), ou la classe `ngt-dark` sur `<html>` / `<body>`, qui thème aussi les menus et filtres
 * ouverts en surcouche (ils ne sont pas dans l'élément du composant). Les règles sont dans `theme.css`, généré par
 * `scripts/generate-theme-css.mjs` depuis la table ci-dessus (le compilateur Angular n'évalue pas d'appel de fonction
 * dans `styles`).
 */

/** Valeur de `[theme]` : `null` ne force rien (les jetons de l'application s'appliquent). */
export type NgTableTheme = 'light' | 'dark' | 'auto';
