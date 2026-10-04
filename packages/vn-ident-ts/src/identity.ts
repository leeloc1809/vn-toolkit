import { centuryOf, genderOf, isProvinceCode, provinceName, type Gender } from './tables.js';
import { isValidMst } from './mst.js';
import { isValidPhone } from './phone.js';

const CCCD_SHAPE = /^[0-9]{12}$/;
const CMND_SHAPE = /^[0-9]{9}$/;

/**
 * Is this a well-formed card number with a province code that exists?
 *
 * **There is no check digit on a card number.** The last six digits are
 * random, so unlike a tax code there is nothing to verify: this cannot detect a
 * number that is well-formed and wrong, and pretending otherwise would be the
 * most expensive thing this package could do. A card number is a format check
 * and nothing more, and the conformance suite says the same.
 *
 * **It also cannot tell you which generation of card it is.** The old
 * unchipped 12-digit number and the current chip number have the same
 * structure, the 2025 reduction to 34 provincial units did not renumber any
 * card, and no function here will claim to distinguish them. If you need to
 * know, you need the issuing authority.
 */
export function isValidCccd(code: string): boolean {
  if (typeof code !== 'string') return false;
  if (!CCCD_SHAPE.test(code)) return false;
  if (!isProvinceCode(code.slice(0, 3))) return false;
  // Every fourth digit is defined, so this is a table lookup rather than a range
  // check. It is written out anyway so that a future table which drops a digit
  // fails here instead of silently yielding undefined.
  return centuryOf(code[3] ?? '') !== undefined;
}

export interface CardNumber {
  provinceCode: string;
  province: string;
  century: number;
  gender: Gender;
  /**
   * The two digits are the last two of the year, so the fourth digit is what
   * turns 85 into 1985 rather than 2085.
   */
  birthYear: number;
  serial: string;
}

/** The parts of a card number, or null if it is not a well-formed one. */
export function parseCccd(code: string): CardNumber | null {
  if (!isValidCccd(code)) return null;
  const century = centuryOf(code[3] ?? '');
  const gender = genderOf(code[3] ?? '');
  const province = provinceName(code.slice(0, 3));
  if (century === undefined || gender === undefined || province === undefined) return null;

  return {
    provinceCode: code.slice(0, 3),
    province,
    century,
    gender,
    birthYear: (century - 1) * 100 + Number(code.slice(4, 6)),
    serial: code.slice(6),
  };
}

/**
 * The old paper card: nine digits.
 *
 * No structure to check and no check digit, so this is a shape test. All zeros
 * is well-formed even though no such card was ever issued, and that is the
 * honest answer: this function cannot tell you more than that.
 */
export function isValidCmnd(code: string): boolean {
  return typeof code === 'string' && CMND_SHAPE.test(code);
}

export type IdentifierKind = 'cccd' | 'cmnd' | 'mst' | 'phone' | 'unknown';

/**
 * What is this string, as far as structure goes?
 *
 * Ordered so the specific reading wins: a twelve-digit value with a known
 * province code is a card, a ten- or thirteen-digit value is a tax code, a
 * ten-digit value starting 0 is a phone number, and nine digits is the old
 * paper card.
 *
 * Note what this does **not** say. `'cccd'` does not mean a chip card, and
 * `'phone'` does not mean the number is subscribed to anyone. A field of type
 * `unknown` means the structure did not match anything here, which is a
 * statement about this package and not about the value.
 */
export function classifyId(value: string): IdentifierKind {
  if (typeof value !== 'string') return 'unknown';
  const s = value.trim();
  if (s.length === 0) return 'unknown';
  if (isValidCccd(s)) return 'cccd';
  if (isValidMst(s)) return 'mst';
  if (isValidPhone(s)) return 'phone';
  if (isValidCmnd(s)) return 'cmnd';
  return 'unknown';
}
