// Hands this entry in: copies app/ and screenshots/ into the output
// directory, then writes dossier.json there with buildDossier from the
// vendored make.fun dossier library. Node 22, standard library only.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-frontend.ts';

const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const rootDir = new URL('.', import.meta.url).pathname;

function copyTree(name) {
  const src = join(rootDir, name);
  const dst = join(outDir, name);
  if (!existsSync(src)) return;
  rmSync(dst, { recursive: true, force: true });
  cpSync(src, dst, { recursive: true });
}

mkdirSync(outDir, { recursive: true });
for (const entry of readdirSync(rootDir)) {
  if (entry === 'app' || entry === 'screenshots') copyTree(entry);
}
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
if (dossier.length > 1572864) {
  throw new Error('dossier.json over the 1.5 MiB cap: ' + dossier.length + ' bytes');
}
// Read the directory back so a silent short write is caught here, not at the gate.
// A dossier over the cap is refused above; an empty output dir is refused here.
const made = readdirSync(outDir);
if (!made.includes('dossier.json') || !made.includes('app') || !made.includes('screenshots')) {
  throw new Error('output is missing dossier.json, app/ or screenshots/');
}
const appCount = readdirSync(join(outDir, 'app')).length;
console.log('wrote ' + join(outDir, 'dossier.json') + ' (' + dossier.length + ' bytes) from ' + appCount + ' app files');
