/**
 * Cross-port check for vn-ident: the TypeScript and Python ports must agree on
 * every answer, not just on the cases the suite happens to list.
 *
 *   node scripts/verify-ident-parity.mjs
 *
 * The conformance suite pins both ports to the same expectations, which is a
 * strong property but a narrow one. This one builds its own corpus -- every
 * carrier prefix, every province code, every fourth digit, and a large block of
 * generated numbers -- runs both implementations over it, and compares the
 * answers directly.
 *
 * The generated numbers matter more than they look. A tax code has a check
 * digit, so a weight table with one transposed pair still produces well-formed
 * digits and the suite's hand-picked cases can all still pass while real tax
 * codes validate wrongly. Ten thousand generated codes either agree or they do
 * not.
 */

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Import the built artifact, not src/. Node 20 cannot strip types, and the
// published package is dist/ anyway, so this checks the thing users get.
const {
  mstCheckDigit, isValidMst, parseMst,
  normalizePhone, detectCarrier, isValidPhone,
  isValidCccd, parseCccd, isValidCmnd, classifyId,
  PROVINCES, CARRIERS, CENTURY_GENDER,
} = await import(new URL('../packages/vn-ident-ts/dist/index.js', import.meta.url).href).catch((err) => {
  console.error('could not load packages/vn-ident-ts/dist/index.js');
  console.error('run `npm run build` first.');
  console.error(err.message);
  process.exit(2);
});

const HERE = dirname(fileURLToPath(import.meta.url));

/* --- The corpus ------------------------------------------------------------ */

/**
 * A small deterministic generator, so a mismatch can be reproduced from the
 * seed in the failure output rather than only by re-running the whole check.
 * mulberry32: 32 bits of state, no dependencies, identical in any language.
 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OPS = [];
const add = (fn, input) => OPS.push({ fn, input });

// Every province code, against every fourth digit, against two serials.
for (const [code] of PROVINCES) {
  for (const [digit] of CENTURY_GENDER) {
    for (const serial of ['000000', '999999', '123456']) {
      const card = `${code}${digit}85${serial}`;
      add('isValidCccd', { code: card });
      add('parseCccd', { code: card });
      add('classifyId', { value: card });
    }
  }
  // The same province with an unassigned code, which is the case a naive
  // "is it three digits" check gets wrong.
  add('isValidCccd', { code: `${code}0999` });
}

// Every carrier prefix, and every unassigned one, at ten digits.
const allPrefixes = new Set();
for (const [, prefixes] of CARRIERS) for (const p of prefixes) allPrefixes.add(p);
for (let n = 30; n < 100; n += 1) allPrefixes.add(String(n).padStart(3, '0'));

for (const prefix of [...allPrefixes].sort()) {
  for (const tail of ['3456789', '0000000', '1234567']) {
    const phone = `${prefix}${tail}`;
    add('detectCarrier', { phone });
    add('isValidPhone', { input: phone });
    add('normalizePhone', { input: phone });
    add('classifyId', { value: phone });

    // The same digits without the trunk zero, and in every spelling a person
    // might type. This is where the two ports most easily disagree.
    const bare = `${prefix}${tail}`;
    for (const input of [
      bare, `+84${bare}`, `84${bare}`, `0${bare}`,
      `${bare.slice(0, 3)} ${bare.slice(3, 6)} ${bare.slice(6)}`,
      `${bare.slice(0, 3)}-${bare.slice(3, 6)}-${bare.slice(6)}`,
      `(0${bare.slice(1, 3)}) ${bare.slice(3)}`,
      `  ${bare}  `,
      `${bare}9`, `${bare.slice(0, -1)}`, `${bare}abc`,
    ]) {
      add('normalizePhone', { input });
      add('normalizePhone', { input, options: { assumeTrunkZero: false } });
      add('isValidPhone', { input });
    }
  }
}

// Generated tax codes. Every one of the nine digits varies, so a transposed
// pair of weights shows up here even though it survives every hand-picked case.
const random = rng(20261004);
for (let n = 0; n < 10000; n += 1) {
  let nine = '';
  for (let d = 0; d < 9; d += 1) nine += Math.floor(random() * 10);
  const check = mstCheckDigit(nine);
  add('mstCheckDigit', { prefix: nine });

  // Valid, invalid, and near-miss, all derived from the algorithm rather than
  // typed, so the corpus cannot accidentally be all of one kind.
  const wrong = (check === null ? 0 : (check + 1) % 10);
  for (const tenth of new Set([check, wrong, 0, 9, 5])) {
    if (tenth === null) continue;
    const code = `${nine}${tenth}`;
    add('isValidMst', { code });
    add('parseMst', { code });
    add('classifyId', { value: code });
    for (const branch of ['001', '000', '999', '1000']) {
      const thirteen = `${code}${branch}`;
      add('isValidMst', { code: thirteen });
      add('isValidMst', { code: `${code}-${branch}` });
      add('parseMst', { code: thirteen });
    }
  }
}

// Sequential prefixes, which walk the weights in a different order than random
// digits do and tend to hit the divisible-by-11 case sooner.
for (let n = 0; n < 3000; n += 1) {
  const nine = String(n).padStart(9, '0');
  add('mstCheckDigit', { prefix: nine });
  const check = mstCheckDigit(nine);
  if (check !== null) {
    add('isValidMst', { code: `${nine}${check}` });
    add('parseMst', { code: `${nine}${check}` });
  }
}

// Values that are not numbers at all, and near misses of every shape.
for (const value of [
  '', ' ', 'abc', '0', '00', '000', '000000000', '0000000000', '00000000000',
  '000000000000', '0000000000000', '00000000000000',
  '001001001', '0010010011', '00100100', '00100100a', 'a010047516',
  '0100047516 ', ' 0100047516', '01.00047516', '+0100047516',
  '0100047516\n', '\n0100047516', '0100047516\t',
  '0912345678', '912345678', '+84912345678', '84912345678', '840912345678',
  '+12025550143', '00800000000', '0000000000 ',
  '97.098.512.345', '1e10', 'null', 'undefined', 'NaN',
  '01000475160001', '01000475161000', '0100047516000', '010004751-001',
  '0100047516-001', '0100047516-000', '0100047516-999',
  // Digits outside ASCII, at every length this package cares about. Python's
  // \d is Unicode-aware and JavaScript's is not, so a port written with \d
  // accepts a card number the other one refuses. Ten digits was the only
  // non-ASCII string here at first, and every shape is nine, ten or thirteen
  // digits, so it failed the length test before the character class was ever
  // reached -- the port could have been wrong this whole time and the corpus
  // would not have noticed.
  '١٢٣٤٥٦٧٨٩٠',            // 10 Arabic-Indic
  '١٢٣٤٥٦٧٨٩٠١٢',          // 12, the card number length
  '١٢٣٤٥٦٧٨٩٠١٢٣',        // 13, the dependent tax unit length
  '١٢٣٤٥٦٧٨٩',              // 9, the old paper card length
  '१२३४५६७८९०१२',          // 12 Devanagari
  '０１００４７５１６',        // 12 fullwidth
  '010004751٦',             // nine ASCII and one that is not
  '٠١٠٠٠٤٧٥١٦',
  '+٨٤٩١٢٣٤٥٦٧٨',
]) {
  add('classifyId', { value });
  add('isValidMst', { code: value });
  add('isValidCccd', { code: value });
  add('isValidCmnd', { code: value });
  add('normalizePhone', { input: value });
  add('detectCarrier', { phone: value });
  add('isValidPhone', { input: value });
  add('parseMst', { code: value });
  add('parseCccd', { code: value });
}

function runHere(op) {
  switch (op.fn) {
    case 'mstCheckDigit': return mstCheckDigit(op.input.prefix);
    case 'isValidMst': return isValidMst(op.input.code);
    case 'parseMst': return parseMst(op.input.code);
    case 'normalizePhone': return normalizePhone(op.input.input, op.input.options);
    case 'detectCarrier': return detectCarrier(op.input.phone);
    case 'isValidPhone': return isValidPhone(op.input.input);
    case 'isValidCccd': return isValidCccd(op.input.code);
    case 'parseCccd': return parseCccd(op.input.code);
    case 'isValidCmnd': return isValidCmnd(op.input.code);
    case 'classifyId': return classifyId(op.input.value);
    default: throw new Error(`no runner for ${op.fn}`);
  }
}

/* --- Ask the Python port for the same answers ----------------------------- */

const PY =
  process.env.VN_IDENT_PYTHON ||
  (process.platform === 'win32'
    ? 'C:\\Users\\Legion 5 pro\\AppData\\Local\\Programs\\Python\\Python313\\python.exe'
    : 'python3');

const script = `
import json, sys
sys.path.insert(0, r'${resolve(HERE, '../packages/vn-ident-py/src').replace(/\\/g, '\\\\')}')
from vn_ident import (
    classify_id, detect_carrier, is_valid_cccd, is_valid_cmnd, is_valid_mst,
    is_valid_phone, mst_check_digit, normalize_phone, parse_cccd, parse_mst,
)

def as_dict(value, snake):
    if value is None:
        return None
    return {snake[k]: getattr(value, k) for k in snake}

TAX = {"region_code": "regionCode", "serial": "serial",
       "check_digit": "checkDigit", "branch": "branch"}
CARD = {"province_code": "provinceCode", "province": "province",
        "century": "century", "gender": "gender",
        "birth_year": "birthYear", "serial": "serial"}

def run(op):
    fn, d = op["fn"], op["input"]
    try:
        if fn == "mstCheckDigit":
            return mst_check_digit(d["prefix"])
        if fn == "isValidMst":
            return is_valid_mst(d["code"])
        if fn == "parseMst":
            return as_dict(parse_mst(d["code"]), TAX)
        if fn == "normalizePhone":
            return normalize_phone(
                d["input"],
                assume_trunk_zero=(d.get("options") or {}).get("assumeTrunkZero", True),
            )
        if fn == "detectCarrier":
            return detect_carrier(d["phone"])
        if fn == "isValidPhone":
            return is_valid_phone(d["input"])
        if fn == "isValidCccd":
            return is_valid_cccd(d["code"])
        if fn == "parseCccd":
            return as_dict(parse_cccd(d["code"]), CARD)
        if fn == "isValidCmnd":
            return is_valid_cmnd(d["code"])
        if fn == "classifyId":
            return classify_id(d["value"])
    except (TypeError, ValueError):
        return {"threw": True}
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
  console.error('Set VN_IDENT_PYTHON to a Python 3.9+ interpreter.');
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
    return `{${Object.keys(value).sort().map((k) => `${k}:${key(value[k])}`).join(',')}}`;
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

const byFn = {};
for (const op of OPS) byFn[op.fn] = (byFn[op.fn] ?? 0) + 1;
for (const fn of [
  'mstCheckDigit', 'isValidMst', 'parseMst', 'normalizePhone',
  'detectCarrier', 'isValidPhone', 'isValidCccd', 'parseCccd',
  'isValidCmnd', 'classifyId',
]) {
  if (!byFn[fn]) {
    console.error(`corpus has no ${fn} operations, so the check is not covering it`);
    process.exit(2);
  }
}

// If the two ports both answered the same wrong thing everywhere, "they agree"
// would be true and useless. Both outcomes have to be present in volume.
const mstResults = OPS.map(runHere).filter((_, i) => OPS[i].fn === 'mstCheckDigit');
const skipped = mstResults.filter((r) => r === null).length;
if (skipped < 5) {
  console.error(`suspicious: only ${skipped} prefixes hit the divisible-by-11 case`);
  process.exit(1);
}
if (mstResults.length - skipped < 5000) {
  console.error('suspicious: almost every generated prefix was skipped');
  process.exit(1);
}

const carriers = OPS.map(runHere).filter((_, i) => OPS[i].fn === 'detectCarrier');
const names = new Set(carriers.filter((c) => c !== null));
if (names.size !== 5) {
  console.error(`suspicious: only ${names.size} carriers appear in the corpus`);
  process.exit(1);
}

const provinces = new Set(
  OPS.map(runHere)
    .filter((r, i) => OPS[i].fn === 'parseCccd' && r !== null)
    .map((r) => r.provinceCode),
);
if (provinces.size !== 63) {
  console.error(`suspicious: only ${provinces.size} of 63 province codes appear`);
  process.exit(1);
}

console.log(`ident parity: ${ours.length}/${ours.length} operations identical across both ports`);
for (const fn of Object.keys(byFn)) console.log(`  ${fn}: ${byFn[fn]}`);
console.log(`  tax prefixes that hit the divisible-by-11 case: ${skipped}`);
console.log(`  carriers exercised: ${[...names].sort().join(', ')}`);
console.log(`  province codes exercised: ${provinces.size}`);
console.log(`  sample: mstCheckDigit("010004751") = ${mstCheckDigit('010004751')}`);
console.log(`  sample: parseCccd("001087123456") = ${JSON.stringify(parseCccd('001087123456'))}`);
console.log(`  sample: detectCarrier("0987654321") = ${detectCarrier('0987654321')}`);
