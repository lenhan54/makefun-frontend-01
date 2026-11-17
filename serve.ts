// A tiny static server for app/: index.html at / and every file under app/.
// Node 22, standard library only. Run: node serve.ts [--port 8080]
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';

const APP = new URL('./app/', import.meta.url).pathname;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function portFromArgs() {
  const at = process.argv.indexOf('--port');
  if (at >= 0 && process.argv[at + 1]) return Number(process.argv[at + 1]);
  return 8080;
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  const path = decodeURIComponent(url.pathname);
  const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
  const file = join(APP, normalize(rel));
  if (!file.startsWith(APP) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found: ' + path);
    return;
  }
  const type = TYPES[extname(file)] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(readFileSync(file));
});

const port = portFromArgs();
server.listen(port, () => console.log('serving app/ at http://localhost:' + port));
