import {Directionality} from '@angular/cdk/bidi';
import {provideZonelessChangeDetection} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {NG_TABLE_DEFAULT_LABELS, NG_TABLE_LABELS_EN, NgTableLabels} from './ng-table-labels';
import {NG_TABLE_LABELS_AR, NG_TABLE_LABELS_DE, NG_TABLE_LABELS_ES, NG_TABLE_LOCALES, ngTableIsRtl, ngTableLabelsFor} from './ng-table-labels-locales';
import {NgTableComponent} from './ng-table.component';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('textes par langue', () => {
  const reference = NG_TABLE_DEFAULT_LABELS as unknown as Record<string, string>;

  for (const [language, labels] of Object.entries(NG_TABLE_LOCALES)) {
    it(`${language} : mêmes clés que le français, aucun texte vide, mêmes {paramètres}`, () => {
      const set = labels as unknown as Record<string, string>;
      expect(Object.keys(set).sort()).toEqual(Object.keys(reference).sort());
      for (const key of Object.keys(reference)) {
        expect(set[key], `${language}.${key}`).toBeTruthy();
        expect(placeholders(set[key]), `${language}.${key} : {paramètres}`).toEqual(placeholders(reference[key]));
      }
    });
  }

  it('espagnol, allemand et arabe sont réellement traduits (pas des copies du français ou de l’anglais)', () => {
    for (const labels of [NG_TABLE_LABELS_ES, NG_TABLE_LABELS_DE, NG_TABLE_LABELS_AR]) {
      expect(labels.columnsButton).not.toBe(NG_TABLE_DEFAULT_LABELS.columnsButton);
      expect(labels.columnsButton).not.toBe(NG_TABLE_LABELS_EN.columnsButton);
      expect(labels.filterBy).toContain('{field}');
    }
    expect(NG_TABLE_LABELS_AR.columnsButton).toMatch(/[؀-ۿ]/);
  });

  it('ngTableLabelsFor : langue ou région, repli sur le français ; ngTableIsRtl : langues de droite à gauche', () => {
    expect(ngTableLabelsFor('de-AT')).toBe(NG_TABLE_LABELS_DE);
    expect(ngTableLabelsFor('es_MX')).toBe(NG_TABLE_LABELS_ES);
    expect(ngTableLabelsFor('EN')).toBe(NG_TABLE_LABELS_EN);
    expect(ngTableLabelsFor('ja')).toBe(NG_TABLE_DEFAULT_LABELS);
    expect(ngTableIsRtl('ar-EG')).toBe(true);
    expect(ngTableIsRtl('he')).toBe(true);
    expect(ngTableIsRtl('fr')).toBe(false);
  });
});

describe('sens de lecture', () => {
  beforeEach(() => TestBed.configureTestingModule({providers: [provideZonelessChangeDetection()]}));

  async function create(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(NgTableComponent);
    fixture.componentRef.setInput('columns', [{id: 'a', header: 'A', valueAccessor: (r: {a: string}) => r.a}]);
    fixture.componentRef.setInput('rows', [{a: 'x'}]);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
    return fixture;
  }

  it('[dir]="\'rtl\'" pose dir="rtl" sur le tableau et le CDK en tient compte pour les colonnes figées', async () => {
    const fixture = await create({dir: 'rtl'});
    expect((fixture.nativeElement as HTMLElement).getAttribute('dir')).toBe('rtl');
    expect(fixture.debugElement.injector.get(Directionality).value).toBe('rtl');
  });

  it('sans [dir], le tableau suit le sens de lecture de la page', async () => {
    const fixture = await create({});
    expect(fixture.debugElement.injector.get(Directionality).value).toBe('ltr');
  });

  it('page de droite à gauche : le CDK du tableau (colonnes figées) lit aussi « rtl », et [dir]="\'ltr\'" peut le contredire', async () => {
    document.documentElement.dir = 'rtl';
    try {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({providers: [provideZonelessChangeDetection()]});
      const inherited = await create({});
      expect(inherited.debugElement.injector.get(Directionality).value).toBe('rtl');
      expect((inherited.nativeElement as HTMLElement).getAttribute('dir')).toBe('rtl');
      const forced = await create({dir: 'ltr'});
      expect(forced.debugElement.injector.get(Directionality).value).toBe('ltr');
    } finally {
      document.documentElement.removeAttribute('dir');
    }
  });

  it('les libellés arabes s’appliquent par [labels]', async () => {
    const fixture = await create({dir: 'rtl', labels: NG_TABLE_LABELS_AR as NgTableLabels, columnsMenuEnabled: true});
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('الأعمدة');
  });
});
