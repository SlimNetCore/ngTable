import {Directive, Input} from '@angular/core';
import {NgTableTooltipDirective} from './tooltip.directive';

/**
 * A l'usage interne de `ng-table` : une info-bulle qui ne s'active que si le texte de l'hôte est réellement
 * tronqué (`scrollWidth > clientWidth`) — pas de bulle superflue quand le contenu tient déjà en entier.
 */
@Directive({
  selector: '[ngTableTruncateTooltip]',
  standalone: true,
})
export class TruncateTooltipDirective extends NgTableTooltipDirective {
  @Input('ngTableTruncateTooltip') text = '';

  protected override message(): string {
    return this.text;
  }

  protected override enabled(): boolean {
    return this.host.scrollWidth > this.host.clientWidth && super.enabled();
  }
}
