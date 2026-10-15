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
}

export const NG_TABLE_TOKENS: readonly NgTableToken[] = [
  {name: 'primary', light: '#3a7ca5', dark: '#7fb4d6', legacy: ['app-primary'], description: 'Couleur d’accent : tri actif, focus, sélection, boutons.'},
  {name: 'primary-soft', light: 'rgba(58, 124, 165, 0.16)', dark: 'rgba(127, 180, 214, 0.24)', legacy: ['app-primary-soft'], description: 'Fond léger de l’accent (survol, plage, ligne sélectionnée).'},
  {name: 'primary-outline', light: 'rgba(58, 124, 165, 0.34)', dark: 'rgba(127, 180, 214, 0.45)', legacy: ['app-primary-outline'], description: 'Contour de l’accent.'},
  {name: 'text', light: '#0d1d26', dark: '#e6edf3', legacy: ['app-text'], description: 'Texte principal.'},
  {name: 'text-muted', light: '#4f6573', dark: '#9fb0bf', legacy: ['app-muted', 'app-text-muted'], description: 'Texte secondaire, icônes, en-têtes.'},
  {name: 'border', light: 'rgba(15, 23, 42, 0.13)', dark: 'rgba(255, 255, 255, 0.16)', legacy: ['app-border'], description: 'Séparateurs et contours.'},
  {name: 'border-strong', light: 'rgba(15, 23, 42, 0.24)', dark: 'rgba(255, 255, 255, 0.3)', legacy: ['app-border-strong'], description: 'Contours des champs et des cartes.'},
  {name: 'surface', light: '#ffffff', dark: '#141b22', legacy: ['app-surface', 'app-surface-solid', 'app-frost'], description: 'Fond du tableau et des panneaux.'},
  {name: 'surface-alt', light: '#f1f5f9', dark: '#1c252e', legacy: ['app-surface-alt'], description: 'Fond des lignes épinglées, des totaux et des puces.'},
  {name: 'surface-soft', light: '#f7fbfe', dark: '#18222b', legacy: ['app-surface-soft'], description: 'Fond très léger (en-têtes, zones de dépôt).'},
  {name: 'hover-surface', light: '#f6fbff', dark: '#202c37', legacy: ['app-hover-surface'], description: 'Fond d’une ligne ou d’un élément survolé.'},
  {name: 'field-bg', light: '#ffffff', dark: '#1a232c', legacy: ['app-field-bg'], description: 'Fond des champs de saisie.'},
  {name: 'field-hover-bg', light: '#f7fbff', dark: '#212d38', legacy: ['app-field-hover-bg'], description: 'Fond d’un champ survolé.'},
  {name: 'filter-panel-bg', light: '#ffffff', dark: '#1a232c', legacy: ['app-filter-panel-bg'], description: 'Fond des panneaux de filtre.'},
  {name: 'shadow-soft', light: '0 8px 20px rgba(15, 23, 42, 0.09)', dark: '0 8px 20px rgba(0, 0, 0, 0.45)', legacy: ['app-shadow-soft'], description: 'Ombre des cartes et des panneaux.'},
  {name: 'danger', light: '#b3261e', dark: '#f2b8b5', legacy: ['mat-sys-error'], description: 'Erreurs : validation d’une saisie, valeur négative.'},
];

const PREFIX = '--ngt-';

/** `{'--ngt-primary': '#3a7ca5', ...}` : à appliquer sur `:root` ou sur un conteneur pour imposer un thème. */
export const NG_TABLE_THEME_LIGHT: Readonly<Record<string, string>> = Object.fromEntries(NG_TABLE_TOKENS.map((token) => [PREFIX + token.name, token.light]));
export const NG_TABLE_THEME_DARK: Readonly<Record<string, string>> = Object.fromEntries(NG_TABLE_TOKENS.map((token) => [PREFIX + token.name, token.dark]));

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
  '--mat-sys-surface': 'var(--ngt-surface, #141b22)',
  '--mat-sys-background': 'var(--ngt-surface, #141b22)',
  '--mat-sys-surface-container': 'var(--ngt-surface-alt, #1c252e)',
  '--mat-sys-surface-container-low': 'var(--ngt-surface, #141b22)',
  '--mat-sys-surface-container-lowest': 'var(--ngt-surface, #141b22)',
  '--mat-sys-surface-container-high': 'var(--ngt-surface-alt, #1c252e)',
  '--mat-sys-surface-container-highest': 'var(--ngt-hover-surface, #202c37)',
  '--mat-sys-surface-variant': 'var(--ngt-surface-alt, #1c252e)',
  '--mat-sys-on-surface': 'var(--ngt-text, #e6edf3)',
  '--mat-sys-on-background': 'var(--ngt-text, #e6edf3)',
  '--mat-sys-on-surface-variant': 'var(--ngt-text-muted, #9fb0bf)',
  '--mat-sys-outline': 'var(--ngt-border-strong, rgba(255, 255, 255, 0.3))',
  '--mat-sys-outline-variant': 'var(--ngt-border, rgba(255, 255, 255, 0.16))',
  '--mat-sys-primary': 'var(--ngt-primary, #7fb4d6)',
  '--mat-sys-on-primary': '#0b1620',
  '--mat-sys-secondary-container': 'var(--ngt-primary-soft, rgba(127, 180, 214, 0.24))',
  '--mat-sys-on-secondary-container': 'var(--ngt-text, #e6edf3)',
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
