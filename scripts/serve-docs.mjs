// Sert le site de documentation généré (dist/docs) pour le consulter en local.
//   node scripts/serve-docs.mjs [port] [dossier]
import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const port = Number(process.argv[2] ?? 4400);
const dir = join(root, process.argv[3] ?? 'dist/docs');
const types = {'.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml'};

createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  let file = normalize(join(dir, path === '/' ? 'index.html' : path));
  if (!file.startsWith(dir)) {
    response.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    response.writeHead(200, {'content-type': types[extname(file)] ?? 'application/octet-stream'}).end(await readFile(file));
  } catch {
    // Routes de la démo (/demo/avance) : repli sur l'application, comme le 404.html de GitHub Pages.
    if (path.startsWith('/demo/')) {
      response.writeHead(200, {'content-type': types['.html']}).end(await readFile(join(dir, 'demo/index.html')).catch(() => 'Démo non compilée : npm run docs:demo'));
      return;
    }
    response.writeHead(404, {'content-type': 'text/plain; charset=utf-8'}).end('Page introuvable');
  }
}).listen(port, () => console.log(`Documentation sur http://localhost:${port}`));