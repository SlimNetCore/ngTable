import {ChangeDetectionStrategy, Component, input, ViewEncapsulation} from '@angular/core';

/** Les icônes de `ng-table`. */
export type NgTableIconName =
  | 'account_tree'
  | 'bookmark'
  | 'check'
  | 'chevron_right'
  | 'close'
  | 'content_copy'
  | 'delete'
  | 'dock_to_left'
  | 'download'
  | 'drag_indicator'
  | 'expand_more'
  | 'file_download'
  | 'file_upload'
  | 'filter_alt'
  | 'filter_alt_off'
  | 'north'
  | 'push_pin'
  | 'radio_button_checked'
  | 'radio_button_unchecked'
  | 'save'
  | 'search'
  | 'south'
  | 'star'
  | 'star_outline'
  | 'swap_vert'
  | 'sync'
  | 'unfold_less'
  | 'unfold_more'
  | 'view_column';

/**
 * Icône en SVG, sans police d'icônes à charger (l'ancien `<mat-icon>` demandait Material Icons dans la page).
 * Dessinées au trait, à la couleur du texte (`currentColor`) : leur taille et leur couleur se règlent par `font-size`
 * et `color`, comme un texte. Les noms sont ceux des icônes Material qu'elles remplacent.
 *
 * ```html
 * <ng-table-icon name="close"/>
 * ```
 */
@Component({
  selector: 'ng-table-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {'aria-hidden': 'true'},
  template: `
    <svg fill="none" height="100%" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
         viewBox="0 0 24 24" width="100%">
      @switch (name()) {
        @case ('account_tree') {
          <rect height="5" width="6" x="3" y="9.5"/><rect height="5" width="6" x="15" y="4"/><rect height="5" width="6" x="15" y="15"/>
          <path d="M9 12h3M12 6.5v11M12 6.5h3M12 17.5h3"/>
        }
        @case ('bookmark') {
          <path d="M7 4h10v16l-5-4-5 4z"/>
        }
        @case ('check') {
          <path d="M5 12.5l4.5 4.5L19 7.5"/>
        }
        @case ('chevron_right') {
          <path d="M9 6l6 6-6 6"/>
        }
        @case ('close') {
          <path d="M6 6l12 12M18 6L6 18"/>
        }
        @case ('content_copy') {
          <rect height="12" rx="2" width="11" x="8" y="8"/><path d="M16 8V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h1"/>
        }
        @case ('delete') {
          <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/>
        }
        @case ('dock_to_left') {
          <rect height="16" rx="2" width="18" x="3" y="4"/><path d="M9 4v16"/>
        }
        @case ('download') {
          <path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>
        }
        @case ('file_download') {
          <path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>
        }
        @case ('file_upload') {
          <path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>
        }
        @case ('drag_indicator') {
          <g fill="currentColor" stroke="none">
            <circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/>
            <circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/>
          </g>
        }
        @case ('expand_more') {
          <path d="M6 9l6 6 6-6"/>
        }
        @case ('filter_alt') {
          <path d="M4 5h16l-6 8v6l-4-2v-4z"/>
        }
        @case ('filter_alt_off') {
          <path d="M4 5h16l-6 8v6l-4-2v-4z"/><path d="M3 3l18 18"/>
        }
        @case ('north') {
          <path d="M12 19V5M6 11l6-6 6 6"/>
        }
        @case ('south') {
          <path d="M12 5v14M6 13l6 6 6-6"/>
        }
        @case ('push_pin') {
          <path d="M9 4h6v5l2.5 3h-11L9 9z"/><path d="M12 12v8"/>
        }
        @case ('radio_button_checked') {
          <circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" fill="currentColor" r="4" stroke="none"/>
        }
        @case ('radio_button_unchecked') {
          <circle cx="12" cy="12" r="8"/>
        }
        @case ('save') {
          <path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6"/>
        }
        @case ('search') {
          <circle cx="10.5" cy="10.5" r="6"/><path d="M15.5 15.5L20 20"/>
        }
        @case ('star') {
          <path d="M12 3l2.8 6 6.2.7-4.6 4.3 1.3 6.5-5.7-3.3-5.7 3.3 1.3-6.5L3 9.7 9.2 9z" fill="currentColor"/>
        }
        @case ('star_outline') {
          <path d="M12 3l2.8 6 6.2.7-4.6 4.3 1.3 6.5-5.7-3.3-5.7 3.3 1.3-6.5L3 9.7 9.2 9z"/>
        }
        @case ('swap_vert') {
          <path d="M8 20V5M4.5 8.5L8 5l3.5 3.5M16 4v15M12.5 15.5L16 19l3.5-3.5"/>
        }
        @case ('sync') {
          <path d="M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4M20 11a8 8 0 0 0-14.5-4M4 4v4h4"/>
        }
        @case ('unfold_less') {
          <path d="M8 5l4 4 4-4M8 19l4-4 4 4"/>
        }
        @case ('unfold_more') {
          <path d="M8 9l4-4 4 4M8 15l4 4 4-4"/>
        }
        @case ('view_column') {
          <rect height="14" rx="1" width="16" x="4" y="5"/><path d="M9.5 5v14M14.5 5v14"/>
        }
      }
    </svg>
  `,
  styles: `
    ng-table-icon {
      display: inline-flex;
      flex: 0 0 auto;
      width: 1.5rem;
      height: 1.5rem;
      font-size: 1.5rem;
      line-height: 1;
      vertical-align: middle;
    }

    ng-table-icon svg {
      display: block;
    }
  `,
})
export class NgTableIconComponent {
  readonly name = input.required<NgTableIconName | string>();
}
