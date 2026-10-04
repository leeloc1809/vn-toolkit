/**
 * Generate conformance/vn-ident-1.0.0.json.
 *
 *   node scripts/generate-ident-conformance.mjs
 *
 * Unlike the collation and money suites, there is no platform to read these
 * rules out of. The tax check digit comes from a Vietnamese circular, the
 * carrier prefixes from the carriers' own published ranges, and the province
 * codes from the decree that defines them. So the tables live here, written
 * once, and the suite records where each one came from.
 *
 * Every table below is a transcription, and a transcription is exactly the kind
 * of thing that is wrong in a way nobody notices: one weight off by two, one
 * province mapped to its neighbour, one carrier prefix assigned twice. The
 * suite's job is to make that visible. The MST weights are the sharpest
 * example -- a wrong weight still produces a well-formed check digit, so a
 * transposed pair of weights would validate real tax codes and reject none.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../conformance/vn-ident-1.0.0.json');

/* --- The tables, and where each one comes from ---------------------------- */

const MST_SOURCE =
  'Thông tư 105/2020/TT-BTC Điều 5 and Phụ lục 1, read from the official ' +
  'VBQPPL portal at moj.gov.vn';

/** Position 1 to 9. The province revenue code, the serial, then the check digit. */
const MST_WEIGHTS = [31, 29, 23, 19, 17, 13, 7, 5, 3];

/**
 * The 63 province codes, from Quyết định 124/2004/QĐ-TTg, cross-checked
 * against chinhphu.gov.vn, thuvienphapluat.vn and vietnamnet.vn.
 *
 * One of those four sources prints Bắc Giang as 023. The other three, and the
 * decree itself, say 024, so 024 is what is here. A single-source table would
 * have carried the typo.
 */
const PROVINCES = [
  ['001', 'Hà Nội'], ['002', 'Hà Giang'], ['004', 'Cao Bằng'], ['006', 'Bắc Kạn'],
  ['008', 'Tuyên Quang'], ['010', 'Lào Cai'], ['011', 'Điện Biên'], ['012', 'Lai Châu'],
  ['014', 'Sơn La'], ['015', 'Yên Bái'], ['017', 'Hòa Bình'], ['019', 'Thái Nguyên'],
  ['020', 'Lạng Sơn'], ['022', 'Quảng Ninh'], ['024', 'Bắc Giang'], ['025', 'Phú Thọ'],
  ['026', 'Vĩnh Phúc'], ['027', 'Bắc Ninh'], ['030', 'Hải Dương'], ['031', 'Hải Phòng'],
  ['033', 'Hưng Yên'], ['034', 'Thái Bình'], ['035', 'Hà Nam'], ['036', 'Nam Định'],
  ['037', 'Ninh Bình'], ['038', 'Thanh Hóa'], ['040', 'Nghệ An'], ['042', 'Hà Tĩnh'],
  ['044', 'Quảng Bình'], ['045', 'Quảng Trị'], ['046', 'Thừa Thiên Huế'], ['048', 'Đà Nẵng'],
  ['049', 'Quảng Nam'], ['051', 'Quảng Ngãi'], ['052', 'Bình Định'], ['054', 'Phú Yên'],
  ['056', 'Khánh Hòa'], ['058', 'Ninh Thuận'], ['060', 'Bình Thuận'], ['062', 'Kon Tum'],
  ['064', 'Gia Lai'], ['066', 'Đắk Lắk'], ['067', 'Đắk Nông'], ['068', 'Lâm Đồng'],
  ['070', 'Bình Phước'], ['072', 'Tây Ninh'], ['074', 'Bình Dương'], ['075', 'Đồng Nai'],
  ['077', 'Bà Rịa - Vũng Tàu'], ['079', 'Hồ Chí Minh'], ['080', 'Long An'],
  ['082', 'Tiền Giang'], ['083', 'Bến Tre'], ['084', 'Trà Vinh'], ['086', 'Vĩnh Long'],
  ['087', 'Đồng Tháp'], ['089', 'An Giang'], ['091', 'Kiên Giang'], ['092', 'Cần Thơ'],
  ['093', 'Hậu Giang'], ['094', 'Sóc Trăng'], ['095', 'Bạc Liêu'], ['096', 'Cà Mau'],
];

/**
 * The fourth digit: which century, and which sex. The pairs run in order, so
 * even digits are male and odd are female, two per century.
 */
const CENTURY_GENDER = [
  ['0', 20, 'male'], ['1', 20, 'female'],
  ['2', 21, 'male'], ['3', 21, 'female'],
  ['4', 22, 'male'], ['5', 22, 'female'],
  ['6', 23, 'male'], ['7', 23, 'female'],
  ['8', 24, 'male'], ['9', 24, 'female'],
];

/** Three-digit mobile prefixes, by carrier. 34 of them in total. */
const CARRIERS = [
  ['viettel', ['032', '033', '034', '035', '036', '037', '038', '039', '086', '096', '097', '098']],
  ['vinaphone', ['081', '082', '083', '084', '085', '088', '091', '094']],
  ['mobifone', ['070', '076', '077', '078', '079', '089', '090', '093']],
  ['vietnamobile', ['052', '056', '058', '092']],
  ['gmobile', ['059', '099']],
];

/* --- The spec: the tax check digit --------------------------------------- */

/**
 * Thông tư 105/2020/TT-BTC, Phụ lục 1.
 *
 * Nine digits in, one digit out -- or null, and null is the interesting case.
 * When the weighted sum divides exactly by 11 there is no check digit that
 * could be assigned without colliding, so the sequence number is skipped. That
 * is why this returns null rather than 10: no tax code whose first nine digits
 * sum to a multiple of 11 can be valid, and one that claims to be is not.
 */
function mstCheckDigit(nine) {
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(nine[i]) * MST_WEIGHTS[i];
  }
  const remainder = sum % 11;
  if (remainder === 0) return null;
  return 10 - remainder;
}

const DIGITS = /^[0-9]+$/;

/** Drop the hyphens the circular writes into the 13-digit form. */
function bare(code) {
  return typeof code === 'string' ? code.replace(/-/g, '') : '';
}

function isValidMst(code) {
  const s = bare(code);
  if (!DIGITS.test(s)) return false;
  if (s.length !== 10 && s.length !== 13) return false;
  if (s.length === 13) {
    const branch = Number(s.slice(10));
    // N11N12N13 runs from 001 to 999. A branch numbered 000 or 1000 does not
    // exist, and accepting it would let a typo through as a real entity.
    if (branch < 1 || branch > 999) return false;
  }
  return mstCheckDigit(s.slice(0, 9)) === Number(s[9]);
}

function parseMst(code) {
  if (!isValidMst(code)) return null;
  const s = bare(code);
  const serial = Number(s.slice(2, 9));
  return {
    // Not a province. This is the tax authority's own revenue code, published
    // in the Ministry of Finance's catalogue, and it is not the same list as
    // the CCCD province codes. Calling it a province is how two different
    // catalogues end up merged in somebody's database.
    regionCode: s.slice(0, 2),
    serial: String(serial).padStart(7, '0'),
    checkDigit: Number(s[9]),
    branch: s.length === 13 ? s.slice(10) : null,
  };
}

/* --- The spec: mobile numbers -------------------------------------------- */

const PREFIX_TO_CARRIER = new Map();
for (const [carrier, prefixes] of CARRIERS) {
  for (const prefix of prefixes) {
    if (PREFIX_TO_CARRIER.has(prefix)) {
      throw new Error(`prefix ${prefix} is assigned to two carriers`);
    }
    PREFIX_TO_CARRIER.set(prefix, carrier);
  }
}

const NATIONAL = '0';

/**
 * Reduce what a person typed to a ten-digit national number, or null.
 *
 * The one inference is a bare nine-digit number: it is assumed to have lost its
 * trunk zero, because that is how a national number is written down and how it
 * arrives from a contact form. Set assumeTrunkZero to false to refuse it
 * instead. Everything else is unambiguous -- the +84 forms all say the same
 * thing, and a number that is 8, 11 or 12 digits with no 84 is refused rather
 * than guessed at.
 */
function normalizePhone(input, { assumeTrunkZero = true } = {}) {
  if (typeof input !== 'string') return null;
  const s = input.replace(/\D/g, '');
  if (s.length === 0) return null;

  let rest = s;
  if (rest.startsWith('84')) rest = rest.slice(2);

  if (rest.length === 9 && !rest.startsWith(NATIONAL)) {
    if (!assumeTrunkZero) return null;
    rest = NATIONAL + rest;
  }

  if (rest.length !== 10) return null;
  if (!rest.startsWith(NATIONAL)) return null;
  return rest;
}

function detectCarrier(phone) {
  const s = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
  // Only a normalised number is looked up. A nine-digit number has no carrier
  // until the trunk zero is known, and guessing is how a phone ends up
  // attributed to the wrong network.
  if (!/^0[0-9]{9}$/.test(s)) return null;
  return PREFIX_TO_CARRIER.get(s.slice(0, 3)) ?? null;
}

function isValidPhone(input) {
  return normalizePhone(input) !== null;
}

/* --- The spec: identity card numbers ------------------------------------- */

const PROVINCE_CODES = new Set(PROVINCES.map(([code]) => code));
const PROVINCE_NAMES = new Map(PROVINCES);
const CENTURY_BY_DIGIT = new Map(CENTURY_GENDER.map(([d, century]) => [d, century]));
const GENDER_BY_DIGIT = new Map(CENTURY_GENDER.map(([d, , gender]) => [d, gender]));

/**
 * Well-formed, and the province code is one that exists.
 *
 * There is no check digit in a CCCD. The last six digits are random, so unlike
 * a tax code there is nothing to verify -- this cannot detect a number that is
 * well-formed and wrong, and pretending otherwise would be the most expensive
 * thing this library could do. It is a format check, and the suite says so.
 *
 * It also cannot tell you which generation of card it is. The old unchipped
 * 12-digit number and the current chip number have the same structure, and no
 * function here will claim to distinguish them.
 */
function isValidCccd(code) {
  if (typeof code !== 'string') return false;
  if (!/^[0-9]{12}$/.test(code)) return false;
  if (!PROVINCE_CODES.has(code.slice(0, 3))) return false;
  // The fourth digit is always defined, so this is a table lookup, not a range
  // check. It is written out anyway so a future table that drops a digit fails
  // loudly instead of yielding NaN.
  return CENTURY_BY_DIGIT.has(code[3]);
}

function parseCccd(code) {
  if (!isValidCccd(code)) return null;
  const century = CENTURY_BY_DIGIT.get(code[3]);
  const twoDigitYear = Number(code.slice(4, 6));
  return {
    provinceCode: code.slice(0, 3),
    province: PROVINCE_NAMES.get(code.slice(0, 3)),
    century,
    gender: GENDER_BY_DIGIT.get(code[3]),
    // The two digits are the last two of the year, so the century digit is
    // what turns 85 into 1985 rather than 2085.
    birthYear: (century - 1) * 100 + twoDigitYear,
    serial: code.slice(6),
  };
}

/** The old paper card: nine digits, no structure to check, no check digit. */
function isValidCmnd(code) {
  return typeof code === 'string' && /^[0-9]{9}$/.test(code);
}

/**
 * What is this string, as far as structure goes?
 *
 * Ordered deliberately: a nine-digit value is an old card, a ten- or
 * thirteen-digit value is a tax code, a ten-digit value starting 0 is a mobile
 * number, and a twelve-digit value with a known province code is a card. The
 * ambiguous cases resolve to the reading that loses the least information, and
 * the ones that cannot be resolved at all say so.
 */
function classifyId(value) {
  if (typeof value !== 'string') return 'unknown';
  const s = value.trim();
  if (s.length === 0) return 'unknown';
  if (isValidCccd(s)) return 'cccd';
  if (isValidMst(s)) return 'mst';
  if (isValidPhone(s)) return 'phone';
  if (isValidCmnd(s)) return 'cmnd';
  return 'unknown';
}

/* --- The cases ------------------------------------------------------------- */

const cases = [];
const counters = new Map();

function add(fn, input, expected, note) {
  const n = (counters.get(fn) ?? 0) + 1;
  counters.set(fn, n);
  cases.push({ id: `${fn}-${String(n).padStart(3, '0')}`, fn, input, expected, note });
}

/* mstCheckDigit */

const MST_PREFIXES = [
  '010004751', // the worked example in the circular itself
  '000000001', '010000000', '030000000', '790000000',
  '010000001', '010000010', '010000100', '010001000', '010010000',
  '010100000', '011000000', '012345678', '100000000',
  '000000000', '987654321', // both skipped: the weighted sum is a multiple of 11
];

for (const prefix of MST_PREFIXES) {
  const expected = mstCheckDigit(prefix);
  add('mstCheckDigit', { prefix }, expected,
    expected === null
      ? `the weighted sum is divisible by 11, so the circular skips this sequence number rather than assigning a check digit`
      : `weights ${MST_WEIGHTS.join(' ')} against the nine digits give a remainder, and 10 minus it is the check digit`);
}

// A prefix whose weighted sum is a multiple of 11 is the case a naive
// implementation gets wrong: 10 - 0 is 10, and "10" is not a digit.
const skipped = [];
for (let n = 0; n < 200000 && skipped.length < 6; n += 1) {
  const prefix = String(n).padStart(9, '0');
  if (mstCheckDigit(prefix) === null) skipped.push(prefix);
}
for (const prefix of skipped) {
  add('mstCheckDigit', { prefix }, null,
    'a multiple of 11 leaves no check digit, because 10 - 0 is 10; the circular skips this sequence number instead of writing a tenth digit');
}

// Every possible remainder, so all eleven outcomes are pinned.
const seenRemainders = new Map();
for (let n = 0; n < 400000 && seenRemainders.size < 11; n += 1) {
  const prefix = String(n).padStart(9, '0');
  const check = mstCheckDigit(prefix);
  if (check !== null && !seenRemainders.has(check)) seenRemainders.set(check, prefix);
}
for (const check of [...seenRemainders.keys()].sort((a, b) => a - b)) {
  add('mstCheckDigit', { prefix: seenRemainders.get(check) }, check,
    `check digit ${check}, one representative for each of the ten values the algorithm can produce`);
}

/* isValidMst */

const MST_VALID = [
  '0100047516', // the worked example printed in the circular itself
  '0000000017',
  '0100000003',
  '0304751015',
  '0100475102',
  '7900000005',
  '0100047516001', // a dependent unit: the parent's ten digits, then 001
  '0100047516999',
  '0100047516-001', // the same, hyphenated the way the circular prints it
];
for (const code of MST_VALID) {
  if (!isValidMst(code)) throw new Error(`the suite thinks ${code} is invalid`);
  add('isValidMst', { code }, true,
    code.includes('-')
      ? 'the hyphen the circular writes between the ten digits and the branch is accepted, because it is how the code is printed'
      : 'the tenth digit is the check digit the circular computes');
}

const MST_INVALID = [
  ['0100047517', 'the tenth digit does not match the computed check digit'],
  ['0100047510', '0 is a digit the algorithm can produce, but not this one: the check digit here is 6'],
  ['0000000000', 'the first nine digits sum to a multiple of 11, so the circular skips this sequence number and no check digit can be assigned to it'],
  ['0000000005', 'as above, with a digit that looks plausible'],
  ['010004751', 'nine digits is the prefix, not a tax code'],
  ['01000475166', 'eleven digits is not a form the circular defines'],
  ['0100047516000', 'a 13-digit code whose branch is 000, outside the 001 to 999 range'],
  ['01000475161000', 'a branch of 1000 is out of range the other way'],
  ['01000475160010', 'a 14-digit code'],
  ['abc0475106', 'letters are not digits'],
  ['', 'an empty field is not a tax code'],
  ['0100047516 ', 'trailing space is refused rather than trimmed, so a paste is a visible error rather than a silent success'],
  ['+0100047516', 'a leading plus is refused'],
  ['01.00047516', 'a separator is refused: a tax code is digits, and a grouped one is a different string every time'],
];
for (const [code, note] of MST_INVALID) {
  if (isValidMst(code)) throw new Error(`the suite thinks ${code} is valid`);
  add('isValidMst', { code }, false, note);
}

// Every wrong check digit for one real code, so an off-by-one in the algorithm
// cannot hide behind a single negative.
for (let d = 0; d <= 9; d += 1) {
  const code = `010004751${d}`;
  add('isValidMst', { code }, d === 6,
    d === 6
      ? 'the one tenth digit that matches the check digit'
      : 'a tenth digit that is not the check digit, and the whole code is refused because of it');
}

/* parseMst */

add('parseMst', { code: '0100047516' },
  { regionCode: '01', serial: '0004751', checkDigit: 6, branch: null },
  'the seven middle digits are the sequence number, kept as a string because the leading zeros are part of it');
add('parseMst', { code: '0100047516001' },
  { regionCode: '01', serial: '0004751', checkDigit: 6, branch: '001' },
  'a 13-digit code is the same ten digits plus a three-digit branch, so the parent parses identically');
add('parseMst', { code: '0100047517' }, null,
  'an invalid code parses to null rather than to a partial answer');
add('parseMst', { code: '0100047516000' }, null,
  'a branch of 000 is out of range, so the whole code is refused rather than the branch alone');

/* normalizePhone */

const PHONE_OK = [
  ['0912345678', '0912345678', 'the national form, already correct'],
  ['+84912345678', '0912345678', 'the international form loses the 84 and regains the trunk zero'],
  ['84912345678', '0912345678', 'without the plus, 84 is still the country code here'],
  ['840912345678', '0912345678', 'somebody wrote the 84 in front of the already-national form'],
  ['0912 345 678', '0912345678', 'spaces are how people write a phone number down'],
  ['0912-345-678', '0912345678', null],
  ['0912.345.678', '0912345678', null],
  ['(0912) 345678', '0912345678', 'punctuation a person typed, not a delimiter with meaning'],
  ['  0912345678  ', '0912345678', 'surrounding whitespace is trimmed'],
  ['912345678', '0912345678', 'the one inference: a bare nine-digit national number is assumed to have lost its trunk zero'],
  ['0987654321', '0987654321', null],
  ['0800123456', '0800123456', 'a landline-format number: 10 digits starting 0, valid as a number even though no mobile carrier owns it'],
];
for (const [input, expected, note] of PHONE_OK) {
  const actual = normalizePhone(input);
  if (actual !== expected) throw new Error(`normalizePhone(${input}) gave ${actual}, not ${expected}`);
  add('normalizePhone', { input }, expected,
    note ?? 'spaces, dashes, dots and brackets are how people write a number, not information');
}

const PHONE_BAD = [
  ['', 'an empty field is not a phone number'],
  ['091234567', 'nine digits starting 0, which is not the shape of anything'],
  ['09123456789', 'eleven digits with no country code'],
  ['8491234567', 'the 84 form with a number that already has its zero, and one digit short'],
  ['+1 202 555 0143', 'a North American number, refused rather than reshaped into something that looks Vietnamese'],
  ['abc', 'letters are not digits, and stripping them leaves nothing'],
  ['09123456789012', 'a number far too long to be anything but a paste accident'],
];
for (const [input, note] of PHONE_BAD) {
  if (normalizePhone(input) !== null) throw new Error(`normalizePhone(${input}) should be null`);
  add('normalizePhone', { input }, null, note);
}

add('normalizePhone', { input: '912345678', options: { assumeTrunkZero: false } }, null,
  'with the inference switched off, a bare nine-digit number is refused, because a number that lost its trunk zero and a number that is simply short are indistinguishable');

/* detectCarrier */

// A national number is ten digits and the prefix is its first three, so
// "032" is the start of 0321234567. The prefix is not the three digits after a
// separate trunk zero; it already includes it.
const rest = '3456789';

for (const [carrier, prefixes] of CARRIERS) {
  for (const prefix of prefixes) {
    add('detectCarrier', { phone: `${prefix}${rest}` }, carrier,
      `${prefix} is in ${carrier}'s published range`);
  }
}

const UNASSIGNED = ['030', '040', '050', '053', '060', '071', '080', '087', '095'];
for (const prefix of UNASSIGNED) {
  add('detectCarrier', { phone: `${prefix}${rest}` }, null,
    `${prefix} is not assigned to any mobile carrier: the number is well-formed and belongs to nobody`);
}

add('detectCarrier', { phone: '0912345678' }, 'vinaphone', 'the lookup runs on the normalised form');
add('detectCarrier', { phone: '912345678' }, null,
  'a nine-digit number has no carrier until the trunk zero is known, and guessing is how a phone ends up attributed to the wrong network');
add('detectCarrier', { phone: '+84912345678' }, null,
  'the lookup does not normalise for you, so a caller cannot accidentally attribute a number it has not actually checked');
add('detectCarrier', { phone: '' }, null, null);
add('detectCarrier', { phone: '0800123456' }, null,
  'a valid ten-digit number with no mobile prefix is still a valid number, and still belongs to no carrier');

/* isValidPhone */

for (const [input, expected, note] of [
  ['0912345678', true, null],
  ['+84912345678', true, 'the international form is the same number'],
  ['0912 345 678', true, null],
  ['091234567', false, 'nine digits is not a phone number shape, and this is exactly where the trunk-zero inference must not fire'],
  ['912345678', true, 'a bare nine-digit number is accepted, with the assumption stated in the case note'],
  ['', false, null],
  ['abc', false, null],
  ['+12025550143', false, 'a number from somewhere else is not reshaped into looking Vietnamese'],
]) {
  add('isValidPhone', { input }, expected,
    note ?? (expected ? 'a number that normalises' : 'a number that does not'));
}

/* isValidCccd */

for (const [code, province] of PROVINCES) {
  add('isValidCccd', { code: `${code}098512345` }, true,
    `${code} is ${province}, and the century digit 0 is 20th century male, so 85 is 1985`);
}

const CCCD_INVALID = [
  ['00100000000', 'eleven digits'],
  ['0010000000000', 'thirteen digits, which is a tax code shape and not a card shape'],
  ['000098512345', '000 is not a province: the codes run 001 to 096 with gaps, and a gap is not an assignment'],
  ['097098512345', '097 is above the highest assigned code'],
  ['003098512345', '003 is a gap between Hà Giang and Cao Bằng, not a province'],
  ['00109851234a', 'a letter in the serial'],
  ['', 'an empty field'],
  ['  001098512345', 'leading whitespace is refused, matching every other function here rather than trimming quietly'],
  ['+84001098512345', 'the country code is not part of a card number'],
];
for (const [code, note] of CCCD_INVALID) {
  if (isValidCccd(code)) throw new Error(`the suite thinks ${code} is a valid card number`);
  add('isValidCccd', { code }, false, note);
}

/* parseCccd */

for (const [digit, century, gender] of CENTURY_GENDER) {
  add('parseCccd', { code: `001${digit}85${'123456'}` },
    { provinceCode: '001', province: 'Hà Nội', century, gender, birthYear: (century - 1) * 100 + 85, serial: '123456' },
    `fourth digit ${digit} is the ${ordinal(century)} century, ${gender}, so 85 means ${(century - 1) * 100 + 85}`);
}

add('parseCccd', { code: '079087123456' },
  { provinceCode: '079', province: 'Hồ Chí Minh', century: 20, gender: 'male', birthYear: 1987, serial: '123456' },
  'a whole card number: 079 is Hồ Chí Minh, the fourth digit 0 is 20th century male, and 87 under that century is 1987');
add('parseCccd', { code: '049205123456' },
  { provinceCode: '049', province: 'Quảng Nam', century: 21, gender: 'male', birthYear: 2005, serial: '123456' },
  'the same two year digits under a different fourth digit would give 1905, and the fourth digit is the only thing that tells the two apart');
add('parseCccd', { code: '001000000000' },
  { provinceCode: '001', province: 'Hà Nội', century: 20, gender: 'male', birthYear: 1900, serial: '000000' },
  'the year 00 in the twentieth century is 1900, which is well-formed, and it parses: whether the person is alive is not this function\'s question');
add('parseCccd', { code: '001899999999' },
  { provinceCode: '001', province: 'Hà Nội', century: 24, gender: 'male', birthYear: 2399, serial: '999999' },
  'the fourth digit 8 is the twenty-fourth century, so year 99 here is 2399, and it parses: a card number has no check digit, so a year in the future is not detectable here');
add('parseCccd', { code: '097000000000' }, null, 'an unassigned province code parses to null');
add('parseCccd', { code: '00100000000' }, null, 'an eleven-digit number parses to null');

/* isValidCmnd */

for (const [code, expected, note] of [
  ['001001001', true, 'the old paper card is nine digits and has no structure to check'],
  ['000000000', true, 'all zeros is well-formed even though no such card was ever issued'],
  ['00100100', false, 'eight digits'],
  ['0010010011', false, 'ten digits, which is a tax code shape'],
  ['00100100a', false, 'letters'],
  ['', false, 'an empty field'],
]) {
  add('isValidCmnd', { code }, expected, note);
}

/* classifyId */

for (const [value, expected, note] of [
  ['001098512345', 'cccd', 'twelve digits with a known province code and a defined fourth digit'],
  ['001001001', 'cmnd', 'nine digits is the old paper card, and there is nothing else nine digits could be'],
  ['0100047516', 'mst', 'ten digits whose tenth is the check digit'],
  ['0100047516001', 'mst', 'thirteen digits is a dependent unit of a tax code'],
  ['0912345678', 'phone', 'ten digits starting 0, and not a tax code because the tenth is not its check digit'],
  ['0800123456', 'phone', 'a ten-digit number starting 0, even though no carrier owns it'],
  ['', 'unknown', 'an empty field is unknown, not a card'],
  ['abc', 'unknown', null],
  ['123', 'unknown', 'three digits is nothing'],
]) {
  const actual = classifyId(value);
  if (actual !== expected) throw new Error(`classifyId(${value}) gave ${actual}, not ${expected}`);
  add('classifyId', { value }, expected, note);
}

// The classification that is genuinely ambiguous, stated rather than hidden.
for (const [digit, century, gender] of CENTURY_GENDER) {
  add('classifyId', { value: `079${digit}00123456` }, 'cccd',
    `fourth digit ${digit} is a defined century and sex, so this is a card number -- of a generation this library cannot identify`);
}

/* --- Emit ------------------------------------------------------------------ */

const FUNCTIONS = [
  'mstCheckDigit', 'isValidMst', 'parseMst',
  'normalizePhone', 'detectCarrier', 'isValidPhone',
  'isValidCccd', 'parseCccd', 'isValidCmnd', 'classifyId',
];

const byFn = Object.fromEntries(FUNCTIONS.map((f) => [f, counters.get(f) ?? 0]));
for (const f of FUNCTIONS) {
  if (!byFn[f]) throw new Error(`no cases for ${f}; the suite would let a stub pass`);
}

function ordinal(n) {
  const names = { 20: 'twentieth', 21: 'twenty-first', 22: 'twenty-second', 23: 'twenty-third', 24: 'twenty-fourth' };
  return names[n] ?? `${n}th`;
}

const suite = {
  schema: 'vn-ident-conformance/1',
  library: 'vn-ident',
  version: '0.1.0',
  created: '2026-10-04',
  derivedFrom: [
    MST_SOURCE,
    'Quyết định 124/2004/QĐ-TTg for the 63 province codes, cross-checked against chinhphu.gov.vn, thuvienphapluat.vn and vietnamnet.vn',
    'Published mobile prefix ranges for Viettel, Vinaphone, Mobifone, Vietnamobile and Gmobile',
    'Nghị định 137/2015 and Thông tư 07/2016/TT-BCA for the card number structure',
  ].join('; '),
  description:
    'Vietnamese identity numbers, pinned as a contract between two ports. ' +
    'A tax code has a check digit and can be verified. A card number has none, ' +
    'so "valid" here means well-formed with a province code that exists, and ' +
    'the suite says so rather than implying more.',
  tables: {
    mstWeights: MST_WEIGHTS,
    mstModulus: 11,
    mstSource: MST_SOURCE,
    mstCheckDigitOfZeroRemainder:
      'null -- Thông tư 105/2020/TT-BTC skips the sequence number when the ' +
      'weighted sum divides exactly by 11, because 10 - 0 is 10 and is not a digit',
    provinces: PROVINCES.map(([code, name]) => ({ code, name })),
    provinceCodeRange: '001 to 096, with gaps that are not assignments',
    centuryGender: CENTURY_GENDER.map(([digit, century, gender]) => ({ digit: Number(digit), century, gender })),
    carriers: CARRIERS.map(([name, prefixes]) => ({ name, prefixes })),
    carrierCount: PREFIX_TO_CARRIER.size,
    note: 'thẻ Căn cước (from 2024) and thẻ CCCD gắn chip have the same ' +
      '12-digit structure, and the 2025 reduction to 34 provincial units did ' +
      'not renumber any card. Nothing in this suite can tell the generations apart.',
  },
  functions: FUNCTIONS,
  caseCounts: byFn,
  cases,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(suite, null, 2) + '\n', 'utf8');

console.log(`wrote ${OUT}`);
console.log(`${cases.length} cases across ${FUNCTIONS.length} functions`);
for (const f of FUNCTIONS) console.log(`  ${f}: ${byFn[f]}`);
console.log(`provinces: ${PROVINCES.length}, carrier prefixes: ${PREFIX_TO_CARRIER.size}`);
