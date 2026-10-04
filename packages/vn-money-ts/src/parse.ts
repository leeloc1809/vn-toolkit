import { ACCEPTED_SYMBOLS, MAX_SAFE_AMOUNT } from './constants.js';
import { VndError } from './errors.js';

/**
 * Spaces are ignorable wherever they appear.
 *
 * A price arrives from a form, a spreadsheet, a scan of a receipt, and a
 * gateway. Each writes the grouping space differently: U+0020, U+00A0, U+2009.
 * Rejecting the two we did not expect would fail an amount a human can read at
 * a glance.
 *
 * JavaScript's \s already covers all three plus the rest of Unicode's space
 * characters, so there is no need to spell them out here -- and spelling them
 * out would mean putting invisible characters in the source. Python's \s is
 * Unicode-aware too, which is why the two ports strip the same set.
 */
const SPACES = /\s/g;

/**
 * A grouped or ungrouped run of ASCII digits, optionally signed.
 *
 * The grouped branch demands exactly three digits per group, which is what
 * separates "1.000" (one thousand) from "1.00" (a decimal nobody should have
 * written). The ungrouped branch exists so "1000" is not read as a malformed
 * group of one digit.
 */
const AMOUNT = /^[+-]?(?:[0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]+)$/;

function stripSymbol(s: string): string {
  for (const symbol of ACCEPTED_SYMBOLS) {
    if (s.startsWith(symbol)) {
      s = s.slice(symbol.length);
      break;
    }
  }
  for (const symbol of ACCEPTED_SYMBOLS) {
    if (s.endsWith(symbol)) {
      s = s.slice(0, s.length - symbol.length);
      break;
    }
  }
  return s;
}

/**
 * Parse a written amount back into an integer.
 *
 * Deliberately refuses rather than guesses. A money parser that guesses is
 * worse than one that fails, because "1.5" under a dot-as-separator reading is
 * either fifteen hundred or a typo, and the two are not interchangeable on an
 * invoice.
 *
 * Throws VndError with a machine-readable `reason`:
 *   'empty'               nothing but spaces and maybe a sign
 *   'has-decimal'         a dot or comma that does not group exactly three digits
 *   'unexpected-character' anything else
 *   'out-of-range'        parsed, but past 2^53-1
 */
export function parseVnd(input: string): number {
  if (typeof input !== 'string') {
    throw new VndError('unexpected-character', `${String(input)} is not text`);
  }

  let s = input.replace(SPACES, '');
  s = stripSymbol(s);

  if (!AMOUNT.test(s)) {
    // A sign on its own carries no digits. So does nothing at all. Everything
    // else that fails here either has a misplaced separator or is not a
    // number, and those two are worth telling apart.
    if (!/[0-9]/.test(s)) {
      if (/^[+-]*$/.test(s)) {
        throw new VndError('empty', `"${input}" holds no digits`);
      }
      throw new VndError('unexpected-character', `"${input}" is not an amount`);
    }
    if (/[.,]/.test(s)) {
      throw new VndError(
        'has-decimal',
        `"${input}" has a separator that does not group exactly three digits`,
      );
    }
    throw new VndError('unexpected-character', `"${input}" is not an amount`);
  }

  // Strip the grouping separators only once the shape is known to be valid.
  const digits = s.replace(/^[+-]/, '').replace(/[.,]/g, '');
  const value = Number(digits);
  const signed = s.startsWith('-') ? -value : value;

  if (Math.abs(signed) > MAX_SAFE_AMOUNT) {
    throw new VndError('out-of-range', `"${input}" is past 2^53-1`);
  }
  return signed;
}
