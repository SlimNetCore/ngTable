import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {NgTableChartComponent} from './ng-table-chart.component';
import {NgTableComponent} from './ng-table.component';
import {NG_TABLE_THEME_DARK, NG_TABLE_THEME_LIGHT, NG_TABLE_TOKENS, ngTableVar} from './theme';

describe('thème', () => {
  it('chaque jeton a une valeur claire, une valeur sombre et une description, sans doublon', () => {
    const names = NG_TABLE_TOKENS.map((token) => token.name);
    expect(new Set(names).size).toBe(names.length);
    for (const token of NG_TABLE_TOKENS) {
      expect(token.light, token.name).not.toBe('');
      expect(token.dark, token.name).not.toBe('');
      expect(token.description, token.name).not.toBe('');
      expect(token.dark, `${token.name} : le thème sombre doit différer du thème clair`).not.toBe(token.light);
    }
  });

  it('les deux thèmes se lisent comme des variables CSS --ngt-*', () => {
    expect(Object.keys(NG_TABLE_THEME_LIGHT)).toEqual(Object.keys(NG_TABLE_THEME_DARK));
    expect(NG_TABLE_THEME_DARK['--ngt-primary']).toBe('#7fb4d6');
    expect(NG_TABLE_THEME_LIGHT['--ngt-surface']).toBe('#ffffff');
  });

  it('ngTableVar lit le jeton public, puis les anciens noms --app-*, puis la valeur claire', () => {
    expect(ngTableVar('primary')).toBe('var(--ngt-primary, var(--app-primary, #3a7ca5))');
    expect(ngTableVar('text-muted')).toBe('var(--ngt-text-muted, var(--app-muted, var(--app-text-muted, #4f6573)))');
    expect(ngTableVar('danger')).toBe('var(--ngt-danger, var(--mat-sys-error, #b3261e))');
    expect(() => ngTableVar('inconnu')).toThrow();
  });

  it('[theme] pose l’attribut data-ngt-theme sur la table et sur le graphique ; sans valeur, rien', async () => {
    const table = TestBed.createComponent(NgTableComponent);
    table.componentRef.setInput('columns', []);
    table.componentRef.setInput('rows', []);
    await table.whenStable();
    expect((table.nativeElement as HTMLElement).hasAttribute('data-ngt-theme')).toBe(false);
    table.componentRef.setInput('theme', 'dark');
    await table.whenStable();
    expect((table.nativeElement as HTMLElement).getAttribute('data-ngt-theme')).toBe('dark');

    const chart = TestBed.createComponent(NgTableChartComponent);
    chart.componentRef.setInput('theme', 'auto');
    await chart.whenStable();
    expect((chart.nativeElement as HTMLElement).getAttribute('data-ngt-theme')).toBe('auto');
  });
});
