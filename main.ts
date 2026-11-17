// Hand this entry in (Node 22, standard library only): copy app/ and
// screenshots/ from beside this file to /output and write
// /output/dossier.json with the vendored make.fun library. The scorer
// rebuilds the dossier from the same library and compares byte for byte,
// so vendor/makefun-frontend.ts is left exactly as the kit shipped it.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
if (!existsSync(join(here, 'app'))) throw new Error('app/ is missing from the repository');

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// Caps from the gate: at most 3 screenshots, each at most 256 KiB; app/
// at most 993 files and directories and 16 MiB; the dossier text cap.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 3, max_bytes: 262144 }, app_max_files: 993, app_max_bytes: 16777216 }),
);
