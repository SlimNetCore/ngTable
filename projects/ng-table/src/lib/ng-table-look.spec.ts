import {Component, provideZonelessChangeDetection} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {FILLED_ICON_PATHS} from './ng-table-icons-filled';
import {NgTableIconComponent, NgTableIconName} from './ng-table-icon.component';
import {NG_TABLE_LOOK_CLASS, NG_TABLE_ICON_STYLE, provideNgTableLook} from './ng-table-look';
import {NG_TABLE_LOOK_OVERRIDES} from './theme';

@Component({imports: [NgTableIconComponent], template: `<ng-table-icon [name]="name"/>`})
class HostComponent {
  name: NgTableIconName | string = 'filter_alt_off';
}

function render(look?: 'default' | 'material') {
  TestBed.configureTestingModule({providers: [provideZonelessChangeDetection(), ...(look ? [provideNgTableLook(look)] : [])]});
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return fixture;
}

describe('apparence (provideNgTableLook)', () => {
  beforeEach(() => document.documentElement.classList.remove(NG_TABLE_LOOK_CLASS));
  afterEach(() => document.documentElement.classList.remove(NG_TABLE_LOOK_CLASS));

  it('par défaut : icônes au trait, aucune classe sur <html>', () => {
    const fixture = render();
    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    expect(TestBed.inject(NG_TABLE_ICON_STYLE)).toBe('outline');
    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(document.documentElement.classList.contains(NG_TABLE_LOOK_CLASS)).toBe(false);
  });

  it('« material » : icônes pleines et classe ngt-look-material sur <html>', () => {
    const fixture = render('material');
    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    expect(TestBed.inject(NG_TABLE_ICON_STYLE)).toBe('filled');
    expect(svg.getAttribute('fill')).toBe('currentColor');
    expect(svg.getAttribute('stroke')).toBeNull();
    expect(svg.querySelector('path')!.getAttribute('d')).toBe(FILLED_ICON_PATHS['filter_alt_off']);
    expect(document.documentElement.classList.contains(NG_TABLE_LOOK_CLASS)).toBe(true);
  });

  it('« default » retire la classe', () => {
    document.documentElement.classList.add(NG_TABLE_LOOK_CLASS);
    render('default');
    expect(document.documentElement.classList.contains(NG_TABLE_LOOK_CLASS)).toBe(false);
  });

  it('une icône sans version pleine retombe sur le trait', () => {
    const fixture = TestBed.configureTestingModule({providers: [provideZonelessChangeDetection(), provideNgTableLook('material')]}).createComponent(HostComponent);
    fixture.componentInstance.name = 'inconnue';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('svg').getAttribute('fill')).toBe('none');
  });

  it('chaque icône au trait a son équivalent plein', () => {
    const names: NgTableIconName[] = [
      'account_tree', 'add', 'bookmark', 'check', 'chevron_right', 'close', 'content_copy', 'delete', 'dock_to_left', 'download', 'drag_indicator',
      'expand_more', 'file_download', 'file_upload', 'filter_alt', 'filter_alt_off', 'more_horiz', 'north', 'push_pin', 'radio_button_checked',
      'radio_button_unchecked', 'save', 'search', 'south', 'star', 'star_outline', 'swap_vert', 'sync', 'unfold_less', 'unfold_more', 'view_column',
    ];
    expect(names.filter((name) => !FILLED_ICON_PATHS[name])).toEqual([]);
  });

  it('seul le texte est redéfini : noir en clair, blanc en sombre ; les traits des boutons et des champs ne bougent pas', () => {
    expect(NG_TABLE_LOOK_OVERRIDES.light).toEqual({'--ngt-text': '#000000', '--ngt-text-muted': '#000000'});
    expect(NG_TABLE_LOOK_OVERRIDES.dark).toEqual({'--ngt-text': '#ffffff', '--ngt-text-muted': '#ffffff'});
  });
});
