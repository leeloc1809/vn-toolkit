/**
 * Cross-port verification harness.
 *
 * There is no Python interpreter on this machine, so the Python port cannot be
 * executed here. This script compensates as far as is possible without one:
 *
 *   1. It re-implements the Python algorithm in JS, step for step, including
 *      the `str.isalnum()` character classification that the Python port
 *      actually uses. If that re-implementation reproduces every expected
 *      value in the conformance file, the algorithm translation is sound.
 *
 *   2. It separately reports any character where the Python classification
 *      (`\p{Alphabetic}` or `\p{Nd}`/`\p{Nl}`/`\p{No}`, which is what
 *      `str.isalnum()` resolves to) disagrees with the TypeScript
 *      classification (`\p{L}` or `\p{N}`). That is the one place the two
 *      ports can genuinely drift, so it is worth measuring rather than hoping.
 *
 * This is a check on the port, not a substitute for running the real Python
 * test suite. Once an interpreter is available:
 *
 *     python packages/py/tests/test_conformance.py
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUITE_PATH = resolve(HERE, '../conformance/vn-text-1.0.0.json');
const suite = JSON.parse(readFileSync(SUITE_PATH, 'utf8'));

// --- Python str.isalnum() equivalent --------------------------------------
// CPython: ISALPHA (L*) || ISDECIMAL (Nd) || ISDIGIT || ISNUMERIC (N*).
// Alphabetic is the Unicode Alphabetic property, a superset of L* that adds
// Nl and Other_Alphabetic marks. Using Alphabetic|N* keeps the check strict.
const PY_ALNUM = /[\p{Alphabetic}\p{Nd}\p{Nl}\p{No}]/u;
// --- TypeScript \p{L}\p{N} equivalent --------------------------------------
const TS_ALNUM = /[\p{L}\p{N}]/u;

const D_UP = '\u0110';
const D_LOW = '\u0111';
const ETH_UP = '\u00D0';
const ETH_LOW = '\u00F0';
const COMBINING = /[\u0300-\u036f]/g;

// --- Python port, transliterated line for line ----------------------------
function pyNormalize(s) { return s.normalize('NFC'); }
function pyDecompose(s) { return s.normalize('NFD'); }
function pyDeaccent(s) {
  return s.normalize('NFD').replace(COMBINING, '').normalize('NFC');
}
function pyStripStroke(s) {
  return s.replace(new RegExp(D_UP, 'g'), 'D').replace(new RegExp(D_LOW, 'g'), 'd');
}
function pyRepairMojibake(s) {
  return s.replace(new RegExp(ETH_UP, 'g'), D_UP).replace(new RegExp(ETH_LOW, 'g'), D_LOW);
}
function pyFold(s) {
  let folded = pyStripStroke(pyDeaccent(s)).toLowerCase();
  folded = folded.normalize('NFD').replace(COMBINING, '');
  const spaced = [...folded].map((ch) => (PY_ALNUM.test(ch) ? ch : ' ')).join('');
  return spaced.split(/\s+/).filter(Boolean).join(' ');
}
function pyIsVietnamese(s) {
  return new RegExp(`[${D_UP}${D_LOW}\u1ea0-\u1ef9]`, 'u').test(s);
}

const PY_IMPLS = {
  normalize: pyNormalize,
  deaccent: pyDeaccent,
  stripStroke: pyStripStroke,
  repairMojibake: pyRepairMojibake,
  fold: pyFold,
  isVietnamese: pyIsVietnamese,
};

// --- Run every case through the Python transliteration ---------------------
let failures = 0;
for (const c of suite.cases) {
  const actual = PY_IMPLS[c.fn](c.input);
  if (actual !== c.expected) {
    failures += 1;
    console.log(`FAIL ${c.id}  ${c.fn}(${JSON.stringify(c.input)})`);
    console.log(`     expected ${JSON.stringify(c.expected)}`);
    console.log(`     actual   ${JSON.stringify(actual)}`);
  }
}
console.log(
  `python-transliteration: ${suite.cases.length - failures}/${suite.cases.length} cases reproduced`,
);

// --- Measure classification drift across every character in the corpus -----
const seen = new Set();
for (const c of suite.cases) for (const ch of c.input) seen.add(ch);

const drift = [...seen].filter((ch) => PY_ALNUM.test(ch) !== TS_ALNUM.test(ch));
console.log(`\ndistinct characters in corpus: ${seen.size}`);
console.log(`isalnum() vs \\p{L}\\p{N} disagreements: ${drift.length}`);
for (const ch of drift) {
  console.log(
    `  U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} ` +
    `${JSON.stringify(ch)} py=${PY_ALNUM.test(ch)} ts=${TS_ALNUM.test(ch)}`,
  );
}

if (drift.length > 0) {
  console.log(
    '\nThese characters would make the two ports disagree on fold(). ' +
    'Either the Python classifier or the TypeScript one has to give.',
  );
}

process.exit(failures > 0 ? 1 : 0);
