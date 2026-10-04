/**
 * Prove that the wiring and invisible-space checks can fail.
 *
 *   node scripts/prove-checks-fail.mjs
 *
 * Each of these two checks exists to catch a mistake nobody would notice:
 * a package that is added and then not watched by dependabot, and a no-break
 * space that survives a review because nobody can see it. A check for a silent
 * failure that cannot itself fail is the worst of both worlds -- it reads like
 * a safeguard in the CI log and catches nothing.
 *
 * So: break the thing on purpose, run the check, restore. Exit non-zero if a
 * check passed while it was broken.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

// Built by code point, not written out. A literal no-break space in this file
// would be flagged by the very check this script proves, and it would be
// invisible while doing it.
const NBSP = String.fromCodePoint(0x00a0);
const THIN_SPACE = String.fromCodePoint(0x2009);

const TARGETS = {
  dependabot: '.github/dependabot.yml',
  ci: '.github/workflows/ci.yml',
  release: '.github/workflows/release.yml',
  // A file that is allowed to carry the invisible characters this check hunts
  // for, so the breakage can be introduced and reverted without leaving a mark.
  scratch: 'scripts/check-invisible-spaces.mjs',
};

const originals = Object.fromEntries(
  Object.entries(TARGETS).map(([key, path]) => [key, readFileSync(resolve(ROOT, path), 'utf8')]),
);

function run(script) {
  try {
    const out = execFileSync(process.execPath, [resolve(HERE, script)], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    return { passed: true, out };
  } catch (err) {
    return { passed: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

function write(path, text) {
  writeFileSync(resolve(ROOT, path), text, 'utf8');
}

/** Put every edited file back exactly as it was. */
function restoreAll() {
  for (const [key, path] of Object.entries(TARGETS)) write(path, originals[key]);
}

/** Every case describes a mistake a real contributor could plausibly make. */
const CASES = [
  {
    script: 'check-wiring.mjs',
    name: 'a Python package is added and dependabot is never told',
    apply: () => {
      // Exactly what happens when a package is created and the dependabot entry
      // is added afterwards, or forgotten. The dependency would silently never
      // be updated.
      write(
        TARGETS.dependabot,
        originals.dependabot.replace(
          new RegExp(
            String.raw`  - package-ecosystem: pip\n    directory: "/packages/vn-money-py"\n(?:.*\n)*?      - dependencies\n`,
          ),
          '',
        ),
      );
    },
    expect: /dependabot/i,
  },
  {
    script: 'check-wiring.mjs',
    name: 'CI installs a package but never runs its conformance test',
    apply: () => {
      write(
        TARGETS.ci,
        originals.ci
          .replace('python packages/vn-money-py/tests/test_vn_money.py', 'true')
          .replace('packages/vn-money-py/tests \\\n                 packages/vn-money-py/tests', 'packages/vn-money-py/tests'),
      );
    },
    expect: /conformance test/i,
  },
  {
    script: 'check-wiring.mjs',
    name: 'the release job builds a package and never publishes it',
    apply: () => {
      write(TARGETS.release, originals.release.replace('vn-money', 'vn-money-DISABLED'));
    },
    expect: /never publishes/i,
  },
  {
    script: 'check-wiring.mjs',
    name: 'the release job writes the npm token to a file npm never reads',
    apply: () => {
      // The exact bug from run 37203373864: setup-node sets
      // NPM_CONFIG_USERCONFIG, so ~/.npmrc is never opened, and the publish
      // failed 401 then 404 for a scope that existed the whole time.
      write(
        TARGETS.release,
        originals.release.replace(
          '> "${NPM_CONFIG_USERCONFIG:-${HOME}/.npmrc}"',
          '> ~/.npmrc',
        ),
      );
    },
    expect: /npm will not read/i,
  },
  {
    script: 'check-invisible-spaces.mjs',
    name: 'a formatter spacer is written as a literal no-break space',
    apply: () => {
      // The exact bug: a human types or pastes a no-break space, it is
      // invisible, the code works, and a later reformat silently breaks it.
      write(TARGETS.scratch, `${originals.scratch}\nexport const SPACER = '${NBSP}';\n`);
    },
    expect: /NO-BREAK SPACE/,
  },
  {
    script: 'check-invisible-spaces.mjs',
    name: 'a thin space is written as a literal where a grouping separator belongs',
    apply: () => {
      write(TARGETS.scratch, `${originals.scratch}\nexport const GROUPER = '${THIN_SPACE}';\n`);
    },
    expect: /THIN SPACE/,
  },
];

let caught = 0;
const missed = [];

try {
  for (const { script, name, apply, expect } of CASES) {
    restoreAll();
    apply();

    const { passed, out } = run(script);

    if (passed) {
      missed.push(name);
      console.error(`::error::${script} PASSED with this broken: ${name}`);
    } else if (!expect.test(out)) {
      missed.push(name);
      console.error(`::error::${script} failed, but not for the expected reason: ${name}`);
      console.error(out.split('\n').slice(0, 6).join('\n'));
    } else {
      caught += 1;
      const line = out.split('\n').find((l) => /^::error::/.test(l.trim())) ?? '';
      console.log(`caught: ${name}`);
      if (line) console.log(`  ${line.replace(/^::error::/, '').trim()}`);
    }
  }
} finally {
  restoreAll();
}

console.log();
console.log(`${caught}/${CASES.length} real mistakes were caught`);

if (missed.length > 0) {
  console.error(`${missed.length} slipped through:`);
  for (const m of missed) console.error(`  - ${m}`);
  process.exit(1);
}
console.log('every file was restored');
