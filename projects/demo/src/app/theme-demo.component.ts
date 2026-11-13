import {ChangeDetectionStrategy, Component, computed, signal} from '@angular/core';
import {NG_TABLE_TOKENS, NgTableColumn, NgTableComponent, NgTableToken} from '@sbourahla/ng-table';
import {Commande, generateCommandes, STATUT_LABELS} from './demo-data';

const HEX = /^#[0-9a-f]{6}$/i;

/** Jetons proposés dans le bac à sable : les couleurs et dimensions qui changent le plus l'allure d'une table. */
const EDITABLE = ['primary', 'text', 'text-muted', 'surface', 'surface-alt', 'surface-soft', 'hover-surface', 'danger', 'success', 'warning', 'radius-card', 'radius-control', 'row-height', 'font-size'];

/** Quelques thèmes tout faits, pour partir de quelque chose. */
const PRESETS: {name: string; values: Record<string, string>}[] = [
  {name: 'Par défaut', values: {}},
  {name: 'Forêt', values: {primary: '#1f6f4a', 'surface-alt': '#eef5f0', 'surface-soft': '#f6faf7', 'hover-surface': '#e9f3ec', 'radius-card': '8px', 'radius-control': '6px'}},
  {name: 'Prune', values: {primary: '#7a2e6e', text: '#2a1830', 'text-muted': '#6b5670', 'surface-alt': '#f6eff5', 'surface-soft': '#fbf7fa', 'hover-surface': '#f3e8f1'}},
  {name: 'Compact et carré', values: {'radius-card': '0px', 'radius-control': '2px', 'row-height': '34px', 'font-size': '0.78rem'}},
];

/**
 * Bac à sable de thème : chaque jeton `--ngt-*` se règle ici, la table en dessous change aussitôt, et le CSS
 * correspondant est prêt à copier dans la feuille de style de l'application.
 */
@Component({
  selector: 'app-theme-demo',
  standalone: true,
  imports: [NgTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
    .tokens {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 10px 16px;
      margin: 12px 0;
    }

    .token {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 2px 8px;
    }

    .token label {
      font-weight: 600;
      font-family: ui-monospace, Consolas, monospace;
      font-size: 0.82rem;
    }

    .token small {
      grid-column: 1 / -1;
      opacity: 0.8;
    }

    .token input[type='color'] {
      width: 44px;
      height: 30px;
      padding: 0;
      border: 1px solid rgba(128, 128, 128, 0.5);
      border-radius: 6px;
      background: none;
    }

    .token input[type='text'] {
      width: 90px;
      padding: 4px 6px;
      border: 1px solid rgba(128, 128, 128, 0.5);
      border-radius: 6px;
      background: transparent;
      color: inherit;
      font: inherit;
    }

    .presets {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .presets button {
      padding: 6px 12px;
      border: 1px solid rgba(128, 128, 128, 0.5);
      border-radius: 8px;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    `,
  ],
  template: `
    <p class="demo-intro">
      Chaque couleur et chaque dimension de la table est un jeton CSS <code>--ngt-*</code>. Réglez-les ici : la table
      change aussitôt, et le CSS à copier dans votre application est en bas de page.
    </p>

    <div class="demo-card">
      <h2>Régler le thème</h2>
      <div class="presets" role="group" aria-label="Thèmes tout faits">
        @for (preset of presets; track preset.name) {
          <button (click)="apply(preset.values)" type="button">{{ preset.name }}</button>
        }
      </div>
      <div class="tokens">
        @for (token of tokens; track token.name) {
          <div class="token">
            <label [attr.for]="'token-' + token.name">--ngt-{{ token.name }}</label>
            @if (isColor(token)) {
              <input (input)="set(token.name, $any($event.target).value)" [id]="'token-' + token.name" [value]="valueOf(token)" type="color"/>
            } @else {
              <input (change)="set(token.name, $any($event.target).value)" [id]="'token-' + token.name" [value]="valueOf(token)" type="text"/>
            }
            <small>{{ token.description }}</small>
          </div>
        }
      </div>
    </div>

    <div class="demo-card" style="margin-top: 16px">
      <h2>Aperçu</h2>
      <!-- Les jetons sont posés sur ce conteneur : ils s'appliquent à la table qu'il contient, pas au reste de la page. -->
      <div [style]="styleVars()">
        <ng-table
          [ariaLabel]="'Aperçu du thème'"
          [columns]="columns"
          [globalSearchEnabled]="true"
          [paginator]="true"
          [rowSelectionEnabled]="true"
          [rows]="rows"
          [showTotals]="true"
          [theme]="'light'"
        />
      </div>
    </div>

    <div class="demo-card" style="margin-top: 16px">
      <h2>Le CSS à copier</h2>
      <p class="demo-intro">
        À placer dans la feuille de style globale de l'application. Sur <code>:root</code> il vaut pour toutes les tables ;
        sur un conteneur, pour celles qu'il contient.
      </p>
      <pre class="demo-code" tabindex="0">{{ css() }}</pre>
    </div>
  `,
})
export class ThemeDemoComponent {
  protected readonly presets = PRESETS;
  protected readonly tokens: NgTableToken[] = EDITABLE.map((name) => NG_TABLE_TOKENS.find((token) => token.name === name)).filter((token): token is NgTableToken => !!token);
  /** Valeurs modifiées, par nom de jeton (les autres gardent leur valeur par défaut). */
  protected readonly overrides = signal<Record<string, string>>({});

  protected readonly rows = generateCommandes(40);
  protected readonly columns: NgTableColumn<Commande>[] = [
    {id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference, sortable: true, filter: {type: 'text'}},
    {id: 'client', header: 'Client', valueAccessor: (c) => c.client, sortable: true, cell: {type: 'avatar'}},
    {
      id: 'statut',
      header: 'Statut',
      valueAccessor: (c) => STATUT_LABELS[c.statut],
      sortable: true,
      cell: {type: 'badge', tone: {Brouillon: 'neutral', Validée: 'info', Expédiée: 'success', Annulée: 'danger'}},
    },
    {id: 'montant', header: 'Montant (€)', valueAccessor: (c) => c.montant, sortable: true, aggregate: 'sum', cell: {type: 'dataBar'}},
  ];

  protected isColor(token: NgTableToken): boolean {
    return token.kind !== 'size' && HEX.test(token.light);
  }

  protected valueOf(token: NgTableToken): string {
    return this.overrides()[token.name] ?? token.light;
  }

  protected set(name: string, value: string): void {
    const trimmed = value.trim();
    const fallback = NG_TABLE_TOKENS.find((token) => token.name === name)?.light;
    this.overrides.update((current) => {
      const next = {...current};
      if (!trimmed || trimmed === fallback) {
        delete next[name];
      } else {
        next[name] = trimmed;
      }
      return next;
    });
  }

  protected apply(values: Record<string, string>): void {
    this.overrides.set({...values});
  }

  /** Les jetons modifiés, en variables CSS posées sur le conteneur de l'aperçu. */
  protected readonly styleVars = computed(() => Object.fromEntries(Object.entries(this.overrides()).map(([name, value]) => [`--ngt-${name}`, value])));

  protected readonly css = computed(() => {
    const entries = Object.entries(this.overrides());
    if (entries.length === 0) {
      return '/* Aucun jeton modifié : la table garde son thème par défaut. */';
    }
    return `:root {\n${entries.map(([name, value]) => `  --ngt-${name}: ${value};`).join('\n')}\n}`;
  });
}
