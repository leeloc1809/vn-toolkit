/**
 * Prove that scripts/verify-ident-parity.mjs can fail.
 *
 *   node scripts/prove-ident-parity-fails.mjs
 *
 * Every breakage here is a transcription or reading error that a hand-picked
 * conformance suite would sail straight past, which is the point: the tax
 * weights in particular are not a progression, so swapping two of them still
 * produces a well-formed check digit for every code. The suite's cases cannot
 * tell you the weights are right; ten thousand generated codes can.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../packages/vn-ident-py/src/vn_ident');
const CHECK = resolve(HERE, 'verify-ident-parity.mjs');

const file = (name) => resolve(SRC, name);

const BREAKAGES = [
  {
    name: 'two tax weights transposed, which still yields well-formed digits',
    file: 'tables.py',
    from: 'MST_WEIGHTS = (31, 29, 23, 19, 17, 13, 7, 5, 3)',
    to: 'MST_WEIGHTS = (31, 29, 23, 19, 13, 17, 7, 5, 3)',
  },
  {
    // The exact case the circular calls out, and the one a naive port gets
    // wrong. 10 - 0 is 10, which is not a digit.
    name: 'the divisible-by-11 case returns 10 instead of None',
    file: 'mst.py',
    from: 'return None if remainder == 0 else 10 - remainder',
    to: 'return 10 - remainder',
  },
  {
    // The typo one of the four published province tables actually carries.
    name: 'Bắc Giang transcribed as 023 instead of 024',
    file: 'tables.py',
    from: '("024", "Bắc Giang"),',
    to: '("023", "Bắc Giang"),',
  },
  {
    // 089 and 094 swapped between the two rows. Both are plausible-looking
    // enough that a transcription slip is easy to make and hard to see. It is
    // done as a swap rather than a copy because a copy would assign one prefix
    // to two carriers, and the port would refuse to import -- caught, but for
    // the wrong reason, which proves nothing about the comparison.
    name: 'two carrier prefixes swapped between Vinaphone and Mobifone',
    file: 'tables.py',
    edits: [
      {
        from: '("vinaphone", ("081", "082", "083", "084", "085", "088", "091", "094")),',
        to: '("vinaphone", ("081", "082", "083", "084", "085", "088", "091", "089")),',
      },
      {
        from: '("mobifone", ("070", "076", "077", "078", "079", "089", "090", "093")),',
        to: '("mobifone", ("070", "076", "077", "078", "079", "094", "090", "093")),',
      },
    ],
  },
  {
    // The one inference, removed. Every 9-digit spelling in the corpus is here
    // precisely so this cannot be dropped unnoticed.
    name: 'the bare nine-digit trunk-zero inference switched off by default',
    file: 'phone.py',
    from: 'def normalize_phone(text: str, *, assume_trunk_zero: bool = True) -> str | None:',
    to: 'def normalize_phone(text: str, *, assume_trunk_zero: bool = False) -> str | None:',
  },
  {
    // Python's \d is Unicode-aware and the TypeScript port is not, so a port
    // written with \d accepts digits the other one refuses.
    //
    // The old paper card, not the current one. is_valid_cccd has a second line
    // of defence -- a province lookup and a fourth-digit lookup, neither of
    // which a non-ASCII digit can pass -- so widening its shape regex to \d
    // changes nothing observable and the corpus would never know. The nine
    // digit check has no such guard: it is a shape test and nothing else,
    // which is exactly what makes it the one to attack.
    name: 'the nine-digit card shape widened to Unicode \\d, which Python has and JavaScript does not',
    file: 'identity.py',
    from: '_CMND_SHAPE = re.compile(r"[0-9]{9}")',
    to: '_CMND_SHAPE = re.compile(r"\\d{9}")',
  },
];

const originals = new Map(
  BREAKAGES.map((b) => [b.file, readFileSync(file(b.file), 'utf8')]),
);

function restoreAll() {
  for (const [filename, original] of originals) {
    writeFileSync(file(filename), original, 'utf8');
  }
}

let caught = 0;
const missed = [];

try {
  for (const breakage of BREAKAGES) {
    restoreAll();
    const { name, file: filename } = breakage;
    // Most breakages are one replacement; a couple need two, because a single
    // edit would trip a different guard than the one being demonstrated.
    const edits = breakage.edits ?? [{ from: breakage.from, to: breakage.to }];

    let text = originals.get(filename);
    for (const { from, to } of edits) {
      if (!text.includes(from)) {
        console.error(`::error::the breakage anchor is not in ${filename} any more:`);
        console.error(`  ${JSON.stringify(from)}`);
        console.error('update prove-ident-parity-fails.mjs to match the port');
        process.exit(2);
      }
      text = text.replace(from, to);
    }
    writeFileSync(file(filename), text, 'utf8');

    let passed = true;
    let output = '';
    try {
      output = execFileSync(process.execPath, [CHECK], { encoding: 'utf8' });
    } catch (err) {
      passed = false;
      output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }

    if (passed) {
      missed.push(name);
      console.error(`::error::the check PASSED with this broken: ${name}`);
    } else if (/could not run the Python port/.test(output)) {
      // The port failed to import, so the comparison never happened. That is a
      // crash, not a detection, and counting it as caught would be flattering
      // the check rather than testing it.
      missed.push(name);
      console.error(`::error::the check crashed instead of comparing: ${name}`);
      console.error(output.split('\n').slice(0, 4).join('\n'));
    } else {
      caught += 1;
      const headline = output.split('\n').find((l) => /mismatches out of/.test(l)) ?? '';
      const first = output.split('\n').find((l) => /^\s{2}\w+\(/.test(l)) ?? '';
      console.log(`caught: ${name}`);
      if (headline.trim()) console.log(`  ${headline.trim()}`);
      if (first.trim()) console.log(`  ${first.trim()}`);
    }
  }
} finally {
  restoreAll();
}

console.log();
console.log(`${caught}/${BREAKAGES.length} real port breakages were caught`);

if (missed.length > 0) {
  console.error(`${missed.length} slipped through:`);
  for (const m of missed) console.error(`  - ${m}`);
  process.exit(1);
}
console.log('the Python port was restored');
