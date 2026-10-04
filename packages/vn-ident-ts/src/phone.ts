import { carrierOfPrefix, type Carrier } from './tables.js';

const TRUNK = '0';
const COUNTRY = '84';

/** Already normalised: ten digits, starting with the trunk zero. */
const NATIONAL_SHAPE = /^0[0-9]{9}$/;

export interface NormalizeOptions {
  /**
   * A bare nine-digit number is assumed to have lost its trunk zero.
   *
   * This is the one inference in the package, and it is the one place a typo
   * and a correct number look the same. A national number written without its
   * leading zero is how it appears in a contact form and how it is read aloud,
   * so the default is to recover it. Set this to false to refuse instead, which
   * is the right choice if the input came from a system that always includes it.
   */
  assumeTrunkZero?: boolean;
}

/**
 * Reduce what a person typed to a ten-digit national number, or null.
 *
 * Everything here is unambiguous except the option above. The `+84` forms all
 * say the same thing; spaces, dashes, dots and brackets are how people write a
 * number down rather than information; and a number that is 8, 11 or 12 digits
 * with no country code is refused rather than reshaped.
 */
export function normalizePhone(input: string, options: NormalizeOptions = {}): string | null {
  if (typeof input !== 'string') return null;
  const { assumeTrunkZero = true } = options;

  const s = input.replace(/\D/g, '');
  if (s.length === 0) return null;

  let rest = s.startsWith(COUNTRY) ? s.slice(COUNTRY.length) : s;

  if (rest.length === 9 && !rest.startsWith(TRUNK)) {
    if (!assumeTrunkZero) return null;
    rest = TRUNK + rest;
  }

  return NATIONAL_SHAPE.test(rest) ? rest : null;
}

/**
 * Which mobile network is this number on, or null.
 *
 * Only a normalised number is looked up, on purpose. A nine-digit number has
 * no carrier until the trunk zero is known, and guessing is how a phone number
 * ends up attributed to the wrong network — which then decides which carrier
 * portal the user is sent to.
 *
 * `null` covers three different situations, and they are not the same: a
 * number that is not a number, a number whose prefix belongs to nobody, and a
 * ten-digit number that is not a mobile number at all. Call `normalizePhone`
 * first if you need to tell them apart.
 */
export function detectCarrier(phone: string): Carrier | null {
  if (typeof phone !== 'string') return null;
  const s = phone.replace(/\D/g, '');
  if (!NATIONAL_SHAPE.test(s)) return null;
  return carrierOfPrefix(s.slice(0, 3)) ?? null;
}

/**
 * Is this something a person could have meant as a Vietnamese phone number?
 *
 * True for a ten-digit number that no carrier owns, which is correct: the shape
 * is what is being checked, not the subscription.
 */
export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}
