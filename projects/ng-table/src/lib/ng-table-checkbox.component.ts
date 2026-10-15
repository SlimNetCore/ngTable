import {ChangeDetectionStrategy, Component, ElementRef, input, output, viewChild, ViewEncapsulation} from '@angular/core';

/** Ce que reçoit `(checkedChange)` : le nouvel état demandé par l'utilisateur. */
export interface NgTableCheckboxChange {
  checked: boolean;
}

/**
 * Case à cocher de `ng-table` : un vrai `<input type="checkbox">` (clavier, lecteur d'écran et formulaires
 * fonctionnent comme d'habitude), habillée par les jetons de thème. Remplace `<mat-checkbox>`.
 *
 * Elle est contrôlée : `[checked]` fait foi, `(checkedChange)` signale ce que l'utilisateur demande.
 *
 * ```html
 * <ng-table-checkbox [checked]="selected()" (checkedChange)="selected.set($event.checked)">Libellé</ng-table-checkbox>
 * ```
 */
@Component({
  selector: 'ng-table-checkbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <label class="ngt-checkbox">
      <input #box (change)="onChange($event)" [attr.aria-label]="ariaLabel()" [checked]="checked()" [disabled]="disabled()"
             [indeterminate]="indeterminate()" class="ngt-checkbox__input" type="checkbox"/>
      <span class="ngt-checkbox__label"><ng-content/></span>
    </label>
  `,
  styles: `
    ng-table-checkbox {
      display: inline-flex;
      vertical-align: middle;
    }

    .ngt-checkbox {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }

    .ngt-checkbox__input {
      width: 18px;
      height: 18px;
      margin: 0;
      accent-color: var(--ngt-primary, var(--app-primary, #3a7ca5));
      cursor: pointer;
    }

    .ngt-checkbox__input:focus-visible {
      outline: 2px solid var(--ngt-primary, var(--app-primary, #3a7ca5));
      outline-offset: 2px;
    }

    .ngt-checkbox__input:disabled {
      cursor: default;
      opacity: 0.5;
    }

    .ngt-checkbox__label:empty {
      display: none;
    }
  `,
})
export class NgTableCheckboxComponent {
  readonly checked = input(false);
  readonly indeterminate = input(false);
  readonly disabled = input(false);
  /** Nom accessible quand la case n'a pas de libellé visible. */
  readonly ariaLabel = input<string | null>(null);
  /** Le nouvel état demandé par l'utilisateur. */
  readonly checkedChange = output<NgTableCheckboxChange>();

  private readonly box = viewChild.required<ElementRef<HTMLInputElement>>('box');

  protected onChange(event: Event): void {
    // L'événement natif `change` remonte jusqu'à l'élément hôte, où l'écouteur `(change)` du parent le recevrait en plus
    // de notre sortie du même nom : on l'arrête pour que le parent ne soit appelé qu'une fois.
    event.stopPropagation();
    const input = this.box().nativeElement;
    this.checkedChange.emit({checked: input.checked});
    // Contrôlée : si le parent n'a pas changé `[checked]`, la case reprend l'état voulu par le parent.
    queueMicrotask(() => {
      input.checked = this.checked();
      input.indeterminate = this.indeterminate();
    });
  }
}
