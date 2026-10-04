import { MAX_SAFE_AMOUNT } from './constants.js';
import { VndError } from './errors.js';

/**
 * Read a number out in Vietnamese words.
 *
 * Vietnamese has several published conventions for this and none of them is
 * official, so this one is stated in full and pinned by the conformance suite
 * rather than assumed. The decisions, and what each one rejects:
 *
 *   filler "linh"      hundreds present, tens zero, units not  (not "lẻ")
 *   "mốt"   units 1 with a tens digit of 2 to 9                (not "một")
 *   "tư"    units 4 with a tens digit of 2 to 9                (not "bốn")
 *   "lăm"   units 5 with any non-zero tens digit              (not "năm")
 *   "mười"  a tens digit of 1, whatever follows it            (not "một mươi")
 *
 * The mốt and tư rules start at 2, so 11, 14 and 15 are the values where a
 * sloppy implementation shows up, and the suite pins all three.
 *
 * Every non-zero triplet is read in full, three slots, including "không trăm"
 * when its hundreds are zero -- but only once something of greater magnitude
 * has been spoken, because that is the only time the position is ambiguous.
 * So 5 is "năm" and 1001 is "một nghìn không trăm linh một".
 *
 * A zero triplet with a non-zero triplet below it reads "không" plus its
 * magnitude name, so 1000008 is "một triệu không nghìn không trăm linh tám".
 * A zero triplet in the tail is silence, so 1000000 is "một triệu".
 *
 * Throws VndError('not-integer' | 'out-of-range'). Negative amounts are
 * prefixed with "âm" rather than read backwards, so no sign can be lost in a
 * string operation.
 */

const DIGIT_WORDS = [
  'không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín',
];

/** Indexed from the thousands upwards; the units triplet has no name. */
const MAGNITUDE_NAMES = ['nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'] as const;

function readTriplet(value: number, speakZeroHundreds: boolean): string {
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor((value % 100) / 10);
  const units = value % 10;
  const parts: string[] = [];

  if (hundreds > 0) parts.push(`${DIGIT_WORDS[hundreds] ?? ''} trăm`);
  else if (speakZeroHundreds) parts.push('không trăm');

  if (tens > 0) {
    parts.push(tens === 1 ? 'mười' : `${DIGIT_WORDS[tens] ?? ''} mươi`);
  } else if (units > 0 && (hundreds > 0 || speakZeroHundreds)) {
    parts.push('linh');
  }

  if (units > 0) {
    if (units === 1) parts.push(tens >= 2 ? 'mốt' : 'một');
    else if (units === 4) parts.push(tens >= 2 ? 'tư' : 'bốn');
    else if (units === 5) parts.push(tens >= 1 ? 'lăm' : 'năm');
    else parts.push(DIGIT_WORDS[units] ?? '');
  }

  return parts.join(' ');
}

export function toWords(amount: number): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new VndError('not-integer', `${String(amount)} is not a finite amount`);
  }
  if (!Number.isInteger(amount)) {
    throw new VndError('not-integer', `${amount} cannot be read out, it is not whole`);
  }
  if (Math.abs(amount) > MAX_SAFE_AMOUNT) {
    throw new VndError('out-of-range', `${amount} cannot be represented exactly`);
  }
  if (amount === 0) return 'không';

  const negative = amount < 0;
  const digits = String(Math.abs(amount));

  if (digits.length > (MAGNITUDE_NAMES.length + 1) * 3) {
    throw new VndError('out-of-range', `${amount} needs more triplets than are named`);
  }

  // Only the triplets the number actually occupies. Padding to the full width
  // would push the significant digits into the topmost triplet and read five
  // dong as five million billion.
  const groupCount = Math.ceil(digits.length / 3);
  const padded = digits.padStart(groupCount * 3, '0');
  const triplets: number[] = [];
  for (let i = groupCount - 1; i >= 0; i -= 1) {
    // i counts magnitudes from the units upwards, but the padded string
    // counts characters from the left, so the offset is the mirror of i.
    const start = (groupCount - 1 - i) * 3;
    triplets[i] = Number(padded.slice(start, start + 3));
  }

  const lowest = triplets.findIndex((t) => t !== 0);
  const words: string[] = [];
  let started = false;

  for (let i = groupCount - 1; i >= 0; i -= 1) {
    const triplet = triplets[i] ?? 0;
    const magnitude = i === 0 ? '' : (MAGNITUDE_NAMES[i - 1] ?? '');

    if (triplet === 0) {
      if (started && i > 0 && i > lowest) words.push(`không ${magnitude}`);
      continue;
    }

    words.push(magnitude === '' ? readTriplet(triplet, started) : `${readTriplet(triplet, started)} ${magnitude}`);
    started = true;
  }

  return (negative ? 'âm ' : '') + words.join(' ');
}
