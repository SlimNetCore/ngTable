// Génère `projects/ng-table/src/lib/theme.css` (règles du thème sombre) depuis la table de jetons de `theme.ts`.
// Le compilateur Angular n'évalue pas d'appel de fonction dans `styles` : les règles sont donc écrites dans un fichier.
//
//   node scripts/generate-theme-css.mjs          écrit le fichier
//   node scripts/generate-theme-css.mjs --check  échoue s'il n'est pas à jour (à lancer en intégration continue)
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {dirname, join} from 'node:path';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lib = join(root, 'projects/ng-table/src/lib');
const source = readFileSync(join(lib, 'theme.ts'), 'utf8');
const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const theme = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

// .ngt-overlay : les panneaux (menus, listes) que la bibliothèque pose dans <body>, hors de l'élément thémé.
const ELEMENTS = ['ng-table', 'ng-table-chart', 'ng-table-pivot', 'ng-table-sparkline', '.ngt-overlay'];
const dark = [
  ...theme.NG_TABLE_TOKENS.map((token) => `  --ngt-${token.name}: ${token.dark};`),
  ...Object.entries(theme.NG_TABLE_MATERIAL_BRIDGE).map(([name, value]) => `  ${name}: ${value};`),
].join('\n');
const selectors = ['.ngt-dark', ...ELEMENTS.map((element) => `${element}[data-ngt-theme='dark']`)].join(',\n');
const autoSelectors = ELEMENTS.map((element) => `    ${element}[data-ngt-theme='auto']`).join(',\n');

const css = `/* Généré par scripts/generate-theme-css.mjs depuis theme.ts : ne pas modifier à la main. */

/* Thème sombre : \`[theme]="'dark'"\` sur le composant, ou la classe \`ngt-dark\` sur <html> / <body> (elle thème aussi
   les menus et filtres ouverts en surcouche). */
${selectors} {
${dark}
  color-scheme: dark;
}

/* \`[theme]="'auto'"\` : suit le réglage du système. */
@media (prefers-color-scheme: dark) {
${autoSelectors} {
${dark.replace(/^/gm, '  ')}
    color-scheme: dark;
  }
}

${ELEMENTS.map((element) => `${element}[data-ngt-theme='light']`).join(',\n')} {
  color-scheme: light;
}
`;

const target = join(lib, 'theme.css');
if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    // fichier absent
  }
  if (current.replace(/\r\n/g, '\n') !== css) {
    console.error('theme.css n’est pas à jour : lancez `node scripts/generate-theme-css.mjs`.');
    process.exit(1);
  }
  console.log('theme.css est à jour.');
} else {
  writeFileSync(target, css);
  console.log(`theme.css écrit (${theme.NG_TABLE_TOKENS.length} jetons).`);
}
