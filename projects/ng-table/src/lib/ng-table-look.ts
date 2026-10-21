import {DOCUMENT} from '@angular/common';
import {EnvironmentProviders, inject, InjectionToken, makeEnvironmentProviders, provideEnvironmentInitializer} from '@angular/core';

/** Apparence générale : `default` (texte et icônes au trait, traits grisés) ou `material` (texte noir, icônes pleines, lignes de la grille noires). */
export type NgTableLook = 'default' | 'material';

/** Style des icônes : `outline` (au trait, défaut) ou `filled` (pleines, tracés Material Icons). */
export const NG_TABLE_ICON_STYLE = new InjectionToken<'outline' | 'filled'>('NG_TABLE_ICON_STYLE', {
  providedIn: 'root',
  factory: () => 'outline',
});

/** Classe posée sur `<html>` par l'apparence « material » : elle redéfinit les jetons de texte (voir `theme.css`) et noircit les lignes de la grille. */
export const NG_TABLE_LOOK_CLASS = 'ngt-look-material';

/**
 * Choisit l'apparence de toutes les tables de l'application.
 *
 * ```ts
 * bootstrapApplication(App, {providers: [provideNgTableLook('material')]});
 * ```
 *
 * `material` : le rendu d'un tableau Angular Material : texte noir (blanc en thème sombre), icônes pleines, lignes de la grille
 * noires, police de la page. Les boutons, champs et cartes gardent leurs traits habituels. Ce préréglage pose la classe
 * `ngt-look-material` sur `<html>` (les couleurs viennent de `theme.css`, déjà embarqué par les composants) et charge les icônes
 * pleines ; tout reste réglable avec les jetons `--ngt-*`. Sans le fournisseur, on peut poser la classe à la main : on obtient
 * alors le texte noir et les lignes noires, avec les icônes au trait.
 */
export function provideNgTableLook(look: NgTableLook): EnvironmentProviders {
  return makeEnvironmentProviders([
    {provide: NG_TABLE_ICON_STYLE, useValue: look === 'material' ? 'filled' : 'outline'},
    provideEnvironmentInitializer(() => {
      inject(DOCUMENT).documentElement.classList.toggle(NG_TABLE_LOOK_CLASS, look === 'material');
    }),
  ]);
}
