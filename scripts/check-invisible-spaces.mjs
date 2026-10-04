/**
 * Refuse literal invisible space characters in source.
 *
 *   node scripts/check-invisible-spaces.mjs [paths...]
 *
 * A no-break space, a thin space or a figure space written as a literal is
 * invisible in an editor. Nobody can see it, so nobody notices when a reformat
 * or a "tidy the whitespace" commit turns it into an ordinary space -- and then
 * the VND formatter stops matching ICU by exactly one code point, which no test
 * failure points at.
 *
 * The escape is the readable form. U+00A0 is a bug waiting to happen; '\u00A0'
 * is a decision.
 *
 * The paths are named by code point rather than written out, because this file
 * is itself source and would otherwise contain the thing it forbids.
 *
 * Precomposed letters like U+0110 are not affected. They are visible, and they
 * are what a Vietnamese developer expects to read.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

// U+00A0, U+2007, U+2009. Deliberately not U+2000..U+200A wholesale: a
// regular space in an indent or a line continuation is fine, and a check that
// cries wolf gets turned off.
const FORBIDDEN = new Map([
  [0x00a0, 'NO-BREAK SPACE'],
  [0x2007, 'FIGURE SPACE'],
  [0x2009, 'THIN SPACE'],
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs']);
const SKIP = new Set(['node_modules', 'dist', '.git', '.traction', 'drafts']);

const roots = process.argv.length > 2
  ? process.argv.slice(2)
  : ['packages', 'scripts', 'conformance'];

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (SOURCE_EXTENSIONS.has(extname(entry))) {
      out.push(full);
    }
  }
}

const files = [];
for (const root of roots) {
  const full = resolve(process.cwd(), root);
  try {
    if (statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  } catch {
    console.error(`no such path: ${root}`);
    process.exit(2);
  }
}

const problems = [];

for (const file of files.sort()) {
  const text = readFileSync(file, 'utf8');
  const found = new Map();
  let line = 1;
  for (const ch of text) {
    const name = FORBIDDEN.get(ch.codePointAt(0));
    if (name) {
      const key = `${name} (U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`;
      if (!found.has(key)) found.set(key, []);
      found.get(key).push(line);
    }
    if (ch === '\n') line += 1;
  }
  for (const [key, lines] of found) {
    problems.push({ file: relative(ROOT, file), key, lines });
  }
}

if (problems.length > 0) {
  for (const { file, key, lines } of problems) {
    console.error(`::error::${file}: ${key} on line(s) ${lines.join(', ')}`);
  }
  console.error('\nWrite these as \\uNNNN escapes. A literal one is invisible in an editor,');
  console.error('so it survives review and then gets silently replaced by a reformat.');
  process.exit(1);
}

console.log(`no literal invisible space characters in ${files.length} source file(s)`);
