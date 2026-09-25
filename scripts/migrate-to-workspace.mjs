// Migration unique vers un workspace Angular standard (lib dans projects/ng-table).
// À lancer une seule fois depuis la racine du repo : `node scripts/migrate-to-workspace.mjs`
// Git détecte les déplacements comme des renommages : l'historique des fichiers est conservé.
import {existsSync, mkdirSync, renameSync, rmSync} from 'node:fs';

if (!existsSync('src') && existsSync('projects/ng-table/src')) {
  console.log('Déjà migré : rien à faire.');
  process.exit(0);
}

if (existsSync('projects/ng-table/src')) {
  console.error('projects/ng-table/src existe déjà ET src/ aussi : migration interrompue, vérifiez à la main.');
  process.exit(1);
}

mkdirSync('projects/ng-table', {recursive: true});
renameSync('src', 'projects/ng-table/src');
console.log('Déplacé : src/ -> projects/ng-table/src/');

// Remplacés par leurs équivalents dans projects/ng-table/, ou devenus inutiles.
const obsolete = [
  'ng-package.json',
  'tsconfig.lib.json',
  'tsconfig.lib.prod.json',
  'tsconfig.spec.json',
  'scratch-truncate-test.html',
  'DOCUMENTATION.md',
];
for (const file of obsolete) {
  if (existsSync(file)) {
    rmSync(file);
    console.log(`Supprimé : ${file}`);
  }
}

console.log('\nMigration terminée. Étapes suivantes :');
console.log('  npm install');
console.log('  npm run build');
console.log('  npm run test:ci');
console.log('  npm start   (application de démo)');
