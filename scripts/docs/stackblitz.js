// Bouton « Ouvrir dans StackBlitz » : envoie un petit projet Angular (le Quick Start) à StackBlitz par formulaire.
// La version de @sbourahla/ng-table installée est celle de la documentation (attribut data-version du bouton).
(() => {
  const files = (version) => ({
    'package.json': JSON.stringify(
      {
        name: 'ng-table-sandbox',
        private: true,
        scripts: {start: 'ng serve', build: 'ng build'},
        dependencies: {
          '@angular/cdk': '^22.0.0',
          '@angular/common': '^22.0.0',
          '@angular/compiler': '^22.0.0',
          '@angular/core': '^22.0.0',
          '@angular/platform-browser': '^22.0.0',
          '@angular/router': '^22.0.0',
          '@sbourahla/ng-table': `^${version}`,
          rxjs: '^7.8.0',
          tslib: '^2.3.0',
        },
        devDependencies: {'@angular/build': '^22.0.0', '@angular/cli': '^22.0.0', '@angular/compiler-cli': '^22.0.0', typescript: '>=6.0 <6.1'},
      },
      null,
      2,
    ),
    'angular.json': JSON.stringify(
      {
        $schema: './node_modules/@angular/cli/lib/config/schema.json',
        version: 1,
        projects: {
          sandbox: {
            projectType: 'application',
            root: '',
            sourceRoot: 'src',
            prefix: 'app',
            architect: {
              build: {builder: '@angular/build:application', options: {browser: 'src/main.ts', tsConfig: 'tsconfig.json', index: 'src/index.html', styles: ['src/styles.css']}},
              serve: {builder: '@angular/build:dev-server', options: {buildTarget: 'sandbox:build'}},
            },
          },
        },
      },
      null,
      2,
    ),
    'tsconfig.json': JSON.stringify(
      {compileOnSave: false, compilerOptions: {strict: true, skipLibCheck: true, moduleResolution: 'bundler', target: 'ES2022', module: 'preserve', experimentalDecorators: true, importHelpers: true}, files: ['src/main.ts'], include: ['src/**/*.ts']},
      null,
      2,
    ),
    'src/index.html': '<!doctype html>\n<html lang="fr">\n<head><meta charset="utf-8"><title>ng-table</title><base href="/"><meta name="viewport" content="width=device-width, initial-scale=1"></head>\n<body><app-root></app-root></body>\n</html>\n',
    'src/styles.css': 'body { margin: 16px; font-family: system-ui, sans-serif; }\n',
    'src/main.ts': "import {bootstrapApplication} from '@angular/platform-browser';\nimport {provideZonelessChangeDetection} from '@angular/core';\nimport {AppComponent} from './app/app.component';\n\nbootstrapApplication(AppComponent, {providers: [provideZonelessChangeDetection()]}).catch(console.error);\n",
    'src/app/app.component.ts':
      "import {Component, signal} from '@angular/core';\nimport {NgTableColumn, NgTableComponent} from '@sbourahla/ng-table';\n\ninterface User {\n  id: string;\n  name: string;\n  email: string;\n  active: boolean;\n}\n\n@Component({\n  selector: 'app-root',\n  imports: [NgTableComponent],\n  template: `<ng-table [columns]=\"columns\" [rows]=\"rows()\" />`,\n})\nexport class AppComponent {\n  readonly rows = signal<User[]>([\n    {id: '1', name: 'Alice', email: 'alice@example.com', active: true},\n    {id: '2', name: 'Bob', email: 'bob@example.com', active: false},\n    {id: '3', name: 'Chloé', email: 'chloe@example.com', active: true},\n  ]);\n\n  readonly columns: NgTableColumn<User>[] = [\n    {id: 'name', header: 'Nom', valueAccessor: (user) => user.name, sortable: true, filter: {type: 'text'}},\n    {id: 'email', header: 'Email', valueAccessor: (user) => user.email, sortable: true},\n    {id: 'active', header: 'Actif', valueAccessor: (user) => user.active, filter: {type: 'boolean'}},\n  ];\n}\n",
  });

  document.querySelectorAll('[data-stackblitz]').forEach((button) => {
    button.addEventListener('click', () => {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = 'https://stackblitz.com/run?file=src/app/app.component.ts';
      form.target = '_blank';
      const add = (name, value) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.append(input);
      };
      add('project[title]', 'ng-table — bac à sable');
      add('project[description]', 'Quick Start de @sbourahla/ng-table');
      add('project[template]', 'node');
      for (const [path, content] of Object.entries(files(button.dataset.version ?? 'latest'))) add(`project[files][${path}]`, content);
      document.body.append(form);
      form.submit();
      form.remove();
    });
  });
})();
