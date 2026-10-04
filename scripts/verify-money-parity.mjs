/**
 * Cross-port check for vn-money: the TypeScript and Python ports must agree on
 * every answer, not just on the cases the suite happens to list.
 *
 *   node scripts/verify-money-parity.mjs
 *
 * The conformance suite pins both ports to the same expectations, which is a
 * strong property but a narrow one: it only covers the inputs somebody thought
 * of. This one builds its own corpus, runs both implementations over it, and
 * compares the results directly. A parser that happens to agree on "1.000" and
 * "abc" and disagrees on "1.000.000 ₫" passes the suite and fails here.
 *
 * Non-finite inputs are left out on purpose. JSON has no spelling for NaN, so
 * they would silently arrive as null on one side and be compared as a
 * different value rather than as the same one. The suite covers them
 * explicitly, where both ports are checked against the expectation instead of
 * against each other.
 */

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Import the built artifact, not src/. Node 20 cannot strip types, and the
// published package is dist/ anyway, so this checks the thing users get.
const { formatVnd, parseVnd, toWords, allocate, isVnd, isVndError } = await import(
  new URL('../packages/vn-money-ts/dist/index.js', import.meta.url).href
).catch((err) => {
  console.error('could not load packages/vn-money-ts/dist/index.js');
  console.error('run `npm run build` first.');
  console.error(err.message);
  process.exit(2);
});

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

/* --- The corpus ------------------------------------------------------------ */

// Every value from 0 to 9999 exercises each triplet rule against each
// magnitude join, which is where a reading convention actually lives.
function toWordsCorpus() {
  const out = [];
  for (let n = 0; n <= 9999; n += 1) out.push(n);
  for (const n of [
    -1, -15, -1000, -1001, -12345678, -MAX_SAFE,
    10000, 10001, 10005, 10008, 99999, 100000, 1000008,
    1000000, 10000000, 999999999, 1000000000,
    1000000000000, 1000000000000000, MAX_SAFE - 1, MAX_SAFE,
  ]) out.push(n);
  return out;
}

function formatCorpus() {
  const amounts = [];
  for (let n = 0; n <= 3000; n += 7) amounts.push(n);
  for (const n of [
    -1, -999, -1000, -1001, -123456789, -1000000000,
    1000000000000, MAX_SAFE, -MAX_SAFE,
  ]) amounts.push(n);

  // The defaults, then each option on its own and one with everything on, so a
  // formatter that only works with the defaults cannot pass.
  const optionSets = [
    {},
    { withSymbol: false },
    { groupSeparator: ',' },
    { groupSeparator: '' },
    { symbol: 'VND' },
    { symbol: '' },
    { withSign: true },
    { withSymbol: false, withSign: true, groupSeparator: ' ' },
  ];

  const out = [];
  for (const amount of amounts) {
    for (const options of optionSets) out.push({ amount, options });
  }
  return out;
}

// Spelled by code point, not as a literal. The parse corpus below has to
// contain real U+00A0 and U+2009, and a literal one in this file would be
// invisible in an editor -- the exact bug the corpus is there to catch, hiding
// in the test that catches it. scripts/check-invisible-spaces.mjs enforces it.
const NBSP = String.fromCodePoint(0x00a0);
const THIN_SPACE = String.fromCodePoint(0x2009);

function parseCorpus() {
  const strings = [
    '', ' ', '   ', '-', '+', 'abc', '1', '0', '1000', '1.000', '1,000',
    '1 000', `1${NBSP}000`, `1${THIN_SPACE}000`,
    '1.000.000', '12.345.678', '+1000',
    '-1.000', '-1.000.000', '  1.000  ', '1.000 ₫', '1,000.00 ₫',
    '1.5', '1,5', '1.50', '1.2345', '1.000,5', '12.34', '1.2.3',
    '1000₫500', '1e3', '1 000 000 ₫', '₫1000', '1.000.000 đ', '1.000.000 Đ',
    '1.000.000 VND', '1.000.000 vnd', '.', ',', '..', '1.', '1,', '1..000',
    '0001', '0000000000', '+-1', '1+1', '1 2 3', '9'.repeat(20),
    '1.'.concat('0'.repeat(3)), '12.345.678.901', '١٢٣', '१२३',
    `1${NBSP}000${NBSP}000`, '1  000', `1.000${NBSP}000`, '1000 ', ' 1000',
  ];
  for (let n = 0; n <= 999; n += 1) {
    strings.push(String(n));
    strings.push(String(n).padStart(3, '0'));
    strings.push(`${n}.${String(n % 1000).padStart(3, '0')}`);
  }
  return strings;
}

function allocateCorpus() {
  const out = [];
  const shareSets = [
    [1], [1, 1], [1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1],
    [1, 2], [2, 1], [1, 3], [3, 1], [2, 3, 5], [5, 3, 2],
    [0, 1], [1, 0], [0, 0, 1], [1, 0, 0], [7, 11, 13, 17],
    [100, 1], [1, 100], [999, 1000], [1, 1, 1, 2, 3, 5, 8, 13],
  ];
  const totals = [
    0, 1, 2, 3, 5, 7, 9, 10, 99, 100, 101, 999, 1000, 1001,
    12345, 1000000, 1000000000, MAX_SAFE, MAX_SAFE - 1,
    -1, -100, -1000, -12345, -1000000, -MAX_SAFE,
  ];
  for (const total of totals) {
    for (const shares of shareSets) out.push({ total, shares });
  }
  return out;
}

/* --- Run every operation in this process ---------------------------------- */

const OPS = [];
for (const value of [0, 1, -1, 999, 1000, 123456789, MAX_SAFE, -MAX_SAFE]) {
  OPS.push({ fn: 'isVnd', input: { value } });
}
for (const { amount, options } of formatCorpus()) {
  OPS.push({ fn: 'formatVnd', input: { amount, options } });
}
for (const input of parseCorpus()) {
  OPS.push({ fn: 'parseVnd', input: { input } });
}
for (const { total, shares } of allocateCorpus()) {
  OPS.push({ fn: 'allocate', input: { total, shares } });
}
for (const amount of toWordsCorpus()) {
  OPS.push({ fn: 'toWords', input: { amount } });
}

function runHere(op) {
  try {
    switch (op.fn) {
      case 'isVnd':
        return isVnd(op.input.value);
      case 'formatVnd':
        return formatVnd(op.input.amount, op.input.options);
      case 'parseVnd':
        return parseVnd(op.input.input);
      case 'allocate':
        return allocate(op.input.total, op.input.shares);
      case 'toWords':
        return toWords(op.input.amount);
      default:
        throw new Error(`no runner for ${op.fn}`);
    }
  } catch (err) {
    if (isVndError(err)) return { error: err.reason };
    throw err;
  }
}

/* --- Ask the Python port for the same answers ----------------------------- */

const PY =
  process.env.VN_MONEY_PYTHON ||
  (process.platform === 'win32'
    ? 'C:\\Users\\Legion 5 pro\\AppData\\Local\\Programs\\Python\\Python313\\python.exe'
    : 'python3');

const script = `
import json, sys
sys.path.insert(0, r'${resolve(HERE, '../packages/vn-money-py/src').replace(/\\/g, '\\\\')}')
from vn_money import VndError, allocate, format_vnd, is_vnd, parse_vnd, to_words

def run(op):
    fn, d = op["fn"], op["input"]
    try:
        if fn == "isVnd":
            return is_vnd(d["value"])
        if fn == "formatVnd":
            o = d.get("options") or {}
            return format_vnd(
                d["amount"],
                group_separator=o.get("groupSeparator", "."),
                symbol=o.get("symbol", "\\u20AB"),
                with_symbol=o.get("withSymbol", True),
                with_sign=o.get("withSign", False),
            )
        if fn == "parseVnd":
            return parse_vnd(d["input"])
        if fn == "allocate":
            return allocate(d["total"], d["shares"])
        if fn == "toWords":
            return to_words(d["amount"])
    except VndError as exc:
        return {"error": exc.reason}
    raise AssertionError(fn)

ops = json.loads(sys.stdin.read())
json.dump([run(op) for op in ops], sys.stdout, ensure_ascii=False)
`;

let theirs;
try {
  const out = execFileSync(PY, ['-c', script], {
    input: JSON.stringify(OPS),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  theirs = JSON.parse(out);
} catch (err) {
  console.error(`could not run the Python port with "${PY}"`);
  console.error(err.stderr?.toString() || err.message);
  console.error('Set VN_MONEY_PYTHON to a Python 3.9+ interpreter.');
  process.exit(2);
}

const ours = OPS.map(runHere);

if (theirs.length !== ours.length) {
  console.error(`length mismatch: TypeScript ${ours.length}, Python ${theirs.length}`);
  process.exit(1);
}

/** Stable stringify, so a difference in key order is not reported as a difference. */
function key(value) {
  if (Array.isArray(value)) return `[${value.map(key).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${k}:${key(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

const diffs = [];
for (let i = 0; i < ours.length; i += 1) {
  if (key(ours[i]) !== key(theirs[i])) {
    diffs.push(
      `  ${OPS[i].fn}(${JSON.stringify(OPS[i].input)})\n` +
        `    TypeScript: ${key(ours[i])}\n` +
        `    Python:     ${key(theirs[i])}`,
    );
  }
}

if (diffs.length > 0) {
  console.error(`${diffs.length} mismatches out of ${ours.length} operations:\n${diffs.slice(0, 15).join('\n')}`);
  process.exit(1);
}

/* --- Guards on the check itself ------------------------------------------- */

// A corpus that collapsed would make the comparison above pass for the wrong
// reason. These are the invariants that have to hold for it to mean anything.
const byFn = {};
for (const op of OPS) byFn[op.fn] = (byFn[op.fn] ?? 0) + 1;
for (const fn of ['isVnd', 'formatVnd', 'parseVnd', 'allocate', 'toWords']) {
  if (!byFn[fn]) {
    console.error(`corpus has no ${fn} operations, so the check is not covering it`);
    process.exit(2);
  }
}

const wordsOut = new Set(ours.filter((_, i) => OPS[i].fn === 'toWords'));
if (wordsOut.size < 2000) {
  console.error(`suspicious: only ${wordsOut.size} distinct readings for ${byFn.toWords} amounts`);
  process.exit(1);
}

// If the two ports both threw everything, "they agree" would be true and
// useless. At least a few refusals and a few successes have to be present.
const parseResults = ours.filter((_, i) => OPS[i].fn === 'parseVnd');
const refusals = parseResults.filter((r) => r !== null && typeof r === 'object');
if (refusals.length < 10) {
  console.error(`suspicious: only ${refusals.length} parse refusals in the corpus`);
  process.exit(1);
}
if (parseResults.length - refusals.length < 100) {
  console.error('suspicious: the parse corpus is almost entirely refusals');
  process.exit(1);
}

console.log(`money parity: ${ours.length}/${ours.length} operations identical across both ports`);
for (const fn of Object.keys(byFn)) console.log(`  ${fn}: ${byFn[fn]}`);
console.log(`  distinct readings: ${wordsOut.size}`);
console.log(`  parse refusals agreed on: ${refusals.length}`);
console.log(`  sample: toWords(12345678) = ${toWords(12345678)}`);
console.log(`  sample: formatVnd(12345678) = ${JSON.stringify(formatVnd(12345678))}`);
console.log(`  sample: allocate(1000000, [1,1,1]) = [${allocate(1000000, [1, 1, 1])}]`);
