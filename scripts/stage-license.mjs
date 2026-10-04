/**
 * Copy the repository's single LICENSE into a package directory.
 *
 *   node scripts/stage-license.mjs <package-dir>
 *
 * npm and PyPI both expect the licence text to travel with the artefact, and
 * npm will not look outside the package directory to find it. There is one
 * canonical LICENSE at the repository root, so it is copied in at pack time
 * rather than committed four times over, where one edit would leave three of
 * the copies quietly stale.
 *
 * The copies are gitignored. If you ever see a staged LICENSE inside a package
 * directory in a diff, that is a bug, not a licence update.
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(HERE, '../LICENSE');

const targets = process.argv.slice(2);

if (targets.length === 0) {
  console.error('usage: node scripts/stage-license.mjs <package-dir> [...]');
  process.exit(2);
}

if (!existsSync(SOURCE)) {
  console.error(`no LICENSE at ${SOURCE}`);
  process.exit(2);
}

for (const target of targets) {
  const dir = resolve(process.cwd(), target);
  mkdirSync(dir, { recursive: true });
  const destination = resolve(dir, 'LICENSE');
  copyFileSync(SOURCE, destination);
  console.log(`staged ${target}/LICENSE`);
}
