import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const TARGET = resolve(ROOT, '.github/workflows/ci.yml');
const original = readFileSync(TARGET, 'utf8');

let passed = true;
try {
  execFileSync(process.execPath, [resolve(HERE, 'check-wiring.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
} catch { passed = false; }

console.log('unmodified ci.yml ->', passed ? 'PASS (expected)' : 'FAIL (unexpected)');

writeFileSync(
  TARGET,
  original.replace(
    'python packages/vn-money-py/tests/test_vn_money.py',
    'python packages/vn-money-py/tests/test_vn_money_typo.py',
  ),
  'utf8',
);

let caughtIt = true;
let out = '';
try {
  out = execFileSync(process.execPath, [resolve(HERE, 'check-wiring.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
} catch (err) { caughtIt = false; out = `${err.stdout ?? ''}${err.stderr ?? ''}`; }

writeFileSync(TARGET, original, 'utf8');

console.log('with one path renamed  ->', caughtIt ? 'FAIL (the check did not notice)' : 'caught');
const line = out.split('\n').find((l) => l.includes('a workflow names')) ?? '';
if (line) console.log(`  ${line.replace(/^::error::/, '').trim()}`);

process.exit(caughtIt ? 1 : 0);
