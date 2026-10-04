/**
 * vn-money
 *
 * Vietnamese money, on integers, because VND has no minor unit.
 *
 * Five functions, zero runtime dependencies, and a conformance suite shared
 * with the Python port at conformance/vn-money-1.0.0.json. The suite is the
 * contract; the two ports are implementations of it.
 */

export {
  CURRENCY_CODE,
  CURRENCY_SYMBOL,
  MINOR_UNITS,
  GROUP_SEPARATOR,
  DECIMAL_SEPARATOR,
  SYMBOL_SPACER,
  ACCEPTED_SYMBOLS,
  MAX_SAFE_AMOUNT,
} from './constants.js';

export { VndError, isVndError, type VndErrorReason } from './errors.js';

export { formatVnd, type FormatOptions } from './format.js';

export { parseVnd } from './parse.js';

export { allocate } from './allocate.js';

export { toWords } from './words.js';

import { MAX_SAFE_AMOUNT } from './constants.js';

/**
 * Is this a whole VND amount both ports can hold exactly?
 *
 * The one check worth having before anything else: it is the difference
 * between an amount and a float that happens to be near one. 0.1 + 0.2 is
 * 0.30000000000000004 in binary floating point, and a price that arrives that
 * way has already lost money before this library sees it.
 */
export function isVnd(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= MAX_SAFE_AMOUNT;
}
