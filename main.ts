// Hands this entry in: copies app/ and screenshots/ into the output
// directory, then writes dossier.json there with buildDossier from the
// vendored make.fun dossier library. Node 22, standard library only.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-frontend.ts';

const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const root = new URL('.', import.meta.url).pathname;

function ship(name) {
  const from = join(root, name);
  const to = join(outDir, name);
  if (!existsSync(from)) return;
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}

mkdirSync(outDir, { recursive: true });
for (const name of readdirSync(root)) {
  if (name === 'app' || name === 'screenshots') ship(name);
}
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
if (dossier.length > 1572864) throw new Error('dossier.json over the 1.5 MiB cap: ' + dossier.length + ' bytes');
// Read the file back so a silent short write is caught here, not at the gate.
const back = readdirSync(outDir);
if (!back.includes('dossier.json') || !back.includes('app') || !back.includes('screenshots')) {
  throw new Error('output is missing dossier.json, app/ or screenshots/');
}
const shipped = readdirSync(join(outDir, 'app'));
console.log('wrote ' + join(outDir, 'dossier.json') + ' (' + dossier.length + ' bytes) from ' + shipped.length + ' app entries');
