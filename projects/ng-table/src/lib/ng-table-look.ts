import {DOCUMENT} from '@angular/common';
import {EnvironmentProviders, inject, InjectionToken, makeEnvironmentProviders, provideEnvironmentInitializer} from '@angular/core';

/** Apparence générale : `default` (traits fins grisés, icônes au trait) ou `contrast` (traits et texte noirs, icônes pleines). */
export type NgTableLook = 'default' | 'contrast';

/** Style des icônes : `outline` (au trait, défaut) ou `filled` (pleines, tracés Material Icons). */
export const NG_TABLE_ICON_STYLE = new InjectionToken<'outline' | 'filled'>('NG_TABLE_ICON_STYLE', {
  providedIn: 'root',
  factory: () => 'outline',
});

/** Classe posée sur `<html>` par l'apparence « contrasté » : elle redéfinit les jetons `--ngt-*` (voir `theme.css`). */
export const NG_TABLE_CONTRAST_CLASS = 'ngt-contrast';

/**
 * Choisit l'apparence de toutes les tables de l'application.
 *
 * ```ts
 * bootstrapApplication(App, {providers: [provideNgTableLook('contrast')]});
 * ```
 *
 * `contrast` : texte et traits noirs (blancs en thème sombre), icônes pleines, police de la page. Ce préréglage pose la
 * classe `ngt-contrast` sur `<html>` (les couleurs viennent de `theme.css`, déjà embarqué par les composants) et charge les
 * icônes pleines ; tout reste réglable avec les jetons `--ngt-*`. Sans le fournisseur, on peut poser la classe à la main :
 * on obtient alors les traits et le texte noirs, avec les icônes au trait.
 */
export function provideNgTableLook(look: NgTableLook): EnvironmentProviders {
  return makeEnvironmentProviders([
    {provide: NG_TABLE_ICON_STYLE, useValue: look === 'contrast' ? 'filled' : 'outline'},
    provideEnvironmentInitializer(() => {
      inject(DOCUMENT).documentElement.classList.toggle(NG_TABLE_CONTRAST_CLASS, look === 'contrast');
    }),
  ]);
}
