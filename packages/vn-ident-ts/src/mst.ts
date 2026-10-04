import { MST_MODULUS, MST_WEIGHTS } from './tables.js';

const DIGITS = /^[0-9]+$/;

/** Drop the hyphen the circular writes into the 13-digit form. */
function bare(code: string): string {
  return code.replace(/-/g, '');
}

/**
 * The tenth digit of a tax code, from its first nine.
 *
 * Thông tư 105/2020/TT-BTC, Phụ lục 1: multiply the nine digits by the nine
 * weights, add, divide by 11, and take ten minus the remainder.
 *
 * **The remainder being zero is a case, not an edge case.** Ten minus zero is
 * ten, which is not a digit, so the circular skips that sequence number rather
 * than assigning a check digit. This returns `null` for it, which means no tax
 * code whose first nine digits sum to a multiple of 11 can be valid — and one
 * that claims to be is not. A naive implementation returns 10 here and then
 * compares it against a character, so it rejects a valid code and never says
 * why.
 *
 * ```ts
 * mstCheckDigit('010004751');  // 6 -- the worked example in the circular
 * mstCheckDigit('000000000');  // null -- the sum is divisible by 11
 * ```
 */
export function mstCheckDigit(nine: string): number | null {
  if (!/^[0-9]{9}$/.test(nine)) {
    throw new TypeError(`a tax code prefix is nine digits, got ${JSON.stringify(nine)}`);
  }

  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(nine[i]) * (MST_WEIGHTS[i] ?? 0);
  }
  const remainder = sum % MST_MODULUS;
  // The circular says it in words: ten minus the remainder. Written as
  // 10 - remainder rather than MST_MODULUS - 1 - remainder so that it reads
  // the same way the regulation does.
  return remainder === 0 ? null : 10 - remainder;
}

/**
 * Is this a tax code with a check digit that matches?
 *
 * Ten digits for an independent entity, thirteen for a dependent unit, and the
 * hyphen between them is accepted because that is how the circular prints it.
 * A thirteen-digit code's last three run from 001 to 999, so a branch of 000
 * does not exist and accepting it would let a typo through as a real entity.
 */
export function isValidMst(code: string): boolean {
  if (typeof code !== 'string') return false;
  const s = bare(code);
  if (!DIGITS.test(s)) return false;
  if (s.length !== 10 && s.length !== 13) return false;

  if (s.length === 13) {
    const branch = Number(s.slice(10));
    if (branch < 1 || branch > 999) return false;
  }
  return mstCheckDigit(s.slice(0, 9)) === Number(s[9]);
}

export interface TaxCode {
  /**
   * Not a province.
   *
   * These two digits are the revenue code of the provincial tax office, from
   * the Ministry of Finance's own catalogue. It is a *different list* from the
   * province codes on a card number, and calling this one a province is how two
   * catalogues end up merged in somebody's database.
   */
  regionCode: string;
  /** The seven middle digits, kept as a string because the leading zeros matter. */
  serial: string;
  checkDigit: number;
  /** The three trailing digits of a dependent unit, or null. */
  branch: string | null;
}

/** The parts of a tax code, or null if it is not one. */
export function parseMst(code: string): TaxCode | null {
  if (!isValidMst(code)) return null;
  const s = bare(code);
  return {
    regionCode: s.slice(0, 2),
    serial: s.slice(2, 9),
    checkDigit: Number(s[9]),
    branch: s.length === 13 ? s.slice(10) : null,
  };
}
