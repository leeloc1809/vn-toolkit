/**
 * Prove that scripts/verify-money-parity.mjs can fail.
 *
 *   node scripts/prove-money-parity-fails.mjs
 *
 * Breaks the Python port in ways a self-consistent port would not catch, runs
 * the check each time, and restores the files afterwards. A check that cannot
 * fail is decoration, and this is the only way to know whether this one still
 * works.
 *
 * Exits non-zero if the check passed while the port was broken, which is the
 * outcome that matters.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK = resolve(HERE, 'verify-money-parity.mjs');
const SRC = resolve(HERE, '../packages/vn-money-py/src/vn_money');

const file = (name) => resolve(SRC, name);

/** Two ways to be wrong that a self-consistent port would not catch. */
const BREAKAGES = [
  {
    // The mốt and tư rules start at a tens digit of 2, so 11 stays "mười một"
    // and 14 stays "mười bốn". Lowering the threshold to 1 turns those into
    // "mười mốt" and "mười tư", which is the single most common way a
    // Vietnamese reading implementation goes wrong -- and the conformance
    // suite pins all three values precisely so this cannot land quietly.
    name: 'the mốt and tư rules lowered to a tens digit of 1 instead of 2',
    file: 'words.py',
    from: 'parts.append("mốt" if tens >= 2 else "một")',
    to: 'parts.append("mốt" if tens >= 1 else "một")',
  },
  {
    // The other half of the same family, so the pair cannot both be masked by
    // one of them.
    name: 'the tư rule lowered to a tens digit of 1 instead of 2',
    file: 'words.py',
    from: 'parts.append("tư" if tens >= 2 else "bốn")',
    to: 'parts.append("tư" if tens >= 1 else "bốn")',
  },
  {
    // The single most likely port drift. Python's \d is Unicode-aware, so a
    // pattern written with \d accepts Arabic-Indic numerals that the
    // TypeScript port rejects, and the two quietly disagree on exactly the
    // inputs nobody writes by hand.
    name: 'the digit class widened to Unicode \\d, which Python has and JavaScript does not',
    file: 'core.py',
    from: '_AMOUNT = re.compile(r"[+-]?(?:[0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]+)")',
    to: '_AMOUNT = re.compile(r"[+-]?(?:\\d{1,3}(?:[.,]\\d{3})+|\\d+)")',
  },
  {
    // The other half of the whitespace story: Python's \s is Unicode-aware
    // too, so a naive strip that removes every whitespace character also
    // accepts a non-breaking space, and the two ports stop agreeing about what
    // is a grouping space.
    name: 'the parser stopped stripping the no-break space ICU itself emits',
    file: 'core.py',
    from: '_SPACES = re.compile(r"\\s")',
    to: '_SPACES = re.compile(r"[ \\t\\n\\r]")',
  },
];

const originals = new Map(BREAKAGES.map((b) => [b.file, readFileSync(file(b.file), 'utf8')]));

let caught = 0;
let missed = 0;

try {
  for (const { name, file: filename, from, to } of BREAKAGES) {
    const original = originals.get(filename);
    if (!original.includes(from)) {
      console.error(`::error::the breakage anchor is not in ${filename} any more:`);
      console.error(`  ${JSON.stringify(from)}`);
      console.error('update prove-money-parity-fails.mjs to match the port');
      process.exit(2);
    }
    writeFileSync(file(filename), original.replace(from, to), 'utf8');

    let passed = true;
    let output = '';
    try {
      output = execFileSync(process.execPath, [CHECK], { encoding: 'utf8' });
    } catch (err) {
      passed = false;
      output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }

    if (passed) {
      missed += 1;
      console.error(`::error::the check PASSED with this broken: ${name}`);
    } else {
      caught += 1;
      const headline = output.split('\n').find((l) => /mismatches out of/.test(l)) ?? '';
      console.log(`caught: ${name}`);
      if (headline.trim()) console.log(`  ${headline.trim()}`);
    }
  }
} finally {
  for (const [filename, original] of originals) {
    writeFileSync(file(filename), original, 'utf8');
  }
}

console.log();
console.log(`${caught}/${BREAKAGES.length} real port breakages were caught`);

if (missed > 0) {
  console.error(`${missed} breakage(s) slipped through. The check is not doing its job.`);
  process.exit(1);
}
console.log('the Python port was restored');
