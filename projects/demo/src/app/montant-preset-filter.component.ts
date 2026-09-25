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
      padding: 4px 10px; border: 1px solid rgba(15, 23, 42, .2); border-radius: 999px;
      background: #fff; font: inherit; font-size: .78rem; cursor: pointer; white-space: nowrap;
    }
    button[aria-pressed='true'] { background: #e3eefb; border-color: #1d4f91; color: #1d4f91; font-weight: 600; }
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
