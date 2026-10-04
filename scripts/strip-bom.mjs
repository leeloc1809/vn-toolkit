/**
 * Strip a UTF-8 BOM from the JSON manifests.
 *
 *   node scripts/strip-bom.mjs [files...]
 *
 * A BOM before the opening brace is invisible in every editor and in every diff,
 * and it breaks `JSON.parse`, `require`, npm's own manifest reader, and this
 * repository's own wiring check -- with an error that names neither the file
 * nor the character.
 *
 * PowerShell 5.1's `Set-Content -Encoding UTF8` writes one. That is the whole
 * reason this script exists.
 *
 * With no arguments, every package manifest is checked, so the BOM cannot come
 * back in one place and not another.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const BOM = '﻿';

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === 'package.json' || extname(entry.name) === '.json') out.push(full);
  }
  return out;
}

const files = process.argv.length > 2 ? process.argv.slice(2) : null;

let stripped = 0;
for (const file of files ?? walk(ROOT, [])) {
  const path = resolve(process.cwd(), file);
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    continue;
  }
  if (!text.startsWith(BOM)) continue;

  writeFileSync(path, text.slice(1), 'utf8');
  stripped += 1;
  console.log(`stripped a UTF-8 BOM from ${relative(ROOT, path)}`);
}

if (stripped === 0) console.log('no BOM found');
