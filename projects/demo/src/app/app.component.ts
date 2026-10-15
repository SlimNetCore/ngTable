import {ChangeDetectionStrategy, Component, effect, signal} from '@angular/core';
import {RouterLink, RouterLinkActive, RouterOutlet} from '@angular/router';

type DemoTheme = 'light' | 'dark' | 'auto';
const STORAGE_KEY = 'ngt-demo-theme';

function storedTheme(): DemoTheme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * Coquille de la démo : trois niveaux d'usage de ng-table, un par route.
 * Importe `@sbourahla/ng-table` depuis les SOURCES (paths du tsconfig racine) :
 * une modification de la lib est visible immédiatement, sans rebuild.
 *
 * Le sélecteur de thème pose la classe `ngt-dark` sur `<html>` : c'est la méthode qui thème aussi les menus et listes
 * ouverts en surcouche, et la démo elle-même (variables `--demo-*`).
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; max-width: 1500px; margin: 0 auto; padding: 24px 16px; }
    header { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    h1 { margin: 0; font-size: 1.5rem; font-weight: 650; letter-spacing: -0.01em; }
    .tools { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    nav { display: flex; gap: 4px; padding: 4px; background: var(--demo-surface); border: 1px solid var(--demo-border); border-radius: 999px; }
    nav a { padding: 8px 18px; border-radius: 999px; color: var(--demo-muted); text-decoration: none; font-weight: 500; transition: background-color .15s ease, color .15s ease; }
    nav a:hover { color: var(--demo-text); }
    nav a small { display: block; font-size: .7rem; font-weight: 400; }
    nav a.active { background: var(--demo-accent); color: var(--demo-surface); }
    nav a:focus-visible, .theme button:focus-visible { outline: 2px solid var(--demo-accent); outline-offset: 2px; }
    .theme { display: inline-flex; padding: 3px; background: var(--demo-surface); border: 1px solid var(--demo-border); border-radius: 999px; }
    .theme button { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: 0; border-radius: 999px; background: none; color: var(--demo-muted); font: inherit; font-size: .8rem; cursor: pointer; }
    .theme button[aria-pressed='true'] { background: color-mix(in srgb, var(--demo-accent) 16%, transparent); color: var(--demo-text); }
    .theme svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  `,
  template: `
    <header>
      <h1>ng-table — démo</h1>
      <div class="tools">
        <nav aria-label="Mode de démonstration">
          @for (mode of modes; track mode.path) {
            <a [routerLink]="mode.path" routerLinkActive="active" ariaCurrentWhenActive="page">
              {{ mode.label }}<small>{{ mode.hint }}</small>
            </a>
          }
        </nav>
        <div aria-label="Thème" class="theme" role="group">
          <button (click)="theme.set('light')" [attr.aria-pressed]="theme() === 'light'" type="button">
            <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>
            Clair
          </button>
          <button (click)="theme.set('dark')" [attr.aria-pressed]="theme() === 'dark'" type="button">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>
            Sombre
          </button>
          <button (click)="theme.set('auto')" [attr.aria-pressed]="theme() === 'auto'" type="button">
            <svg aria-hidden="true" viewBox="0 0 24 24"><rect height="12" rx="2" width="18" x="3" y="4"/><path d="M8 20h8M12 16v4"/></svg>
            Auto
          </button>
        </div>
      </div>
    </header>
    <router-outlet/>
  `,
})
export class AppComponent {
  protected readonly modes = [
    {path: '/simple', label: 'Simple', hint: 'le minimum'},
    {path: '/avance', label: 'Avancé', hint: 'toutes les options'},
    {path: '/expert', label: 'Expert', hint: 'serveur, contrôle, API'},
    {path: '/live', label: 'Live', hint: 'flux temps réel'},
    {path: '/analyse', label: 'Analyse', hint: 'pivot, graphiques'},
    {path: '/benchmark', label: 'Benchmark', hint: 'face à AG Grid'},
  ];

  protected readonly theme = signal<DemoTheme>(storedTheme());

  constructor() {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const mode = this.theme();
      document.documentElement.classList.toggle('ngt-dark', mode === 'dark' || (mode === 'auto' && query.matches));
    };
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, this.theme());
      } catch {
        // stockage indisponible : le choix vaut pour la session
      }
      apply();
    });
    query.addEventListener('change', apply);
  }
}