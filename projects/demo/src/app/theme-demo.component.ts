import {ChangeDetectionStrategy, Component, computed, effect, signal} from '@angular/core';
import {NG_TABLE_TOKENS, NgTableColumn, NgTableComponent, NgTableToken} from '@sbourahla/ng-table';
import {Commande, generateCommandes, STATUT_LABELS} from './demo-data';
import {contrast, parseTokenCss, toHex, withAlpha} from './theme-colors';

type Mode = 'light' | 'dark';
type Overrides = Record<Mode, Record<string, string>>;

const STORAGE_KEY = 'ngt-demo-theme-sandbox';

/** Familles de jetons, dans l'ordre d'affichage. */
const GROUPS: {title: string; hint: string; match: (name: string) => boolean}[] = [
  {title: 'Accent', hint: 'Tri actif, focus, sélection, boutons.', match: (name) => name.startsWith('primary') || name === 'on-primary'},
  {title: 'Texte', hint: 'Contenu des cellules et des en-têtes.', match: (name) => name.startsWith('text')},
  {title: 'Fonds', hint: 'Tableau, lignes survolées, champs, panneaux.', match: (name) => /surface|field|filter-panel/.test(name)},
  {title: 'Contours et ombre', hint: 'Séparateurs, contours de champs.', match: (name) => name.includes('border') || name.startsWith('shadow')},
  {title: 'États', hint: 'Erreur, succès, avertissement.', match: (name) => ['danger', 'success', 'warning'].includes(name)},
  {title: 'Graphiques', hint: 'Les huit couleurs de série.', match: (name) => name.startsWith('chart')},
  {title: 'Dimensions', hint: 'Rayons et hauteurs de ligne.', match: (name) => /radius|height/.test(name)},
  {title: 'Typographie', hint: 'Police et tailles de texte.', match: (name) => name.startsWith('font') || name.startsWith('header-font')},
];

/** Thèmes tout faits : valeurs claires et sombres. */
const PRESETS: {name: string; light: Record<string, string>; dark: Record<string, string>}[] = [
  {name: 'Par défaut', light: {}, dark: {}},
  {
    name: 'Forêt',
    light: {primary: '#1f6f4a', 'surface-alt': '#eef5f0', 'surface-soft': '#f6faf7', 'hover-surface': '#e9f3ec'},
    dark: {primary: '#7fd3a7', surface: '#0f1713', 'surface-alt': '#16211b', 'surface-soft': '#131c17', 'hover-surface': '#1c2a22'},
  },
  {
    name: 'Prune',
    light: {primary: '#7a2e6e', text: '#2a1830', 'text-muted': '#6b5670', 'surface-alt': '#f6eff5', 'surface-soft': '#fbf7fa', 'hover-surface': '#f3e8f1'},
    dark: {primary: '#e0a3d6', surface: '#17111a', 'surface-alt': '#211826', 'surface-soft': '#1c1420', 'hover-surface': '#2a1f30'},
  },
  {
    name: 'Ardoise',
    light: {primary: '#334155', text: '#0f172a', 'text-muted': '#475569', 'surface-alt': '#f1f5f9', 'surface-soft': '#f8fafc', 'hover-surface': '#e2e8f0'},
    dark: {primary: '#cbd5e1', surface: '#0f172a', 'surface-alt': '#1e293b', 'surface-soft': '#162033', 'hover-surface': '#243247'},
  },
  {
    name: 'Contraste renforcé',
    light: {primary: '#003e8a', text: '#000000', 'text-muted': '#333333', border: 'rgba(0, 0, 0, 0.45)', 'border-strong': 'rgba(0, 0, 0, 0.7)'},
    dark: {primary: '#9cd1ff', text: '#ffffff', 'text-muted': '#d6d6d6', surface: '#000000', border: 'rgba(255, 255, 255, 0.45)', 'border-strong': 'rgba(255, 255, 255, 0.7)'},
  },
  {
    name: 'Compact et carré',
    light: {'radius-card': '0px', 'radius-control': '2px', 'row-height': '34px', 'font-size': '0.78rem'},
    dark: {'radius-card': '0px', 'radius-control': '2px', 'row-height': '34px', 'font-size': '0.78rem'},
  },
];

/** Couples de couleurs à contrôler : [texte, fond, libellé, seuil WCAG]. */
const CHECKS: {front: string; back: string; label: string; min: number; kind: string}[] = [
  {front: 'text', back: 'surface', label: 'Texte sur le fond du tableau', min: 4.5, kind: 'texte'},
  {front: 'text-muted', back: 'surface', label: 'Texte secondaire sur le fond du tableau', min: 4.5, kind: 'texte'},
  {front: 'text', back: 'surface-alt', label: 'Texte sur les lignes de groupe et de totaux', min: 4.5, kind: 'texte'},
  {front: 'text', back: 'hover-surface', label: 'Texte sur une ligne survolée', min: 4.5, kind: 'texte'},
  {front: 'primary', back: 'surface', label: 'Accent (liens, tri actif) sur le fond', min: 4.5, kind: 'texte'},
  {front: 'on-primary', back: 'primary', label: 'Texte posé sur l’accent (bouton plein)', min: 4.5, kind: 'texte'},
  {front: 'danger', back: 'surface', label: 'Message d’erreur sur le fond', min: 4.5, kind: 'texte'},
  {front: 'control-border', back: 'surface', label: 'Contour des champs de saisie', min: 3, kind: 'élément graphique'},
  {front: 'primary', back: 'surface', label: 'Indicateur de focus', min: 3, kind: 'élément graphique'},
];

const tokenByName = new Map(NG_TABLE_TOKENS.map((token) => [token.name, token]));

/**
 * Bac à sable de thème : chaque jeton `--ngt-*` se règle ici, en clair et en sombre ; la table en dessous change
 * aussitôt, les contrastes sont contrôlés, et le CSS obtenu est prêt à copier.
 */
@Component({
  selector: 'app-theme-demo',
  standalone: true,
  imports: [NgTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
    .layout {
      display: grid;
      grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }

    @media (max-width: 1000px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    .panel {
      max-height: calc(100vh - 32px);
      overflow: auto;
      position: sticky;
      top: 16px;
    }

    @media (max-width: 1000px) {
      .panel {
        position: static;
        max-height: none;
      }
    }

    .bar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-bottom: 10px;
    }

    .bar button,
    .bar select,
    .field {
      min-height: 32px;
      padding: 4px 10px;
      border: 1px solid var(--demo-control-border, rgba(110, 120, 130, 0.75));
      border-radius: 8px;
      background: var(--demo-surface);
      color: inherit;
      font: inherit;
    }

    .bar button {
      cursor: pointer;
    }

    .bar button[aria-pressed='true'] {
      background: var(--demo-text);
      border-color: var(--demo-text);
      color: var(--demo-surface);
    }

    .bar button:focus-visible,
    .bar select:focus-visible,
    .field:focus-visible,
    .token input:focus-visible,
    .token button:focus-visible {
      outline: 2px solid var(--demo-accent);
      outline-offset: 2px;
    }

    .search {
      flex: 1 1 140px;
      min-width: 0;
    }

    fieldset {
      margin: 0 0 12px;
      padding: 8px 10px 10px;
      border: 1px solid var(--demo-border);
      border-radius: 10px;
      min-width: 0;
    }

    legend {
      padding: 0 6px;
      font-weight: 700;
    }

    .hint {
      margin: 0 0 8px;
      color: var(--demo-muted);
      font-size: 0.85rem;
    }

    .token {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 2px 6px;
      padding: 5px 0;
      border-top: 1px solid var(--demo-border);
    }

    .token:first-of-type {
      border-top: 0;
    }

    .token label {
      font-family: ui-monospace, Consolas, monospace;
      font-size: 0.8rem;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .token--changed label::after {
      content: ' •';
      color: var(--demo-accent);
    }

    .token small {
      grid-column: 1 / -1;
      color: var(--demo-muted);
      font-size: 0.78rem;
    }

    .token input[type='color'] {
      width: 36px;
      height: 28px;
      padding: 0;
      border: 1px solid var(--demo-control-border, rgba(110, 120, 130, 0.75));
      border-radius: 6px;
      background: none;
    }

    .token input[type='text'] {
      width: 118px;
      min-height: 28px;
      padding: 2px 6px;
      border: 1px solid var(--demo-control-border, rgba(110, 120, 130, 0.75));
      border-radius: 6px;
      background: transparent;
      color: inherit;
      font: 0.8rem ui-monospace, Consolas, monospace;
    }

    .token button {
      min-width: 28px;
      min-height: 28px;
      border: 1px solid var(--demo-control-border, rgba(110, 120, 130, 0.75));
      border-radius: 6px;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }

    .token__controls {
      display: flex;
      gap: 4px;
      align-items: center;
    }

    .checks {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
    }

    .checks th,
    .checks td {
      padding: 5px 8px;
      border-top: 1px solid var(--demo-border);
      text-align: start;
    }

    .checks td:nth-child(2),
    .checks td:nth-child(3) {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    .sample {
      display: inline-block;
      min-width: 3.2em;
      padding: 1px 8px;
      border: 1px solid var(--demo-border);
      border-radius: 4px;
      text-align: center;
      font-weight: 600;
    }

    .sample--line {
      height: 1.3em;
      border-width: 2px;
      vertical-align: middle;
    }

    .verdict--bad {
      font-weight: 700;
      color: var(--demo-bad);
    }

    .verdict--good {
      color: var(--demo-good);
    }

    .preview {
      padding: 12px;
      border-radius: 12px;
      border: 1px dashed var(--demo-border);
    }

    .status {
      min-height: 1.3em;
      margin: 6px 0 0;
      color: var(--demo-muted);
      font-size: 0.85rem;
    }

    textarea {
      width: 100%;
      min-height: 90px;
      box-sizing: border-box;
      padding: 8px;
      border: 1px solid var(--demo-control-border, rgba(110, 120, 130, 0.75));
      border-radius: 8px;
      background: transparent;
      color: inherit;
      font: 0.8rem ui-monospace, Consolas, monospace;
    }
    `,
  ],
  template: `
    <p class="demo-intro">
      Chaque couleur et chaque dimension de la table est un jeton CSS <code>--ngt-*</code>. Réglez-les ici, en clair et
      en sombre : l'aperçu change aussitôt, les contrastes sont contrôlés, et le CSS à copier est en bas de page.
      Vos réglages sont gardés dans ce navigateur.
    </p>

    <div class="layout">
      <!-- ---------------------------------------------------------------- réglages -->
      <div class="demo-card panel">
        <h2>Régler le thème</h2>
        <div aria-label="Thème réglé" class="bar" role="group">
          <button (click)="mode.set('light')" [attr.aria-pressed]="mode() === 'light'" type="button">Thème clair</button>
          <button (click)="mode.set('dark')" [attr.aria-pressed]="mode() === 'dark'" type="button">Thème sombre</button>
          <span>{{ changedCount() }} jeton(s) modifié(s)</span>
        </div>
        <div class="bar">
          <label>
            <span class="hint">Partir d'un thème tout fait&nbsp;: </span>
            <select (change)="applyPreset($any($event.target).value); $any($event.target).value = ''" aria-label="Thème tout fait">
              <option value="">Choisir…</option>
              @for (preset of presets; track preset.name) {
                <option [value]="preset.name">{{ preset.name }}</option>
              }
            </select>
          </label>
          <button (click)="resetAll()" [disabled]="changedCount() === 0" type="button">Tout réinitialiser</button>
        </div>
        <div class="bar">
          <input (input)="query.set($any($event.target).value)" [value]="query()" aria-label="Chercher un jeton" class="field search" placeholder="Chercher un jeton (nom ou usage)…"
                 type="search"/>
        </div>
        <label class="hint" style="display: flex; gap: 6px; align-items: center">
          <input (change)="derive.set($any($event.target).checked)" [checked]="derive()" type="checkbox"/>
          Déduire les teintes légères de l'accent quand il change
        </label>

        @for (group of visibleGroups(); track group.title) {
          <fieldset>
            <legend>{{ group.title }}</legend>
            <p class="hint">{{ group.hint }}</p>
            @for (token of group.tokens; track token.name) {
              <div [class.token--changed]="isChanged(token)" class="token">
                <label [attr.for]="'token-' + token.name">--ngt-{{ token.name }}</label>
                <span class="token__controls">
                  @if (hexOf(token); as hex) {
                    <input (input)="set(token.name, $any($event.target).value)" [attr.aria-label]="'Couleur de --ngt-' + token.name" [value]="hex" type="color"/>
                  }
                  <input (change)="set(token.name, $any($event.target).value)" [id]="'token-' + token.name" [value]="valueOf(token)" spellcheck="false" type="text"/>
                </span>
                <button (click)="reset(token.name)" [attr.aria-label]="'Rétablir --ngt-' + token.name" [disabled]="!isChanged(token)" title="Rétablir la valeur par défaut" type="button">↺</button>
                <small>{{ token.description }}</small>
              </div>
            }
          </fieldset>
        } @empty {
          <p class="hint">Aucun jeton ne correspond à « {{ query() }} ».</p>
        }
      </div>

      <!-- ---------------------------------------------------------------- aperçu, contrastes, CSS -->
      <div>
        <div class="demo-card">
          <h2>Aperçu ({{ mode() === 'dark' ? 'thème sombre' : 'thème clair' }})</h2>
          <div class="bar">
            <button (click)="compact.set(!compact())" [attr.aria-pressed]="compact()" type="button">Densité compacte</button>
            <button (click)="grouped.set(!grouped())" [attr.aria-pressed]="grouped()" type="button">Regrouper par statut</button>
          </div>
          <!-- Les jetons sont posés sur la table elle-même : ils priment sur ceux du thème sombre, déclarés sur le même élément. -->
          <div [style.background]="currentValue('surface')" class="preview">
            <ng-table
              [ariaLabel]="'Aperçu du thème'"
              [columns]="columns"
              [density]="compact() ? 'compact' : 'default'"
              [globalSearchEnabled]="true"
              [groupBy]="grouped() ? 'statut' : null"
              [paginator]="true"
              [rowSelectionEnabled]="true"
              [rows]="rows"
              [showActiveFiltersBar]="true"
              [showTotals]="true"
              [style]="styleVars()"
              [theme]="mode()"
            />
          </div>
        </div>

        <div class="demo-card">
          <h2>Contrastes (WCAG 2.2, niveau AA)</h2>
          <p class="hint">
            Un texte demande un rapport d'au moins 4,5 pour 1 avec son fond ; un contour de champ ou un indicateur de focus,
            3 pour 1. Calculé sur les valeurs en cours du thème {{ mode() === 'dark' ? 'sombre' : 'clair' }}.
          </p>
          <table class="checks">
            <thead>
              <tr><th scope="col">Ce qui est contrôlé</th><th scope="col">Rapport</th><th scope="col">Seuil</th><th scope="col">Verdict</th><th scope="col">Échantillon</th></tr>
            </thead>
            <tbody>
              @for (check of checks(); track check.label) {
                <tr>
                  <th scope="row" style="font-weight: 400">{{ check.label }}</th>
                  <td>{{ check.ratio === null ? '—' : check.ratio.toFixed(2) + ' : 1' }}</td>
                  <td>{{ check.min }} : 1</td>
                  <td>
                    @if (check.ratio === null) {
                      <span>Non calculable</span>
                    } @else if (check.ok) {
                      <span class="verdict--good">✓ Conforme</span>
                    } @else {
                      <span class="verdict--bad">✗ Insuffisant</span>
                    }
                  </td>
                  <td>
                    @if (check.kind === 'texte') {
                      <span [style.background]="check.backValue" [style.color]="check.frontValue" class="sample">Abc</span>
                    } @else {
                      <!-- Élément graphique : un contour, pas un texte (rien à lire). -->
                      <span [style.background]="check.backValue" [style.border-color]="check.frontValue" aria-hidden="true" class="sample sample--line"></span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <p aria-live="polite" class="status">{{ failingCount() === 0 ? 'Tous les contrastes contrôlés sont conformes.' : failingCount() + ' contraste(s) insuffisant(s).' }}</p>
        </div>

        <div class="demo-card">
          <h2>Le CSS à copier</h2>
          <div class="bar">
            <label>
              <span class="hint">Portée&nbsp;: </span>
              <select (change)="scope.set($any($event.target).value)" aria-label="Portée du CSS">
                <option value="root">Toute l'application (:root)</option>
                <option value="class">Une zone (.ma-zone)</option>
              </select>
            </label>
            <button (click)="copy()" type="button">Copier</button>
          </div>
          <pre class="demo-code" tabindex="0">{{ css() }}</pre>
          <p aria-live="polite" class="status">{{ status() }}</p>

          <h2 style="margin-top: 14px">Reprendre un thème existant</h2>
          <p class="hint">
            Collez des déclarations <code>--ngt-nom: valeur;</code> : elles sont appliquées au thème {{ mode() === 'dark' ? 'sombre' : 'clair' }} réglé ci-dessus.
          </p>
          <textarea #paste aria-label="CSS à reprendre" placeholder="--ngt-primary: #1f6f4a;&#10;--ngt-radius-control: 4px;" spellcheck="false"></textarea>
          <div class="bar" style="margin-top: 8px">
            <button (click)="importCss(paste.value); paste.value = ''" type="button">Appliquer</button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ThemeDemoComponent {
  protected readonly presets = PRESETS;
  protected readonly mode = signal<Mode>('light');
  protected readonly query = signal('');
  protected readonly derive = signal(true);
  protected readonly compact = signal(false);
  protected readonly grouped = signal(false);
  protected readonly scope = signal<'root' | 'class'>('root');
  protected readonly status = signal('');
  /** Valeurs modifiées, par thème puis par nom de jeton (les autres gardent leur valeur par défaut). */
  protected readonly overrides = signal<Overrides>(readStored());

  protected readonly rows = generateCommandes(40);
  protected readonly columns: NgTableColumn<Commande>[] = [
    {id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference, sortable: true, filter: {type: 'text'}},
    {id: 'client', header: 'Client', valueAccessor: (c) => c.client, sortable: true, filter: {type: 'set'}, cell: {type: 'avatar'}},
    {
      id: 'statut',
      header: 'Statut',
      valueAccessor: (c) => STATUT_LABELS[c.statut],
      sortable: true,
      cell: {type: 'badge', tone: {Brouillon: 'neutral', Validée: 'info', Expédiée: 'success', Annulée: 'danger'}},
    },
    {id: 'montant', header: 'Montant (€)', valueAccessor: (c) => c.montant, sortable: true, aggregate: 'sum', filter: {type: 'number'}, cell: {type: 'dataBar'}},
    {id: 'tendance', header: 'Tendance', valueAccessor: (c) => c.tendance, sparkline: {type: 'area'}},
  ];

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.overrides()));
      } catch {
        // stockage indisponible (navigation privée, quota) : les réglages ne sont simplement pas gardés
      }
    });
  }

  private defaultOf(token: NgTableToken): string {
    return this.mode() === 'dark' ? token.dark : token.light;
  }

  protected valueOf(token: NgTableToken): string {
    return this.overrides()[this.mode()][token.name] ?? this.defaultOf(token);
  }

  /** Valeur en cours d'un jeton, par son nom. */
  protected currentValue(name: string): string {
    const token = tokenByName.get(name);
    return token ? this.valueOf(token) : '';
  }

  protected hexOf(token: NgTableToken): string | null {
    return token.kind === 'size' ? null : toHex(this.valueOf(token));
  }

  protected isChanged(token: NgTableToken): boolean {
    return this.overrides()[this.mode()][token.name] !== undefined;
  }

  protected readonly changedCount = computed(() => Object.keys(this.overrides()[this.mode()]).length);

  protected readonly visibleGroups = computed(() => {
    const query = this.query().trim().toLowerCase();
    return GROUPS.map((group) => ({
      ...group,
      tokens: NG_TABLE_TOKENS.filter((token) => group.match(token.name) && (!query || token.name.includes(query) || token.description.toLowerCase().includes(query))),
    })).filter((group) => group.tokens.length > 0);
  });

  protected set(name: string, value: string): void {
    const token = tokenByName.get(name);
    if (!token) {
      return;
    }
    const mode = this.mode();
    const trimmed = value.trim();
    this.overrides.update((current) => {
      const next = {...current[mode]};
      const put = (key: string, raw: string | null) => {
        const fallback = tokenByName.get(key);
        if (!raw || !fallback || raw === (mode === 'dark' ? fallback.dark : fallback.light)) {
          delete next[key];
        } else {
          next[key] = raw;
        }
      };
      put(name, trimmed);
      // Les teintes légères de l'accent suivent l'accent, avec la transparence du thème par défaut.
      if (name === 'primary' && this.derive() && trimmed) {
        put('primary-soft', withAlpha(trimmed, mode === 'dark' ? 0.18 : 0.1));
        put('primary-outline', withAlpha(trimmed, mode === 'dark' ? 0.42 : 0.32));
      }
      return {...current, [mode]: next};
    });
  }

  protected reset(name: string): void {
    const mode = this.mode();
    this.overrides.update((current) => {
      const next = {...current[mode]};
      delete next[name];
      return {...current, [mode]: next};
    });
  }

  protected resetAll(): void {
    this.overrides.update((current) => ({...current, [this.mode()]: {}}));
    this.status.set('Thème rétabli.');
  }

  protected applyPreset(name: string): void {
    const preset = PRESETS.find((candidate) => candidate.name === name);
    if (preset) {
      this.overrides.set({light: {...preset.light}, dark: {...preset.dark}});
      this.status.set(`Thème « ${preset.name} » appliqué (clair et sombre).`);
    }
  }

  protected importCss(text: string): void {
    const values = parseTokenCss(text);
    const known = Object.entries(values).filter(([name]) => tokenByName.has(name));
    for (const [name, value] of known) {
      this.set(name, value);
    }
    const ignored = Object.keys(values).length - known.length;
    this.status.set(known.length === 0 ? 'Aucun jeton --ngt-* reconnu dans ce texte.' : `${known.length} jeton(s) appliqué(s)${ignored > 0 ? `, ${ignored} inconnu(s) ignoré(s)` : ''}.`);
  }

  /** Les jetons modifiés du thème en cours, en variables CSS posées sur la table. */
  protected readonly styleVars = computed(() => Object.fromEntries(Object.entries(this.overrides()[this.mode()]).map(([name, value]) => [`--ngt-${name}`, value])));

  protected readonly checks = computed(() => {
    const canvas = this.currentValue('surface');
    return CHECKS.map((check) => {
      const frontValue = this.currentValue(check.front);
      const backValue = this.currentValue(check.back);
      const ratio = contrast(frontValue, backValue, toHex(canvas) ?? (this.mode() === 'dark' ? '#000000' : '#ffffff'));
      return {...check, frontValue, backValue, ratio, ok: ratio !== null && ratio >= check.min};
    });
  });

  protected readonly failingCount = computed(() => this.checks().filter((check) => check.ratio !== null && !check.ok).length);

  protected readonly css = computed(() => {
    const {light, dark} = this.overrides();
    const block = (selector: string, values: Record<string, string>) =>
      `${selector} {\n${Object.entries(values)
        .map(([name, value]) => `  --ngt-${name}: ${value};`)
        .join('\n')}\n}`;
    const zone = this.scope() === 'class';
    const blocks: string[] = [];
    if (Object.keys(light).length > 0) {
      blocks.push(block(zone ? '.ma-zone' : ':root', light));
    }
    if (Object.keys(dark).length > 0) {
      // Le thème sombre déclare ses jetons sur la table elle-même : il faut la même cible pour passer devant.
      blocks.push(block(zone ? ".ma-zone ng-table[data-ngt-theme='dark'],\n.ngt-dark .ma-zone" : "ng-table[data-ngt-theme='dark'],\n.ngt-dark", dark));
    }
    return blocks.length > 0 ? blocks.join('\n\n') : '/* Aucun jeton modifié : la table garde son thème par défaut. */';
  });

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.css());
      this.status.set('CSS copié dans le presse-papiers.');
    } catch {
      this.status.set('Copie refusée par le navigateur : sélectionnez le texte ci-dessus et copiez-le.');
    }
  }
}

function readStored(): Overrides {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Overrides> | null;
    const clean = (values: unknown): Record<string, string> =>
      Object.fromEntries(Object.entries((values as Record<string, unknown>) ?? {}).filter(([name, value]) => tokenByName.has(name) && typeof value === 'string')) as Record<string, string>;
    return {light: clean(raw?.light), dark: clean(raw?.dark)};
  } catch {
    return {light: {}, dark: {}};
  }
}
