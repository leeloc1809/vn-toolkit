/**
 * Check that every package is wired into everything that enumerates packages.
 *
 *   node scripts/check-wiring.mjs
 *
 * This repository has several places that have to mention every package: the
 * workspace list, the tarball check, the dependabot config, the CI packaging
 * loop, the release job, and a test file in each port that reads the shared
 * conformance file. Every one of them is a hand-maintained list, and the
 * failure mode of a stale list is silence.
 *
 * Nothing reports a package that was added to packages/ and then not added to
 * dependabot.yml. It simply never gets an update, forever, and the only
 * symptom is a dependency that quietly falls years behind. So it is checked
 * here instead of trusted.
 *
 * Each rule below is about a different list, so one broken wiring does not get
 * hidden by another being fine.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

/**
 * The import name inside a Python package. The directory is vn-collate-py
 * because hyphens are legal in a distribution name and illegal in a module
 * name, so the import is vn_collate. Deriving one from the other by guesswork
 * is how a check ends up reporting a missing file that is not missing.
 */
const moduleName = (pyDir) => pyDir.replace(/-py$/, '').replace(/-/g, '_');

const problems = [];
const checks = [];

function check(name, fn) {
  try {
    const detail = fn();
    checks.push(`  ok        ${name}${detail ? ` (${detail})` : ''}`);
  } catch (err) {
    problems.push(`${name}: ${err.message}`);
  }
}

/** Every packages/ subdirectory, sorted. */
const packageDirs = readdirSync(resolve(ROOT, 'packages'))
  .filter((d) => existsSync(join(ROOT, 'packages', d)))
  .sort();
const tsDirs = packageDirs.filter((d) => d.endsWith('-ts'));
const pyDirs = packageDirs.filter((d) => d.endsWith('-py'));

if (tsDirs.length === 0 || pyDirs.length === 0) {
  console.error('no TypeScript or Python packages found; the glob is wrong, not the repo');
  process.exit(2);
}
if (tsDirs.length !== pyDirs.length) {
  // A package with only one port is a half-published library, and the failure
  // is exactly this: a name on npm and a name on PyPI that are not the same
  // library.
  problems.push(
    `the two ports disagree on how many packages exist: ${tsDirs.length} TypeScript, ${pyDirs.length} Python`,
  );
}

const conformanceFiles = readdirSync(resolve(ROOT, 'conformance'))
  .filter((f) => f.endsWith('.json'))
  .sort();

console.log(`found ${tsDirs.length} TypeScript packages, ${pyDirs.length} Python packages, ${conformanceFiles.length} conformance files\n`);

/* 1. The two ports agree on the library names. */
check('every TypeScript package has a Python sibling', () => {
  const missing = tsDirs.filter((t) => !pyDirs.includes(t.replace(/-ts$/, '-py')));
  if (missing.length) throw new Error(`no Python port for ${missing.join(', ')}`);
  return `${tsDirs.length} matched pairs`;
});

/* 2. Each port is in the npm workspace list. */
check('every TypeScript package is an npm workspace', () => {
  const workspaces = readJson('package.json').workspaces;
  const missing = tsDirs.filter((d) => !workspaces.includes(`packages/${d}`));
  if (missing.length) throw new Error(`not in package.json workspaces: ${missing.join(', ')}`);
  return `${workspaces.length} workspaces`;
});

/* 3. Every Python package has a dependabot entry. This is the one that bites. */
check('every Python package is watched by dependabot', () => {
  const config = read('.github/dependabot.yml');
  // Exact line, not a substring. "vn-money-py-old" contains "vn-money-py", and
  // a substring check would happily pass on an entry for a package that no
  // longer exists.
  const missing = pyDirs.filter((d) => {
    const line = `directory: "/packages/${d}"`;
    return !config.split('\n').some((l) => l.trim() === line);
  });
  if (missing.length) {
    throw new Error(
      `no dependabot entry for ${missing.join(', ')}. Dependabot has no glob for ` +
        `directories, so these would never be updated and nothing would report it.`,
    );
  }
  return `${pyDirs.length} pip entries`;
});

/* 4. Every TypeScript package is in the tarball check. */
check('every TypeScript package is in the tarball check', () => {
  const source = read('scripts/check-tarballs.mjs');
  const missing = tsDirs.filter((d) => !source.includes(`'${d}'`));
  if (missing.length) {
    throw new Error(`not packed or not checked: ${missing.join(', ')}`);
  }
  return `${tsDirs.length} entries`;
});

/* 5. Every manifest is covered by the tag check's glob, and the glob matches. */
check('the tag check discovers every manifest', () => {
  const source = read('scripts/check-release-tag.sh');
  if (!source.includes('packages/*-ts/package.json') || !source.includes('packages/*-py/pyproject.toml')) {
    throw new Error('check-release-tag.sh no longer globs its manifests');
  }
  for (const d of tsDirs) {
    if (!existsSync(resolve(ROOT, 'packages', d, 'package.json'))) {
      throw new Error(`packages/${d}/package.json is missing`);
    }
  }
  for (const d of pyDirs) {
    if (!existsSync(resolve(ROOT, 'packages', d, 'pyproject.toml'))) {
      throw new Error(`packages/${d}/pyproject.toml is missing`);
    }
  }
  return `${tsDirs.length + pyDirs.length} manifests`;
});

/* 6. Every Python package is installed and tested by CI. */
check('every Python package is installed and tested by CI', () => {
  const ci = read('.github/workflows/ci.yml');
  const notInstalled = pyDirs.filter((d) => {
    const line = `pip install ./packages/${d}`;
    return !ci.split('\n').some((l) => l.trim() === line);
  });
  if (notInstalled.length) throw new Error(`CI never installs ${notInstalled.join(', ')}`);
  const notTested = pyDirs.filter(
    (d) => !ci.includes(`packages/${d}/tests/test_${moduleName(d)}.py`),
  );
  if (notTested.length) {
    throw new Error(
      `CI never runs a conformance test for ${notTested.join(', ')}. A package ` +
        `installed but never exercised passes CI while shipping nothing.`,
    );
  }
  return `${pyDirs.length} installed and tested`;
});

/* 7. Every conformance file is read by a test in both ports. */
check('every conformance file is read by both ports', () => {
  for (const file of conformanceFiles) {
    const stem = file.replace(/-\d+\.\d+\.\d+\.json$/, '');
    const tsTest = tsDirs.map((d) => join('packages', d, 'test')).find((dir) => {
      if (!existsSync(resolve(ROOT, dir))) return false;
      return readdirSync(resolve(ROOT, dir)).some((f) => f.endsWith('.ts') && read(join(dir, f)).includes(file));
    });
    if (!tsTest) throw new Error(`no TypeScript test reads conformance/${file}`);

    const pyTest = pyDirs.find((d) => {
      const dir = join('packages', d, 'tests');
      if (!existsSync(resolve(ROOT, dir))) return false;
      return readdirSync(resolve(ROOT, dir))
        .filter((f) => f.endsWith('.py'))
        .some((f) => read(join(dir, f)).includes(file));
    });
    if (!pyTest) throw new Error(`no Python test reads conformance/${file}`);
  }
  return `${conformanceFiles.length} suites, each read by both ports`;
});

/* 8. The two Python test basenames are unique. */
check('Python test file names are unique across packages', () => {
  const seen = new Map();
  for (const d of pyDirs) {
    const dir = join('packages', d, 'tests');
    if (!existsSync(resolve(ROOT, dir))) continue;
    for (const f of readdirSync(resolve(ROOT, dir))) {
      if (!f.endsWith('.py')) continue;
      if (seen.has(f)) {
        throw new Error(
          `${seen.get(f)} and ${join(dir, f)} are both ${f}. pytest collects ` +
            `two modules with the same basename and the second one is ignored, ` +
            `or the run errors out.`,
        );
      }
      seen.set(f, join(dir, f));
    }
  }
  return `${seen.size} distinct test files`;
});

/* 9. Every package ships its type marker, because both declare it. */
check('every Python package ships py.typed and declares Typing :: Typed', () => {
  for (const d of pyDirs) {
    const marker = resolve(ROOT, 'packages', d, 'src', moduleName(d), 'py.typed');
    if (!existsSync(marker)) {
      throw new Error(`packages/${d} declares Typing :: Typed but has no py.typed at ${relative(ROOT, marker)}`);
    }
    const manifest = read(join('packages', d, 'pyproject.toml'));
    if (!manifest.includes('"Typing :: Typed"')) {
      throw new Error(`packages/${d} ships py.typed but does not declare Typing :: Typed`);
    }
  }
  return `${pyDirs.length} packages`;
});

/* 10. The npm publish list in the release job covers every package. */
check('the release job publishes every TypeScript package', () => {
  const release = read('.github/workflows/release.yml');
  const missing = tsDirs.filter((d) => {
    // Whole token, not a substring, and not a whitespace boundary either: a
    // publish loop ends the name with ";", not a space. What matters is whether
    // the name could still be extended -- "@vntoolkit/vn-money" is a prefix of
    // "@vntoolkit/vn-money-DISABLED" and of a commented-out line, and a plain
    // includes() would call both of those published.
    const name = readJson(join('packages', d, 'package.json')).name.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );
    const pattern = new RegExp(`(?<![\\w@/.-])${name}(?![\\w@/.-])`);
    return !pattern.test(release);
  });
  if (missing.length) {
    throw new Error(
      `the release job never publishes ${missing.join(', ')}. The package would ` +
        `be built and verified and then silently not released.`,
    );
  }
  return `${tsDirs.length} packages published`;
});

/* 11. The root verify script runs every parity check that exists. */
check('npm run verify reaches every parity script', () => {
  const scripts = readJson('package.json').scripts ?? {};

  // Resolve the chain rather than grepping one string. `verify` calls
  // `verify:collate`, which calls the file; a check that only looked inside
  // `verify` would report every parity script as unreached and then be
  // "fixed" by pasting a long command into it.
  const reached = new Set();
  const walk = (name, depth) => {
    if (reached.has(name) || depth > 10) return;
    reached.add(name);
    const command = scripts[name];
    if (typeof command !== 'string') return;
    for (const match of command.matchAll(/npm run ([\w:-]+)/g)) walk(match[1], depth + 1);
  };
  walk('verify', 0);

  const parityScripts = readdirSync(resolve(ROOT, 'scripts')).filter((f) =>
    /^verify-.*-parity\.mjs$/.test(f),
  );

  const unreached = parityScripts.filter((f) => {
    // Reached means: some script in the chain names this file.
    for (const name of reached) {
      if ((scripts[name] ?? '').includes(f)) return false;
    }
    return true;
  });

  if (unreached.length) {
    throw new Error(
      `scripts/${unreached.join(', ')} are not reachable from npm run verify. ` +
        `A parity check nobody runs is a comment.`,
    );
  }
  return `${parityScripts.length} parity scripts, all reachable`;
});

for (const line of checks) console.log(line);
console.log();

if (problems.length > 0) {
  for (const p of problems) console.error(`::error::${p}`);
  console.error(`\n${problems.length} wiring problem(s)`);
  process.exit(1);
}

console.log(`every one of ${checks.length} checks passes: no package is left unwired`);
