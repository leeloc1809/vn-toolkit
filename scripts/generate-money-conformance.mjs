/**
 * Generate conformance/vn-money-1.0.0.json.
 *
 *   node scripts/generate-money-conformance.mjs
 *
 * The formatting cases are read out of ICU rather than written by hand, the
 * same way the collation table is. Hand-writing a thousand separator is how a
 * library ends up disagreeing with every other tool in the ecosystem, and the
 * disagreement is invisible until an invoice says 1.100.000 instead of
 * 1,100,000.
 *
 * The reading convention for toWords is NOT derived from a runtime. Vietnamese
 * number reading has genuine regional variation -- "linh" against "lẻ", "một"
 * against "mốt", "bốn" against "tư" -- and no platform ships a canonical
 * answer, so the suite has to choose one and say so. The choice is recorded
 * under readingConvention below, and the cases that exist only to pin a
 * contested reading say which alternative they rejected.
 *
 * allocate is arithmetic, not vocabulary: the largest-remainder method has one
 * correct answer and it is computed here rather than transcribed.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../conformance/vn-money-1.0.0.json');

/* --- The spec: VND formatting, derived from ICU --------------------------- */

// The runtime the formatting cases were read out of. If a future ICU formats
// VND differently, this string is how you find out what moved.
const icu = process.versions.icu;
const unicode = process.versions.unicode;
const DERIVED_FROM =
  `Intl.NumberFormat('vi-VN', {style:'currency', currency:'VND'}) ` +
  `on ${process.platform}/${process.arch}, ICU ${icu}, Unicode ${unicode}; ` +
  `ISO 4217 minor unit 0`;

// Spelled by code point, not as a literal. A literal no-break space is invisible
// in an editor, so it survives review and is then silently replaced by a
// reformat, and the formatter stops matching ICU by exactly one code point.
// scripts/check-invisible-spaces.mjs fails the build if one comes back.
const NBSP = String.fromCodePoint(0x00a0);
const THIN_SPACE = String.fromCodePoint(0x2009);
const CURRENCY = String.fromCodePoint(0x20ab);
const ICU_FORMAT = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
});

/** Group thousands with a dot, exactly as vi-VN does. */
function groupDigits(digits) {
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += '.';
    out += digits[i];
  }
  return out;
}

/** The formatter the two ports must reproduce, and ICU the arbiter. */
function formatVnd(amount, options = {}) {
  const {
    groupSeparator = '.',
    symbol = CURRENCY,
    withSymbol = true,
    withSign = false,
  } = options;

  const negative = amount < 0;
  const body = groupDigits(String(Math.abs(amount))).split('.').join(groupSeparator);
  let out = negative ? '-' : withSign ? '+' : '';
  out += body;
  if (withSymbol) out += NBSP + symbol;
  return out;
}

/* --- The spec: reading a number out in words ------------------------------- */

// Every contested decision, in one object, so the suite cannot quietly drift
// away from the documentation that explains it.
const READING_CONVENTION = {
  fillerWord: 'linh',
  fillerWhen: 'the hundreds are present, the tens are zero, and the units are not',
  unitOne: {
    word: 'mốt',
    when: 'the units digit is 1 and the tens digit of the same triplet is 2 to 9',
    alternative: 'một',
  },
  unitFour: {
    word: 'tư',
    when: 'the units digit is 4 and the tens digit of the same triplet is 2 to 9',
    alternative: 'bốn',
  },
  unitFive: {
    word: 'lăm',
    when: 'the units digit is 5 and the tens digit of the same triplet is 1 to 9',
    alternative: 'năm',
  },
  tensOne: {
    word: 'mười',
    when: 'the tens digit is 1, whatever follows it',
    alternative: 'một mươi',
  },
  emptyTriplet: {
    rule:
      'a zero triplet with a non-zero triplet below it reads as "không" ' +
      'plus its magnitude name; a zero triplet above the most significant ' +
      'one, or in the tail, is silence',
    example:
      '1000008 reads "một triệu không nghìn không trăm linh tám", while ' +
      '1000000 reads "một triệu" and never "một triệu không nghìn"',
    alternative:
      'other published conventions drop the magnitude name on the empty slot ' +
      'and read only "không trăm"',
  },
  zeroHundreds: {
    rule:
      'a non-zero triplet whose hundreds digit is zero is read in full, so ' +
      'the "không trăm" slot is spoken -- but only when something of greater ' +
      'magnitude is also spoken, because then the position really is ambiguous',
    example:
      '1001 reads "một nghìn không trăm linh một", and 1000008 reads ' +
      '"một triệu không nghìn không trăm linh tám", while 5 reads "năm" ' +
      'rather than "không trăm linh năm"',
    alternative:
      'a convention that reads every triplet in full regardless would say ' +
      '"không trăm linh năm" for five dong',
  },
  magnitudeNames: ['nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'],
  largestValue: Number.MAX_SAFE_INTEGER,
  reasonForTheCeiling:
    'JS numbers are exact only to 2^53-1 and both ports take a number, so a ' +
    'larger amount would silently read a rounded value',
};

const DIGIT_WORDS = [
  'không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín',
];

/** Read one triplet, 1 to 999, under READING_CONVENTION. */
function readTriplet(value, speakZeroHundreds) {
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor((value % 100) / 10);
  const units = value % 10;
  const parts = [];

  if (hundreds > 0) parts.push(`${DIGIT_WORDS[hundreds]} trăm`);
  else if (speakZeroHundreds) parts.push('không trăm');

  if (tens > 0) {
    parts.push(tens === 1 ? 'mười' : `${DIGIT_WORDS[tens]} mươi`);
  } else if (units > 0 && (hundreds > 0 || speakZeroHundreds)) {
    parts.push(READING_CONVENTION.fillerWord);
  }

  if (units > 0) {
    // mốt and tư need a tens digit of at least 2; lăm needs only a non-zero
    // tens digit. 11, 14 and 15 are exactly where a sloppy implementation
    // shows up, which is why they are pinned as cases below.
    if (units === 1) parts.push(tens >= 2 ? READING_CONVENTION.unitOne.word : 'một');
    else if (units === 4) parts.push(tens >= 2 ? READING_CONVENTION.unitFour.word : 'bốn');
    else if (units === 5) parts.push(tens >= 1 ? READING_CONVENTION.unitFive.word : 'năm');
    else parts.push(DIGIT_WORDS[units]);
  }

  return parts.join(' ');
}

function toWords(amount) {
  if (!Number.isSafeInteger(amount)) {
    throw new Error(`${amount} is not a safe integer`);
  }
  if (amount === 0) return 'không';

  const magnitudeNames = READING_CONVENTION.magnitudeNames;
  const negative = amount < 0;
  const digits = String(Math.abs(amount));

  // One more triplet than there are magnitude names, because the units triplet
  // has no name of its own. In practice Number.isSafeInteger caps this at
  // sixteen digits, so the list is never the binding limit.
  if (digits.length > (magnitudeNames.length + 1) * 3) {
    throw new Error(`${amount} needs more triplets than the convention defines`);
  }

  // Only the triplets the number actually occupies. Padding to the full width
  // would push the significant digits into the topmost triplet and read five
  // dong as five million billion.
  const groupCount = Math.ceil(digits.length / 3);
  const padded = digits.padStart(groupCount * 3, '0');
  const words = [];
  const triplets = [];
  for (let i = groupCount - 1; i >= 0; i -= 1) {
    // i counts magnitudes from the units upwards, but the padded string
    // counts characters from the left, so the offset is the mirror of i.
    const start = (groupCount - 1 - i) * 3;
    triplets[i] = Number(padded.slice(start, start + 3));
  }

  // The lowest non-zero triplet. A zero triplet above it is a hole in the
  // middle of the number and has to be spoken; a zero triplet below it is the
  // tail, and the magnitude names already said everything it could.
  const lowest = triplets.findIndex((t) => t !== 0);
  let started = false;

  for (let i = groupCount - 1; i >= 0; i -= 1) {
    const triplet = triplets[i];
    // magnitudeNames starts at the thousands, so the units triplet has no name
    // and every other triplet is one index below its magnitude.
    const magnitude = i === 0 ? '' : magnitudeNames[i - 1];

    if (triplet === 0) {
      // A zero triplet above the most significant one is padding the number
      // happens to have, not a place value the speaker intended. So is a
      // trailing one: 1,000,000 is "một triệu", not "một triệu không nghìn".
      // Only a zero with a non-zero triplet below it is a real hole, and
      // without it the listener cannot tell 1,000,008 from 1,000,008,000,000.
      if (started && i > 0 && i > lowest) words.push(`không ${magnitude}`);
      continue;
    }

    // The "không trăm" slot is only spoken once something of greater
    // magnitude has been, which `started` records. The most significant
    // triplet has nothing above it, so there is nothing to disambiguate.
    const text = readTriplet(triplet, started);
    words.push(magnitude === '' ? text : `${text} ${magnitude}`);
    started = true;
  }

  return (negative ? 'âm ' : '') + words.join(' ');
}

/* --- The spec: splitting an amount without losing a single dong ----------- */

/**
 * Largest-remainder apportionment. Every dong lands somewhere, and when two
 * shares tie on the remainder the earlier one wins, so the result never depends
 * on a sort being stable.
 */
function allocate(total, shares) {
  const magnitude = BigInt(total < 0 ? -total : total);
  const sign = total < 0 ? -1n : 1n;
  const weights = shares.map((s) => BigInt(s));
  const sum = weights.reduce((a, b) => a + b, 0n);

  const base = weights.map((w) => (magnitude * w) / sum);
  const remainder = weights.map((w, i) => magnitude * w - base[i] * sum);
  let leftover = magnitude - base.reduce((a, b) => a + b, 0n);

  const order = weights
    .map((_, i) => i)
    .sort((a, b) => (remainder[b] === remainder[a] ? a - b : Number(remainder[b] - remainder[a])));

  const out = base.map((v) => v * sign);
  for (let k = 0; k < Number(leftover); k += 1) {
    out[order[k]] += sign;
  }

  return out.map((v) => Number(v));
}

/* --- The cases ------------------------------------------------------------- */

const cases = [];
const counters = new Map();

function add(fn, input, expected, note) {
  const n = (counters.get(fn) ?? 0) + 1;
  counters.set(fn, n);
  cases.push({
    id: `${fn}-${String(n).padStart(3, '0')}`,
    fn,
    input,
    expected,
    note,
  });
}

/* formatVnd -- every expectation read straight out of ICU. */

const FORMAT_AMOUNTS = [
  0, 1, 4, 5, 9, 10, 11, 15, 21, 24, 25, 55, 99, 100, 101, 105, 110, 115, 150,
  200, 555, 999, 1000, 1001, 1010, 1100, 1234, 9999, 10000, 100000, 123456,
  999999, 1000000, 1000001, 1234567, 9999999, 10000000, 123456789, 1000000000,
  1234567890, 1000000000000, 999999999999999,
];

for (const amount of FORMAT_AMOUNTS) {
  const icuOut = ICU_FORMAT.format(amount);
  const mine = formatVnd(amount);
  if (mine !== icuOut) {
    throw new Error(
      `the formatter and ICU disagree at ${amount}:\n  ours: ${JSON.stringify(mine)}\n  icu:  ${JSON.stringify(icuOut)}`,
    );
  }
  add(
    'formatVnd',
    { amount },
    icuOut,
    `vi-VN groups thousands with a dot, separates the symbol with U+00A0, and shows no decimal places because VND has a minor unit of 0`,
  );
}

// Negative amounts, and the explicit-sign variant. ICU only pins the first.
for (const amount of [-1, -1000, -1000000, -123456789]) {
  const icuOut = ICU_FORMAT.format(amount);
  if (formatVnd(amount) !== icuOut) throw new Error(`negative ${amount} disagrees with ICU`);
  add(
    'formatVnd',
    { amount },
    icuOut,
    'ICU puts the minus in front of the digits, not in front of the symbol',
  );
}

add('formatVnd', { amount: 1000000, options: { withSymbol: false } }, '1.000.000',
  'a bare number, for a column in a spreadsheet or a CSV a colleague opens');
add('formatVnd', { amount: 1000000, options: { withSymbol: false, groupSeparator: ',' } }, '1,000,000',
  'the separator is the one thing a Vietnamese shop actually argues about with a foreign marketplace, so it is the one thing that is configurable');
add('formatVnd', { amount: 1000000, options: { withSymbol: false, groupSeparator: '' } }, '1000000',
  'an empty separator gives an ungrouped number, which is what an export format wants');
add('formatVnd', { amount: 1000000, options: { symbol: 'VND' } }, `1.000.000${NBSP}VND`,
  'the symbol is configurable because every payment gateway spells it differently');
add('formatVnd', { amount: 1000000, options: { withSign: true } }, `+1.000.000${NBSP}${CURRENCY}`,
  'withSign is off by default: a "+" in a stored amount is a rendering decision, not part of the value');
add('formatVnd', { amount: -1000000, options: { withSign: true } }, `-1.000.000${NBSP}${CURRENCY}`,
  'withSign never produces "+-": a negative amount keeps its own minus');

/* isVnd */

const IS_VND = [
  [0, true, 'zero dong is a real amount'],
  [1, true, null],
  [1000000, true, null],
  [-1, true, 'a refund is a negative amount, not an invalid one'],
  [Number.MAX_SAFE_INTEGER, true, 'the largest integer both ports can hold exactly'],
  [-Number.MAX_SAFE_INTEGER, true, null],
  [1.5, false, 'VND has no minor unit, so a fractional dong cannot be represented and is not rounded silently'],
  [0.5, false, null],
  [-1.5, false, null],
  [Number.NaN, false, 'NaN is not an amount'],
  [Number.POSITIVE_INFINITY, false, 'infinity is not an amount'],
  [Number.NEGATIVE_INFINITY, false, null],
  [Number.MAX_SAFE_INTEGER + 1, false, 'past 2^53-1 a number silently loses its low bits, so it is refused rather than accepted and corrupted'],
  [0.1 + 0.2, false, 'this sums to 0.30000000000000004 in binary floating point, which is exactly the class of bug the check exists to stop'],
];
for (const [value, expected, note] of IS_VND) {
  add('isVnd', { value }, expected, note ?? 'a safe integer is a valid amount');
}

/* parseVnd */

const PARSE_OK = [
  ['0', 0, 'the smallest amount'],
  ['1', 1, null],
  ['1000', 1000, 'an ungrouped number parses as itself'],
  ['1.000', 1000, 'a dot is a thousands separator in vi-VN, so this is one thousand, not one'],
  ['1,000', 1000, 'a comma is accepted too, because text pasted from en-US must not silently become 1'],
  ['1 000', 1000, 'a plain space groups, the way it is written on a receipt'],
  [`1${NBSP}000`, 1000, 'U+00A0 is the space ICU itself emits, so round-tripping a formatted amount must work'],
  [`1${THIN_SPACE}000`, 1000, 'a thin space is what a browser inserts when a price is broken across lines'],
  ['1.000.000', 1000000, null],
  ['12.345.678', 12345678, null],
  ['+1000', 1000, 'an explicit plus is accepted'],
  ['-1.000', -1000, null],
  ['-1.000.000', -1000000, null],
  ['  1.000  ', 1000, 'surrounding whitespace is not the same as a grouping space and must be allowed'],
  [`1.000${NBSP}${CURRENCY}`, 1000, 'the symbol is stripped, so a formatted amount parses back'],
];

for (const [input, value, note] of PARSE_OK) {
  if (value === null) continue;
  add('parseVnd', { input }, value, note ?? 'a grouped, optionally signed number with an optional symbol');
}

// The other spellings of the same symbol.
for (const suffix of ['₫', 'đ', 'Đ', 'VND', 'vnd']) {
  add('parseVnd', { input: `1.000.000 ${suffix}` }, 1000000,
    `"${suffix}" is stripped: the amount is the same and a shop's export should not have to be fixed first`);
}
add('parseVnd', { input: '₫1000' }, 1000,
  'the symbol is accepted in front as well, because some receipts print it there');

const PARSE_ERR = [
  ['', 'empty', 'an empty string is not an amount, and defaulting it to 0 is how a form saves a blank total'],
  ['   ', 'empty', null],
  ['abc', 'unexpected-character', null],
  ['1.5', 'has-decimal', 'a dot followed by fewer than three digits is a decimal point, not a separator: this is the mistake that turns 1.500 into 1.5'],
  ['1,5', 'has-decimal', null],
  ['1.50', 'has-decimal', null],
  ['1.2345', 'has-decimal', 'four digits after the dot is a malformed group, and guessing which of the two is wrong is not a decision a parser gets to make silently'],
  ['1.000,5', 'has-decimal', 'a mixed pair like this is a decimal, not a grouping'],
  ['12.34', 'has-decimal', null],
  ['1.2.3', 'has-decimal', 'two short groups in a row are not grouping either'],
  ['1000₫500', 'unexpected-character', 'two numbers with a symbol in the middle are not one number'],
  ['-', 'empty', 'a sign on its own carries no digits'],
  ['+', 'empty', null],
  ['1e3', 'unexpected-character', 'scientific notation is not how a price arrives; accepting it hides a bug upstream'],
];
for (const [input, reason, note] of PARSE_ERR) {
  if (typeof reason === 'number') continue;
  add('parseVnd', { input }, { error: reason },
    note ?? 'the parser refuses instead of guessing, because a money parser that guesses is worse than one that fails');
}
add('parseVnd', { input: '1 000 000 ₫' }, 1000000,
  'spaces group on their own, so a receipt written out in words groups just as well');

/* allocate */

const ALLOCATE = [
  [[100, [1, 1, 1]], [34, 33, 33], 'the classic three-way split: two dong are left over and the earlier shares get them'],
  [[100, [1, 1]], [50, 50], null],
  [[101, [1, 1]], [51, 50], 'the odd dong goes to the first share, and it always does, not sometimes'],
  [[1, [1, 1, 1, 1, 1]], [1, 0, 0, 0, 0], 'a one-dong bill split five ways cannot round, so one person pays and the rest owe nothing'],
  [[0, [1, 2, 3]], [0, 0, 0], 'a zero amount splits into zeros, and the shares still decide who would pay'],
  [[-100, [1, 1, 1]], [-34, -33, -33], 'a negative total splits the same way, and the parts add back up to the total'],
  [[7, [1, 1]], [4, 3], null],
  [[999, [3, 1]], [749, 250], 'a 3:1 ratio of 999 leaves 0.75 and 0.25 over, so the odd dong goes to the SMALLER share: the remainder decides, not the position in the list'],
  [[999, [1, 3]], [250, 749], 'the same 999 apportioned the other way round, which shows the answer follows the shares rather than the order they arrived in'],
  [[1000000, [1, 1, 1]], [333334, 333333, 333333], 'a million dong split three ways, which is the case a real bill hits'],
  [[1000000, [1, 1, 1, 1, 1, 1, 1]], [142858, 142857, 142857, 142857, 142857, 142857, 142857], null],
  [[12345, [2, 3, 5]], [2469, 3704, 6172], 'shares that sum to ten still apportion exactly, and here the middle share has the largest remainder and takes the odd dong'],
  [[100, [0, 0, 1]], [0, 0, 100], 'a zero share is simply nobody: they are not an error, and refusing them would break a filtered list'],
  [[5, [0, 1]], [0, 5], null],
  [[1000000000, [1, 1, 1, 1, 1, 1, 1]], [142857143, 142857143, 142857143, 142857143, 142857143, 142857143, 142857142], 'a billion split seven ways overflows a 32-bit int and must not be computed in one'],
  [[Number.MAX_SAFE_INTEGER, [1, 1]], [4503599627370496, 4503599627370495], 'the arithmetic runs on big integers, so the two halves still add back up exactly at the top of the range'],
];
for (const [[total, shares], expected, note] of ALLOCATE) {
  if (expected === undefined) continue;
  const computed = allocate(total, shares);
  if (JSON.stringify(computed) !== JSON.stringify(expected)) {
    throw new Error(
      `allocate(${total}, [${shares}]) gave [${computed}] but the case says [${expected}]`,
    );
  }
  add('allocate', { total, shares }, expected,
    note ?? 'the shares add back up to the total exactly, with no dong created or lost');
}

/* toWords */

// Cases that exist only to pin a contested reading, each naming the reading it
// rejected. These are the ones a future contributor is most likely to "fix".
const WORDS_PINNED = [
  [0, 'không', 'zero is the only word, and it is the same word the filler uses'],
  [5, 'năm', 'a 5 with no tens digit is năm; lăm would sound like "years"'],
  [15, 'mười lăm', 'pinned against "mười năm": the two are pronounced identically, which is the entire reason lăm exists'],
  [25, 'hai mươi lăm', null],
  [105, 'một trăm linh năm', 'pinned against "một trăm lẻ năm" and against the shorter "một trăm năm", which reads as 150'],
  [21, 'hai mươi mốt', 'pinned against "hai mươi một": mốt is the codified school rule for a units 1 behind a tens of 2 or more'],
  [24, 'hai mươi tư', 'pinned against "hai mươi bốn"'],
  [14, 'mười bốn', 'a tens digit of exactly 1 keeps bốn, not tư: the rule starts at 2, and 11 and 14 are where a sloppy implementation shows up'],
  [11, 'mười một', 'the mốt rule needs a tens digit of at least 2, so this stays một'],
  [4, 'bốn', 'four on its own is bốn, never tư'],
  [10, 'mười', 'pinned against "một mươi", which is wrong in the codified convention'],
  [100, 'một trăm', null],
  [101, 'một trăm linh một', 'the mốt rule is scoped to the units place, so a hundreds digit of 1 is still một'],
  [1000, 'một nghìn', null],
  [1001, 'một nghìn không trăm linh một', 'the "không trăm" slot is spoken here because a greater magnitude is too, so the position is genuinely ambiguous; dropping it would read as "một nghìn một"'],
  [1000000, 'một triệu', null],
  [1000008, 'một triệu không nghìn không trăm linh tám', 'pinned against "một triệu không trăm linh tám": the empty thousands slot keeps its magnitude name, so every place value is spoken exactly once'],
  [1000000000, 'một tỷ', null],
  [1024123, 'một triệu không trăm hai mươi tư nghìn một trăm hai mươi ba', 'a 024 triplet reads không trăm, because the hundreds are zero inside a triplet that is otherwise read in full'],
  [1000000000000, 'một nghìn tỷ', null],
  [1000000000000000, 'một triệu tỷ', null],
  [999999999999999, 'chín trăm chín mươi chín nghìn tỷ chín trăm chín mươi chín tỷ chín trăm chín mươi chín triệu chín trăm chín mươi chín nghìn chín trăm chín mươi chín', 'the largest fifteen-digit value: every triplet is 999, so no special case fires and the plain reading repeats across all five magnitudes'],
  [-1, 'âm một', 'a negative amount is prefixed, not read backwards, so no sign ever gets lost in a string operation'],
  [-15000, 'âm mười lăm nghìn', null],
  [1005, 'một nghìn không trăm linh năm', 'a 5 preceded by a zero reads năm, not lăm, even though the number is five digits long'],
  [515, 'năm trăm mười lăm', 'here the 5 is behind a tens digit, so lăm; the rule is about position inside a triplet, not about the size of the number'],
  [5555, 'năm nghìn năm trăm năm mươi lăm', null],
  [100000, 'một trăm nghìn', 'a 5 in the hundreds is năm, never lăm, whatever sits to the right of it'],
  [21, 'hai mươi mốt', null],
  [31, 'ba mươi mốt', null],
  [91, 'chín mươi mốt', null],
  [41, 'bốn mươi mốt', null],
  [81, 'tám mươi mốt', null],
];
for (const [amount, expected, note] of WORDS_PINNED) {
  const computed = toWords(amount);
  if (computed !== expected) {
    throw new Error(`toWords(${amount}) gave "${computed}" but the case says "${expected}"`);
  }
  add('toWords', { amount }, expected,
    note ?? 'read under the convention recorded in readingConvention');
}

// Every number from 0 to 999, which is where the triplet rules actually live.
// A whole sweep beats a hand-picked set: the cases that break a reading rule
// are the ones nobody thinks to write down.
for (let n = 0; n <= 999; n += 1) {
  add('toWords', { amount: n }, toWords(n),
    'one of a thousand consecutive values, so the whole 0-999 triplet is covered rather than a sample of it');
}

// One value per hundred, to check the magnitude join.
for (let n = 1000; n <= 9000; n += 100) {
  add('toWords', { amount: n }, toWords(n), 'a thousands value, to check the magnitude name is joined to the triplet');
}

/* --- Emit ------------------------------------------------------------------ */

const FUNCTIONS = ['isVnd', 'formatVnd', 'parseVnd', 'allocate', 'toWords'];

const byFn = Object.fromEntries(FUNCTIONS.map((f) => [f, counters.get(f) ?? 0]));
for (const f of FUNCTIONS) {
  if (!byFn[f]) throw new Error(`no cases for ${f}; the suite would let a stub pass`);
}

const suite = {
  schema: 'vn-money-conformance/1',
  library: 'vn-money',
  version: '0.1.0',
  created: '2026-10-04',
  derivedFrom: DERIVED_FROM,
  description:
    'Vietnamese money handling pinned as a contract between two ports. The ' +
    'formatting cases are read out of ICU, so they cannot be wrong in a way ' +
    'the platform itself would not be. The reading cases pin one of several ' +
    'published Vietnamese conventions and name the alternative they rejected; ' +
    'there is no platform to defer to, so the suite has to choose and say so.',
  currency: {
    code: 'VND',
    // ISO 4217 gives VND a minor unit of 0. Everything downstream follows from
    // that one fact: no decimals, no rounding, and hào and xu are history.
    minorUnits: 0,
    symbol: CURRENCY,
    symbolNote: `U+20AB VIETNAMESE DONG SIGN, as ICU writes it. U+0110 (Đ) and U+0111 (đ) are informal stand-ins`,
    groupSeparator: '.',
    decimalSeparator: ',',
    groupSeparatorNote:
      'vi-VN uses the same two characters as en-US with the opposite ' +
      'meaning: a dot groups and a comma separates decimals. Copying an ' +
      'en-US formatter here produces a wrong number that still looks fine.',
  },
  readingConvention: READING_CONVENTION,
  functions: FUNCTIONS,
  caseCounts: byFn,
  cases,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(suite, null, 2) + '\n', 'utf8');

console.log(`wrote ${OUT}`);
console.log(`${cases.length} cases across ${FUNCTIONS.length} functions`);
for (const f of FUNCTIONS) console.log(`  ${f}: ${byFn[f]}`);
console.log(`derived from: ${DERIVED_FROM}`);
