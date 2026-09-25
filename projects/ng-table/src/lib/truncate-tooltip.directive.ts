import {Directive, ElementRef, HostListener, inject, Input} from '@angular/core';
import {MatTooltip} from '@angular/material/tooltip';

/**
 * A l'usage interne de `ng-table` : porte un `matTooltip` qui ne s'active que si
 * le texte de l'hôte est réellement tronqué (`scrollWidth > clientWidth`) — pas de
 * tooltip superflue quand le contenu tient déjà en entier.
 */
@Directive({
  selector: '[ngTableTruncateTooltip]',
  standalone: true,
  hostDirectives: [{directive: MatTooltip, inputs: ['matTooltipPosition'], outputs: []}],
})
export class TruncateTooltipDirective {
  @Input('ngTableTruncateTooltip') text = '';

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly tooltip = inject(MatTooltip);

  constructor() {
    this.tooltip.tooltipClass = 'ngt-truncate-tooltip';
    this.tooltip.disabled = true;
  }

  @HostListener('mouseenter')
  onMouseEnter(): void {
    const node = this.el.nativeElement;
    this.tooltip.message = this.text;
    this.tooltip.disabled = node.scrollWidth <= node.clientWidth;
  }
}
