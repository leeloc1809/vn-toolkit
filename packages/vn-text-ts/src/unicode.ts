/**
 * Unicode constants that matter for Vietnamese text handling.
 *
 * ## The trap
 *
 * Four characters look like a capital or lowercase D with a stroke:
 *
 *   U+0110  Đ  LATIN CAPITAL LETTER D WITH STROKE   -> Vietnamese
 *   U+0111  đ  LATIN SMALL LETTER D WITH STROKE     -> Vietnamese
 *   U+00D0  Ð  LATIN CAPITAL LETTER ETH              -> Icelandic, Danish
 *   U+00F0  ð  LATIN SMALL LETTER ETH                -> Icelandic, Danish
 *
 * None of them has a canonical decomposition, and none has a compatibility
 * decomposition either — verified against both NFD and NFKD. Unicode treats
 * each as a letter in its own right rather than as a decorated `D`.
 *
 * ## Why that breaks search
 *
 * The obvious implementation, normalise to NFD and strip the combining marks,
 * silently fails to fold Vietnamese `Đ`:
 *
 *     'Đặng Minh'  ->  'Đang Minh'
 *
 * Note the surviving `Đ`. The index key no longer matches anything a user can
 * type, because nobody types `Đang` to find `Đặng`. Nothing throws, nothing
 * looks wrong — search just quietly returns fewer results than it should.
 *
 * The obvious repair is worse. A blanket "fold anything that looks like a
 * stroked D" rule also converts `Ð` to `D`, which corrupts Icelandic and Danish
 * names. Transliteration tables that treat `Đ` as decoration hit exactly this.
 *
 * So the two have to be distinguished explicitly, which is what
 * {@link stripStroke} is for: it converts U+0110/U+0111 and nothing else.
 */

/** Đ — LATIN CAPITAL LETTER D WITH STROKE (Vietnamese). */
export const D_WITH_STROKE_UPPER = '\u0110';
/** đ — LATIN SMALL LETTER D WITH STROKE (Vietnamese). */
export const D_WITH_STROKE_LOWER = '\u0111';
/** Ð — LATIN CAPITAL LETTER ETH (Icelandic). Must never fold to D. */
export const ETH_UPPER = '\u00D0';
/** ð — LATIN SMALL LETTER ETH (Icelandic). Must never fold to d. */
export const ETH_LOWER = '\u00f0';

/** Full Combining Diacritical Marks block. */
export const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * The five Vietnamese tone marks, as combining marks in NFD.
 *
 *   sắc   U+0301  COMBINING ACUTE ACCENT
 *   huyền U+0300  COMBINING GRAVE ACCENT
 *   hỏi   U+0309  COMBINING HOOK ABOVE
 *   ngã   U+0303  COMBINING TILDE
 *   nặng  U+0323  COMBINING DOT BELOW
 */
export const TONE_MARKS = ['\u0301', '\u0300', '\u0309', '\u0303', '\u0323'] as const;

/**
 * Vietnamese vowel letters in their precomposed NFC form.
 * `ă â ê ô ơ ư` are not listed: NFD already reduces them to a base letter
 * plus U+0306 / U+0302 / U+031B, which `deaccent` handles generically.
 */
export const VIETNAMESE_VOWELS = new Set([
  'a', 'e', 'i', 'o', 'u', 'y',
  'A', 'E', 'I', 'O', 'U', 'Y',
]);

/**
 * Characters whose presence proves the text contains Vietnamese-specific
 * letters (Precomposed Vietnamese Latin Extended Additional + D WITH STROKE).
 */
export const VIETNAMESE_SPECIFIC =
  /[\u0110\u0111\u1ea0-\u1ef9]/;

/** Punctuation and symbols, as opposed to letters and numbers. */
export const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;
