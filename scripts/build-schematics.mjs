// Compile le schéma `ng add` de la bibliothèque (TypeScript -> CommonJS) et copie ses fichiers JSON : ng-packagr ne
// compile pas les schémas.
//
//   node scripts/build-schematics.mjs [dossier de sortie]      défaut : dist/ng-table/schematics
import {copyFileSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'projects/ng-table/schematics');
const ts = createRequire(join(root, 'package.json'))('typescript');

export function buildSchematics(out = join(root, 'dist/ng-table/schematics')) {
  mkdirSync(join(out, 'ng-add'), {recursive: true});
  const code = ts.transpileModule(readFileSync(join(source, 'ng-add/index.ts'), 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true},
  }).outputText;
  writeFileSync(join(out, 'ng-add/index.js'), code);
  copyFileSync(join(source, 'collection.json'), join(out, 'collection.json'));
  copyFileSync(join(source, 'ng-add/schema.json'), join(out, 'ng-add/schema.json'));
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`Schéma ng add compilé dans ${buildSchematics(process.argv[2] ? join(root, process.argv[2]) : undefined)}`);
}