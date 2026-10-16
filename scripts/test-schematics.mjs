// Teste le schéma `ng add` dans un vrai espace de travail Angular généré en mémoire (SchematicTestRunner).
//   node --test scripts/test-schematics.mjs
import assert from 'node:assert/strict';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {test, before} from 'node:test';
import {buildSchematics} from './build-schematics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const {SchematicTestRunner} = require('@angular-devkit/schematics/testing');

let runner;
let workspaceTree;

/** Dans `dist/` : le schéma compilé doit pouvoir résoudre `@angular-devkit/schematics` depuis les node_modules du dépôt. */
before(async () => {
  const out = buildSchematics(join(root, 'dist/schematics-test'));
  runner = new SchematicTestRunner('@sbourahla/ng-table', join(out, 'collection.json'));
  const ng = new SchematicTestRunner('@schematics/angular', join(root, 'node_modules/@schematics/angular/collection.json'));
  const workspace = await ng.runSchematic('workspace', {name: 'espace', newProjectRoot: 'projects', version: '22.0.0'});
  workspaceTree = await ng.runSchematic('application', {name: 'demo', projectRoot: '', standalone: true, routing: false, style: 'css', skipTests: true}, workspace);
  // Le schéma `workspace` ne crée pas toujours package.json avec @angular/core : on y met ce qu'aurait un vrai projet.
  const packageJson = workspaceTree.exists('package.json') ? JSON.parse(workspaceTree.readText('package.json')) : {name: 'espace'};
  packageJson.dependencies = {...packageJson.dependencies, '@angular/core': '^22.0.0'};
  if (workspaceTree.exists('package.json')) {
    workspaceTree.overwrite('package.json', JSON.stringify(packageJson, null, 2));
  } else {
    workspaceTree.create('package.json', JSON.stringify(packageJson, null, 2));
  }
});

const run = (options) => runner.runSchematic('ng-add', {skipInstall: true, ...options}, workspaceTree.branch());

test('ajoute @angular/cdk à la version d’Angular, sans installer quand skipInstall est demandé', async () => {
  const tree = await run({});
  const dependencies = JSON.parse(tree.readText('package.json')).dependencies;
  assert.equal(dependencies['@angular/cdk'], '^22.0.0');
});

test('une langue déclare provideNgTableLabels dans les fournisseurs de l’application', async () => {
  const tree = await run({locale: 'es'});
  const config = tree.readText('src/app/app.config.ts');
  assert.match(config, /import \{[^}]*NG_TABLE_LOCALES[^}]*\} from '@sbourahla\/ng-table'/);
  assert.match(config, /import \{[^}]*provideNgTableLabels[^}]*\} from '@sbourahla\/ng-table'/);
  assert.match(config, /provideNgTableLabels\(\(\) => NG_TABLE_LOCALES\['es'\]\)/);
  assert.match(tree.readText('src/index.html'), /<html[^>]*lang="es"/);
  assert.doesNotMatch(tree.readText('src/index.html'), /dir="rtl"/);
});

test('l’arabe pose aussi dir="rtl" sur <html>, sans doubler lang ni dir', async () => {
  const tree = await run({locale: 'ar'});
  const html = tree.readText('src/index.html');
  assert.equal((html.match(/\blang=/g) ?? []).length, 1);
  assert.match(html, /<html[^>]*lang="ar"[^>]*dir="rtl"/);
  const again = await runner.runSchematic('ng-add', {skipInstall: true, locale: 'ar'}, tree);
  assert.equal((again.readText('src/index.html').match(/dir="rtl"/g) ?? []).length, 1);
});

test('sans langue, aucun fournisseur n’est ajouté', async () => {
  const tree = await run({locale: 'none'});
  assert.doesNotMatch(tree.readText('src/app/app.config.ts'), /provideNgTableLabels/);
});

test('un projet inconnu est refusé avec un message clair', async () => {
  await assert.rejects(run({project: 'nexiste-pas'}), /introuvable/);
});