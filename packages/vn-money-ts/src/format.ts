import { CURRENCY_SYMBOL, GROUP_SEPARATOR, MAX_SAFE_AMOUNT, SYMBOL_SPACER } from './constants.js';
import { VndError } from './errors.js';

export interface FormatOptions {
  /** Defaults to vi-VN's dot. Pass '' for an ungrouped number. */
  groupSeparator?: string;
  /** Defaults to U+20AB. */
  symbol?: string;
  /** Defaults to true. False gives a bare number, for a CSV. */
  withSymbol?: boolean;
  /** Defaults to false: a plus sign is a rendering decision, not a value. */
  withSign?: boolean;
}

/** Group a digit string from the right, in threes. */
function group(digits: string, separator: string): string {
  const out: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    out.unshift(digits.slice(Math.max(0, end - 3), end));
  }
  return out.join(separator);
}

/**
 * Format a VND amount the way vi-VN does.
 *
 * vi-VN groups thousands with a dot and separates decimals with a comma: the
 * same two characters as en-US with the opposite meaning. Copying an en-US
 * formatter here produces a wrong number that still looks plausible, which is
 * the worst kind of bug to ship into an invoice.
 *
 * The default output is byte-for-byte what
 * `Intl.NumberFormat('vi-VN', {style: 'currency', currency: 'VND'})` produces,
 * and the conformance suite holds the two together.
 *
 * Throws VndError('not-integer') for a fractional amount, because VND has no
 * minor unit and there is nothing to round to.
 */
export function formatVnd(amount: number, options: FormatOptions = {}): string {
  const {
    groupSeparator = GROUP_SEPARATOR,
    symbol = CURRENCY_SYMBOL,
    withSymbol = true,
    withSign = false,
  } = options;

  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new VndError('not-integer', `${String(amount)} is not a finite amount`);
  }
  if (!Number.isInteger(amount)) {
    throw new VndError(
      'not-integer',
      `VND has no minor unit, so ${amount} cannot be formatted without rounding it away`,
    );
  }
  if (Math.abs(amount) > MAX_SAFE_AMOUNT) {
    throw new VndError('out-of-range', `${amount} cannot be represented exactly`);
  }

  const negative = amount < 0;
  const sign = negative ? '-' : withSign ? '+' : '';
  const body = group(String(Math.abs(amount)), groupSeparator);

  return withSymbol ? `${sign}${body}${SYMBOL_SPACER}${symbol}` : `${sign}${body}`;
}
