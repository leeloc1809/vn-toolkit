/**
 * The tables, and where each one came from.
 *
 * There is no platform to read these out of the way there is for collation and
 * currency, so they are transcribed once, here, and the conformance suite
 * records the source of each. The suite's job is to make a transcription
 * error visible: a transposed pair of tax weights still produces a well-formed
 * check digit, so it would validate real tax codes and reject none.
 */

/* --- Tax codes ------------------------------------------------------------ */

/**
 * Thông tư 105/2020/TT-BTC Điều 5 and Phụ lục 1, from the official VBQPPL
 * portal at moj.gov.vn.
 *
 * Nine weights for the nine digits before the check digit. The sums are
 * deliberately not a neat progression, which is exactly why they have to be
 * transcribed rather than computed.
 */
export const MST_WEIGHTS: readonly number[] = [31, 29, 23, 19, 17, 13, 7, 5, 3];

/** The circular divides the weighted sum by this. */
export const MST_MODULUS = 11;

/* --- Province codes ------------------------------------------------------- */

/**
 * The 63 province codes on a card number, from Quyết định 124/2004/QĐ-TTg,
 * cross-checked against chinhphu.gov.vn, thuvienphapluat.vn and vietnamnet.vn.
 *
 * One of those four prints Bắc Giang as 023. The other three, and the decree
 * itself, say 024, so 024 is what is here. A single-source table would have
 * carried the typo.
 *
 * The codes run 001 to 096 with gaps, and a gap is not an assignment: 003 is
 * nobody, and a card number starting 003 is not a card number.
 */
export const PROVINCES: readonly (readonly [code: string, name: string])[] = [
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
 * The fourth digit: which century, and which sex.
 *
 * The pairs run in order, so even digits are male and odd are female, two per
 * century, from the twentieth to the twenty-fourth.
 */
export const CENTURY_GENDER: readonly (readonly [digit: string, century: number, gender: Gender])[] = [
  ['0', 20, 'male'], ['1', 20, 'female'],
  ['2', 21, 'male'], ['3', 21, 'female'],
  ['4', 22, 'male'], ['5', 22, 'female'],
  ['6', 23, 'male'], ['7', 23, 'female'],
  ['8', 24, 'male'], ['9', 24, 'female'],
];

export type Gender = 'male' | 'female';

/* --- Mobile carriers ------------------------------------------------------ */

/**
 * Published three-digit mobile prefixes, 34 in total.
 *
 * 34 is not 100, and the gap is the point: 030, 040, 050, 053, 060, 071, 080,
 * 087 and 095 belong to nobody. A well-formed ten-digit number can therefore
 * be valid and still have no carrier, and saying "unknown" is a different
 * answer from saying "invalid".
 */
export const CARRIERS: readonly (readonly [name: Carrier, prefixes: readonly string[]])[] = [
  ['viettel', ['032', '033', '034', '035', '036', '037', '038', '039', '086', '096', '097', '098']],
  ['vinaphone', ['081', '082', '083', '084', '085', '088', '091', '094']],
  ['mobifone', ['070', '076', '077', '078', '079', '089', '090', '093']],
  ['vietnamobile', ['052', '056', '058', '092']],
  ['gmobile', ['059', '099']],
];

export type Carrier = 'viettel' | 'vinaphone' | 'mobifone' | 'vietnamobile' | 'gmobile';

export const CARRIER_NAMES: readonly Carrier[] = CARRIERS.map(([name]) => name);

const PREFIX_TO_CARRIER = new Map<string, Carrier>();
for (const [name, prefixes] of CARRIERS) {
  for (const prefix of prefixes) {
    // A prefix assigned to two carriers is a transcription error, and it would
    // otherwise resolve to whichever table was read first. The conformance
    // generator checks this too, but failing here means it cannot ship.
    if (PREFIX_TO_CARRIER.has(prefix)) {
      throw new Error(`prefix ${prefix} is assigned to two carriers`);
    }
    PREFIX_TO_CARRIER.set(prefix, name);
  }
}

const PROVINCE_NAMES = new Map(PROVINCES);
const CENTURY_BY_DIGIT = new Map(CENTURY_GENDER.map(([d, century]) => [d, century]));
const GENDER_BY_DIGIT = new Map(CENTURY_GENDER.map(([d, , gender]) => [d, gender]));

export function provinceName(code: string): string | undefined {
  return PROVINCE_NAMES.get(code);
}

export function isProvinceCode(code: string): boolean {
  return PROVINCE_NAMES.has(code);
}

export function centuryOf(digit: string): number | undefined {
  return CENTURY_BY_DIGIT.get(digit);
}

export function genderOf(digit: string): Gender | undefined {
  return GENDER_BY_DIGIT.get(digit);
}

export function carrierOfPrefix(prefix: string): Carrier | undefined {
  return PREFIX_TO_CARRIER.get(prefix);
}

export const ASSIGNED_PREFIX_COUNT = PREFIX_TO_CARRIER.size;
