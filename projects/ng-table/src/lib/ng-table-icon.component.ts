import {ChangeDetectionStrategy, Component, computed, input, ViewEncapsulation} from '@angular/core';

/** Icônes qui désignent une direction : retournées en lecture de droite à gauche (:dir(rtl) dans la feuille de la table). */
const DIRECTIONAL_ICONS: ReadonlySet<string> = new Set(['chevron_right', 'dock_to_left']);

/** Les icônes de `ng-table`. */
export type NgTableIconName =
  | 'account_tree'
  | 'add'
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
  | 'more_horiz'
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
  host: {'aria-hidden': 'true', '[attr.data-flip]': 'flips() ? "" : null'},
  template: `
    <svg fill="none" height="100%" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"
         viewBox="0 0 24 24" width="100%">
      @switch (name()) {
        @case ('account_tree') {
          <rect height="6" rx="1.5" width="6" x="3" y="9"/><rect height="6" rx="1.5" width="6" x="15" y="3.5"/><rect height="6" rx="1.5" width="6" x="15" y="14.5"/>
          <path d="M9 12h3M12 6.5v11M12 6.5h3M12 17.5h3"/>
        }
        @case ('add') {
          <path d="M12 5v14M5 12h14"/>
        }
        @case ('bookmark') {
          <path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-4.2L6 20V5.5a1 1 0 0 1 1-1z"/>
        }
        @case ('check') {
          <path d="M5 12.5l4.2 4.2L19 7.2"/>
        }
        @case ('chevron_right') {
          <path d="M9.5 6l6 6-6 6"/>
        }
        @case ('close') {
          <path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>
        }
        @case ('content_copy') {
          <rect height="12" rx="2.5" width="11.5" x="8.5" y="8.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>
        }
        @case ('delete') {
          <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 11.6A1.6 1.6 0 0 0 8.9 20h6.2a1.6 1.6 0 0 0 1.6-1.4L17.5 7M10 11v5M14 11v5"/>
        }
        @case ('dock_to_left') {
          <rect height="16" rx="3" width="18" x="3" y="4"/><path d="M9.5 4v16"/>
        }
        @case ('download') {
          <path d="M12 4v10.5M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>
        }
        @case ('file_download') {
          <path d="M12 4v10.5M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>
        }
        @case ('file_upload') {
          <path d="M12 15.5V5M7.5 9L12 4.5 16.5 9M5 19.5h14"/>
        }
        @case ('drag_indicator') {
          <g fill="currentColor" stroke="none">
            <circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/>
            <circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>
          </g>
        }
        @case ('expand_more') {
          <path d="M6.5 9.5L12 15l5.5-5.5"/>
        }
        @case ('filter_alt') {
          <path d="M4.6 5.5h14.8a.6.6 0 0 1 .46 1L14 13.3V19l-4 1.5v-7.2L4.14 6.5a.6.6 0 0 1 .46-1z"/>
        }
        @case ('filter_alt_off') {
          <path d="M4.6 5.5h14.8a.6.6 0 0 1 .46 1L14 13.3V19l-4 1.5v-7.2L4.14 6.5a.6.6 0 0 1 .46-1z"/><path d="M3.5 3.5l17 17"/>
        }
        @case ('more_horiz') {
          <g fill="currentColor" stroke="none"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></g>
        }
        @case ('north') {
          <path d="M12 19.5V5M6.5 10.5L12 5l5.5 5.5"/>
        }
        @case ('south') {
          <path d="M12 4.5V19M6.5 13.5L12 19l5.5-5.5"/>
        }
        @case ('push_pin') {
          <path d="M9.5 4.5h5l-.6 5 3 3.2H7.1l3-3.2z"/><path d="M12 12.7V20"/>
        }
        @case ('radio_button_checked') {
          <circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" fill="currentColor" r="4" stroke="none"/>
        }
        @case ('radio_button_unchecked') {
          <circle cx="12" cy="12" r="8.5"/>
        }
        @case ('save') {
          <path d="M6 4.5h10.2a1 1 0 0 1 .7.3l2.3 2.3a1 1 0 0 1 .3.7V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V6A1.5 1.5 0 0 1 6 4.5zM8 4.5v4.2h7.2V4.5M8 19.5v-5.7h8v5.7"/>
        }
        @case ('search') {
          <circle cx="10.8" cy="10.8" r="6.3"/><path d="M15.5 15.5l4.5 4.5"/>
        }
        @case ('star') {
          <path d="M12 3.6l2.5 5.4 5.9.7-4.4 4 1.2 5.8L12 16.5 6.8 19.5 8 13.7l-4.4-4 5.9-.7z" fill="currentColor"/>
        }
        @case ('star_outline') {
          <path d="M12 3.6l2.5 5.4 5.9.7-4.4 4 1.2 5.8L12 16.5 6.8 19.5 8 13.7l-4.4-4 5.9-.7z"/>
        }
        @case ('swap_vert') {
          <path d="M8 19.5V5M4.5 8.5L8 5l3.5 3.5M16 4.5V19M12.5 15.5L16 19l3.5-3.5"/>
        }
        @case ('sync') {
          <path d="M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4M20 11a8 8 0 0 0-14.5-4M4 4v4h4"/>
        }
        @case ('unfold_less') {
          <path d="M8 5.5l4 4 4-4M8 18.5l4-4 4 4"/>
        }
        @case ('unfold_more') {
          <path d="M8 9.5l4-4 4 4M8 14.5l4 4 4-4"/>
        }
        @case ('view_column') {
          <rect height="14" rx="2.5" width="16" x="4" y="5"/><path d="M9.5 5v14M14.5 5v14"/>
        }
      }    </svg>
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

    :dir(rtl) ng-table-icon[data-flip] {
      transform: scaleX(-1);
    }
  `,
})
export class NgTableIconComponent {
  readonly name = input.required<NgTableIconName | string>();
  protected readonly flips = computed(() => DIRECTIONAL_ICONS.has(this.name()));
}
