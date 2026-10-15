// Empaquette `ng-table.worker.ts` (et les modules purs qu'il importe) en une source JavaScript unique, écrite dans
// `projects/ng-table/src/lib/worker-source.generated.ts`. La table la charge dans un `Blob` : une bibliothèque Angular ne
// peut pas livrer un fichier worker que l'application empaquetterait, et ainsi aucun réglage n'est demandé à l'application.
//
//   node scripts/bundle-worker.mjs          écrit le fichier
//   node scripts/bundle-worker.mjs --check  échoue s'il n'est pas à jour (intégration continue)
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {build} from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lib = join(root, 'projects/ng-table/src/lib');
const target = join(lib, 'worker-source.generated.ts');

const result = await build({
  entryPoints: [join(lib, 'ng-table.worker.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  logLevel: 'silent',
});
const code = result.outputFiles[0].text.trim();

const source = `/* Généré par scripts/bundle-worker.mjs depuis ng-table.worker.ts : ne pas modifier à la main. */

/** Source du Web Worker de calcul (tri, filtres, recherche), chargée dans un \`Blob\`. */
export const NG_TABLE_WORKER_SOURCE = ${JSON.stringify(code)};
`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    // fichier absent
  }
  if (current.replace(/\r\n/g, '\n') !== source) {
    console.error('worker-source.generated.ts n’est pas à jour : lancez `node scripts/bundle-worker.mjs`.');
    process.exit(1);
  }
  console.log('worker-source.generated.ts est à jour.');
} else {
  writeFileSync(target, source);
  console.log(`worker-source.generated.ts écrit (${code.length} caractères).`);
}
