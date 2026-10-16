import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';

/**
 * Filtre de colonne 100 % personnalisé (`filter.component`) : des tranches de
 * montant en un clic plutôt qu'une saisie. Le contrat avec ng-table tient en deux
 * membres : une entrée `value` et une sortie `valueChange` (texte libre ; ici la
 * syntaxe de plage `min..max`, interprétée par le serveur).
 */
@Component({
  selector: 'app-montant-preset-filter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; flex-wrap: wrap; gap: 6px; }
    button {
      padding: 4px 10px; border: 1px solid var(--demo-border); border-radius: 999px;
      background: var(--demo-surface); color: var(--demo-text); font: inherit; font-size: .78rem; cursor: pointer; white-space: nowrap;
    }
    button[aria-pressed='true'] { background: color-mix(in srgb, var(--demo-accent) 14%, transparent); border-color: var(--demo-accent); color: var(--demo-accent); font-weight: 600; }
  `,
  template: `
    @for (preset of presets; track preset.value) {
      <button (click)="valueChange.emit(value() === preset.value ? '' : preset.value)"
              [attr.aria-pressed]="value() === preset.value" type="button">
        {{ preset.label }}
      </button>
    }
  `,
})
export class MontantPresetFilterComponent {
  readonly value = input('');
  readonly valueChange = output<string>();

  protected readonly presets = [
    {label: '< 500 €', value: '..500'},
    {label: '500 – 5 000 €', value: '500..5000'},
    {label: '> 5 000 €', value: '5000..'},
  ];
}
