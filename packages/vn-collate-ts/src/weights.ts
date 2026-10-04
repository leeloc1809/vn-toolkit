/**
 * Collation weights for Vietnamese, derived from ICU.
 *
 * ## Do not hand-edit this table
 *
 * Every value here was read out of `Intl.Collator('vi-VN')` by
 * `scripts/generate-collation-conformance.mjs`, and pinned by the 519 cases in
 * `conformance/vn-collate-1.0.0.json`. If you think a weight is wrong, change
 * the generator and regenerate — the diff will show what moved and why.
 *
 * The generator records the exact runtime it ran on in the suite's
 * `derivedFrom` field, so a future ICU change shows up as a failing suite
 * rather than as a silent behaviour change.
 */

/**
 * Primary weights, in ICU order. 33 letters.
 *
 * The first 29 are the Vietnamese alphabet in its official order. The last four
 * are w, x, y, z: x and y are Vietnamese, but w and z are not — they appear
 * because ICU's vi-VN locale still collates them as letters in meaningful
 * positions instead of dropping them into the fallback bucket alongside
 * punctuation. Keeping them where ICU puts them is what makes "sorts like ICU"
 * true rather than approximately true.
 */
export const PRIMARY_ORDER = [
  'a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê',
  'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n',
  'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u',
  'ư', 'v', 'w', 'x', 'y', 'z',
] as const;

/** Tone weights. Uniform across every base letter, confirmed by probing all 33. */
export const TONE_ORDER = ['none', 'huyền', 'hỏi', 'ngã', 'sắc', 'nặng'] as const;

/** Marks that modify the base letter rather than carrying tone. */
export const LETTER_MODIFIERS = new Set([
  cp(0x0302), // circumflex  -> â ê ô
  cp(0x0306), // breve      -> ă
  cp(0x031b), // horn       -> ơ ư
]);

/** Marks that carry tone, mapped to their weight in TONE_ORDER. */
export const TONE_MARKS = new Map<string, number>([
  [cp(0x0300), 1], // huyền
  [cp(0x0309), 2], // hỏi
  [cp(0x0303), 3], // ngã
  [cp(0x0301), 4], // sắc
  [cp(0x0323), 5], // nặng
]);

/**
 * Primary byte layout.
 *
 *   0x01..0x0A   digits 0-9, which ICU sorts before every letter
 *   0x0B..0x2B   the 33 letters above
 *   0xFE         anything else
 *
 * 0x00 is reserved as the level terminator, so no weight may be zero.
 */
export const DIGIT_PRIMARY_BASE = 0x01;
export const LETTER_PRIMARY_BASE = 0x0b;
export const FALLBACK_PRIMARY = 0xfe;

/**
 * The ten digits, in collation order.
 *
 * ICU sorts every digit before every letter, so they occupy the primaries just
 * below the letter block rather than sitting in the fallback bucket.
 */
export const DIGITS = '0123456789';

/**
 * Combining marks are written as code points, never as literal characters.
 * They are invisible in an editor, and a stray reformat can silently corrupt a
 * lookup table that still compiles.
 */
export function cp(codePoint: number): string {
  return String.fromCodePoint(codePoint);
}

export const PRIMARY_INDEX = new Map<string, number>(
  PRIMARY_ORDER.map((letter, i) => [letter, LETTER_PRIMARY_BASE + i]),
);
