// Copie README et LICENSE (à la racine du repo, pour GitHub) dans le paquet publié :
// npm n'affiche que le README présent dans le paquet lui-même.
import {copyFileSync, existsSync} from 'node:fs';

const dest = 'dist/ng-table';
if (!existsSync(dest)) {
  console.error(`${dest} introuvable : lancez d'abord \`ng build ng-table\`.`);
  process.exit(1);
}

for (const file of ['README.md', 'LICENSE']) {
  copyFileSync(file, `${dest}/${file}`);
  console.log(`Copié : ${file} -> ${dest}/${file}`);
}
