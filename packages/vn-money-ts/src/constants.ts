/**
 * Currency facts, and why each one is here.
 *
 * These are not settings. Changing any of them changes what an amount means,
 * and every function in the package is defined in terms of them.
 */

/** ISO 4217. */
export const CURRENCY_CODE = 'VND';

/**
 * ISO 4217 gives VND a minor unit of 0.
 *
 * This one fact is the reason the whole package works on integers. There is no
 * half a dong, `hao` and `xu` were withdrawn because they were issued in
 * practice, and a price that arrives with a decimal point is either an error
 * or a different currency.
 */
export const MINOR_UNITS = 0;

/**
 * U+20AB VIETNAMESE DONG SIGN, which is what ICU writes.
 *
 * U+0110 (Đ) and U+0111 (đ) are the informal stand-ins and they are not
 * interchangeable in a document that has to render identically everywhere, so
 * they are accepted on input and never produced on output.
 */
export const CURRENCY_SYMBOL = '₫';

/** What vi-VN uses to group thousands. */
export const GROUP_SEPARATOR = '.';

/** What vi-VN uses for a decimal point. Never produced: there are no decimals. */
export const DECIMAL_SEPARATOR = ',';

/**
 * U+00A0 NO-BREAK SPACE, between the digits and the symbol.
 *
 * A plain space would let a line wrap between "1.000.000" and "₫", which reads
 * as two different things. This is the character ICU itself emits, which is
 * what makes formatVnd and Intl agree byte for byte.
 *
 * Written with an explicit code point on purpose. A literal no-break space is
 * invisible in an editor, so a later edit that "cleans it up" replaces it with
 * an ordinary space and the formatter quietly stops matching ICU by one code
 * point. See scripts/check-invisible-spaces.mjs, which fails the build if a
 * literal one comes back.
 */
export const SYMBOL_SPACER = String.fromCharCode(0x00a0);

/** Every spelling of the symbol that parseVnd accepts. */
export const ACCEPTED_SYMBOLS: readonly string[] = [
  CURRENCY_SYMBOL,
  'đ',
  'Đ',
  'VND',
  'vnd',
];

/**
 * The largest amount both ports can represent exactly.
 *
 * A JavaScript number is a double. Past this value the low bits are silently
 * dropped, so an amount above it is not "a big amount", it is a different
 * number from the one that was stored. Refusing is the only honest option.
 */
export const MAX_SAFE_AMOUNT = Number.MAX_SAFE_INTEGER;
