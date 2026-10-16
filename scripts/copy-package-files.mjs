// Copie dans le paquet publié (dist/ng-table) ce que npm doit montrer :
//  - README, LICENSE, CHANGELOG (npm n'affiche que le README présent dans le paquet lui-même) ;
//  - le site de documentation (dist/docs, sans la démo) dans docs/, s'il a été généré : `npm run docs:build`.
import {copyFileSync, cpSync, existsSync} from 'node:fs';

const dest = 'dist/ng-table';
if (!existsSync(dest)) {
  console.error(`${dest} introuvable : lancez d'abord \`ng build ng-table\`.`);
  process.exit(1);
}

for (const file of ['README.md', 'LICENSE', 'CHANGELOG.md']) {
  copyFileSync(file, `${dest}/${file}`);
  console.log(`Copié : ${file} -> ${dest}/${file}`);
}

if (existsSync('dist/docs/index.html')) {
  cpSync('dist/docs', `${dest}/docs`, {recursive: true, filter: (source) => !/[\\/]docs[\\/]demo([\\/]|$)/.test(source)});
  console.log(`Copié : dist/docs (sans la démo) -> ${dest}/docs`);
} else {
  console.log('Documentation non générée (npm run docs:build) : non incluse dans le paquet.');
}
