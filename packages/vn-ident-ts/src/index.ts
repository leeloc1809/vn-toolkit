/**
 * @vntoolkit/vn-ident
 *
 * Vietnamese tax codes, mobile numbers and card numbers, validated against the
 * sources that define them rather than against a regex somebody liked.
 *
 * Zero runtime dependencies, and a conformance suite shared with the Python
 * port at conformance/vn-ident-1.0.0.json.
 *
 * The one thing to read before using it: a tax code has a check digit and this
 * can tell you it is right. A card number does not, and this cannot. Both facts
 * are stated in the code, in the suite and in the README, because a validation
 * library that overstates what it checks is worse than one that checks less.
 */

export {
  MST_WEIGHTS,
  MST_MODULUS,
  PROVINCES,
  CENTURY_GENDER,
  CARRIERS,
  CARRIER_NAMES,
  ASSIGNED_PREFIX_COUNT,
  provinceName,
  isProvinceCode,
  centuryOf,
  genderOf,
  carrierOfPrefix,
  type Carrier,
  type Gender,
} from './tables.js';

export { mstCheckDigit, isValidMst, parseMst, type TaxCode } from './mst.js';

export {
  normalizePhone,
  detectCarrier,
  isValidPhone,
  type NormalizeOptions,
} from './phone.js';

export {
  isValidCccd,
  parseCccd,
  isValidCmnd,
  classifyId,
  type CardNumber,
  type IdentifierKind,
} from './identity.js';
