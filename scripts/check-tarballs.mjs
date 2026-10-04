/**
 * Check that the npm tarballs would publish something complete.
 *
 *   node scripts/check-tarballs.mjs
 *
 * A file missing from `files` still imports perfectly from the repository and
 * only fails once somebody installs the published package. This reads the same
 * manifest npm packs from, so the check and the artefact cannot disagree.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const PACKAGES = [
  { name: '@vntoolkit/vn-text', dir: 'vn-text-ts' },
  { name: '@vntoolkit/vn-collate', dir: 'vn-collate-ts' },
  { name: '@vntoolkit/vn-money', dir: 'vn-money-ts' },
  { name: '@vntoolkit/vn-ident', dir: 'vn-ident-ts' },
];

// On Windows npm is a .cmd shim. Node 20 refuses to spawn one without a shell,
// so the arguments have to be quoted for the shell that will re-parse them.
const IS_WINDOWS = process.platform === 'win32';
const NPM = IS_WINDOWS ? 'npm.cmd' : 'npm';

function npm(args) {
  const quoted = IS_WINDOWS ? args.map((a) => `"${a}"`) : args;
  return execFileSync(NPM, quoted, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    shell: IS_WINDOWS,
  });
}

/** What a consumer needs, or the package is broken in a way tests cannot see. */
const REQUIRED = [
  'LICENSE',
  'package.json',
  'README.md',
  'dist/index.js',
  'dist/index.d.ts',
];

/**
 * Source maps are shipped, so the sources they point at have to be shipped too.
 * A .map that resolves to nothing is worse than no map: it sends a debugger
 * into a file that is not there.
 */
const SOURCE_SHIPPED = ['src/index.ts'];

/**
 * `npm pack --json` shares stdout with the lifecycle scripts it runs, so the
 * JSON has to be cut out of the noise. The array is the last thing printed and
 * starts on its own line, which is enough to find it reliably.
 */
function extractJson(raw) {
  const lines = raw.split('\n');
  const start = lines.findIndex((line) => line.trim() === '[');
  if (start === -1) {
    throw new Error(`no JSON array in npm output:\n${raw}`);
  }
  return JSON.parse(lines.slice(start).join('\n'));
}

let failures = 0;

for (const { name, dir } of PACKAGES) {
  const raw = npm(['pack', '--workspace', name, '--dry-run', '--json']);
  const packed = extractJson(raw)[0];
  const files = packed.files.map((f) => f.path);

  console.log(`\n${packed.filename}  (${packed.entryCount} entries, unpacked ${packed.unpackedSize} B)`);

  const missing = REQUIRED.filter((f) => !files.includes(f));
  for (const f of missing) {
    console.error(`  MISSING ${f}`);
    failures += 1;
  }

  const maps = files.filter((f) => f.endsWith('.map'));
  if (maps.length > 0) {
    const shipped = SOURCE_SHIPPED.filter((f) => files.includes(f));
    if (shipped.length !== SOURCE_SHIPPED.length) {
      console.error(
        `  ${maps.length} source map(s) shipped but src/ is not, so they point at nothing`,
      );
      failures += 1;
    }
  }

  // A package that quietly pulls in a runtime dependency contradicts the whole
  // point of the library. devDependencies are fine and expected.
  const manifestPath = resolve(ROOT, 'packages', dir, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const runtime = Object.keys(manifest.dependencies ?? {});
  if (runtime.length > 0) {
    console.error(`  runtime dependencies: ${runtime.join(', ')} (expected none)`);
    failures += 1;
  }
  if (manifest.publishConfig?.access !== 'public') {
    console.error('  publishConfig.access is not "public"; a scoped publish will fail');
    failures += 1;
  }
  if (!manifest.repository?.url) {
    console.error('  no repository URL; the registry page will not link to the source');
    failures += 1;
  }
}

console.log();
if (failures > 0) {
  console.error(`${failures} packaging problem(s)`);
  process.exit(1);
}
console.log('every tarball would publish something complete');
