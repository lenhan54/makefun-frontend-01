// Hands this entry in: copies app/ and screenshots/ into the output
// directory, then writes dossier.json there with buildDossier from the
// vendored make.fun dossier library. Node 22, standard library only.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-frontend.ts';

const dest = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const here = new URL('.', import.meta.url).pathname;

function copyDir(name) {
  const from = join(here, name);
  const to = join(dest, name);
  if (!existsSync(from)) return;
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}

mkdirSync(dest, { recursive: true });
for (const name of readdirSync(here)) {
  if (name === 'app' || name === 'screenshots') copyDir(name);
}
const dossier = buildDossier(dest, {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
});
writeFileSync(join(dest, 'dossier.json'), dossier);
if (dossier.length > 1572864) throw new Error('dossier.json over the 1.5 MiB cap: ' + dossier.length + ' bytes');
// Read the directory back so a silent short write is caught here, not at the gate.
const present = readdirSync(dest);
if (!present.includes('dossier.json') || !present.includes('app') || !present.includes('screenshots')) {
  throw new Error('output is missing dossier.json, app/ or screenshots/');
}
const appEntries = readdirSync(join(dest, 'app'));
console.log('wrote ' + join(dest, 'dossier.json') + ' (' + dossier.length + ' bytes) from ' + appEntries.length + ' app files');
