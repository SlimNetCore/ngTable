import {CommonModule} from '@angular/common';
import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';

/** Usage interne uniquement — non exporté par `public-api.ts`. */
@Component({
  selector: 'ng-table-select-filter',
  standalone: true,
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './select-filter.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './select-filter.component.css',
})
export class SelectFilterComponent {
  /** Texte affiché tel quel (déjà résolu — plus une clé i18n). */
  @Input() placeholder = 'Rechercher';
  /** Texte du bouton "effacer" (aria-label), déjà résolu. */
  @Input() clearLabel = 'Effacer le filtre';
  @Output() valueChange = new EventEmitter<string>();

  protected onClear(input: HTMLInputElement): void {
    input.value = '';
    this.valueChange.emit('');
    input.focus();
  }
}
