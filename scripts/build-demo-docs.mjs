// Compile la démo et l'installe dans le site de documentation (dist/docs/demo).
//   node scripts/build-demo-docs.mjs [base-href]      défaut : /demo/   (GitHub Pages : /ngTable/demo/)
// À lancer après `build-docs.mjs`, qui vide dist/docs. Le repli 404.html renvoie les routes (/demo/avance) vers l'application.
import {execSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, renameSync, rmSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] ?? '/demo/';
const build = join(root, 'dist/demo-build');
const target = join(root, 'dist/docs/demo');

rmSync(build, {recursive: true, force: true});
execSync(`npx ng build demo --base-href ${base} --output-path dist/demo-build`, {cwd: root, stdio: 'inherit'});
const browser = join(build, 'browser');
if (!existsSync(browser)) throw new Error(`Sortie de la démo introuvable : ${browser}`);
rmSync(target, {recursive: true, force: true});
mkdirSync(join(root, 'dist/docs'), {recursive: true});
renameSync(browser, target);
copyFileSync(join(target, 'index.html'), join(target, '404.html'));
rmSync(build, {recursive: true, force: true});
console.log(`Démo : ${target} (base ${base})`);
