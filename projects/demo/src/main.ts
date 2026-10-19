import {bootstrapApplication} from '@angular/platform-browser';
import {provideZonelessChangeDetection} from '@angular/core';
import {provideRouter, Routes, withHashLocation} from '@angular/router';
import {NG_TABLE_LOCALES, ngTableIsRtl, provideNgTableLabels} from '@sbourahla/ng-table';
import {AppComponent} from './app/app.component';

/** Langue de la démo : choisie dans l'en-tête, mémorisée, appliquée avant le démarrage (le sens de lecture suit la page). */
const storedLanguage = (() => {
  try {
    return localStorage.getItem('ngt-demo-lang');
  } catch {
    return null;
  }
})();
const language = (storedLanguage && storedLanguage in NG_TABLE_LOCALES ? storedLanguage : 'fr') as keyof typeof NG_TABLE_LOCALES;
document.documentElement.lang = language;
document.documentElement.dir = ngTableIsRtl(language) ? 'rtl' : 'ltr';

const routes: Routes = [
  {path: '', pathMatch: 'full', redirectTo: 'simple'},
  {path: 'simple', title: 'ng-table — simple', loadComponent: () => import('./app/simple-demo.component').then((m) => m.SimpleDemoComponent)},
  {path: 'avance', title: 'ng-table — avancé', loadComponent: () => import('./app/advanced-demo.component').then((m) => m.AdvancedDemoComponent)},
  {path: 'expert', title: 'ng-table — expert', loadComponent: () => import('./app/expert-demo.component').then((m) => m.ExpertDemoComponent)},
  {path: 'analyse', title: 'ng-table — analyse', loadComponent: () => import('./app/analytics-demo.component').then((m) => m.AnalyticsDemoComponent)},
  {path: 'benchmark', title: 'ng-table — benchmark', loadComponent: () => import('./app/benchmark-demo.component').then((m) => m.BenchmarkDemoComponent)},
  {path: 'live', title: 'ng-table — live', loadComponent: () => import('./app/live-demo.component').then((m) => m.LiveDemoComponent)},
  {path: '**', redirectTo: 'simple'},
];

bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection(), // Routage par « # » : la démo est servie en fichiers statiques (GitHub Pages), où recharger /demo/simple donnerait une 404.
    provideRouter(routes, withHashLocation()),
    provideNgTableLabels(() => NG_TABLE_LOCALES[language])],
}).catch((error: unknown) => console.error(error));
